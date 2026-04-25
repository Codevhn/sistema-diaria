/**
 * post-repeticion-engine.js — Análisis estratégico post-repetido.
 *
 * Cuando La Diaria entra en un régimen de repetición, analiza qué números
 * han aparecido históricamente en los sorteos POSTERIORES a un repetido.
 *
 * Metodología:
 *   1. Identificar todos los "repetidos" en el historial
 *      (sorteo[i] cuyo número ya cayó en los últimos LOOKBACK sorteos)
 *   2. Recolectar los WINDOW sorteos inmediatamente siguientes a cada repetido
 *   3. Calcular la frecuencia de cada número en esas ventanas post-repetido
 *   4. Comparar con la frecuencia base del historial completo
 *   5. Números con ratio > BOOST_THRESHOLD son candidatos "post-repetido"
 *
 * Solo se activa si actualmente estamos en régimen de repetición
 * (los últimos N sorteos muestran repetidos por encima de la media).
 */

const LOOKBACK   = 5;   // ventana para detectar un "repetido"
const WINDOW     = 5;   // sorteos a analizar después de cada repetido
const MIN_EVENTS = 8;   // mínimo de repetidos históricos para confiar
const BOOST_THRESHOLD = 1.4; // veces más frecuente que la base para considerar candidato
const TOP_RESULTS = 10; // máximo de candidatos a mostrar

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDraws(draws, pais = null) {
  return draws
    .filter((d) => {
      if (d.esTest) return false;
      if (pais && (d.pais || "").toUpperCase() !== pais.toUpperCase()) return false;
      return d.fecha && !isNaN(parseInt(d.numero, 10));
    })
    .map((d) => ({ num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || "" }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

function isRepetido(sorted, idx) {
  if (idx < LOOKBACK) return false;
  const prev = sorted.slice(Math.max(0, idx - LOOKBACK), idx).map((d) => d.num);
  return prev.includes(sorted[idx].num);
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {Array}  draws
 * @param {object} [opts]
 * @param {string} [opts.pais]
 * @param {boolean} [opts.forceActive] — activar aunque no haya racha caliente
 * @returns {object|null}
 */
export function analizarPostRepeticion(draws, { pais = null, forceActive = false } = {}) {
  const sorted = parseDraws(draws, pais);
  if (sorted.length < 80) return null;

  // ── 1. Frecuencia base de cada número (historial completo) ─────────────────
  const baseCount = new Array(100).fill(0);
  sorted.forEach((d) => baseCount[d.num]++);
  const baseTotal = sorted.length;

  // ── 2. Encontrar todos los repetidos y recolectar ventanas post-repetido ────
  const repetidosIdx = [];
  for (let i = LOOKBACK; i < sorted.length - WINDOW; i++) {
    if (isRepetido(sorted, i)) repetidosIdx.push(i);
  }
  if (repetidosIdx.length < MIN_EVENTS) return null;

  // ── 3. Frecuencia post-repetido ────────────────────────────────────────────
  const postCount  = new Array(100).fill(0);
  let   postTotal  = 0;

  repetidosIdx.forEach((idx) => {
    const window = sorted.slice(idx + 1, idx + 1 + WINDOW);
    window.forEach((d) => { postCount[d.num]++; postTotal++; });
  });

  // ── 4. Calcular ratio boost para cada número ───────────────────────────────
  const candidatos = [];
  for (let n = 0; n <= 99; n++) {
    const baseRate = baseTotal > 0 ? baseCount[n] / baseTotal : 0;
    const postRate = postTotal > 0 ? postCount[n] / postTotal : 0;
    if (baseRate === 0 || postCount[n] < 2) continue;
    const ratio = postRate / baseRate;
    if (ratio >= BOOST_THRESHOLD) {
      candidatos.push({
        numero: n,
        baseRate,
        postRate,
        ratio,
        postHits: postCount[n],
        eventosTotal: repetidosIdx.length,
      });
    }
  }

  candidatos.sort((a, b) => b.ratio - a.ratio);
  const top = candidatos.slice(0, TOP_RESULTS);
  if (!top.length) return null;

  // ── 5. ¿Estamos actualmente en régimen de repetición? ────────────────────────
  // Contar repetidos en los últimos 20 sorteos
  const recentSlice = sorted.slice(-20);
  let recentReps = 0;
  for (let i = LOOKBACK; i < recentSlice.length; i++) {
    if (isRepetido(recentSlice, i)) recentReps++;
  }
  const recentRate  = recentReps / Math.max(1, recentSlice.length - LOOKBACK);
  const overallRate = repetidosIdx.length / Math.max(1, sorted.length - LOOKBACK);
  const enRacha     = forceActive || recentRate >= overallRate * 1.2;

  // ── 6. Último repetido detectado ─────────────────────────────────────────────
  let ultimoRepetido = null;
  for (let i = sorted.length - 1; i >= LOOKBACK; i--) {
    if (isRepetido(sorted, i)) {
      ultimoRepetido = sorted[i];
      break;
    }
  }

  return {
    candidatos: top,
    enRacha,
    recentReps,
    recentRate,
    overallRate,
    eventosHistoricos: repetidosIdx.length,
    ultimoRepetido,
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderPostRepeticionHTML(resultado, guia = {}) {
  if (!resultado) return "";

  const { candidatos, enRacha, recentReps, recentRate, overallRate,
          eventosHistoricos, ultimoRepetido } = resultado;

  const pad   = (n) => String(n).padStart(2, "0");
  const pct   = (r) => `${(r * 100).toFixed(1)}%`;
  const ratio = (r) => `${r.toFixed(1)}×`;

  // Badge de estado
  const estadoBadge = enRacha
    ? `<span class="pr-badge pr-badge--activo">🔥 Régimen activo</span>`
    : `<span class="pr-badge pr-badge--latente">⏸ Régimen latente</span>`;

  const contexto = enRacha
    ? `${recentReps} repetidos en los últimos 20 sorteos (${pct(recentRate)} vs media ${pct(overallRate)})`
    : `Basado en ${eventosHistoricos} repetidos históricos — actívate cuando La Diaria entre en racha`;

  const ultimoTxt = ultimoRepetido
    ? `Último repetido detectado: <strong>${pad(ultimoRepetido.num)}</strong> ${guia[pad(ultimoRepetido.num)]?.simbolo || ""} · ${ultimoRepetido.fecha}`
    : "";

  // Chips de candidatos
  const chips = candidatos.map((c) => {
    const p   = pad(c.numero);
    const sym = guia[p]?.simbolo || "";
    const strength = c.ratio >= 2.5 ? "pr-chip--strong"
                   : c.ratio >= 1.8 ? "pr-chip--med"
                   : "pr-chip--mild";
    return `
      <div class="pr-chip ${strength}" title="Aparece ${ratio(c.ratio)} más frecuente después de un repetido">
        <span class="pr-chip__num">${p}</span>
        ${sym ? `<span class="pr-chip__sym">${sym}</span>` : ""}
        <span class="pr-chip__ratio">${ratio(c.ratio)}</span>
      </div>`;
  }).join("");

  return `
    <div class="pr-wrap${enRacha ? " pr-wrap--activo" : ""}">
      <div class="pr-head">
        <div class="pr-head__left">
          <span class="pr-title">🔁 Post-Repetición</span>
          ${estadoBadge}
        </div>
        <span class="pr-subtitle">${contexto}</span>
      </div>
      ${ultimoTxt ? `<p class="pr-ultimo">${ultimoTxt}</p>` : ""}
      <p class="pr-desc">
        Números que aparecen significativamente más en los <strong>${5}</strong> sorteos
        posteriores a un repetido, basado en <strong>${eventosHistoricos}</strong> eventos históricos:
      </p>
      <div class="pr-chips">${chips}</div>
      <p class="pr-hint">Ratio = cuántas veces más frecuente que su media histórica después de un repetido.</p>
    </div>`;
}
