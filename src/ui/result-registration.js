import { registrationDay, registrationResume, shiftRegistrationDate, unchangedRegistrationValue, validRegistrationDate } from '../registration.js';
import { getTodayISODate } from '../date-utils.js';
import { formatFriendlyDate } from './format.js';

export function initResultRegistration({ getContext, getData, getSlots, getSymbol, userId, onEdit }) {
  const dialog = document.getElementById('register-result-dialog');
  const dateInput = document.getElementById('day-fecha');
  const picker = document.getElementById('day-date-picker');
  const host = document.getElementById('register-date-host');
  const context = document.getElementById('register-result-context');
  const progress = document.getElementById('register-progress');
  const latestButton = document.getElementById('register-resume');
  const save = document.getElementById('save-day');
  const saveNext = document.getElementById('save-day-next');
  const placeholder = document.createComment('Selector de fecha de Jornada');
  picker.before(placeholder);
  let data = { draws: [], pending: [] }, baseline = new Map(), currentDate = null;
  let savingTransaction = false;
  let loaded = false, busy = false, request = 0, changingContext = false, explicitlySelected = false;
  const drafts = new Map();
  const storageKey = () => `ld:registration-date:${userId}:${getContext().pais || 'HN'}`;
  const slots = () => getSlots(getContext().pais);
  const key = fecha => `${getContext().pais || 'HN'}|${fecha}`;
  function readDate() { try { return localStorage.getItem(storageKey()); } catch { return null; } }
  function remember() { if (currentDate) try { localStorage.setItem(storageKey(), currentDate); } catch { /* storage is optional */ } }
  function stashDraft(force = false) {
    if (!currentDate || !loaded || (!dialog.open && !force)) return;
    drafts.set(key(currentDate), slots().map(config=>({ horario:config.key, value:document.getElementById(config.inputId).value, isTest:document.getElementById(config.checkboxId).checked })).filter(row=> (row.value.trim() || baseline.get(row.horario)?.record) && !unchangedRegistrationValue(row.value,row.isTest,baseline.get(row.horario)?.record)));
  }
  function fieldsComplete() {
    return slots().every(config => /^\d{1,2}$/.test(document.getElementById(config.inputId).value.trim()));
  }
  function updateProgress() {
    const active = slots();
    let entered = 0;
    active.forEach(config => {
      const input = document.getElementById(config.inputId), test = document.getElementById(config.checkboxId);
      const field = input.closest('[data-register-field]'), record = baseline.get(config.key);
      input.readOnly = !!record?.record;
      test.disabled = busy || !!record?.record;
      const edit = field.querySelector('[data-register-correct]');
      edit.hidden = !record?.record;
      edit.disabled = busy;
      const raw = input.value.trim(), valid = /^\d{1,2}$/.test(raw);
      if (valid) entered++;
      const changed = valid && !unchangedRegistrationValue(raw, test.checked, record?.record);
      field.querySelector('[data-register-state]').textContent = changed ? 'Sin guardar' : record?.state === 'pending' ? 'Por publicar' : record?.record ? (record.record.isTest ? 'Prueba registrada' : 'Registrado') : 'Falta ingresar';
      const name = valid ? getSymbol(Number(raw)) : '';
      field.querySelector('[data-register-symbol]').textContent = name;
      const image = field.querySelector('[data-register-image]');
      if (valid && name) {
        const src = `data/img/${String(Number(raw)).padStart(2,'0')}.png`;
        if (image.getAttribute('src') !== src) { image.hidden = false; image.src = src; }
      } else { image.hidden = true; image.removeAttribute('src'); }
    });
    const missing = active.filter(config=>!/^\d{1,2}$/.test(document.getElementById(config.inputId).value.trim())).map(c=>c.key);
    progress.textContent = `${entered} de ${active.length} turnos ingresados${missing.length ? ` · Falta: ${missing.join(', ')}` : ' · Día completo'}.`;
    save.disabled = busy || !loaded;
    saveNext.disabled = busy || !loaded || !fieldsComplete() || currentDate >= getTodayISODate();
    document.getElementById('register-next').disabled = busy || !loaded || !currentDate || currentDate >= getTodayISODate();
    document.getElementById('register-previous').disabled = busy || !loaded || !currentDate || currentDate <= '1900-01-01';
    latestButton.disabled = busy || !loaded || !latestButton.dataset.date;
    saveNext.title = !fieldsComplete() ? 'Completa los turnos de esta fecha para continuar al día siguiente.' : '';
  }
  for (const config of getSlots('HN')) {
    const input = document.getElementById(config.inputId), field = input.closest('[data-register-field]');
    const state = document.createElement('span'); state.className = 'register-field__state'; state.dataset.registerState = '';
    const label = field.querySelector('label');
    label.append(state);
    const head = document.createElement('div');head.className='register-field__head';
    label.before(head);head.append(label);
    const edit = document.createElement('button');edit.type='button';edit.className='btn-ghost register-correct';edit.dataset.registerCorrect=config.key;edit.textContent='Corregir';edit.hidden=true;
    edit.setAttribute('aria-label',`Corregir fecha, horario o número del sorteo ${config.key}`);
    edit.addEventListener('click',()=>{const record=baseline.get(config.key)?.record;if(record&&!busy)onEdit(record)});
    head.append(edit);
    const identity = document.createElement('div'); identity.className = 'register-field__symbol';
    const image = document.createElement('img'); image.dataset.registerImage = ''; image.alt = ''; image.hidden = true;
    image.addEventListener('error',()=>{ image.hidden = true; });
    const name = document.createElement('span'); name.dataset.registerSymbol = '';
    identity.append(image,name); field.append(identity);
    input.addEventListener('input',updateProgress);
    document.getElementById(config.checkboxId).addEventListener('change',updateProgress);
  }
  function hydrate() {
    const { pais } = getContext();
    currentDate = dateInput.value;
    const day = registrationDay(data.draws, data.pending, { fecha:currentDate, pais, horarios:slots().map(c=>c.key) });
    baseline = new Map(day.map(slot=>[slot.horario,slot]));
    const draft = drafts.get(key(currentDate));
    slots().forEach(config => {
      const original = baseline.get(config.key)?.record;
      const savedDraft = original ? null : draft?.find(row=>row.horario===config.key);
      const input = document.getElementById(config.inputId);
      input.value = savedDraft ? savedDraft.value : original ? String(Number(original.numero)).padStart(2,'0') : '';
      input.removeAttribute('aria-invalid');
      document.getElementById(config.checkboxId).checked = savedDraft ? savedDraft.isTest : !!original?.isTest;
    });
    const resume = registrationResume(data.draws,data.pending,{pais,today:getTodayISODate()});
    latestButton.disabled = !resume.latest || busy;
    latestButton.dataset.date = resume.latest || '';
    latestButton.textContent = resume.latest ? `Última fecha con datos: ${formatFriendlyDate(resume.latest)}` : 'Aún no hay sorteos registrados';
    context.textContent = `${formatFriendlyDate(currentDate)} · ${pais || 'HN'}`;
    loaded = true; remember(); updateProgress();
  }
  function focusMissing(suffix) {
    const active = slots();
    const target = suffix ? active.find(config=>config.inputId===`n-${suffix}`) : active.find(config=>!document.getElementById(config.inputId).value.trim());
    document.getElementById((target || active[0]).inputId).focus();
  }
  function selectDate(fecha) {
    if (!validRegistrationDate(fecha) || fecha > getTodayISODate()) return;
    stashDraft();
    changingContext = true;
    dateInput.value = fecha;
    dateInput.dispatchEvent(new Event('change',{bubbles:true}));
    changingContext = false;
    hydrate();
  }
  dateInput.addEventListener('change', () => {
    if (changingContext) return;
    explicitlySelected = true;
    if (dialog.open) {
      if (!validRegistrationDate(dateInput.value) || dateInput.value > getTodayISODate()) {
        selectDate(currentDate);
        progress.textContent = 'Elige una fecha válida hasta hoy.';
        return;
      }
      stashDraft(); hydrate();
    }
  });
  document.getElementById('register-previous').addEventListener('click',()=>{ selectDate(shiftRegistrationDate(currentDate,-1)); });
  document.getElementById('register-next').addEventListener('click',()=>{ selectDate(shiftRegistrationDate(currentDate,1)); });
  latestButton.addEventListener('click',()=>{ if (latestButton.dataset.date) selectDate(latestButton.dataset.date); });
  document.getElementById('close-register-result').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{ stashDraft(true); placeholder.after(picker); [dateInput,document.getElementById('day-date-button'),document.getElementById('day-calendar-year')].forEach(el=>{el.disabled=false;}); document.getElementById('day-calendar').hidden = true; document.getElementById('day-date-button').setAttribute('aria-expanded','false'); });
  // Native dialog close runs after open becomes false, so keep drafts on the cancel path too.
  dialog.addEventListener('cancel',event=>{ if (savingTransaction) event.preventDefault(); else stashDraft(); });
  function setSaving(value, { loading = false } = {}) {
    busy = value;
    savingTransaction = value && !loading;
    document.getElementById('close-register-result').disabled = savingTransaction;
    dialog.querySelectorAll('input, [data-register-date-action], #day-date-button').forEach(el=>{ el.disabled=value || !loaded; });
    dialog.setAttribute('aria-busy',String(value));
    if (value) { save.disabled=true; saveNext.disabled=true; }
    else updateProgress();
  }
  return {
    async restoreInitialDate() {
      data = await getData();
      if (!explicitlySelected) {
        const resume = registrationResume(data.draws,data.pending,{pais:getContext().pais,today:getTodayISODate(),remembered:readDate()});
        selectDate(resume.fecha);
      }
    },
    async open(suffix) {
      const current = ++request;
      host.append(picker);
      if (!dialog.open) dialog.showModal();
      loaded = false;
      let failure = null;
      progress.textContent = 'Recuperando los resultados de esta fecha…';
      setSaving(true, { loading: true });
      try {
        data = await getData({refreshPending:true});
        if (current!==request || !dialog.open) return;
        const resume = registrationResume(data.draws,data.pending,{pais:getContext().pais,today:getTodayISODate(),remembered:readDate()});
        selectDate(suffix || explicitlySelected ? getContext().fecha : resume.fecha);
      } catch {
        failure = 'No se pudieron recuperar los resultados. Cierra y vuelve a abrir el registro.';
      } finally {
        if (current===request) { setSaving(false); if (failure) progress.textContent = failure; else if(dialog.open) focusMissing(suffix); }
      }
    },
    async reload() {
      stashDraft();
      data = await getData({refreshPending:true});
      if(dialog.open)hydrate();
      else { currentDate=dateInput.value;remember(); }
    },
    isExisting(config) { return !!baseline.get(config.key)?.record; },
    canSave: () => loaded && !busy,
    canAdvance: () => loaded && !busy && fieldsComplete() && currentDate < getTodayISODate(),
    setSaving,
    async afterSave({advance=false}={}) {
      drafts.delete(key(currentDate));
      data = await getData();
      if (advance) { currentDate=null; selectDate(shiftRegistrationDate(dateInput.value,1)); }
      else hydrate();
      focusMissing();
    },
  };
}
