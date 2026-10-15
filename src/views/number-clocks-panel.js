import { buildNumberClocks, elapsedParts } from '../number-clocks.js';

const lastDateFormat = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatLastDate = iso => lastDateFormat.format(new Date(`${iso}T00:00:00Z`));

const pad = n => String(n).padStart(2, '0');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function initNumberClocksPanel({ obtenerSorteos, obtenerGuia }) {
  const root = document.getElementById('view-clocks');
  const grid = document.getElementById('number-clocks-grid');
  const search = document.getElementById('number-clocks-search');
  const status = document.getElementById('number-clocks-status');
  const summary = document.getElementById('number-clocks-summary');
  const refreshButton = document.getElementById('number-clocks-refresh');
  if (!root || !grid || !search || !status || !summary || !refreshButton) return { setActive() {}, onDrawsChanged: () => Promise.resolve() };
  let active = false, loaded = false, dirty = true, timer = null, request = 0;
  let records = [], visible = [], order = 'number';

  function tick() {
    const now = Date.now();
    for (const card of visible) {
      if (!card.record.last) continue;
      const parts = elapsedParts(card.record.last.at, now);
      card.clock.hidden = !parts;
      card.waiting.hidden = !!parts;
      if (!parts) continue;
      for (const [key, node] of Object.entries(card.units)) {
        const value = key === 'days' ? String(parts[key]) : pad(parts[key]);
        if (node.textContent !== value) node.textContent = value;
      }
    }
  }
  function stop() { clearInterval(timer); timer = null; }
  function start() {
    stop();
    if (!active || document.hidden || !loaded) return;
    tick();
    timer = setInterval(tick, 1000);
  }
  function filter() {
    const query = normalize(search.value);
    const exact = /^\d{1,2}$/.test(query) ? Number(query) : null;
    const sorted = records.slice().sort((a, b) => order === 'number' ? a.record.numero - b.record.numero : (a.record.last?.at ?? Infinity) - (b.record.last?.at ?? Infinity) || a.record.numero - b.record.numero);
    visible = [];
    for (const card of sorted) {
      card.element.hidden = exact === null ? !normalize(card.symbol).includes(query) && !pad(card.record.numero).includes(query) : card.record.numero !== exact;
      if (!card.element.hidden) visible.push(card);
      grid.appendChild(card.element);
    }
    status.textContent = visible.length ? `${visible.length} de 100 números` : 'No hay números que coincidan con la búsqueda.';
    tick();
  }
  function render(result) {
    const guia = obtenerGuia();
    grid.replaceChildren();
    records = result.numbers.map(record => {
      const number = pad(record.numero);
      const symbol = guia[number]?.simbolo || 'Sin símbolo';
      const element = document.createElement('article');
      element.className = 'number-clock';
      element.dataset.number = number;
      const last = record.last;
      element.innerHTML = `<div class="number-clock__identity"><div><strong>${number}</strong><span>${escape(symbol)}</span></div><img src="data/img/${number}.png" alt="${escape(symbol)}" loading="lazy" decoding="async"></div>
        ${last ? `<div class="number-clock__elapsed" role="timer" aria-live="off" aria-label="Tiempo sin salir"><div class="number-clock__days"><b data-unit="days"></b><span>días</span></div><div class="number-clock__time"><span><b data-unit="hours"></b><small>horas</small></span><i aria-hidden="true">:</i><span><b data-unit="minutes"></b><small>min</small></span><i aria-hidden="true">:</i><span><b data-unit="seconds"></b><small>seg</small></span></div></div><p class="number-clock__waiting" hidden>La hora del sorteo es posterior a la hora actual.</p><p class="number-clock__last">Última aparición<br><b>${formatLastDate(last.fecha)} · ${last.horario}</b></p>` : '<p class="number-clock__missing">Sin aparición registrada</p>'}`;
      element.querySelector('img').addEventListener('error', event => { event.currentTarget.hidden = true; });
      return {
        record, symbol, element,
        clock: element.querySelector('[role=timer]'),
        waiting: element.querySelector('.number-clock__waiting'),
        units: Object.fromEntries([...element.querySelectorAll('[data-unit]')].map(node => [node.dataset.unit, node])),
      };
    });
    summary.textContent = result.latest ? `Último sorteo disponible: ${formatLastDate(result.latest.fecha)} · ${result.latest.horario}. ${result.total.toLocaleString('es-HN')} registros analizados.${result.future ? ` ${result.future} registros con hora futura excluidos.` : ''}` : 'No hay sorteos válidos disponibles en el historial.';
    filter();
  }
  async function refresh(force = false) {
    const current = ++request;
    refreshButton.disabled = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = 'Cargando las últimas apariciones…';
    try {
      const draws = await obtenerSorteos(force);
      if (current !== request) return;
      const result = buildNumberClocks(draws);
      render(result);
      loaded = true;
      dirty = false;
      start();
    } catch {
      if (current === request) status.textContent = 'No se pudo actualizar el historial. Intenta nuevamente con Actualizar datos.';
    } finally {
      if (current === request) { refreshButton.disabled = false; root.removeAttribute('aria-busy'); }
    }
  }
  search.addEventListener('input', filter);
  root.querySelectorAll('[data-clock-order]').forEach(button => button.addEventListener('click', () => {
    order = button.dataset.clockOrder;
    root.querySelectorAll('[data-clock-order]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    filter();
  }));
  refreshButton.addEventListener('click', () => refresh(true));
  document.addEventListener('visibilitychange', start);
  return {
    setActive(value) {
      active = value;
      if (!active) { stop(); return; }
      if (!loaded || dirty) refresh();
      else start();
    },
    onDrawsChanged() {
      dirty = true;
      return active ? refresh() : Promise.resolve();
    },
  };
}
