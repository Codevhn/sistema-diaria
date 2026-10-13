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
  const cards = entries => entries.map(entry => `<article class="monthly-rank-row">
    <span class="monthly-position">${entry.apariciones ? `#${entry.puesto}` : '—'}</span>
    <strong class="monthly-number ${entry.puesto === 1 ? 'monthly-number--first' : ''}">${pad(entry.numero)}</strong>
    <div class="monthly-symbol"><span>${escape(guia[pad(entry.numero)]?.simbolo || 'Sin símbolo')}</span><div class="monthly-track" aria-hidden="true"><span style="width:${(entry.apariciones / max * 100).toFixed(2)}%"></span></div></div>
    <strong class="monthly-count">${entry.apariciones}</strong><span class="monthly-share">${entry.porcentaje.toFixed(1)}%</span>
  </article>`).join('');
  const zero = result.ranking.filter(entry => !entry.apariciones);
  const leader = result.lideres[0];
  return `<div class="monthly-stats"><div><strong>${count(result.total)}</strong><span>sorteos registrados</span></div><div><strong>${result.distintos}</strong><span>números diferentes</span></div><div><strong>${result.diasRegistrados}</strong><span>días con registros</span></div><p>${escape(nombreMes(result.mes))} · ${result.desde} → ${result.hasta}</p></div>
  <div class="monthly-layout"><div class="monthly-list"><div class="monthly-table-head"><span>Puesto</span><span>Número</span><span>Símbolo / frecuencia</span><span>Veces</span><span>%</span></div>${cards(result.ranking.filter(entry => entry.apariciones).slice(0, 10))}
  ${result.distintos > 10 ? `<details class="monthly-more"><summary>Ver los ${result.distintos - 10} números restantes ↓</summary>${cards(result.ranking.filter(entry => entry.apariciones).slice(10))}</details>` : ''}
  ${zero.length ? `<details class="mr-zero"><summary>Ver ${zero.length} números que no salieron · 0 apariciones</summary>${cards(zero)}</details>` : ''}</div>
  <aside><div class="monthly-feature"><span class="product-eyebrow">${result.lideres.length > 1 ? 'Primer puesto compartido' : 'El más frecuente del mes'}</span><strong>${pad(leader.numero)}</strong><h2>${escape(guia[pad(leader.numero)]?.simbolo || 'Sin símbolo')}</h2><div><b>${leader.apariciones}</b><span>apariciones registradas</span></div><div><b>${leader.porcentaje.toFixed(1)}%</b><span>del total mensual</span></div>${result.lideres.length > 1 ? `<p>Empatado con ${result.lideres.slice(1).map(entry => pad(entry.numero)).join(', ')}.</p>` : ''}</div><p class="monthly-explanation">Porcentaje = apariciones del número ÷ ${count(result.total)} sorteos registrados × 100. Las barras comparan cada conteo con el mayor del mes. Incluye los tres turnos; excluye pruebas y pendientes. Un mes en curso o con datos faltantes puede estar incompleto.</p></aside></div>`;
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
