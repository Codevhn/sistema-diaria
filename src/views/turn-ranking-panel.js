import { buildTurnRanking } from '../turn-ranking.js';
import { HORAS_DIARIA } from '../horario-engine.js';
import { escapeHtml } from '../ui/format.js';

const dateFormat = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatDate = iso => dateFormat.format(new Date(`${iso}T00:00:00Z`));

const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function initTurnRankingPanel({ obtenerSorteos, obtenerGuia }) {
  const root = document.getElementById('view-turnos');
  if (!root) return { setActive() {}, onDrawsChanged() {} };
  const grid = root.querySelector('#turn-ranking-grid');
  const status = root.querySelector('#turn-ranking-status');
  const summary = root.querySelector('#turn-ranking-summary');
  const search = root.querySelector('#turn-ranking-search');
  const favorite = root.querySelector('#turn-ranking-favorite');
  const refresh = root.querySelector('#turn-ranking-refresh');
  let active = false, result = null, selected = '11AM', request = 0;

  function render() {
    if (!result) return;
    const turno = result[selected], guide = obtenerGuia(), query = normalize(search.value);
    const exact = /^\d{1,2}$/.test(query) ? Number(query) : null;
    const numbers = turno.numbers.filter(n => {
      const symbol = guide[String(n.numero).padStart(2, '0')]?.simbolo || 'Sin símbolo';
      return (!favorite.checked || n.favoritos.includes(selected)) && (exact === null ? normalize(symbol).includes(query) || String(n.numero).padStart(2, '0').includes(query) : n.numero === exact);
    });
    summary.textContent = turno.sorteos ? `${HORAS_DIARIA[selected]} · ${turno.sorteos.toLocaleString('es-HN')} sorteos registrados. Del ${formatDate(turno.desde)} al ${formatDate(turno.hasta)}.` : `${HORAS_DIARIA[selected]} · Sin sorteos registrados en este turno.`;
    status.textContent = turno.sorteos ? `${numbers.length} de 100 números${favorite.checked ? ' · Este es su horario con más apariciones (incluye empates)' : ' · De mayor a menor frecuencia'}` : 'Sin datos disponibles para elaborar el ranking.';
    grid.replaceChildren();
    if (!turno.sorteos || !numbers.length) {
      grid.textContent = turno.sorteos ? 'No hay números que coincidan con estos filtros.' : 'Actualiza los datos para comprobar si hay nuevos registros.';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const number of numbers) {
      const pad = String(number.numero).padStart(2, '0');
      const symbol = guide[pad]?.simbolo || 'Sin símbolo';
      const item = document.createElement('article');
      item.className = 'turn-ranking-number'; item.dataset.number = pad;
      item.innerHTML = `<div class="turn-ranking-number__rank">${number.puesto ? `Puesto ${number.puesto}` : 'Sin apariciones'}</div><div class="turn-ranking-number__identity"><div><strong>${pad}</strong><span>${escapeHtml(symbol)}</span></div><img src="data/img/${pad}.png" alt="" loading="lazy" decoding="async"></div><div class="turn-ranking-number__counts"><b>${number.apariciones.toLocaleString('es-HN')}</b><span>${number.apariciones === 1 ? 'aparición' : 'apariciones'} en este turno</span></div><p>${number.porcentaje.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% de los sorteos de ${HORAS_DIARIA[selected]}</p>`;
      const image = item.querySelector('img');
      image.addEventListener('error', () => { if (image.src.endsWith('.png')) image.src = `data/img/${pad}.jpg`; else image.hidden = true; });
      fragment.appendChild(item);
    }
    grid.appendChild(fragment);
  }
  async function load(force = false) {
    const current = ++request;
    refresh.disabled = true; root.setAttribute('aria-busy', 'true');
    status.textContent = 'Consultando frecuencias por horario…';
    try {
      const draws = await obtenerSorteos(force);
      if (current !== request) return;
      result = buildTurnRanking(draws); render();
    } catch {
      if (current === request) status.textContent = 'No se pudo cargar el historial. Intenta con Actualizar datos.';
    } finally {
      if (current === request) { refresh.disabled = false; root.removeAttribute('aria-busy'); }
    }
  }
  root.querySelectorAll('[data-ranking-turn]').forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.rankingTurn;
    root.querySelectorAll('[data-ranking-turn]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    render();
  }));
  search.addEventListener('input', render);
  favorite.addEventListener('change', render);
  refresh.addEventListener('click', () => load(true));
  return { setActive(value) { active = value; if (active) return load(); }, onDrawsChanged() { result = null; if (active) return load(); } };
}
