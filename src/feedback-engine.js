/**
 * feedback-engine.js — Bucle de feedback: adapta el motor basado en rendimiento reciente.
 *
 * Lee `prediction_logs` (a través de hit-tracker) y computa:
 *   - ¿El motor está rindiendo mejor o peor que el azar en los últimos sorteos?
 *   - ¿Cuántos candidatos debería devolver el motor? (topN adaptativo)
 *   - Un veredicto para mostrar en Escenarios.
 *
 * Regla de adaptación:
 *   lift reciente ≥ 1.4  → topN = 8  (motor fuerte, pool ajustado)
 *   lift reciente 0.9–1.4 → topN = 10 (neutral, leve ampliación)
 *   lift reciente < 0.9  → topN = 13  (motor débil, ampliar para no perderse el número)
 */

import { computeHitTrackerStats } from "./hit-tracker.js";

const TOP_N_STRONG  = 8;
const TOP_N_NEUTRAL = 10;
const TOP_N_WEAK    = 13;
const RECENT_WINDOW = 20; // batches para el lift "reciente"

/**
 * @returns {Promise<{adaptiveTopN, lift, trend, verdict, stats}>}
 */
export async function computeFeedback() {
  let stats;
  try {
    stats = await computeHitTrackerStats({ recent: RECENT_WINDOW });
  } catch {
    return { adaptiveTopN: TOP_N_NEUTRAL, lift: null, trend: "desconocida", verdict: "sin datos", stats: null };
  }

  if (!stats || stats.error || stats.resolved < 5) {
    return { adaptiveTopN: TOP_N_NEUTRAL, lift: null, trend: "insuficiente", verdict: "sin datos", stats };
  }

  const recentLift = stats.recent?.lift ?? stats.lift;

  let adaptiveTopN, trend, verdict;

  if (recentLift >= 1.4) {
    adaptiveTopN = TOP_N_STRONG;
    trend = "subiendo";
    verdict = "fuerte";
  } else if (recentLift >= 0.9) {
    adaptiveTopN = TOP_N_NEUTRAL;
    trend = "estable";
    verdict = "estable";
  } else {
    adaptiveTopN = TOP_N_WEAK;
    trend = "bajando";
    verdict = "débil";
  }

  // Detectar giro brusco: motor caía bien pero cayó repentinamente
  const overallLift = stats.lift;
  const recentDrop = overallLift >= 1.3 && recentLift < 0.9;

  return { adaptiveTopN, lift: recentLift, trend, verdict, stats, recentDrop };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderFeedbackHTML(fb) {
  if (!fb || !fb.stats || fb.stats.resolved < 5) return "";

  const { adaptiveTopN, lift, trend, verdict, stats, recentDrop } = fb;

  const trendIcon  = { subiendo: "📈", estable: "➡️", bajando: "📉", insuficiente: "⏳", desconocida: "❓" }[trend] || "➡️";
  const verdictCls = { fuerte: "fb-verdict--fuerte", estable: "fb-verdict--estable", débil: "fb-verdict--debil" }[verdict] || "fb-verdict--estable";
  const verdictColor = { fuerte: "#5ec47e", estable: "#a89e88", débil: "#e05252" }[verdict] || "#a89e88";

  const fmtLift = lift !== null ? lift.toFixed(2) : "—";
  const fmtRate = stats.recent?.hitRate != null ? `${(stats.recent.hitRate * 100).toFixed(1)}%` : "—";

  const adaptMsg =
    verdict === "fuerte"  ? `Pool ajustado a ${adaptiveTopN} candidatos — señal precisa` :
    verdict === "débil"   ? `Pool ampliado a ${adaptiveTopN} candidatos — buscando rango más ancho` :
                            `Pool estándar de ${adaptiveTopN} candidatos`;

  const dropAlert = recentDrop
    ? `<p class="fb-alert">⚠️ Giro detectado: el motor tenía buen historial (lift ${stats.lift.toFixed(2)}×) pero los últimos ${stats.recent.n} sorteos bajaron. El sistema amplió el pool automáticamente.</p>`
    : "";

  return `
    <div class="fb-wrap">
      <div class="fb-head">
        <span class="fb-title">⚙️ Motor adaptativo</span>
        <span class="fb-subtitle">Ajuste automático basado en rendimiento real · últimos ${stats.recent.n} sorteos resueltos</span>
      </div>
      <div class="fb-row">
        <div class="fb-metric">
          <span class="fb-metric__val">${fmtLift}×</span>
          <span class="fb-metric__lbl">lift reciente</span>
        </div>
        <div class="fb-metric">
          <span class="fb-metric__val">${fmtRate}</span>
          <span class="fb-metric__lbl">hit rate</span>
        </div>
        <div class="fb-metric">
          <span class="fb-metric__val">${trendIcon} ${stats.recent.hits}/${stats.recent.n}</span>
          <span class="fb-metric__lbl">aciertos recientes</span>
        </div>
        <div class="fb-verdict ${verdictCls}" style="color:${verdictColor}">
          <span class="fb-verdict__label">Señal ${verdict}</span>
          <span class="fb-verdict__sub">${adaptMsg}</span>
        </div>
      </div>
      ${dropAlert}
    </div>`;
}
