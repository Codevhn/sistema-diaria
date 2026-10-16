export function initProductShell({ navigate, getDayContext }) {
  const header = document.querySelector('.app-header');
  const numberTabs = document.getElementById('number-workspace-tabs');
  const tabs = [...(numberTabs?.querySelectorAll('[role="tab"]') || [])];
  numberTabs?.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    navigate(tabs[next].dataset.view);
    tabs[next].focus({ preventScroll: true });
  });
  const menus = [...header.querySelectorAll('.app-menu')];
  menus.forEach(menu => menu.querySelectorAll('.app-menu__panel button').forEach((button, index) => button.style.setProperty('--menu-order', String(index))));
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    menu.querySelector('summary')?.setAttribute('aria-expanded', String(menu.open));
    if (menu.open) menus.filter(other => other !== menu).forEach(other => other.open = false);
  }));
  document.addEventListener('pointerdown', event => menus.forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    menus.filter(menu => menu.open).forEach(menu => { menu.open = false; menu.querySelector('summary')?.focus(); });
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button && !button.disabled) { navigate(button.dataset.view); menus.forEach(menu => menu.open = false); }
  });
  const historyFilters = document.getElementById('history-filters');
  if (historyFilters) {
    historyFilters.addEventListener('toggle', () => historyFilters.querySelector('summary').setAttribute('aria-expanded', String(historyFilters.open)));
    document.addEventListener('pointerdown', event => { if (!historyFilters.contains(event.target)) historyFilters.open = false; });
    historyFilters.addEventListener('keydown', event => { if (event.key === 'Escape' && historyFilters.open) { event.preventDefault(); historyFilters.open = false; historyFilters.querySelector('summary').focus(); } });
  }
  const dialog = document.getElementById('register-result-dialog');
  const openRegister = suffix => {
    if (document.documentElement.dataset.role === 'lector') return;
    navigate('day');
    const context = getDayContext();
    document.getElementById('register-result-context').textContent = `${context.fecha || ''} · ${context.pais || 'HN'}`;
    if (!dialog.open) dialog.showModal();
    const field = document.getElementById(`n-${suffix || '11'}`);
    if (field && field.closest('[data-register-field]')?.classList.contains('hidden') !== true) field.focus();
  };
  document.addEventListener('click', event => {
    if (event.target.closest('[data-register-result]')) openRegister();
    const button = event.target.closest('[data-register-turn]');
    if (button) openRegister(button.dataset.registerTurn);
  });
  document.getElementById('close-register-result')?.addEventListener('click', () => dialog.close());
  document.getElementById('day-number-query')?.addEventListener('submit', event => {
    event.preventDefault();
    const value = document.getElementById('day-explore-number').value.trim();
    if (!/^\d{1,2}$/.test(value)) return;
    document.getElementById('hf-numero').value = value;
    navigate('horario');
    document.getElementById('hf-form').requestSubmit();
  });
  return key => {
    const isNumberWorkspace = tabs.some(tab => tab.dataset.view === key);
    if (numberTabs) numberTabs.hidden = !isNumberWorkspace;
    tabs.forEach(tab => {
      const selected = tab.dataset.view === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    header.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.primaryNav === 'number-workspace' ? isNumberWorkspace : button.dataset.view === key;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    menus.forEach(menu => menu.classList.toggle('active', !!menu.querySelector(`[data-view="${key}"]`)));
  };
}

export function renderRecentRecords(target, draws, guia = {}) {
  if (!target) return;
  const rows = draws.filter(draw => !draw.isTest && !draw.isPending).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || ['11AM','12PM','3PM','6PM','9PM'].indexOf(b.horario) - ['11AM','12PM','3PM','6PM','9PM'].indexOf(a.horario)).slice(0, 4);
  target.replaceChildren();
  if (!rows.length) { target.textContent = 'Aún no hay resultados registrados.'; return; }
  for (const draw of rows) {
    const row = document.createElement('div'); row.className = 'product-recent-row';
    const date = document.createElement('span'); date.textContent = draw.fecha;
    const number = document.createElement('strong'); number.textContent = String(draw.numero).padStart(2, '0');
    const symbol = document.createElement('span'); symbol.textContent = guia[number.textContent]?.simbolo || 'Sin símbolo';
    const time = document.createElement('span'); time.textContent = draw.horario;
    row.append(date, number, symbol, time); target.append(row);
  }
}
