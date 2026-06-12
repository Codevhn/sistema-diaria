/**
 * ausencia-engine.js — Detector de ausencias prolongadas y doble aparición.
 *
 * Patrón clave: cuando un número lleva mucho tiempo sin caer y de repente
 * aparece 2+ veces en el mismo día → señal de que va a repetir pronto.
 *
 * El motor hace tres cosas:
 *
 * 1. DETECTOR DE DOBLE POST-AUSENCIA (DAPA)
 *    Escanea el historial buscando eventos donde un número:
 *      a) Llevaba ≥ UMBRAL_AUSENCIA sorteos sin caer
 *      b) Cayó 2+ veces en el mismo día (doble)
 *    Para cada evento histórico mide si volvió a caer en los LOOKAHEAD
 *    sorteos siguientes. Calcula la tasa de repetición.
 *    Si hay un evento DAPA reciente (últimos VENTANA_RECIENTE sorteos),
 *    lo marca como ALERTA ACTIVA.
 *
 * 2. CANDIDATOS EN AUSENCIA PROLONGADA
 *    Números cuya ausencia actual supera significativamente su ciclo medio.
 *    Son candidatos para el patrón DAPA cuando llegue su doble.
 *
 * 3. HISTÓRICO DE DOBLES EN EL MISMO DÍA
 *    Todos los eventos de doble aparición en el día, independientemente
 *    de si había ausencia previa, para detectar tendencias.
 */

import { bayesRate } from "./stats-utils.js";

const UMBRAL_AUSENCIA    = 15;  // sorteos mínimos de ausencia para calificar como "prolongada"
const LOOKAHEAD          = 10;  // sorteos a mirar después del doble para ver si repite
const VENTANA_RECIENTE   = 9;   // últimos N sorteos para detectar evento activo (≈ 3 días)
const MIN_EVENTOS_HIST   = 3;   // mínimo de eventos históricos para calcular probabilidad
const TOP_CANDIDATOS     = 12;  // máx candidatos en ausencia a mostrar
const RATIO_AUSENCIA     = 1.6; // gap actual / ciclo medio para calificar como prolongada

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function parseAndSort(draws) {
  const ORD = { '11AM': 0, '3PM': 1, '9PM': 2 };
  return draws
    .filter(d => !d.esTest && d.fecha && !isNaN(parseInt(d.numero, 10)))
    .map(d => ({ num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || '' }))
    .sort((a, b) => {
      const dd = a.fecha.localeCompare(b.fecha);
      return dd !== 0 ? dd : (ORD[a.horario] ?? 9) - (ORD[b.horario] ?? 9);
    });
}

function meanVal(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

// ─── Calcular ausencia actual y ciclo medio para cada número ─────────────────

function buildAusenciaMap(sorted) {
  // Para cada número: índices de aparición, gap actual, ciclo medio
  const map = new Map(); // num → { idxs[], gapActual, cicloMedio }

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i].num;
    if (!map.has(n)) map.set(n, []);
    map.get(n).push(i);
  }

  const result = new Map();
  const lastIdx = sorted.length - 1;

  map.forEach((idxs, num) => {
    const gaps = [];
    for (let i = 1; i < idxs.length; i++) gaps.push(idxs[i] - idxs[i - 1]);
    const cicloMedio  = gaps.length ? meanVal(gaps) : null;
    const gapActual   = lastIdx - idxs[idxs.length - 1];
    const ultimaFecha = sorted[idxs[idxs.length - 1]].fecha;
    result.set(num, { idxs, gapActual, cicloMedio, ultimaFecha, totalHits: idxs.length });
  });

  // Números que nunca cayeron: gapActual = sorted.length (ausencia total)
  for (let n = 0; n <= 99; n++) {
    if (!result.has(n)) {
      result.set(n, { idxs: [], gapActual: sorted.length, cicloMedio: null, ultimaFecha: null, totalHits: 0 });
    }
  }

  return result;
}

// ─── Detectar eventos DAPA en el historial ────────────────────────────────────

/**
 * Busca todos los eventos "doble el mismo día tras ausencia prolongada".
 * Devuelve lista de eventos con su tasa de repetición posterior.
 */
function detectarEventosDAPAHistorico(sorted, ausenciaMap) {
  // Agrupar por fecha
  const byDay = new Map();
  sorted.forEach((d, idx) => {
    const list = byDay.get(d.fecha) || [];
    list.push({ ...d, idx });
    byDay.set(d.fecha, list);
  });

  const eventos = [];

  byDay.forEach((dayDraws, fecha) => {
    // Contar apariciones por número en este día
    const cntNum = new Map();
    dayDraws.forEach(d => cntNum.set(d.num, (cntNum.get(d.num) || 0) + 1));

    cntNum.forEach((cnt, num) => {
      if (cnt < 2) return; // necesita doble mínimo

      // El primer sorteo del día donde apareció este número
      const firstAppIdx = dayDraws.find(d => d.num === num)?.idx;
      if (firstAppIdx === undefined) return;

      // ¿Llevaba ausencia prolongada antes de este día?
      const info   = ausenciaMap.get(num);
      if (!info || !info.idxs.length) return;

      // Índice de la aparición anterior (antes del primer sorteo de hoy)
      const prevIdxs = info.idxs.filter(i => i < firstAppIdx);
      if (!prevIdxs.length) return; // nunca había caído antes

      const prevIdx    = prevIdxs[prevIdxs.length - 1];
      const ausenciaPrevia = firstAppIdx - prevIdx - 1; // sorteos de ausencia

      if (ausenciaPrevia < UMBRAL_AUSENCIA) return; // no era ausencia prolongada

      // ¿Volvió a caer en los siguientes LOOKAHEAD sorteos?
      const afterDraws = sorted.slice(firstAppIdx + 1, firstAppIdx + 1 + LOOKAHEAD);
      const repitioEn  = afterDraws.findIndex(d => d.num === num);
      const repitio    = repitioEn !== -1;

      eventos.push({
        num,
        fecha,
        ausenciaPrevia,  // sorteos de ausencia antes del doble
        vecesEnDia: cnt,
        repitio,
        repitioEn: repitio ? repitioEn + 1 : null, // en qué sorteo posterior
        idxEvento: firstAppIdx,
      });
    });
  });

  return eventos.sort((a, b) => a.idxEvento - b.idxEvento);
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {Array}  draws
 * @param {object} guia
 * @param {object} opts
 * @param {string} [opts.pais]
 * @returns {object|null}
 */
export function analizarAusencias(draws, guia = {}, { pais = null } = {}) {
  const filtered = pais
    ? draws.filter(d => (d.pais || '').toUpperCase() === pais.toUpperCase())
    : draws;

  const sorted = parseAndSort(filtered);
  if (sorted.length < 60) return null;

  const ausenciaMap = buildAusenciaMap(sorted);

  // ── 1. Eventos DAPA históricos ───────────────────────────────────────────────
  const eventosHist = detectarEventosDAPAHistorico(sorted, ausenciaMap);

  // Tasa global de repetición post-DAPA, suavizada con prior Beta(1,1):
  // con muestras de 3-5 eventos, la tasa cruda (2/3 = "67%") exagera la
  // certeza; el suavizado la acerca a 50% hasta que haya evidencia real.
  const tasaRepeticion = eventosHist.length >= MIN_EVENTOS_HIST
    ? bayesRate(eventosHist.filter(e => e.repitio).length, eventosHist.length)
    : null;

  // Distribución de cuándo repite (sorteo 1, 2, 3...)
  const distRepeticion = new Array(LOOKAHEAD).fill(0);
  eventosHist.filter(e => e.repitio && e.repitioEn != null)
    .forEach(e => { if (e.repitioEn <= LOOKAHEAD) distRepeticion[e.repitioEn - 1]++; });

  // ── 2. Eventos DAPA recientes (alerta activa) ───────────────────────────────
  const corteReciente = sorted.length - VENTANA_RECIENTE;
  const eventosRecientes = eventosHist.filter(e => e.idxEvento >= corteReciente);

  // ── 3. Candidatos en ausencia prolongada ────────────────────────────────────
  const candidatosAusencia = [];
  ausenciaMap.forEach((info, num) => {
    if (info.cicloMedio === null || info.totalHits < 3) return;
    const ratio = info.gapActual / info.cicloMedio;
    if (ratio < RATIO_AUSENCIA) return;
    candidatosAusencia.push({
      num,
      gapActual: info.gapActual,
      cicloMedio: Math.round(info.cicloMedio * 10) / 10,
      ratio: Math.round(ratio * 10) / 10,
      ultimaFecha: info.ultimaFecha,
    });
  });
  candidatosAusencia.sort((a, b) => b.ratio - a.ratio);
  const topAusencia = candidatosAusencia.slice(0, TOP_CANDIDATOS);

  // ── 4. Dobles del mismo día recientes (últimos 14 días) ─────────────────────
  const hoy   = sorted[sorted.length - 1]?.fecha || '';
  const hace14 = new Date(new Date(`${hoy}T12:00:00`).getTime() - 14 * 86400000)
    .toISOString().slice(0, 10);

  const doblesRecientes = eventosHist
    .filter(e => e.fecha >= hace14)
    .map(e => ({
      num:           e.num,
      fecha:         e.fecha,
      vecesEnDia:    e.vecesEnDia,
      ausenciaPrevia: e.ausenciaPrevia,
      repitio:       e.repitio,
      repitioEn:     e.repitioEn,
    }));

  return {
    eventosHistoricos: eventosHist.length,
    tasaRepeticion,           // null si no hay suficientes eventos
    distRepeticion,           // [n sorteos después: cuántas veces repitió]
    eventosRecientes,         // alertas activas
    topAusencia,              // números en ausencia prolongada
    doblesRecientes,          // dobles en últimos 14 días
    sorted,                   // para referencia (no renderizar directo)
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderAusenciasHTML(resultado, guia = {}) {
  if (!resultado) return '';

  const {
    eventosHistoricos, tasaRepeticion, distRepeticion,
    eventosRecientes, topAusencia, doblesRecientes,
  } = resultado;

  const p   = n => String(n).padStart(2, '0');
  const pct = r => `${Math.round(r * 100)}%`;

  // ── Chip de número con imagen ─────────────────────────────────────────────
  function numCard(num, extra = '', cls = '') {
    const pd  = p(num);
    const sym = guia[pd]?.simbolo || '';
    return `
      <div class="aus-card ${cls}">
        <img class="aus-card__img" src="data/img/${pd}.png" alt="${pd}"
          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
        <span class="aus-card__num">${pd}</span>
        ${sym ? `<span class="aus-card__sym">${sym}</span>` : ''}
        ${extra ? `<span class="aus-card__extra">${extra}</span>` : ''}
      </div>`;
  }

  // ── Sección 1: alertas activas (DAPA reciente) ───────────────────────────
  let alertasHtml = '';
  if (eventosRecientes.length) {
    const cards = eventosRecientes.map(e => {
      const pd  = p(e.num);
      const sym = guia[pd]?.simbolo || '';
      const repTxt = e.repitio
        ? `<span class="aus-alert__rep aus-alert__rep--si">✓ Repitió al sorteo ${e.repitioEn}</span>`
        : `<span class="aus-alert__rep aus-alert__rep--pend">⏳ Pendiente de repetir</span>`;
      return `
        <div class="aus-alert">
          <div class="aus-alert__img-wrap">
            <img class="aus-alert__img" src="data/img/${pd}.png" alt="${pd}"
              onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
          </div>
          <div class="aus-alert__body">
            <span class="aus-alert__num">${pd}</span>
            ${sym ? `<span class="aus-alert__sym">${sym}</span>` : ''}
            <span class="aus-alert__desc">
              Cayó <strong>${e.vecesEnDia}×</strong> el <strong>${e.fecha}</strong>
              tras <strong>${e.ausenciaPrevia}</strong> sorteos de ausencia
            </span>
            ${repTxt}
          </div>
        </div>`;
    }).join('');

    const tasaStr = tasaRepeticion !== null
      ? `Históricamente esto ocurrió ${eventosHistoricos} veces y el número repitió en el <strong>${pct(tasaRepeticion)}</strong> de los casos.`
      : '';

    alertasHtml = `
      <div class="aus-section aus-section--alerta">
        <div class="aus-section__title">🚨 Doble post-ausencia — evento activo</div>
        <p class="aus-hint">${tasaStr}</p>
        ${cards}
      </div>`;
  }

  // ── Sección 2: dobles recientes (últimos 14 días) ───────────────────────
  let doblesHtml = '';
  if (doblesRecientes.length) {
    const rows = doblesRecientes.map(e => {
      const pd   = p(e.num);
      const sym  = guia[pd]?.simbolo || '';
      const ausStr = e.ausenciaPrevia >= UMBRAL_AUSENCIA
        ? `<span class="aus-dbl-aus aus-dbl-aus--larga">${e.ausenciaPrevia} sorteos ausente</span>`
        : `<span class="aus-dbl-aus">${e.ausenciaPrevia} sorteos ausente</span>`;
      const repStr = e.repitio
        ? `<span class="aus-dbl-rep aus-dbl-rep--si">↻ repitió (s${e.repitioEn})</span>`
        : `<span class="aus-dbl-rep aus-dbl-rep--pend">↻ sin repetición aún</span>`;
      return `
        <div class="aus-dbl-row">
          <img class="aus-dbl-img" src="data/img/${pd}.png" alt="${pd}"
            onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
          <span class="aus-dbl-num">${pd}</span>
          ${sym ? `<span class="aus-dbl-sym">${sym}</span>` : ''}
          <span class="aus-dbl-fecha">${e.fecha}</span>
          <span class="aus-dbl-veces">${e.vecesEnDia}× ese día</span>
          ${ausStr}
          ${repStr}
        </div>`;
    }).join('');

    doblesHtml = `
      <div class="aus-section">
        <div class="aus-section__title">📆 Dobles recientes (últimos 14 días)</div>
        <div class="aus-dbls">${rows}</div>
      </div>`;
  }

  // ── Sección 3: candidatos en ausencia prolongada ─────────────────────────
  let candidatosHtml = '';
  if (topAusencia.length) {
    const cards = topAusencia.map(c => {
      const cls = c.ratio >= 3 ? 'aus-card--critical'
                : c.ratio >= 2 ? 'aus-card--high'
                : 'aus-card--mid';
      return numCard(c.num, `${c.gapActual}/${Math.round(c.cicloMedio)}`, cls);
    }).join('');

    candidatosHtml = `
      <div class="aus-section">
        <div class="aus-section__title">
          ⏳ En ausencia prolongada — candidatos para el patrón
          <span class="aus-section__badge">${topAusencia.length} números</span>
        </div>
        <p class="aus-hint">Números cuyo gap actual supera ×${RATIO_AUSENCIA} su ciclo medio. Si alguno cae 2 veces en el mismo día, activa el patrón DAPA. <small>Formato: sorteos-actual / ciclo-medio</small></p>
        <div class="aus-cards">${cards}</div>
      </div>`;
  }

  // ── Sección 4: validación histórica (distribución de repetición) ─────────
  let validacionHtml = '';
  if (eventosHistoricos >= MIN_EVENTOS_HIST && tasaRepeticion !== null) {
    const maxDist = Math.max(...distRepeticion, 1);
    const bars = distRepeticion.map((n, i) => {
      const h = Math.round((n / maxDist) * 40);
      return `
        <div class="aus-dist-col" title="Sorteo ${i+1}: ${n} veces">
          <div class="aus-dist-bar" style="height:${h}px"></div>
          <span class="aus-dist-lbl">${i+1}</span>
        </div>`;
    }).join('');

    validacionHtml = `
      <details class="aus-valid">
        <summary class="aus-valid__toggle">
          Validación histórica — ${eventosHistoricos} eventos · tasa ${pct(tasaRepeticion)}
        </summary>
        <div class="aus-valid__body">
          <p class="aus-hint">En cuántos sorteos después del doble post-ausencia volvió a repetir el número:</p>
          <div class="aus-dist">${bars}</div>
        </div>
      </details>`;
  }

  if (!alertasHtml && !doblesHtml && !candidatosHtml) {
    return `
      <div class="aus-wrap">
        <div class="aus-head">
          <span class="aus-title">⏳ Ausencias y doble aparición</span>
        </div>
        <p class="aus-hint">Sin eventos DAPA recientes y sin ausencias prolongadas detectadas.</p>
      </div>`;
  }

  return `
    <div class="aus-wrap">
      <div class="aus-head">
        <span class="aus-title">⏳ Ausencias y doble aparición</span>
        <span class="aus-sub">Números con ausencia prolongada que caen 2× en el mismo día → señal de repetición</span>
      </div>
      ${alertasHtml}
      ${doblesHtml}
      ${candidatosHtml}
      ${validacionHtml}
    </div>`;
}
