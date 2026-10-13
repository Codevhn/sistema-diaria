import { consultarHorarioFavorito, HORAS_DIARIA } from '../horario-engine.js';

export function renderHorarioFavorito(result, guia = {}) {
  const number = String(result.numero).padStart(2, '0');
  const symbol = String(guia[number]?.simbolo || 'Sin símbolo').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const count = (n) => n.toLocaleString('es-HN');
  if (!result.totalSorteos) return '<p class="hf-empty">No hay sorteos válidos de Honduras en el historial disponible.</p>';
  const title = !result.total ? 'Sin apariciones registradas'
    : result.favoritos.length > 1 ? 'Empate entre horarios' : 'Horario con más apariciones';
  const winner = result.favoritos.map(t => HORAS_DIARIA[t]).join(' · ');
  return `<div class="number-profile"><div class="number-profile__portrait"><span class="product-eyebrow">${symbol}</span><strong>${number}</strong><p>La Diaria · Honduras</p></div>
  <div class="number-profile__data"><div class="number-profile__heading"><div><span class="product-eyebrow">${title}</span><h2>${winner || `El ${number} aún no aparece en este historial.`}</h2></div><div><strong>${count(result.total)}</strong><span>apariciones totales</span></div></div>
  ${result.turnos.map(t => `<div class="number-turn-row"><span>${HORAS_DIARIA[t.horario]}</span><div class="monthly-track" aria-hidden="true"><span style="width:${t.porcentaje.toFixed(2)}%;${result.favoritos.includes(t.horario) ? '' : 'opacity:.4'}"></span></div><strong>${count(t.apariciones)}</strong><small>${t.porcentaje.toFixed(1)}%</small></div>`).join('')}
  <p class="number-profile__note">Porcentaje sobre las ${count(result.total)} apariciones del ${number}. Historial entre ${result.desde} y ${result.hasta}. El horario más frecuente se determina por conteo; los turnos pueden tener distinta cobertura.</p></div></div>
  <div class="number-coverage">${result.turnos.map(t => `<div><span>${HORAS_DIARIA[t.horario]}</span><strong>${count(t.sorteos)}</strong><p>sorteos disponibles en este turno</p></div>`).join('')}</div>`;
}

export function initHorarioPanel({ obtenerSorteos, obtenerGuia = () => ({}) }) {
  const form = document.getElementById('hf-form');
  const input = document.getElementById('hf-numero');
  const output = document.getElementById('hf-result');
  if (!form || !input || !output) return;
  let request = 0;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const current = ++request;
    const numero = input.value.trim();
    if (!/^\d{1,2}$/.test(numero)) {
      output.textContent = 'Ingresá un número entre 00 y 99.';
      input.focus();
      return;
    }
    output.textContent = 'Consultando todo el historial…';
    output.setAttribute('aria-busy', 'true');
    try {
      const draws = await obtenerSorteos();
      if (current !== request) return;
      output.innerHTML = renderHorarioFavorito(consultarHorarioFavorito(numero, draws), obtenerGuia());
    } catch {
      if (current === request) output.textContent = 'No se pudo cargar el historial. Volvé a consultar para reintentar.';
    } finally {
      if (current === request) output.removeAttribute('aria-busy');
    }
  });
}
