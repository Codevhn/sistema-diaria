import { initToolSelect } from './tool-select.js';
import { initDayPickers } from './day-pickers.js?v=2';
import { prepareDrawCorrection } from '../draw-corrections.js';
import { formatFriendlyDate } from './format.js';

export function initDrawCorrection({ getDraw, saveDraw, getSymbol, onCorrected }) {
  const dialog = document.getElementById('draw-correction-dialog');
  const form = document.getElementById('draw-correction-form');
  const status = document.getElementById('draw-correction-status');
  const error = document.getElementById('draw-correction-error');
  const number = document.getElementById('draw-correction-number');
  const turn = document.getElementById('draw-correction-turn');
  const test = document.getElementById('draw-correction-test');
  const save = document.getElementById('draw-correction-save');
  const close = document.getElementById('draw-correction-close');
  const symbol = document.getElementById('draw-correction-symbol');
  const turnPicker = initToolSelect(turn, { label: 'Horario del sorteo' });
  let original = null, saving = false, request = 0;
  // Reuse the same calendar with independent IDs and event handlers.
  for (const [source, host] of [['day-date-picker','draw-correction-date-host'],['day-country-picker','draw-correction-country-host']]) {
    const clone = document.getElementById(source).cloneNode(true);
    [clone,...clone.querySelectorAll('*')].forEach(el=>{
      if (el.id) el.id = el.id.replace(/^day-/,'correction-');
      for(const attribute of ['for','aria-controls','aria-labelledby']) if(el.hasAttribute(attribute)) el.setAttribute(attribute,el.getAttribute(attribute).replace(/day-/g,'correction-'));
    });
    clone.querySelectorAll('.day-picker__popup').forEach(el=>el.hidden=true);
    clone.querySelectorAll('[aria-expanded]').forEach(el=>el.setAttribute('aria-expanded','false'));
    document.getElementById(host).append(clone);
  }
  document.getElementById('correction-calendar').setAttribute('aria-label','Fecha correcta del sorteo');
  const date = document.getElementById('correction-fecha');
  const dow = document.getElementById('correction-fecha-dow');
  dow.remove();
  const syncCalendar = initDayPickers({ prefix:'correction' });
  function preview() { symbol.textContent = /^\d{1,2}$/.test(number.value) ? getSymbol(Number(number.value)) : ''; }
  number.addEventListener('input', preview);
  function setBusy(value) {
    form.setAttribute('aria-busy',String(value));
    [number,turn,test,date,document.getElementById('correction-date-button'),save].forEach(el=>el.disabled=value);
    turnPicker.update();
    close.disabled=saving;
    save.textContent = saving ? 'Guardando corrección…' : 'Guardar corrección';
  }
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
  dialog.addEventListener('close',()=>{request++;document.getElementById('correction-calendar').hidden=true;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if (!original || saving) return;
    if (document.documentElement.dataset.role === 'lector') { error.textContent='Tu cuenta no tiene permiso para corregir sorteos.'; return; }
    error.textContent='';
    let changes;
    try {
      changes=prepareDrawCorrection(original,{fecha:date.value,horario:turn.value,numero:number.value.trim(),isTest:test.checked});
      if(!getSymbol(changes.numero))throw new Error('El número no tiene símbolo en la guía.');
    } catch(err) { error.textContent=err.message; return; }
    saving=true;setBusy(true);
    try {
      const updated=await saveDraw(original.id,changes,original);
      await onCorrected(updated);
      dialog.close();
    } catch(err) { error.textContent=err.message || 'No se pudo guardar la corrección. Intenta nuevamente.'; }
    finally { saving=false;setBusy(false); }
  });
  return { async open(record) {
    if(document.documentElement.dataset.role==='lector'||saving)return;
    const current=++request;original=null;error.textContent='';
    status.textContent='Recuperando el sorteo para corregirlo…';
    if(!dialog.open)dialog.showModal();setBusy(true);
    try {
      const fresh=await getDraw(record.id);
      if(current!==request||!dialog.open)return;
      if(!fresh)throw new Error('No se encontró el sorteo. Actualiza los datos y vuelve a intentarlo.');
      original=fresh;date.value=fresh.fecha;turn.value=fresh.horario;number.value=String(fresh.numero).padStart(2,'0');test.checked=!!fresh.isTest;
      syncCalendar();preview();
      status.textContent=`${fresh.isPending?'Pendiente de publicar':'Sorteo registrado'}: ${formatFriendlyDate(fresh.fecha)} · ${fresh.horario} · ${String(fresh.numero).padStart(2,'0')}.`;
      setBusy(false);number.focus();number.select();
    } catch(err) {if(current===request){error.textContent=err.message;status.textContent='No se pudo abrir el registro.';}}
    finally {if(current===request&&!original){setBusy(false);save.disabled=true;}}
  }};
}
