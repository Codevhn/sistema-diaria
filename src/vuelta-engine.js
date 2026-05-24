/**
 * vuelta-engine.js — Detector del patrón "vuelta del día"
 *
 * En La Diaria, LOTELHSA a veces juega un número en un turno y en un turno
 * posterior del mismo día tira el mismo número con los dígitos invertidos
 * ("le da vuelta"), p.ej.: turno 1 = 76 Palomas → turno 3 = 67 Vaca.
 *
 * IMPORTANTE: Los períodos de recuperación post-Super Premio son un modo de
 * juego completamente distinto. Las estadísticas se calculan por separado
 * para cada modo (normal vs recuperación) para evitar contaminar el análisis.
 *
 * Métodos exportados:
 *   analizarVuelta(draws, { pais, spFechas }) — análisis completo del día actual
 *   renderVueltaHTML(result, guia)            — HTML del panel
 */

const TURNOS      = ["11AM", "3PM", "9PM"];
const SP_DAYS     = 14; // días que dura el período de recuperación post-SP

function mirror(n) {
  const d = Math.floor(n / 10), u = n % 10;
  return d === u ? null : u * 10 + d; // null si palíndromo (11, 22, …)
}

function turnoIdx(h) { return TURNOS.indexOf(h); }

// ─── Clasificación de períodos ────────────────────────────────────────────────

/**
 * Construye un Set de fechas que caen dentro de un período de recuperación
 * (los SP_DAYS días posteriores a cualquier fecha de Super Premio).
 */
function buildRecupSet(spFechas) {
  const recupDates = new Set();
  spFechas.forEach((sp) => {
    const base = new Date(sp + "T12:00:00");
    for (let i = 1; i <= SP_DAYS; i++) {
      const d = new Date(base.getTime() + i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      recupDates.add(iso);
    }
  });
  return recupDates;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsear(draws, pais = null) {
  return draws.filter((d) => {
    if (d.isTest || d.isPending) return false;
    if (pais && (d.pais || "").toUpperCase() !== pais.toUpperCase()) return false;
    return d.fecha && TURNOS.includes(d.horario) && !isNaN(parseInt(d.numero, 10));
  });
}

function agruparPorFecha(draws) {
  const map = new Map();
  draws.forEach((d) => {
    if (!map.has(d.fecha)) map.set(d.fecha, []);
    map.get(d.fecha).push(d);
  });
  return map;
}

/**
 * Analiza el patrón de vuelta dentro de un conjunto de días ya agrupados por fecha.
 * Cada fecha del mapa debe tener ≥2 draws para contar como día analizable.
 */
function calcularStats(fechaMap) {
  let diasTotal = 0;
  let diasConVuelta = 0;
  const parMap   = new Map(); // "11AM→9PM" → {desde, hasta, total, conVuelta}
  const pairFreq = new Map(); // "76:67"    → count
  const confirmadas = [];

  fechaMap.forEach((dayDraws, fecha) => {
    const sorted = [...dayDraws]
      .filter((d) => turnoIdx(d.horario) !== -1)
      .sort((a, b) => turnoIdx(a.horario) - turnoIdx(b.horario));

    if (sorted.length < 2) return;
    diasTotal++;

    let diaConVuelta = false;

    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        const parKey = `${a.horario}→${b.horario}`;

        if (!parMap.has(parKey)) parMap.set(parKey, { desde: a.horario, hasta: b.horario, total: 0, conVuelta: 0 });
        parMap.get(parKey).total++;

        const numA = parseInt(a.numero, 10);
        const numB = parseInt(b.numero, 10);
        const mA   = mirror(numA);

        if (mA !== null && mA === numB) {
          parMap.get(parKey).conVuelta++;
          diaConVuelta = true;
          const pairKey = `${numA}:${numB}`;
          pairFreq.set(pairKey, (pairFreq.get(pairKey) || 0) + 1);
          confirmadas.push({ fecha, numOrigen: numA, numVuelta: numB, turnoOrigen: a.horario, turnoVuelta: b.horario });
        }
      }
    }

    if (diaConVuelta) diasConVuelta++;
  });

  const porParTurno = [...parMap.values()]
    .map((p) => ({ ...p, pct: p.total > 0 ? Math.round(p.conVuelta / p.total * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  const topPares = [...pairFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([key, count]) => {
      const [o, v] = key.split(":").map(Number);
      return {
        numOrigen: o, padOrigen: String(o).padStart(2, "0"),
        numVuelta: v, padVuelta: String(v).padStart(2, "0"),
        count,
      };
    });

  const ultimasConfirmadas = [...confirmadas]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  return {
    diasTotal,
    diasConVuelta,
    pct: diasTotal > 0 ? Math.round(diasConVuelta / diasTotal * 100) : 0,
    porParTurno,
    topPares,
    ultimasConfirmadas,
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Análisis completo del patrón de vuelta del día.
 *
 * @param {Array}  draws     — historial completo de sorteos
 * @param {object} opts
 * @param {string} [opts.pais]
 * @param {Array}  [opts.spFechas] — fechas de Super Premio (["YYYY-MM-DD", ...])
 *
 * @returns {object|null}
 */
export function analizarVuelta(draws, { pais = null, spFechas = [] } = {}) {
  const clean = parsear(draws, pais);
  if (clean.length < 30) return null;

  // ── Clasificar draws por período ──────────────────────────────────────────
  const recupSet = buildRecupSet(spFechas);

  const drawsRecup  = clean.filter((d) => recupSet.has(d.fecha));
  const drawsNormal = clean.filter((d) => !recupSet.has(d.fecha));

  const mapTodos  = agruparPorFecha(clean);
  const mapRecup  = agruparPorFecha(drawsRecup);
  const mapNormal = agruparPorFecha(drawsNormal);

  // ── Stats por período ──────────────────────────────────────────────────────
  const statsGlobal = calcularStats(mapTodos);
  if (statsGlobal.diasTotal < 15) return null;

  const statsRecup  = drawsRecup.length  >= 20 ? calcularStats(mapRecup)  : null;
  const statsNormal = drawsNormal.length >= 20 ? calcularStats(mapNormal) : null;

  // ── Día más reciente ───────────────────────────────────────────────────────
  const sorted = [...clean].sort((a, b) => {
    const d = a.fecha.localeCompare(b.fecha);
    return d !== 0 ? d : turnoIdx(a.horario) - turnoIdx(b.horario);
  });
  const hoy      = sorted[sorted.length - 1].fecha;
  const esHoyRecup = recupSet.has(hoy);

  // Stats relevantes al período actual (para calcular pct del candidato)
  const statsActuales = (esHoyRecup && statsRecup) ? statsRecup : (statsNormal || statsGlobal);

  const drawsHoy = sorted.filter((d) => d.fecha === hoy);
  if (!drawsHoy.length) return null;

  const numsCaidos = new Map();
  drawsHoy.forEach((d) => {
    const n = parseInt(d.numero, 10);
    if (!numsCaidos.has(n)) numsCaidos.set(n, d.horario);
  });

  const lastTurno       = drawsHoy[drawsHoy.length - 1].horario;
  const turnosRestantes = TURNOS.filter((t) => turnoIdx(t) > turnoIdx(lastTurno));
  const diaCompleto     = turnosRestantes.length === 0;

  // ── Vueltas ya confirmadas hoy ─────────────────────────────────────────────
  const vueltasConfirmadasHoy = [];
  for (let i = 0; i < drawsHoy.length - 1; i++) {
    const a   = drawsHoy[i];
    const numA = parseInt(a.numero, 10);
    const mA   = mirror(numA);
    if (mA === null) continue;
    for (let j = i + 1; j < drawsHoy.length; j++) {
      const b = drawsHoy[j];
      if (parseInt(b.numero, 10) === mA) {
        vueltasConfirmadasHoy.push({
          numOrigen:   numA,
          padOrigen:   String(numA).padStart(2, "0"),
          numVuelta:   mA,
          padVuelta:   String(mA).padStart(2, "0"),
          turnoOrigen: a.horario,
          turnoVuelta: b.horario,
        });
      }
    }
  }

  // ── Vueltas pendientes ─────────────────────────────────────────────────────
  const vueltasPendientes = [];
  if (!diaCompleto) {
    drawsHoy.forEach((d) => {
      const numA = parseInt(d.numero, 10);
      const mA   = mirror(numA);
      if (mA === null || numsCaidos.has(mA)) return;

      const pairHist = statsActuales.topPares.find(
        (p) => p.numOrigen === numA && p.numVuelta === mA
      );
      const frecHistorica = pairHist?.count || 0;

      turnosRestantes.forEach((turnoDestino) => {
        if (turnoIdx(turnoDestino) <= turnoIdx(d.horario)) return;
        const parStr  = `${d.horario}→${turnoDestino}`;
        const parStat = statsActuales.porParTurno.find(
          (p) => `${p.desde}→${p.hasta}` === parStr
        );

        vueltasPendientes.push({
          numOrigen:    numA,
          padOrigen:    String(numA).padStart(2, "0"),
          numVuelta:    mA,
          padVuelta:    String(mA).padStart(2, "0"),
          turnoOrigen:  d.horario,
          turnoDestino,
          pct:          parStat?.pct || 0,
          frecHistorica,
        });
      });
    });

    vueltasPendientes.sort((a, b) => b.frecHistorica - a.frecHistorica || b.pct - a.pct);
  }

  return {
    hoy,
    esHoyRecup,
    diaCompleto,
    drawsHoy,
    vueltasPendientes,
    vueltasConfirmadasHoy,
    statsGlobal,
    statsRecup,
    statsNormal,
    statsActuales,
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderVueltaHTML(result, guia = {}) {
  if (!result) return "";

  const {
    esHoyRecup, diaCompleto,
    vueltasPendientes, vueltasConfirmadasHoy,
    statsGlobal, statsRecup, statsNormal, statsActuales,
  } = result;

  const pad = (n) => String(n).padStart(2, "0");

  // ── Badge de estado ────────────────────────────────────────────────────────
  let badgeHtml;
  if (vueltasConfirmadasHoy.length > 0) {
    badgeHtml = `<span class="vlt-badge vlt-badge--confirmada">✓ Vuelta confirmada hoy</span>`;
  } else if (diaCompleto) {
    badgeHtml = `<span class="vlt-badge vlt-badge--completo">Día completo · Sin vuelta</span>`;
  } else if (vueltasPendientes.length > 0) {
    badgeHtml = `<span class="vlt-badge vlt-badge--activa">${vueltasPendientes.length} pendiente${vueltasPendientes.length > 1 ? "s" : ""}</span>`;
  } else {
    badgeHtml = `<span class="vlt-badge vlt-badge--sin">Sin candidatos hoy</span>`;
  }

  // Badge de modo actual
  const modoBadge = esHoyRecup
    ? `<span class="vlt-badge vlt-badge--recup">🔴 Recuperación</span>`
    : `<span class="vlt-badge vlt-badge--normal">Modo normal</span>`;

  // ── Comparativa de períodos ────────────────────────────────────────────────
  const pctRecup  = statsRecup  ? statsRecup.pct  : null;
  const pctNormal = statsNormal ? statsNormal.pct : null;

  let comparativaHtml = "";
  if (pctRecup !== null && pctNormal !== null) {
    const diff    = pctRecup - pctNormal;
    const diffStr = diff > 0
      ? `<span class="vlt-diff vlt-diff--up">+${diff}pp en recuperación</span>`
      : diff < 0
      ? `<span class="vlt-diff vlt-diff--down">${diff}pp en recuperación</span>`
      : `<span class="vlt-diff vlt-diff--eq">Sin diferencia entre modos</span>`;

    const interpretation = diff >= 5
      ? "La vuelta es más frecuente en recuperación — señal a vigilar en este modo."
      : diff <= -5
      ? "La vuelta es menos frecuente en recuperación — LOTELHSA tiende a evitarla post-SP."
      : "No hay diferencia estadística significativa entre modos para este patrón.";

    comparativaHtml = `
      <div class="vlt-compare">
        <div class="vlt-compare__col ${esHoyRecup ? "vlt-compare__col--active" : ""}">
          <span class="vlt-compare__label">Modo normal</span>
          <span class="vlt-compare__pct">${pctNormal}%</span>
          <span class="vlt-compare__sub">${statsNormal.diasConVuelta}/${statsNormal.diasTotal} días</span>
        </div>
        <div class="vlt-compare__vs">vs</div>
        <div class="vlt-compare__col ${esHoyRecup ? "vlt-compare__col--active vlt-compare__col--recup" : ""}">
          <span class="vlt-compare__label">🔴 Recuperación</span>
          <span class="vlt-compare__pct vlt-compare__pct--recup">${pctRecup}%</span>
          <span class="vlt-compare__sub">${statsRecup.diasConVuelta}/${statsRecup.diasTotal} días</span>
        </div>
        <div class="vlt-compare__insight">
          ${diffStr}
          <span class="vlt-compare__interp">${interpretation}</span>
        </div>
      </div>`;
  }

  // ── Tasas por par de turno (período actual) ────────────────────────────────
  const parRates = statsActuales.porParTurno
    .filter((p) => p.total >= 5)
    .map((p) => `<span class="vlt-rate">${p.desde}→${p.hasta}: <strong>${p.pct}%</strong> <small>(${p.conVuelta}/${p.total})</small></span>`)
    .join("");

  // ── Función para chip de número ────────────────────────────────────────────
  const chipHtml = (padNum, turno, modClass = "", turnoClass = "") => {
    const info = guia[padNum] || {};
    return `
      <div class="vlt-chip ${modClass}">
        <img class="vlt-chip__img" src="data/img/${padNum}.png" onerror="this.style.display='none'">
        <span class="vlt-chip__num">${padNum}</span>
        ${info.simbolo ? `<span class="vlt-chip__sym">${info.simbolo}</span>` : ""}
        <span class="vlt-chip__turno ${turnoClass}">${turno}</span>
      </div>`;
  };

  // ── Vueltas pendientes ─────────────────────────────────────────────────────
  const pendientesHtml = vueltasPendientes.map((v) => {
    const freqBadge = v.frecHistorica > 0
      ? `<span class="vlt-freq">${v.frecHistorica}×</span>` : "";
    const pctBadge = v.pct > 0
      ? `<span class="vlt-pct">${v.pct}%</span>` : "";
    return `
      <div class="vlt-item">
        ${chipHtml(v.padOrigen, v.turnoOrigen, "vlt-chip--origen")}
        <span class="vlt-arrow">&#x21C4;</span>
        ${chipHtml(v.padVuelta, `${v.turnoDestino} ?`, "vlt-chip--vuelta", "vlt-chip__turno--pending")}
        <div class="vlt-item__meta">${freqBadge}${pctBadge}</div>
      </div>`;
  }).join("");

  // ── Vueltas confirmadas hoy ────────────────────────────────────────────────
  const confirmadasHtml = vueltasConfirmadasHoy.map((v) => `
    <div class="vlt-item vlt-item--confirmed">
      ${chipHtml(v.padOrigen, v.turnoOrigen, "vlt-chip--origen")}
      <span class="vlt-arrow vlt-arrow--confirmed">&#x2713;</span>
      ${chipHtml(v.padVuelta, v.turnoVuelta, "vlt-chip--vuelta vlt-chip--confirmed")}
    </div>`).join("");

  // ── Top pares por período ──────────────────────────────────────────────────
  function topParesSection(stats, label, modClass = "") {
    if (!stats || !stats.topPares.length) return "";
    const chips = stats.topPares.slice(0, 8).map((p) => {
      const infoO = guia[p.padOrigen] || {};
      const infoV = guia[p.padVuelta] || {};
      return `
        <div class="vlt-top-pair ${modClass}">
          <span class="vlt-top-pair__nums">${p.padOrigen}→${p.padVuelta}</span>
          <span class="vlt-top-pair__syms">${infoO.simbolo || "—"}→${infoV.simbolo || "—"}</span>
          <span class="vlt-top-pair__count">${p.count}×</span>
        </div>`;
    }).join("");
    return `
      <div class="vlt-history-block">
        <div class="vlt-history-label">${label}</div>
        <div class="vlt-top-pairs">${chips}</div>
      </div>`;
  }

  const historyHtml = (statsRecup || statsNormal)
    ? `<details class="vlt-history">
        <summary>Pares históricos por modo de juego</summary>
        <div class="vlt-history-grid">
          ${topParesSection(statsNormal, "Modo normal", "")}
          ${topParesSection(statsRecup,  "🔴 Recuperación post-SP", "vlt-top-pair--recup")}
        </div>
       </details>`
    : topParesSection(statsGlobal, "Pares más frecuentes");

  // ── HTML final ─────────────────────────────────────────────────────────────
  return `
    <div class="vlt-panel">
      <div class="vlt-panel__head">
        <span class="vlt-panel__title">Vuelta del día</span>
        ${modoBadge}
        ${badgeHtml}
        <span class="vlt-panel__rate">${statsActuales.pct}% en modo actual</span>
      </div>
      <p class="vlt-panel__hint">
        Patrón donde LOTELHSA juega un número y luego su espejo de dígitos en el mismo día.
        Las estadísticas se calculan por separado para modo normal y período de recuperación post-SP.
      </p>

      ${comparativaHtml}

      ${parRates ? `<div class="vlt-rates"><span class="vlt-rates__label">Tasas por turno (modo actual):</span>${parRates}</div>` : ""}

      ${confirmadasHtml ? `
        <div class="vlt-section">
          <div class="vlt-section__label">Confirmada hoy</div>
          <div class="vlt-grid">${confirmadasHtml}</div>
        </div>` : ""}

      ${pendientesHtml ? `
        <div class="vlt-section">
          <div class="vlt-section__label">Candidatos pendientes — usando stats de ${esHoyRecup ? "recuperación" : "modo normal"}</div>
          <div class="vlt-grid">${pendientesHtml}</div>
        </div>` : ""}

      ${historyHtml}
    </div>`;
}
