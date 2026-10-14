export function initToolSelect(select, { searchable = false, label = 'Seleccionar' } = {}) {
  const abort = new AbortController();
  const opts = { signal: abort.signal };
  const root = document.createElement('div');
  root.className = 'tool-choice';
  select.before(root);
  select.hidden = true;
  root.appendChild(select);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'btn-ghost tool-choice__trigger';
  trigger.id = `${select.id}-button`;
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const popup = document.createElement('div');
  popup.className = 'tool-choice__popup'; popup.hidden = true;
  popup.id = `${select.id}-popup`; trigger.setAttribute('aria-controls', popup.id);
  const list = document.createElement('div'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
  let search = null;
  if (searchable) {
    search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Buscar número o símbolo'; search.setAttribute('aria-label', `Buscar ${label.toLowerCase()}`); popup.appendChild(search);
  }
  popup.appendChild(list); root.append(trigger, popup);
  const fieldLabel = root.closest('label') || document.querySelector(`label[for="${select.id}"]`);
  if (fieldLabel) fieldLabel.htmlFor = trigger.id;
  const close = (focus = false) => { popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (focus) trigger.focus(); };
  function filter() {
    const q = (search?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    list.querySelectorAll('button').forEach(button => { button.hidden = !button.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q); });
  }
  function update() {
    trigger.replaceChildren();
    const text = document.createElement('span'); text.textContent = select.selectedOptions[0]?.textContent || label;
    const icon = document.createElement('span'); icon.textContent = '⌄'; icon.setAttribute('aria-hidden', 'true'); trigger.append(text, icon);
    trigger.disabled = select.disabled;
    list.replaceChildren();
    [...select.options].forEach(option => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-ghost';
      button.textContent = option.textContent; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.selected)); button.disabled = option.disabled;
      button.addEventListener('click', () => { select.value = option.value; close(true); select.dispatchEvent(new Event('change', { bubbles: true })); update(); });
      list.appendChild(button);
    });
    filter();
  }
  trigger.addEventListener('click', () => { if (!popup.hidden) return close(); update(); if (search) { search.value = ''; filter(); } popup.hidden = false; trigger.setAttribute('aria-expanded', 'true'); (search || list.querySelector('[aria-selected=true]'))?.focus(); }, opts);
  trigger.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); if (popup.hidden) trigger.click(); } }, opts);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (popup.hidden) return;
    const choices = [...list.querySelectorAll('button:not([hidden]):not(:disabled)')];
    const index = choices.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const next = index < 0 ? (e.key === 'ArrowDown' ? 0 : choices.length - 1) : (index + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length; choices[next]?.focus(); }
  }, opts);
  search?.addEventListener('input', filter, opts);
  select.addEventListener('change', update, opts);
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) close(); }, opts);
  root.addEventListener('focusout', e => { if (e.relatedTarget && !root.contains(e.relatedTarget)) close(); }, opts);
  update();
  return { update, destroy: () => abort.abort() };
}
