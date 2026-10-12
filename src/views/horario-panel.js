import { consultarHorarioFavorito, HORAS_DIARIA } from '../horario-engine.js';

export function renderHorarioFavorito(result) {
  const number = String(result.numero).padStart(2, '0');
  const count = (n) => n.toLocaleString('es-HN');
  if (!result.totalSorteos) return '<p class="hf-empty">No hay sorteos válidos de Honduras en el historial disponible.</p>';
  const title = !result.total ? 'Sin apariciones registradas'
    : result.favoritos.length > 1 ? 'Empate entre horarios' : 'Horario con más apariciones';
  const winner = result.favoritos.map(t => HORAS_DIARIA[t]).join(' · ');
  return `<div class="hf-summary">
    <div class="hf-number-block"><span class="hf-eyebrow">Número consultado</span><div class="hf-number">${number}</div><span class="hf-number-caption">La Diaria · Honduras</span></div>
    <div class="hf-summary__answer"><span class="hf-eyebrow">${title}</span><h3>${winner || `El ${number} aún no aparece en este historial.`}</h3>
    <p>${count(result.total)} apariciones · ${count(result.totalSorteos)} sorteos analizados<br>Desde ${result.desde} hasta ${result.hasta} · Honduras</p></div>
  </div>
  <div class="hf-grid">${result.turnos.map(t => `<article class="hf-card ${result.favoritos.includes(t.horario) ? 'hf-card--favorite' : ''}">
    <div class="hf-card__head"><h3><span class="hf-clock" aria-hidden="true">◷</span>${HORAS_DIARIA[t.horario]}</h3>${result.favoritos.includes(t.horario) ? '<span class="hf-badge">Más apariciones</span>' : ''}</div>
    <strong class="hf-count">${count(t.apariciones)}</strong><span class="hf-label">apariciones del ${number}</span>
    <div class="hf-bar" aria-hidden="true"><span style="width:${t.porcentaje.toFixed(2)}%"></span></div>
    <p><strong>${t.porcentaje.toFixed(1)}%</strong> de las apariciones del ${number}</p>
    <small>${count(t.sorteos)} sorteos disponibles en este turno</small>
  </article>`).join('')}</div>
  <p class="hf-footnote">“Favorito” significa el horario con más apariciones registradas. Se analiza todo el historial disponible, sin limitarlo a los sorteos recientes. El porcentaje reparte las apariciones del número entre horarios; no es la probabilidad de que salga. Si los turnos tienen distinta cobertura histórica, los conteos pueden reflejar esa diferencia.</p>`;
}

export function initHorarioPanel({ obtenerSorteos }) {
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
      output.innerHTML = renderHorarioFavorito(consultarHorarioFavorito(numero, draws));
    } catch {
      if (current === request) output.textContent = 'No se pudo cargar el historial. Volvé a consultar para reintentar.';
    } finally {
      if (current === request) output.removeAttribute('aria-busy');
    }
  });
}
