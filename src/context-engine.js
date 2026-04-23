/**
 * context-engine.js — Detector de régimen actual de La Diaria
 *
 * Detecta "rachas" estadísticamente improbables en los sorteos recientes:
 *   - Racha seca de repetidos: N sorteos sin que caiga un número ya visto antes
 *   - Racha seca de dobles:    N sorteos sin doble (00, 11, 22…)
 *   - Racha caliente de repetidos: repetidos ocurriendo más de lo esperado
 *
 * Cada contexto incluye la probabilidad de que esa racha sea aleatoria, basada
 * en la tasa histórica real del sistema.
 */

const LOOKBACK_REPETIDO = 5; // ventana de comparación para detectar repetido

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

function round1(x) { return Math.round(x * 10) / 10; }

// ─── Detección de rachas ──────────────────────────────────────────────────────

/** Calcula cuántos sorteos consecutivos recientes NO han tenido un repetido */
function rachaRepetidos(sorted) {
  let racha = 0;
  for (let i = sorted.length - 1; i >= LOOKBACK_REPETIDO; i--) {
    const prev = sorted.slice(Math.max(0, i - LOOKBACK_REPETIDO), i).map((d) => d.num);
    if (prev.includes(sorted[i].num)) break;
    racha++;
  }
  return racha;
}

/** Calcula cuántos sorteos consecutivos recientes NO han tenido un doble */
function rachaDobles(sorted) {
  let racha = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const n = sorted[i].num;
    if (Math.floor(n / 10) === n % 10) break;
    racha++;
  }
  return racha;
}

/** Tasa histórica de repetidos (excluyendo los últimos `recentN` sorteos) */
function baseRateRepetidos(sorted, recentN) {
  const base = sorted.slice(0, sorted.length - recentN);
  let hits = 0, trials = 0;
  for (let i = LOOKBACK_REPETIDO; i < base.length; i++) {
    const prev = base.slice(Math.max(0, i - LOOKBACK_REPETIDO), i).map((d) => d.num);
    if (prev.includes(base[i].num)) hits++;
    trials++;
  }
  return trials > 0 ? hits / trials : 0.18;
}

/** Tasa histórica de dobles (excluyendo los últimos `recentN` sorteos) */
function baseRateDobles(sorted, recentN) {
  const base = sorted.slice(0, sorted.length - recentN);
  if (!base.length) return 0.10;
  const hits = base.filter((d) => Math.floor(d.num / 10) === d.num % 10).length;
  return hits / base.length;
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * @param {Array}  draws
 * @param {object} [opts]
 * @param {string} [opts.pais]
 * @param {number} [opts.baselineN=80] — cuántos sorteos usar como baseline histórico
 * @returns {Array} contextos activos
 */
export function detectarContexto(draws, { pais = null, baselineN = 80 } = {}) {
  const sorted = parseDraws(draws, pais);
  if (sorted.length < baselineN + 20) return [];

  const contextos = [];

  // ── 1. Racha seca de repetidos ───────────────────────────────────────────
  const rachaRep  = rachaRepetidos(sorted);
  const baseRep   = baseRateRepetidos(sorted, baselineN);
  // Probabilidad de que esta racha (≥rachaRep sorteos sin repetido) sea aleatoria:
  // P = (1 - baseRep)^rachaRep
  const probRachaRep = Math.pow(1 - baseRep, rachaRep);

  if (rachaRep >= 5 && probRachaRep < 0.20) {
    const sev = probRachaRep < 0.05 ? "alta" : "moderada";
    contextos.push({
      id: "racha_seca_repetidos",
      tipo: "seca",
      icono: "🔁",
      titulo: "Racha seca de repetidos",
      cuerpo: `Van <strong>${rachaRep}</strong> sorteos seguidos sin repetido. Tasa histórica: ${round1(baseRep * 100)}%. La probabilidad de esta racha es solo <strong>${round1(probRachaRep * 100)}%</strong>.`,
      implicacion: "El próximo repetido podría estar estadísticamente vencido.",
      severidad: sev,
      rachaCount: rachaRep,
      prob: probRachaRep,
    });
  }

  // ── 2. Racha caliente de repetidos (demasiados) ───────────────────────────
  // Contar repetidos en los últimos `baselineN` sorteos
  const recentSlice = sorted.slice(-baselineN);
  let hitsRecientes = 0;
  for (let i = LOOKBACK_REPETIDO; i < recentSlice.length; i++) {
    const prev = recentSlice.slice(Math.max(0, i - LOOKBACK_REPETIDO), i).map((d) => d.num);
    if (prev.includes(recentSlice[i].num)) hitsRecientes++;
  }
  const rateReciente = hitsRecientes / (baselineN - LOOKBACK_REPETIDO);
  const ratioRep = baseRep > 0 ? rateReciente / baseRep : 1;

  if (ratioRep >= 1.8 && hitsRecientes >= 8) {
    contextos.push({
      id: "racha_caliente_repetidos",
      tipo: "caliente",
      icono: "🔥",
      titulo: "Racha caliente de repetidos",
      cuerpo: `Repetidos al <strong>${round1(rateReciente * 100)}%</strong> en los últimos ${baselineN} sorteos (histórico: ${round1(baseRep * 100)}%). Ratio: ${round1(ratioRep)}×.`,
      implicacion: "La Diaria está en modo repetitivo. Considerar números que ya cayeron.",
      severidad: ratioRep >= 2.5 ? "alta" : "moderada",
      rachaCount: hitsRecientes,
      prob: null,
    });
  }

  // ── 3. Racha seca de dobles ───────────────────────────────────────────────
  const rachaDobl  = rachaDobles(sorted);
  const baseDobl   = baseRateDobles(sorted, baselineN);
  const probDoble  = Math.pow(1 - baseDobl, rachaDobl);

  if (rachaDobl >= 20 && probDoble < 0.20) {
    const sev = probDoble < 0.05 ? "alta" : "moderada";
    contextos.push({
      id: "racha_seca_dobles",
      tipo: "seca",
      icono: "♊",
      titulo: "Racha seca de dobles",
      cuerpo: `Van <strong>${rachaDobl}</strong> sorteos sin doble (00–99). Tasa histórica: ${round1(baseDobl * 100)}%. Probabilidad de esta racha: <strong>${round1(probDoble * 100)}%</strong>.`,
      implicacion: "Un número doble podría estar próximo.",
      severidad: sev,
      rachaCount: rachaDobl,
      prob: probDoble,
    });
  }

  return contextos;
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderContextoHTML(contextos) {
  if (!contextos || !contextos.length) return "";

  const SEV = {
    alta:     { color: "#e05252", badge: "🔴 Alta"     },
    moderada: { color: "#e88c38", badge: "🟠 Moderada" },
    leve:     { color: "#f2c44a", badge: "🟡 Leve"     },
  };

  const items = contextos.map((ctx) => {
    const s = SEV[ctx.severidad] || SEV.moderada;
    return `
      <div class="ctx-item ctx-item--${ctx.severidad}" style="border-left:3px solid ${s.color}">
        <div class="ctx-item__head">
          <span class="ctx-icon">${ctx.icono}</span>
          <span class="ctx-titulo">${ctx.titulo}</span>
          <span class="ctx-badge" style="color:${s.color};border-color:${s.color}44;background:${s.color}11">${s.badge}</span>
        </div>
        <p class="ctx-cuerpo">${ctx.cuerpo}</p>
        <p class="ctx-implicacion">→ ${ctx.implicacion}</p>
      </div>`;
  }).join("");

  return `
    <div class="ctx-wrap">
      <div class="ctx-head">
        <span class="ctx-head__title">🧭 Régimen actual</span>
        <span class="ctx-head__sub">Comportamientos activos que se salen de lo habitual</span>
      </div>
      <div class="ctx-list">${items}</div>
    </div>`;
}
