import { initMonthlyPickers } from '../ui/monthly-pickers.js';
import { rankingMensual, mesesDisponibles } from '../monthly-ranking-engine.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pad = n => String(n).padStart(2, '0');
const count = n => n.toLocaleString('es-HN');
export function nombreMes(mes) {
  const [year, month] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function renderRankingMensual(result, guia = {}) {
  if (!result.total) return `<div class="mr-empty">No hay sorteos registrados para ${escape(nombreMes(result.mes))}. Seleccioná otro mes.</div>`;
  const max = result.lideres[0].apariciones;
  const cards = entries => entries.map(entry => `<article class="mr-card ${entry.puesto === 1 ? 'mr-card--leader' : ''}">
    <div class="mr-card__head"><span class="mr-position">${entry.apariciones ? `#${entry.puesto}` : 'Sin apariciones'}</span>${entry.puesto === 1 ? '<span class="mr-badge">Más frecuente</span>' : ''}</div>
    <div class="mr-card__main"><div><strong class="mr-number">${pad(entry.numero)}</strong><span class="mr-symbol">${escape(guia[pad(entry.numero)]?.simbolo || 'Sin símbolo')}</span></div>
    <div class="mr-occurrences"><strong>${entry.apariciones}</strong><span>${entry.apariciones === 1 ? 'aparición' : 'apariciones'}</span></div></div>
    <div class="mr-bar" aria-hidden="true"><span style="width:${(entry.apariciones / max * 100).toFixed(2)}%"></span></div>
    <div class="mr-share"><strong>${entry.porcentaje.toFixed(1)}%</strong><span>de ${count(result.total)} sorteos del mes</span></div>
  </article>`).join('');
  const zero = result.ranking.filter(entry => !entry.apariciones);
  return `<div class="mr-overview">
    <div class="mr-overview__month"><span class="mr-eyebrow">La Diaria · Honduras</span><h3>${escape(nombreMes(result.mes))}</h3><p>Registros: ${result.desde} → ${result.hasta}</p></div>
    <div class="mr-metric"><strong>${count(result.total)}</strong><span>sorteos registrados</span></div>
    <div class="mr-metric"><strong>${result.distintos}</strong><span>números que salieron</span></div>
    <div class="mr-metric"><strong>${result.diasRegistrados}</strong><span>días con registros</span></div>
  </div>
  <div class="mr-list-head"><h3>Del más frecuente al menos frecuente</h3><span>Los empates comparten puesto</span></div>
  <div class="mr-grid">${cards(result.ranking.filter(entry => entry.apariciones))}</div>
  ${zero.length ? `<details class="mr-zero"><summary>Ver ${zero.length} números que no salieron · 0 apariciones</summary><div class="mr-grid">${cards(zero)}</div></details>` : ''}
  <p class="mr-note">Porcentaje = apariciones del número ÷ ${count(result.total)} sorteos registrados × 100. Las barras comparan cada conteo con el mayor del mes. Incluye los tres turnos; excluye pruebas y pendientes. Solo se cuentan los registros disponibles: un mes en curso o con datos faltantes puede estar incompleto.</p>`;
}

export function initMonthlyRankingPanel({ obtenerSorteos, obtenerGuia = () => ({}) }) {
  const form = document.getElementById('mr-form');
  const input = document.getElementById('mr-month');
  const output = document.getElementById('mr-result');
  const select = document.getElementById('mr-available');
  if (!form || !input || !output || !select) return () => {};
  const updatePickers = initMonthlyPickers(input, select);
  updatePickers();
  let request = 0;
  async function consultar() {
    const current = ++request;
    const requestedMonth = input.value;
    output.textContent = 'Consultando los sorteos del mes…';
    output.setAttribute('aria-busy', 'true');
    try {
      const draws = await obtenerSorteos();
      if (current !== request) return;
      const months = mesesDisponibles(draws);
      select.replaceChildren(new Option('Meses con registros', ''), ...months.map(month => new Option(nombreMes(month), month)));
      if (!requestedMonth && !months.length) { updatePickers(); output.textContent = 'No hay sorteos de Honduras disponibles para consultar.'; return; }
      input.value = requestedMonth || months[0];
      select.value = months.includes(input.value) ? input.value : '';
      updatePickers();
      output.innerHTML = renderRankingMensual(rankingMensual(input.value, draws), obtenerGuia());
    } catch {
      if (current === request) output.textContent = 'No se pudo cargar el ranking. Revisá el mes y volvé a consultar.';
    } finally {
      if (current === request) output.removeAttribute('aria-busy');
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); consultar(); });
  input.addEventListener('change', consultar);
  select.addEventListener('change', () => { if (select.value) { input.value = select.value; consultar(); } });
  return consultar;
}
