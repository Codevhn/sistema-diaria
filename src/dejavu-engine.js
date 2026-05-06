/**
 * dejavu-engine.js — "Ya vi esta jugada" — reconocimiento de secuencias similares.
 *
 * Toma los últimos WINDOW_SIZE sorteos y busca en todo el historial
 * ventanas de igual tamaño con características parecidas (mismo número,
 * misma familia, espejo, complemento, decena, terminación).
 *
 * Por cada ventana similar encontrada recoge los LOOKAHEAD sorteos
 * siguientes y agrega su frecuencia para producir candidatos con
 * respaldo histórico real.
 */

const WINDOW_SIZE  = 3;   // sorteos a comparar
const LOOKAHEAD    = 3;   // sorteos a recoger tras cada match
const TOP_MATCHES  = 12;  // mejores ventanas a considerar
const MIN_SCORE    = 18;  // score mínimo para match relevante (max por par ≈ 12)
const MAX_CANDS    = 10;  // candidatos a devolver

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

// ─── Similitud entre dos números ──────────────────────────────────────────────

function scorePair(a, b, guia) {
  if (a === b) return 12;                                   // exact
  let s = 0;
  const pa = pad(a), pb = pad(b);

  // Espejo (16 ↔ 61)
  const mirror = parseInt(pb.split('').reverse().join(''), 10);
  if (a === mirror) s += 6;

  // Complemento a 99 (16 ↔ 83)
  if (a + b === 99) s += 4;

  // Misma decena (10-19 con 10-19)
  if (Math.floor(a / 10) === Math.floor(b / 10)) s += 3;

  // Misma terminación (6 y 16 y 26 …)
  if (a % 10 === b % 10) s += 3;

  // Misma familia (guía de los sueños)
  const fa = guia?.[pa]?.familia, fb = guia?.[pb]?.familia;
  if (fa && fa === fb) s += 3;

  // Misma polaridad
  const ea = guia?.[pa]?.elemento, eb = guia?.[pb]?.elemento;
  if (ea && ea === eb) s += 2;

  // Misma paridad
  if (a % 2 === b % 2) s += 1;

  // Proximidad numérica ≤ 3
  if (Math.abs(a - b) <= 3) s += 2;

  return s;
}

function scoreWindow(current, historical, guia) {
  let total = 0;
  const len = Math.min(current.length, historical.length);
  for (let i = 0; i < len; i++) {
    total += scorePair(current[i].num, historical[i].num, guia);
  }
  return total;
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {Array}  draws  — historial completo
 * @param {object} guia   — GUIA de símbolos
 * @param {object} opts
 * @param {number} [opts.windowSize] — cuántos sorteos comparar (default 3)
 * @param {string} [opts.pais]
 * @returns {object|null}
 */
export function analizarDejaVu(draws, guia = {}, { windowSize = WINDOW_SIZE, pais = null } = {}) {
  const sorted = parseAndSort(
    pais ? draws.filter(d => (d.pais || '').toUpperCase() === pais.toUpperCase()) : draws
  );
  if (sorted.length < windowSize + LOOKAHEAD + 20) return null;

  const current    = sorted.slice(-windowSize);
  const historical = sorted.slice(0, sorted.length - windowSize);

  // Evaluar todas las ventanas históricas
  const matches = [];
  for (let i = 0; i <= historical.length - windowSize - LOOKAHEAD; i++) {
    const win   = historical.slice(i, i + windowSize);
    const score = scoreWindow(current, win, guia);
    if (score >= MIN_SCORE) {
      const after = historical.slice(i + windowSize, i + windowSize + LOOKAHEAD);
      matches.push({ window: win, score, after });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, TOP_MATCHES);
  if (!top.length) return null;

  // Agregar frecuencia de candidatos
  const freq = new Map();
  top.forEach(m => {
    m.after.forEach((d, pos) => {
      const e = freq.get(d.num) || { num: d.num, hits: 0, positions: [] };
      e.hits++;
      e.positions.push(pos);
      freq.set(d.num, e);
    });
  });

  const candidatos = [...freq.values()]
    .sort((a, b) => b.hits - a.hits || a.num - b.num)
    .slice(0, MAX_CANDS);

  return {
    current,
    matches: top,
    candidatos,
    totalMatches: matches.length,
    windowSize,
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderDejaVuHTML(resultado, guia = {}) {
  if (!resultado || !resultado.candidatos.length) return '';

  const { current, matches, candidatos, totalMatches, windowSize } = resultado;
  const p = n => String(n).padStart(2, '0');

  // Secuencia actual
  const curChips = current.map(d => {
    const pd = p(d.num);
    const sym = guia[pd]?.simbolo || '';
    return `
      <div class="dv-cur-chip">
        <img class="dv-cur-chip__img" src="data/img/${pd}.png" alt="${pd}"
          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
        <span class="dv-cur-chip__num">${pd}</span>
        ${sym ? `<span class="dv-cur-chip__sym">${sym}</span>` : ''}
        <span class="dv-cur-chip__hora">${d.horario}</span>
      </div>`;
  }).join('<span class="dv-seq-arrow">→</span>');

  // Candidatos
  const candHTML = candidatos.slice(0, 8).map(c => {
    const pd  = p(c.num);
    const sym = guia[pd]?.simbolo || '';
    const pct = Math.round((c.hits / matches.length) * 100);
    const str = pct >= 60 ? 'dv-cand--strong' : pct >= 35 ? 'dv-cand--med' : '';
    return `
      <div class="dv-cand ${str}" title="${c.hits} de ${matches.length} episodios similares">
        <img class="dv-cand__img" src="data/img/${pd}.png" alt="${pd}"
          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
        <span class="dv-cand__num">${pd}</span>
        ${sym ? `<span class="dv-cand__sym">${sym}</span>` : ''}
        <span class="dv-cand__pct">${pct}%</span>
      </div>`;
  }).join('');

  // Episodios históricos (top 4)
  const episodiosHTML = matches.slice(0, 4).map(m => {
    const wChips = m.window.map(d =>
      `<span class="dv-ep-num">${p(d.num)}</span>`).join('<span class="dv-ep-arr">→</span>');
    const aChips = m.after.map(d =>
      `<span class="dv-ep-num dv-ep-num--after">${p(d.num)}</span>`).join(' ');
    const score100 = Math.round((m.score / (windowSize * 12)) * 100);
    return `
      <div class="dv-episode">
        <span class="dv-ep-date">${m.window[0]?.fecha || ''}</span>
        <span class="dv-ep-seq">${wChips}</span>
        <span class="dv-ep-then">→ luego:</span>
        <span class="dv-ep-after">${aChips}</span>
        <span class="dv-ep-score">${score100}% similar</span>
      </div>`;
  }).join('');

  return `
    <div class="dv-wrap">
      <div class="dv-head">
        <div class="dv-head__left">
          <span class="dv-title">🔁 Déjà Vu</span>
          <span class="dv-badge">${totalMatches} episodios similares en el historial</span>
        </div>
        <span class="dv-sub">Basado en los últimos ${windowSize} sorteos</span>
      </div>

      <div class="dv-current">
        <span class="dv-current__label">Secuencia actual</span>
        <div class="dv-current__chips">${curChips}</div>
      </div>

      <div class="dv-cands-label">Candidatos históricos para el próximo sorteo</div>
      <div class="dv-cands">${candHTML}</div>

      <details class="dv-details">
        <summary class="dv-details__toggle">Ver episodios similares encontrados</summary>
        <div class="dv-episodes">${episodiosHTML}</div>
      </details>

      <p class="dv-hint">
        Porcentaje = en cuántos de los ${matches.length} mejores episodios similares apareció ese número
        en los ${windowSize} sorteos siguientes.
      </p>
    </div>`;
}
