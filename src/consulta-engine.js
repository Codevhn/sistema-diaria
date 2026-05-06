/**
 * consulta-engine.js — Modo Consulta histórica.
 *
 * Dado un número (o secuencia), responde:
 *   1. Las últimas N veces que cayó ese número
 *   2. Qué vino justo ANTES (contexto previo)
 *   3. Qué vino justo DESPUÉS (los siguientes sorteos)
 *   4. Resumen de los "seguidores" más frecuentes
 *
 * Permite al jugador preguntarle al historial: "la última vez que
 * cayó el 16 en 11AM, ¿qué siguió?" y ver el patrón real.
 */

const CONTEXT_BEFORE = 2;   // sorteos previos a mostrar
const CONTEXT_AFTER  = 3;   // sorteos posteriores a mostrar
const MAX_EPISODES   = 8;   // máximo de episodios a listar
const MIN_HITS       = 2;   // mínimo de apariciones para considerar seguidor frecuente

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function parseAndSort(draws, pais) {
  const ORD = { '11AM': 0, '3PM': 1, '9PM': 2 };
  return draws
    .filter(d => {
      if (d.esTest) return false;
      if (pais && (d.pais || '').toUpperCase() !== pais.toUpperCase()) return false;
      return d.fecha && !isNaN(parseInt(d.numero, 10));
    })
    .map(d => ({ num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || '' }))
    .sort((a, b) => {
      const dd = a.fecha.localeCompare(b.fecha);
      return dd !== 0 ? dd : (ORD[a.horario] ?? 9) - (ORD[b.horario] ?? 9);
    });
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {number|string} numero    — número a consultar (0-99)
 * @param {Array}         draws
 * @param {object}        guia
 * @param {object}        opts
 * @param {string}        [opts.pais]
 * @param {string}        [opts.horario]  — filtrar por turno (opcional)
 * @returns {object|null}
 */
export function consultarNumero(numero, draws, guia = {}, { pais = null, horario = null } = {}) {
  const target  = parseInt(numero, 10);
  if (isNaN(target) || target < 0 || target > 99) return null;

  const sorted = parseAndSort(draws, pais);
  if (!sorted.length) return null;

  // Índices donde cayó el número (opcionalmente filtrando por horario)
  const hits = sorted
    .map((d, i) => ({ ...d, idx: i }))
    .filter(d => d.num === target && (!horario || d.horario === horario));

  if (!hits.length) return { target, pad: pad(target), hits: [], seguidores: [], antecesores: [] };

  // Construir episodios: antes + el número + después
  const episodes = hits.slice().reverse().slice(0, MAX_EPISODES).map(h => {
    const before = sorted.slice(Math.max(0, h.idx - CONTEXT_BEFORE), h.idx);
    const after  = sorted.slice(h.idx + 1, h.idx + 1 + CONTEXT_AFTER);
    return { draw: h, before, after };
  });

  // Frecuencia de seguidores (los que vienen DESPUÉS)
  const segFreq = new Map();
  hits.forEach(h => {
    const after = sorted.slice(h.idx + 1, h.idx + 1 + CONTEXT_AFTER);
    after.forEach((d, pos) => {
      const e = segFreq.get(d.num) || { num: d.num, hits: 0, positions: [] };
      e.hits++;
      e.positions.push(pos);
      segFreq.set(d.num, e);
    });
  });
  const seguidores = [...segFreq.values()]
    .filter(s => s.hits >= MIN_HITS)
    .sort((a, b) => b.hits - a.hits || a.num - b.num)
    .slice(0, 10);

  // Frecuencia de antecesores (los que vienen ANTES)
  const antFreq = new Map();
  hits.forEach(h => {
    const before = sorted.slice(Math.max(0, h.idx - CONTEXT_BEFORE), h.idx);
    before.forEach(d => {
      const e = antFreq.get(d.num) || { num: d.num, hits: 0 };
      e.hits++;
      antFreq.set(d.num, e);
    });
  });
  const antecesores = [...antFreq.values()]
    .filter(a => a.hits >= MIN_HITS)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8);

  // Distribución por horario
  const porHorario = { '11AM': 0, '3PM': 0, '9PM': 0 };
  hits.forEach(h => { if (porHorario[h.horario] !== undefined) porHorario[h.horario]++; });

  // Último y primer appearance
  const ultimaVez  = hits[hits.length - 1];
  const primeraVez = hits[0];
  const sorteosDesde = (sorted.length - 1) - ultimaVez.idx;

  return {
    target, pad: pad(target),
    info: guia[pad(target)] || {},
    totalHits: hits.length,
    sorteosDesde,
    ultimaVez,
    primeraVez,
    porHorario,
    episodes,
    seguidores,
    antecesores,
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

function numChip(num, guia, cls = '') {
  const pd  = pad(num);
  const sym = guia[pd]?.simbolo || '';
  return `
    <span class="cq-chip ${cls}" title="${sym}">
      <img class="cq-chip__img" src="data/img/${pd}.png" alt="${pd}"
        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
      <span class="cq-chip__num">${pd}</span>
      ${sym ? `<span class="cq-chip__sym">${sym}</span>` : ''}
    </span>`;
}

export function renderConsultaHTML(resultado, guia = {}) {
  if (!resultado) return '';

  const { target, pad: pd, info, totalHits, sorteosDesde,
          ultimaVez, porHorario, episodes, seguidores, antecesores } = resultado;

  if (!totalHits) {
    return `<div class="cq-wrap"><p class="hint small">El número ${pd} no aparece en el historial.</p></div>`;
  }

  // Cabecera
  const headerHTML = `
    <div class="cq-header">
      <div class="cq-header__img-wrap">
        <img class="cq-header__img" src="data/img/${pd}.png" alt="${pd}"
          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
      </div>
      <div class="cq-header__info">
        <span class="cq-header__num">${pd}</span>
        ${info.simbolo ? `<span class="cq-header__sym">${info.simbolo}</span>` : ''}
        ${info.familia ? `<span class="cq-header__fam">${info.familia}</span>` : ''}
        <span class="cq-header__stats">
          Cayó <strong>${totalHits}</strong> veces ·
          Última: <strong>${ultimaVez.fecha} ${ultimaVez.horario}</strong> ·
          <strong>${sorteosDesde}</strong> sorteos sin caer
        </span>
        <div class="cq-horario-row">
          ${['11AM','3PM','9PM'].map(h =>
            `<span class="cq-h-chip">${h}: <strong>${porHorario[h]}</strong></span>`
          ).join('')}
        </div>
      </div>
    </div>`;

  // Seguidores frecuentes
  const segHTML = seguidores.length ? `
    <div class="cq-section">
      <div class="cq-section__title">Seguidores más frecuentes (vienen después)</div>
      <div class="cq-chips-row">
        ${seguidores.map(s => {
          const pct = Math.round((s.hits / totalHits) * 100);
          return `<div class="cq-seg-chip" title="${s.hits} veces">
            ${numChip(s.num, guia)}
            <span class="cq-seg-chip__pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Antecesores frecuentes
  const antHTML = antecesores.length ? `
    <div class="cq-section">
      <div class="cq-section__title">Antecesores frecuentes (vienen antes)</div>
      <div class="cq-chips-row">
        ${antecesores.map(a => {
          const pct = Math.round((a.hits / totalHits) * 100);
          return `<div class="cq-seg-chip" title="${a.hits} veces">
            ${numChip(a.num, guia)}
            <span class="cq-seg-chip__pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Episodios históricos
  const epHTML = episodes.length ? `
    <details class="cq-episodes">
      <summary class="cq-episodes__toggle">Ver episodios históricos (${episodes.length})</summary>
      <div class="cq-episodes__list">
        ${episodes.map(ep => {
          const beforeChips = ep.before.map(d =>
            `<span class="cq-ep-num cq-ep-num--before">${pad(d.num)}<small>${d.horario}</small></span>`
          ).join('');
          const targetChip = `<span class="cq-ep-num cq-ep-num--target">${pd}</span>`;
          const afterChips = ep.after.map(d =>
            `<span class="cq-ep-num cq-ep-num--after">${pad(d.num)}<small>${d.horario}</small></span>`
          ).join('');
          return `
            <div class="cq-episode">
              <span class="cq-ep-date">${ep.draw.fecha} ${ep.draw.horario}</span>
              <div class="cq-ep-seq">
                ${beforeChips}
                <span class="cq-ep-sep">·</span>
                ${targetChip}
                <span class="cq-ep-sep">→</span>
                ${afterChips}
              </div>
            </div>`;
        }).join('')}
      </div>
    </details>` : '';

  return `
    <div class="cq-wrap">
      ${headerHTML}
      ${segHTML}
      ${antHTML}
      ${epHTML}
      <p class="cq-hint">Porcentaje = sobre el total de ${totalHits} apariciones del número en el historial.</p>
    </div>`;
}
