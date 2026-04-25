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

  const trendIcon    = { subiendo: "📈", estable: "➡️", bajando: "📉" }[trend] || "➡️";
  const verdictColor = { fuerte: "#5ec47e", estable: "#a89e88", débil: "#e05252" }[verdict] || "#a89e88";

  const adaptMsg =
    verdict === "fuerte" ? `Pool reducido a ${adaptiveTopN} — señal precisa` :
    verdict === "débil"  ? `Pool ampliado a ${adaptiveTopN} — buscando rango más ancho` :
                           `Pool estándar de ${adaptiveTopN} candidatos`;

  const dropNote = recentDrop
    ? ` · ⚠️ caída brusca vs historial`
    : "";

  return `
    <div class="fb-badge">
      <span class="fb-badge__icon">⚙️</span>
      <span class="fb-badge__text">
        Motor adaptativo ${trendIcon}
        <strong style="color:${verdictColor}">${adaptMsg}</strong>${dropNote}
        <small>· detalle en "Validación en vivo"</small>
      </span>
    </div>`;
}
