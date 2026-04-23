/**
 * anomaly-engine.js — Detector de anomalías estadísticas
 *
 * Compara el comportamiento reciente (últimos N sorteos) contra el histórico
 * usando z-score para detectar desviaciones significativas.
 *
 * Comportamientos analizados:
 *   - Repetidos     : mismo número que ya cayó en los últimos K sorteos
 *   - Dobles        : 00, 11, 22, … 99
 *   - Espejos       : 32→23, 47→74, etc.
 *   - Complementos  : n + compl = 99 → 32→67
 *   - Decenas       : distribución por rango 0x–9x
 *
 * Z-score: cuántas desviaciones estándar se aleja la tasa reciente de la esperada.
 *   |z| ≥ 1.2 → leve | ≥ 1.8 → moderada | ≥ 2.5 → alta
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HORARIO_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };

function normalizeDraws(draws, { pais = null } = {}) {
  return draws
    .filter((d) => {
      if (d.esTest) return false;
      if (pais && (d.pais || "").toUpperCase() !== pais.toUpperCase()) return false;
      return d.fecha && !isNaN(parseInt(d.numero, 10));
    })
    .map((d) => ({ num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || "" }))
    .sort((a, b) => {
      if (a.fecha < b.fecha) return -1;
      if (a.fecha > b.fecha) return 1;
      return (HORARIO_ORDER[a.horario] ?? 5) - (HORARIO_ORDER[b.horario] ?? 5);
    });
}

/** Z-score binomial: (observado - esperado) / sqrt(n·p·(1-p)) */
function zScore(hits, n, rate) {
  const expected = rate * n;
  const variance = n * rate * (1 - rate);
  if (variance <= 0 || n === 0) return 0;
  return (hits - expected) / Math.sqrt(variance);
}

function severityFromZ(z) {
  const a = Math.abs(z);
  if (a >= 2.5) return "alta";
  if (a >= 1.8) return "moderada";
  if (a >= 1.2) return "leve";
  return "normal";
}

function round3(x) { return Math.round(x * 1000) / 1000; }

// ─── Analizador: Repetidos ────────────────────────────────────────────────────

function analizarRepetidos(sorted, recentN, lookback = 5) {
  if (sorted.length < recentN + lookback + 10) return null;

  const splitAt = sorted.length - recentN;
  let baseHits = 0, baseTrials = 0;
  let recentHits = 0;

  for (let i = lookback; i < sorted.length; i++) {
    const prev = sorted.slice(Math.max(0, i - lookback), i).map((d) => d.num);
    const isHit = prev.includes(sorted[i].num);
    if (i < splitAt) { baseHits += isHit ? 1 : 0; baseTrials++; }
    else              { recentHits += isHit ? 1 : 0; }
  }

  const baseRate = baseTrials > 0 ? baseHits / baseTrials : 0;
  const z = zScore(recentHits, recentN, baseRate);

  return {
    id: "repetidos",
    icono: "🔄",
    label: "Repetidos",
    descripcion: `El número ya había caído en los ${lookback} sorteos previos`,
    baseline: round3(baseRate),
    recent: round3(recentHits / recentN),
    recentHits,
    recentN,
    z: round3(z),
    severity: severityFromZ(z),
    direccion: z < 0 ? "bajo" : "alto",
  };
}

// ─── Analizador: Dobles ───────────────────────────────────────────────────────

function analizarDobles(sorted, recentN) {
  if (sorted.length < recentN + 20) return null;
  const isDoble = (n) => Math.floor(n / 10) === n % 10;

  const base  = sorted.slice(0, -recentN);
  const recent = sorted.slice(-recentN);

  const baseRate   = base.length > 0 ? base.filter((d) => isDoble(d.num)).length / base.length : 0.1;
  const recentHits = recent.filter((d) => isDoble(d.num)).length;
  const z = zScore(recentHits, recentN, baseRate);

  return {
    id: "dobles",
    icono: "♊",
    label: "Dobles (00·11·22…)",
    descripcion: "Ambos dígitos iguales: 00, 11, 22, 33, 44, 55, 66, 77, 88, 99",
    baseline: round3(baseRate),
    recent: round3(recentHits / recentN),
    recentHits,
    recentN,
    z: round3(z),
    severity: severityFromZ(z),
    direccion: z < 0 ? "bajo" : "alto",
  };
}

// ─── Analizador: Espejos ──────────────────────────────────────────────────────

function analizarEspejos(sorted, recentN, lookback = 5) {
  if (sorted.length < recentN + lookback + 10) return null;
  const mirror = (n) => { const d = Math.floor(n / 10), u = n % 10; return d === u ? null : u * 10 + d; };

  const splitAt = sorted.length - recentN;
  let baseHits = 0, baseTrials = 0, recentHits = 0;

  for (let i = lookback; i < sorted.length; i++) {
    const m = mirror(sorted[i].num);
    if (m === null) continue;
    const prev = sorted.slice(Math.max(0, i - lookback), i).map((d) => d.num);
    const isHit = prev.includes(m);
    if (i < splitAt) { baseHits += isHit ? 1 : 0; baseTrials++; }
    else              { recentHits += isHit ? 1 : 0; }
  }

  const baseRate = baseTrials > 0 ? baseHits / baseTrials : 0;
  const z = zScore(recentHits, recentN, baseRate);

  return {
    id: "espejos",
    icono: "🪞",
    label: "Espejos (32→23)",
    descripcion: `Dígitos invertidos del número cayeron en los ${lookback} sorteos previos`,
    baseline: round3(baseRate),
    recent: round3(recentHits / recentN),
    recentHits,
    recentN,
    z: round3(z),
    severity: severityFromZ(z),
    direccion: z < 0 ? "bajo" : "alto",
  };
}

// ─── Analizador: Complementos ─────────────────────────────────────────────────

function analizarComplementos(sorted, recentN, lookback = 5) {
  if (sorted.length < recentN + lookback + 10) return null;

  const splitAt = sorted.length - recentN;
  let baseHits = 0, baseTrials = 0, recentHits = 0;

  for (let i = lookback; i < sorted.length; i++) {
    const c = 99 - sorted[i].num;
    if (c === sorted[i].num) continue; // propio complemento (no existe para ningún n≠49.5)
    const prev = sorted.slice(Math.max(0, i - lookback), i).map((d) => d.num);
    const isHit = prev.includes(c);
    if (i < splitAt) { baseHits += isHit ? 1 : 0; baseTrials++; }
    else              { recentHits += isHit ? 1 : 0; }
  }

  const baseRate = baseTrials > 0 ? baseHits / baseTrials : 0;
  const z = zScore(recentHits, recentN, baseRate);

  return {
    id: "complementos",
    icono: "⚖️",
    label: "Complementos (32+67=99)",
    descripcion: `El complemento a 99 del número cayó en los ${lookback} sorteos previos`,
    baseline: round3(baseRate),
    recent: round3(recentHits / recentN),
    recentHits,
    recentN,
    z: round3(z),
    severity: severityFromZ(z),
    direccion: z < 0 ? "bajo" : "alto",
  };
}

// ─── Analizador: Decenas ──────────────────────────────────────────────────────

function analizarDecenas(sorted, recentN) {
  if (sorted.length < recentN + 30) return null;

  const base   = sorted.slice(0, -recentN);
  const recent = sorted.slice(-recentN);
  const dec    = (n) => Math.floor(n / 10);

  const subAnomalias = [];
  for (let d = 0; d <= 9; d++) {
    const baseRate   = base.length > 0 ? base.filter((x) => dec(x.num) === d).length / base.length : 0.1;
    const recentHits = recent.filter((x) => dec(x.num) === d).length;
    const z = zScore(recentHits, recentN, baseRate);
    const sev = severityFromZ(z);
    if (sev !== "normal") {
      subAnomalias.push({
        decena: d,
        label: `Decena ${d}0–${d}9`,
        baseline: round3(baseRate),
        recent: round3(recentHits / recentN),
        recentHits,
        z: round3(z),
        severity: sev,
        direccion: z < 0 ? "bajo" : "alto",
      });
    }
  }

  subAnomalias.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  if (!subAnomalias.length) return null;

  return {
    id: "decenas",
    icono: "📊",
    label: "Distribución por decenas",
    descripcion: "¿Algún rango (00-09, 10-19, …) está sobre/sub-representado?",
    subAnomalias: subAnomalias.slice(0, 3),
    severity: subAnomalias[0].severity,
    recentN,
  };
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * @param {Array}  draws   - todos los sorteos de la BD
 * @param {object} [opts]
 * @param {number} [opts.recentN=35]  - ventana reciente
 * @param {string} [opts.pais]
 * @returns {Array} anomalías ordenadas por severidad
 */
export async function detectarAnomalias(draws, opts = {}) {
  const recentN = opts.recentN ?? 35;
  const pais    = opts.pais ?? null;

  const sorted = normalizeDraws(draws, { pais });
  if (sorted.length < recentN * 2 + 20) return [];

  const results = [
    analizarRepetidos(sorted, recentN),
    analizarDobles(sorted, recentN),
    analizarEspejos(sorted, recentN),
    analizarComplementos(sorted, recentN),
    analizarDecenas(sorted, recentN),
  ].filter(Boolean);

  const ORDER = { alta: 0, moderada: 1, leve: 2, normal: 3 };
  return results.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderAnomaliasHTML(anomalias, recentN = 35) {
  const activas = anomalias.filter((a) => a.severity !== "normal");

  const SEV = {
    alta:     { cls: "anom-card--alta",     badge: "🔴 Alta",     color: "#e05252" },
    moderada: { cls: "anom-card--moderada", badge: "🟠 Moderada", color: "#e88c38" },
    leve:     { cls: "anom-card--leve",     badge: "🟡 Leve",     color: "#f2c44a" },
    normal:   { cls: "anom-card--normal",   badge: "⚪ Normal",   color: "#a89e88" },
  };

  const header = `
    <div class="anom-head">
      <span class="anom-title">🧪 Detector de anomalías</span>
      <span class="anom-subtitle">
        Comportamientos que se desvían del patrón histórico · últimos <strong>${recentN}</strong> sorteos
        ${activas.length ? `· <span style="color:#e05252">${activas.length} anomalía${activas.length > 1 ? "s" : ""} activa${activas.length > 1 ? "s" : ""}</span>` : "· <span style='color:#5ec47e'>sin anomalías</span>"}
      </span>
    </div>`;

  if (!activas.length) {
    return `<div class="anom-wrap">${header}<p class="anom-ok">✅ El sistema se comporta dentro de sus parámetros históricos normales.</p></div>`;
  }

  const cards = activas.map((a) => {
    const s = SEV[a.severity] || SEV.normal;
    const arrow = a.direccion === "alto" ? "▲" : "▼";
    const arrowColor = a.direccion === "alto" ? "#e05252" : "#5ec47e";

    // Decenas tiene subAnomalias
    if (a.id === "decenas") {
      const rows = a.subAnomalias.map((sub) => {
        const ss = SEV[sub.severity] || SEV.normal;
        const sa = sub.direccion === "alto" ? "▲" : "▼";
        const saColor = sub.direccion === "alto" ? "#e05252" : "#5ec47e";
        return `
          <div class="anom-sub-row">
            <span class="anom-sub-row__label">${sub.label}</span>
            <span class="anom-sub-row__vals">
              <span style="color:${saColor}">${sa}</span>
              ${(sub.recent * 100).toFixed(1)}% <span class="anom-muted">vs ${(sub.baseline * 100).toFixed(1)}%</span>
            </span>
            <span class="anom-badge" style="color:${ss.color};border-color:${ss.color}44;background:${ss.color}11">${ss.badge}</span>
          </div>`;
      }).join("");

      return `
        <div class="anom-card ${s.cls}">
          <div class="anom-card__head">
            <span class="anom-card__icon">${a.icono}</span>
            <div class="anom-card__titles">
              <span class="anom-card__label">${a.label}</span>
              <span class="anom-card__desc">${a.descripcion}</span>
            </div>
            <span class="anom-badge" style="color:${s.color};border-color:${s.color}44;background:${s.color}11">${s.badge}</span>
          </div>
          <div class="anom-sub-list">${rows}</div>
        </div>`;
    }

    const recentPct  = (a.recent   * 100).toFixed(1);
    const basePct    = (a.baseline * 100).toFixed(1);
    const deltaRel   = a.baseline > 0 ? Math.round(Math.abs((a.recent - a.baseline) / a.baseline) * 100) : 0;
    const hitLabel   = `${a.recentHits} de ${a.recentN} sorteos`;

    return `
      <div class="anom-card ${s.cls}">
        <div class="anom-card__head">
          <span class="anom-card__icon">${a.icono}</span>
          <div class="anom-card__titles">
            <span class="anom-card__label">${a.label}</span>
            <span class="anom-card__desc">${a.descripcion}</span>
          </div>
          <span class="anom-badge" style="color:${s.color};border-color:${s.color}44;background:${s.color}11">${s.badge}</span>
        </div>
        <div class="anom-stats">
          <div class="anom-stat">
            <span class="anom-stat__val">${recentPct}%</span>
            <span class="anom-stat__lbl">Últimos ${a.recentN}</span>
          </div>
          <div class="anom-stat anom-stat--sep">vs</div>
          <div class="anom-stat">
            <span class="anom-stat__val">${basePct}%</span>
            <span class="anom-stat__lbl">Histórico</span>
          </div>
          <div class="anom-stat anom-stat--delta">
            <span style="color:${arrowColor};font-weight:700">${arrow} ${deltaRel}%</span>
            <span class="anom-stat__lbl">${hitLabel} · z=${a.z}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  return `<div class="anom-wrap">${header}<div class="anom-grid">${cards}</div></div>`;
}
