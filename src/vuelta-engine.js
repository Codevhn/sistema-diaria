/**
 * vuelta-engine.js — Detector del patrón "vuelta del día"
 *
 * En La Diaria, LOTELHSA a veces juega un número en un turno y en un turno
 * posterior del mismo día tira el mismo número con los dígitos invertidos
 * ("le da vuelta"), p.ej.: turno 1 = 76 Palomas → turno 3 = 67 Vaca.
 *
 * Este motor:
 *   1. Calcula la tasa histórica de vueltas por par de turnos
 *   2. Identifica los pares específicos (origen → vuelta) más frecuentes
 *   3. Detecta vueltas pendientes en el día actual
 *   4. Detecta si una vuelta ya se confirmó hoy
 */

const TURNOS = ["11AM", "3PM", "9PM"];

function mirror(n) {
  const d = Math.floor(n / 10), u = n % 10;
  return d === u ? null : u * 10 + d; // null si palíndromo (11, 22, …)
}

function turnoIdx(h) { return TURNOS.indexOf(h); }

function agruparPorFecha(draws) {
  const map = new Map();
  draws.forEach((d) => {
    if (!map.has(d.fecha)) map.set(d.fecha, []);
    map.get(d.fecha).push(d);
  });
  return map;
}

function parsear(draws, pais = null) {
  return draws.filter((d) => {
    if (d.isTest || d.isPending) return false;
    if (pais && (d.pais || "").toUpperCase() !== pais.toUpperCase()) return false;
    return d.fecha && TURNOS.includes(d.horario) && !isNaN(parseInt(d.numero, 10));
  });
}

// ─── Análisis histórico ───────────────────────────────────────────────────────

/**
 * Calcula estadísticas históricas del patrón vuelta dentro del mismo día.
 */
export function analizarVueltaHistorica(draws, pais = null) {
  const clean = parsear(draws, pais);
  const fechaMap = agruparPorFecha(clean);

  let diasTotal = 0;       // días con ≥2 turnos
  let diasConVuelta = 0;   // días donde ocurrió al menos una vuelta

  // Estadísticas por par de turno: "11AM→9PM" → {total, conVuelta}
  const parMap = new Map();
  // Frecuencia por par numérico: "76:67" → count
  const pairFreq = new Map();
  // Lista de vueltas confirmadas con fecha para mostrar últimas
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
    .slice(0, 20)
    .map(([key, count]) => {
      const [o, v] = key.split(":").map(Number);
      return { numOrigen: o, padOrigen: String(o).padStart(2, "0"), numVuelta: v, padVuelta: String(v).padStart(2, "0"), count };
    });

  // Últimas 5 vueltas confirmadas
  const ultimasConfirmadas = confirmadas
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  return {
    diasTotal,
    diasConVuelta,
    pctGeneral: diasTotal > 0 ? Math.round(diasConVuelta / diasTotal * 100) : 0,
    porParTurno,
    topPares,
    ultimasConfirmadas,
  };
}

// ─── Detección del día actual ─────────────────────────────────────────────────

/**
 * Devuelve el estado de la vuelta en el día más reciente del historial.
 *
 * Returns {
 *   hoy, drawsHoy, stats,
 *   vueltasPendientes: [{numOrigen, padOrigen, numVuelta, padVuelta, turnoOrigen, turnoDestino, pct, frecHistorica}]
 *   vueltasConfirmadasHoy: [{numOrigen, padOrigen, numVuelta, padVuelta, turnoOrigen, turnoVuelta}]
 *   diaCompleto: boolean
 * }
 */
export function analizarVuelta(draws, { pais = null } = {}) {
  const clean = parsear(draws, pais);
  if (clean.length < 30) return null;

  const stats = analizarVueltaHistorica(draws, pais);
  if (stats.diasTotal < 15) return null;

  // Día más reciente
  const sorted = [...clean].sort((a, b) => {
    const d = a.fecha.localeCompare(b.fecha);
    return d !== 0 ? d : turnoIdx(a.horario) - turnoIdx(b.horario);
  });
  const hoy = sorted[sorted.length - 1].fecha;
  const drawsHoy = sorted.filter((d) => d.fecha === hoy);

  if (!drawsHoy.length) return null;

  const numsCaidos = new Map(); // numero → horario (primer turno en que cayó)
  drawsHoy.forEach((d) => {
    const n = parseInt(d.numero, 10);
    if (!numsCaidos.has(n)) numsCaidos.set(n, d.horario);
  });

  const turnosYaCaidos = new Set(drawsHoy.map((d) => d.horario));
  const lastTurno      = drawsHoy[drawsHoy.length - 1].horario;
  const turnosRestantes = TURNOS.filter((t) => turnoIdx(t) > turnoIdx(lastTurno));
  const diaCompleto     = turnosRestantes.length === 0;

  // Vueltas ya confirmadas hoy
  const vueltasConfirmadasHoy = [];
  drawsHoy.forEach((d) => {
    const numA = parseInt(d.numero, 10);
    const mA   = mirror(numA);
    if (mA === null) return;
    drawsHoy.forEach((e) => {
      if (e.horario === d.horario) return;
      if (parseInt(e.numero, 10) === mA && turnoIdx(e.horario) > turnoIdx(d.horario)) {
        vueltasConfirmadasHoy.push({
          numOrigen:  numA,
          padOrigen:  String(numA).padStart(2, "0"),
          numVuelta:  mA,
          padVuelta:  String(mA).padStart(2, "0"),
          turnoOrigen: d.horario,
          turnoVuelta: e.horario,
        });
      }
    });
  });

  // Vueltas pendientes (solo si quedan turnos)
  const vueltasPendientes = [];
  if (!diaCompleto) {
    drawsHoy.forEach((d) => {
      const numA = parseInt(d.numero, 10);
      const mA   = mirror(numA);
      if (mA === null) return;
      if (numsCaidos.has(mA)) return; // ya cayó hoy

      // Buscar frecuencia histórica del par exacto
      const pairHist = stats.topPares.find((p) => p.numOrigen === numA && p.numVuelta === mA);
      const frecHistorica = pairHist?.count || 0;

      turnosRestantes.forEach((turnoDestino) => {
        if (turnoIdx(turnoDestino) <= turnoIdx(d.horario)) return;
        const parStr  = `${d.horario}→${turnoDestino}`;
        const parStat = stats.porParTurno.find((p) => `${p.desde}→${p.hasta}` === parStr);

        vueltasPendientes.push({
          numOrigen:    numA,
          padOrigen:    String(numA).padStart(2, "0"),
          numVuelta:    mA,
          padVuelta:    String(mA).padStart(2, "0"),
          turnoOrigen:  d.horario,
          turnoDestino,
          pct:          parStat?.pct  || 0,
          frecHistorica,
        });
      });
    });

    vueltasPendientes.sort((a, b) => b.frecHistorica - a.frecHistorica || b.pct - a.pct);
  }

  return { hoy, drawsHoy, stats, vueltasPendientes, vueltasConfirmadasHoy, diaCompleto };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderVueltaHTML(result, guia = {}) {
  if (!result) return "";

  const { stats, vueltasPendientes, vueltasConfirmadasHoy, diaCompleto } = result;
  const pad = (n) => String(n).padStart(2, "0");

  // Resumen de tasas por par de turno
  const parRates = stats.porParTurno
    .filter((p) => p.total >= 5)
    .map((p) => `<span class="vlt-rate">${p.desde}→${p.hasta}: <strong>${p.pct}%</strong> <small>(${p.conVuelta}/${p.total})</small></span>`)
    .join("");

  // Badge de estado
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

  // Chips de vueltas pendientes
  const pendientesHtml = vueltasPendientes.map((v) => {
    const infoO = guia[v.padOrigen] || {};
    const infoV = guia[v.padVuelta] || {};
    const freqBadge = v.frecHistorica > 0
      ? `<span class="vlt-freq">${v.frecHistorica}×</span>` : "";
    const pctBadge = v.pct > 0
      ? `<span class="vlt-pct">${v.pct}%</span>` : "";
    return `
      <div class="vlt-item">
        <div class="vlt-chip vlt-chip--origen">
          <img class="vlt-chip__img" src="data/img/${v.padOrigen}.png" onerror="this.style.display='none'">
          <span class="vlt-chip__num">${v.padOrigen}</span>
          ${infoO.simbolo ? `<span class="vlt-chip__sym">${infoO.simbolo}</span>` : ""}
          <span class="vlt-chip__turno">${v.turnoOrigen}</span>
        </div>
        <span class="vlt-arrow">&#x21C4;</span>
        <div class="vlt-chip vlt-chip--vuelta">
          <img class="vlt-chip__img" src="data/img/${v.padVuelta}.png" onerror="this.style.display='none'">
          <span class="vlt-chip__num">${v.padVuelta}</span>
          ${infoV.simbolo ? `<span class="vlt-chip__sym">${infoV.simbolo}</span>` : ""}
          <span class="vlt-chip__turno vlt-chip__turno--pending">${v.turnoDestino} ?</span>
        </div>
        <div class="vlt-item__meta">
          ${freqBadge}${pctBadge}
        </div>
      </div>`;
  }).join("");

  // Chips de vueltas confirmadas hoy
  const confirmadasHtml = vueltasConfirmadasHoy.map((v) => {
    const infoO = guia[pad(v.numOrigen)] || {};
    const infoV = guia[pad(v.numVuelta)] || {};
    return `
      <div class="vlt-item vlt-item--confirmed">
        <div class="vlt-chip vlt-chip--origen">
          <img class="vlt-chip__img" src="data/img/${v.padOrigen}.png" onerror="this.style.display='none'">
          <span class="vlt-chip__num">${v.padOrigen}</span>
          ${infoO.simbolo ? `<span class="vlt-chip__sym">${infoO.simbolo}</span>` : ""}
          <span class="vlt-chip__turno">${v.turnoOrigen}</span>
        </div>
        <span class="vlt-arrow vlt-arrow--confirmed">&#x2713;</span>
        <div class="vlt-chip vlt-chip--vuelta vlt-chip--confirmed">
          <img class="vlt-chip__img" src="data/img/${v.padVuelta}.png" onerror="this.style.display='none'">
          <span class="vlt-chip__num">${v.padVuelta}</span>
          ${infoV.simbolo ? `<span class="vlt-chip__sym">${infoV.simbolo}</span>` : ""}
          <span class="vlt-chip__turno">${v.turnoVuelta}</span>
        </div>
      </div>`;
  }).join("");

  // Top pares históricos más frecuentes
  const topParesHtml = stats.topPares.slice(0, 8).map((p) => {
    const infoO = guia[p.padOrigen] || {};
    const infoV = guia[p.padVuelta] || {};
    return `
      <div class="vlt-top-pair">
        <span class="vlt-top-pair__nums">${p.padOrigen}→${p.padVuelta}</span>
        <span class="vlt-top-pair__syms">${infoO.simbolo || ""}→${infoV.simbolo || ""}</span>
        <span class="vlt-top-pair__count">${p.count}×</span>
      </div>`;
  }).join("");

  return `
    <div class="vlt-panel">
      <div class="vlt-panel__head">
        <span class="vlt-panel__title">Vuelta del día</span>
        ${badgeHtml}
        <span class="vlt-panel__rate">${stats.pctGeneral}% de días</span>
      </div>
      <p class="vlt-panel__hint">
        En el <strong>${stats.pctGeneral}%</strong> de días con múltiples turnos, La Diaria jugó un número y luego su vuelta (dígitos invertidos) en el mismo día.
        Muestra: ${stats.diasConVuelta} vueltas en ${stats.diasTotal} días con ≥2 turnos.
      </p>

      ${parRates ? `<div class="vlt-rates">${parRates}</div>` : ""}

      ${confirmadasHtml ? `
        <div class="vlt-section">
          <div class="vlt-section__label">Confirmada hoy</div>
          <div class="vlt-grid">${confirmadasHtml}</div>
        </div>` : ""}

      ${pendientesHtml ? `
        <div class="vlt-section">
          <div class="vlt-section__label">Candidatos pendientes</div>
          <div class="vlt-grid">${pendientesHtml}</div>
        </div>` : ""}

      ${topParesHtml ? `
        <details class="vlt-history">
          <summary>Pares históricos más frecuentes</summary>
          <div class="vlt-top-pairs">${topParesHtml}</div>
        </details>` : ""}
    </div>`;
}
