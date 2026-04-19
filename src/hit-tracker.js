/**
 * hit-tracker.js — Mide la performance del motor unificado en producción real.
 *
 * Cada vez que el motor corre en Escenarios, se loggean sus top-N candidatos
 * en `prediction_logs` con estado=pendiente. Cuando el sorteo correspondiente
 * se carga (vía registrarResultado), markPredictionResult marca uno como
 * "acierto" y closePredictionBatch marca el resto como "fallo".
 *
 * Este módulo lee esa historia y computa hit-rate vs baseline, separando
 * acumulado y los últimos N batches para detectar tendencia reciente.
 *
 * IMPORTANTE: el motor solo loggea su top-N (típicamente 8). El "hit" significa
 * "el número que cayó estaba en el top-N del motor". Baseline al azar = N/100.
 */

import { DB } from "./storage.js";

const TOP_N_DEFAULT = 8; // motor.candidatos top-N

/**
 * Agrupa logs por batch (fecha+pais+turno) y devuelve estadísticas.
 *
 * @param {object} [opts]
 * @param {number} [opts.topN=8]   - tamaño del batch (para baseline)
 * @param {number} [opts.recent=30] - cuántos batches recientes para "ventana móvil"
 * @returns {Promise<object>}
 */
export async function computeHitTrackerStats(opts = {}) {
  const topN = opts.topN ?? TOP_N_DEFAULT;
  const recent = opts.recent ?? 30;

  let logs;
  try {
    logs = await DB.getPredictionLogs();
  } catch (err) {
    return { error: err?.message || String(err), batches: 0 };
  }
  if (!Array.isArray(logs) || !logs.length) {
    return { batches: 0, resolved: 0, hits: 0, hitRate: 0, baseline: topN / 100, lift: 0 };
  }

  // Agrupar por (fecha+pais+turno)
  const batches = new Map();
  for (const row of logs) {
    const key = `${row.targetFecha || row.target_fecha || "?"}|${row.targetPais || row.target_pais || "?"}|${row.turno || "?"}`;
    if (!batches.has(key)) {
      batches.set(key, {
        key,
        fecha: row.targetFecha || row.target_fecha || null,
        pais: row.targetPais || row.target_pais || null,
        turno: row.turno || null,
        rows: [],
        createdAt: row.createdAt || row.created_at || 0,
      });
    }
    const b = batches.get(key);
    b.rows.push(row);
    if ((row.createdAt || row.created_at || 0) > b.createdAt) {
      b.createdAt = row.createdAt || row.created_at || 0;
    }
  }

  // Clasificar cada batch
  const batchList = Array.from(batches.values()).map((b) => {
    const states = b.rows.map((r) => r.estado);
    const hasAcierto = states.includes("acierto");
    const allResolved = states.every((s) => s === "acierto" || s === "fallo" || s === "descartado");
    const onlyDescartado = states.every((s) => s === "descartado");
    const isPending = !allResolved && !onlyDescartado;
    const isResolved = allResolved && !onlyDescartado;
    return {
      ...b,
      isPending,
      isResolved,
      hit: hasAcierto,
      size: b.rows.filter((r) => r.estado !== "descartado").length,
    };
  });

  // Ordenar por createdAt ascendente para "recent" estable
  batchList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const resolved = batchList.filter((b) => b.isResolved);
  const pending = batchList.filter((b) => b.isPending);

  const hits = resolved.filter((b) => b.hit).length;
  const total = resolved.length;
  const hitRate = total ? hits / total : 0;
  const baseline = topN / 100;
  const lift = baseline > 0 ? hitRate / baseline : 0;

  // Últimos N
  const recentList = resolved.slice(-recent);
  const recentHits = recentList.filter((b) => b.hit).length;
  const recentRate = recentList.length ? recentHits / recentList.length : 0;
  const recentLift = baseline > 0 ? recentRate / baseline : 0;

  // Streak actual (cantidad de aciertos consecutivos al final, o fallos)
  let streakHits = 0;
  let streakMisses = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].hit) {
      if (streakMisses > 0) break;
      streakHits++;
    } else {
      if (streakHits > 0) break;
      streakMisses++;
    }
  }

  return {
    batches: batchList.length,
    pending: pending.length,
    resolved: total,
    hits,
    hitRate,
    baseline,
    lift,
    pctMejorQueAzar: (lift - 1) * 100,
    recent: {
      n: recentList.length,
      hits: recentHits,
      hitRate: recentRate,
      lift: recentLift,
      pctMejorQueAzar: (recentLift - 1) * 100,
    },
    streakHits,
    streakMisses,
    lastResolvedAt: resolved.length ? resolved[resolved.length - 1].createdAt : null,
    topN,
  };
}

/**
 * Renderiza un mini-panel HTML con las stats. Devuelve el string HTML.
 */
export function renderHitTrackerHTML(stats) {
  if (!stats || stats.error) {
    return `<div class="hit-tracker hit-tracker--error">⚠ No se pudo leer el historial de predicciones${stats?.error ? `: ${stats.error}` : ""}</div>`;
  }
  if (!stats.resolved) {
    if (stats.pending) {
      return `
        <div class="hit-tracker hit-tracker--pending">
          <div class="hit-tracker__title">📊 Validación en vivo</div>
          <div class="hit-tracker__hint">${stats.pending} predicción${stats.pending === 1 ? "" : "es"} pendiente${stats.pending === 1 ? "" : "s"} de validar — entrá el resultado del sorteo cuando salga.</div>
        </div>`;
    }
    return `
      <div class="hit-tracker hit-tracker--empty">
        <div class="hit-tracker__title">📊 Validación en vivo</div>
        <div class="hit-tracker__hint">Aún no hay predicciones registradas. Cada vez que el motor se ejecute, se guardará su top-${stats.topN} para luego compararlo con el resultado real.</div>
      </div>`;
  }

  const verdict = (() => {
    if (stats.lift >= 1.5) return { icon: "🔥", label: "Señal fuerte", cls: "hit-tracker--hot" };
    if (stats.lift >= 1.15) return { icon: "✅", label: "Ventaja real", cls: "hit-tracker--ok" };
    if (stats.lift >= 0.85) return { icon: "≈", label: "Cerca del azar", cls: "hit-tracker--neutral" };
    return { icon: "⚠", label: "Por debajo del azar", cls: "hit-tracker--bad" };
  })();

  const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
  const liftSign = stats.pctMejorQueAzar >= 0 ? "+" : "";
  const recentLiftSign = stats.recent.pctMejorQueAzar >= 0 ? "+" : "";

  return `
    <div class="hit-tracker ${verdict.cls}">
      <div class="hit-tracker__head">
        <span class="hit-tracker__title">📊 Validación en vivo</span>
        <span class="hit-tracker__verdict">${verdict.icon} ${verdict.label}</span>
      </div>
      <div class="hit-tracker__grid">
        <div class="hit-tracker__metric">
          <span class="hit-tracker__metric-label">Acumulado</span>
          <span class="hit-tracker__metric-value">${stats.hits}/${stats.resolved}</span>
          <span class="hit-tracker__metric-sub">${fmtPct(stats.hitRate)} <small>(azar ${fmtPct(stats.baseline)})</small></span>
        </div>
        <div class="hit-tracker__metric">
          <span class="hit-tracker__metric-label">vs azar</span>
          <span class="hit-tracker__metric-value">${liftSign}${stats.pctMejorQueAzar.toFixed(0)}%</span>
          <span class="hit-tracker__metric-sub">lift ${stats.lift.toFixed(2)}×</span>
        </div>
        <div class="hit-tracker__metric">
          <span class="hit-tracker__metric-label">Últimos ${stats.recent.n}</span>
          <span class="hit-tracker__metric-value">${stats.recent.hits}/${stats.recent.n}</span>
          <span class="hit-tracker__metric-sub">${fmtPct(stats.recent.hitRate)} (${recentLiftSign}${stats.recent.pctMejorQueAzar.toFixed(0)}%)</span>
        </div>
        <div class="hit-tracker__metric">
          <span class="hit-tracker__metric-label">Racha</span>
          <span class="hit-tracker__metric-value">${stats.streakHits ? `🟢 ${stats.streakHits}` : stats.streakMisses ? `🔴 ${stats.streakMisses}` : "—"}</span>
          <span class="hit-tracker__metric-sub">${stats.pending} pendiente${stats.pending === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="hit-tracker__hint">
        Mide si el número que cayó estaba en el top-${stats.topN} del motor unificado. Es la prueba honesta de si el sistema le pega más que el azar.
      </div>
    </div>
  `;
}
