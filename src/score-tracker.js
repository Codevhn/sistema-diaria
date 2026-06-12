/**
 * score-tracker.js
 *
 * Mantiene el score_global rolling sobre la ventana de las últimas N evaluaciones.
 * Detecta crisis (hitTop3 < CRISIS_THRESHOLD) y activa el weight-optimizer.
 *
 * Score global = hitTop1 × 0.40 + hitTop3 × 0.35 + hitTop5 × 0.15 + (1-ausencia) × 0.10
 *
 * Exports:
 *   calcularScoreActual(opts)          → ScoreActual
 *   detectarCrisis(score)              → CrisisInfo | null
 *   ejecutarCicloEvaluacion(draws)     → CicloResult
 *   getScoreTendencia(n)               → 'mejorando' | 'estable' | 'cayendo'
 */

import { getRecentEvaluations, getScoreHistory, insertScoreSnapshot } from './intelligence-storage.js';
import { optimizarPesos } from './weight-optimizer.js';
import { getRegimenActual } from './regime-detector.js';

// Ventana de evaluaciones para score rolling
const VENTANA = 30;

// Umbral de crisis: si hit_top3 cae a menos de esto, activa modo crisis
const CRISIS_THRESHOLD_TOP3 = 0.20;

// Umbral de ajuste automático: score_global por debajo de este valor → optimizar pesos
const AJUSTE_THRESHOLD = 0.22;

// Mínimo de evaluaciones para que el score sea significativo
const MIN_EVALS_SCORE = 5;

// ---------------------------------------------------------------------------
// Score actual
// ---------------------------------------------------------------------------

/**
 * Calcula el score de las últimas VENTANA evaluaciones.
 *
 * @param {object} [opts]
 * @param {number} [opts.ventana=30]
 * @returns {Promise<ScoreActual>}
 */
export async function calcularScoreActual(opts = {}) {
  const ventana = opts.ventana ?? VENTANA;

  const { data: evals, error } = await getRecentEvaluations(ventana);
  if (error) return { error: error.message, evaluaciones: 0, scoreGlobal: 0 };

  if (!evals?.length) {
    return {
      evaluaciones:  0,
      scoreGlobal:   0,
      hitRateTop1:   0,
      hitRateTop3:   0,
      hitRateTop5:   0,
      ausencia:      0,
      enCrisis:      false,
      suficiente:    false,
    };
  }

  const n          = evals.length;
  const hitTop1    = evals.filter(e => e.en_top1).length / n;
  const hitTop3    = evals.filter(e => e.en_top3).length / n;
  const hitTop5    = evals.filter(e => e.en_top5).length / n;
  const ausencia   = evals.filter(e => e.ausente).length / n;

  const scoreGlobal = hitTop1 * 0.40 + hitTop3 * 0.35 + hitTop5 * 0.15 + (1 - ausencia) * 0.10;

  const tiposConteo = { A: 0, B: 0, C: 0, D: 0 };
  for (const e of evals) {
    const t = e.tipo;
    if (t in tiposConteo) tiposConteo[t]++;
  }

  return {
    evaluaciones: n,
    scoreGlobal:  Math.round(scoreGlobal * 1000) / 1000,
    hitRateTop1:  Math.round(hitTop1 * 1000) / 1000,
    hitRateTop3:  Math.round(hitTop3 * 1000) / 1000,
    hitRateTop5:  Math.round(hitTop5 * 1000) / 1000,
    ausencia:     Math.round(ausencia * 1000) / 1000,
    enCrisis:     hitTop3 < CRISIS_THRESHOLD_TOP3,
    suficiente:   n >= MIN_EVALS_SCORE,
    tiposConteo,
  };
}

// ---------------------------------------------------------------------------
// Detección de crisis
// ---------------------------------------------------------------------------

/**
 * Analiza un ScoreActual y determina si hay crisis activa.
 *
 * @param {object} score - resultado de calcularScoreActual()
 * @returns {CrisisInfo | null}
 */
export function detectarCrisis(score) {
  if (!score || score.evaluaciones < MIN_EVALS_SCORE) return null;

  const problemas = [];

  if (score.hitRateTop3 < CRISIS_THRESHOLD_TOP3) {
    problemas.push(`Hit rate top-3 crítico: ${(score.hitRateTop3 * 100).toFixed(0)}% (mínimo ${(CRISIS_THRESHOLD_TOP3 * 100).toFixed(0)}%)`);
  }

  if (score.ausencia > 0.60) {
    problemas.push(`Alta tasa de ausencia: ${(score.ausencia * 100).toFixed(0)}% de sorteos sin captura`);
  }

  if (score.tiposConteo?.B > score.evaluaciones * 0.50) {
    problemas.push(`Mayoría de errores tipo B (ausente): el motor no captura la señal`);
  }

  if (score.tiposConteo?.A > score.evaluaciones * 0.40) {
    problemas.push(`Alta tasa errores tipo A (ranking): motor predice pero rankea mal`);
  }

  if (!problemas.length) return null;

  let severidad = 'baja';
  if (score.hitRateTop3 < 0.10 || score.ausencia > 0.75) severidad = 'critica';
  else if (score.hitRateTop3 < 0.15 || score.ausencia > 0.65) severidad = 'alta';
  else if (score.hitRateTop3 < CRISIS_THRESHOLD_TOP3) severidad = 'media';

  return {
    enCrisis:   true,
    severidad,
    problemas,
    scoreGlobal: score.scoreGlobal,
    hitRateTop3: score.hitRateTop3,
    recomendacion: _buildRecomendacion(score, problemas),
  };
}

function _buildRecomendacion(score, problemas) {
  if (score.ausencia > 0.60) {
    return 'RESET de pesos + revisar régimen activo. El motor no está capturando la señal principal.';
  }
  if (score.tiposConteo?.A > score.evaluaciones * 0.40) {
    return 'Optimizar pesos: el motor detecta el número pero no lo prioriza correctamente.';
  }
  if (score.tiposConteo?.B > score.evaluaciones * 0.50) {
    return 'Ampliar diversidad de motores. Considerar activar motores de menor peso (semanal/mensual).';
  }
  return 'Ejecutar ciclo de optimización de pesos para recalibrar el gradient.';
}

// ---------------------------------------------------------------------------
// Ciclo completo de evaluación
// ---------------------------------------------------------------------------

/**
 * Ejecuta el ciclo completo:
 *   1. Calcula score actual
 *   2. Detecta crisis
 *   3. Si crisis o score bajo → ejecuta weight-optimizer
 *   4. Persiste snapshot
 *
 * Llamar después de cada sorteo registrado.
 *
 * @param {Array}  draws  - sorteos recientes (reciente primero) — para detectar régimen
 * @param {object} [opts]
 * @param {boolean}[opts.persistir=true]
 * @param {boolean}[opts.verbose=false]
 * @returns {Promise<CicloResult>}
 */
export async function ejecutarCicloEvaluacion(draws = [], opts = {}) {
  const { persistir = true, verbose = false } = opts;

  const score   = await calcularScoreActual();
  const crisis  = detectarCrisis(score);

  let optimizacion = null;
  let regimen      = 'normal';

  if (draws.length >= 60) {
    regimen = getRegimenActual(draws);
  }

  // Activar optimizador si hay crisis o score bajo
  const necesitaOptimizar = score.suficiente && (
    crisis !== null || score.scoreGlobal < AJUSTE_THRESHOLD
  );

  if (necesitaOptimizar) {
    if (verbose) console.log('[score-tracker] Activando weight-optimizer. Crisis:', crisis?.severidad ?? 'score bajo');
    optimizacion = await optimizarPesos({
      regimen,
      persistir,
      verbose,
    }).catch(e => ({ error: e?.message }));
  }

  const result = {
    score,
    crisis,
    regimen,
    optimizacionEjecutada: necesitaOptimizar,
    optimizacion,
    timestamp: new Date().toISOString(),
  };

  if (verbose) {
    console.log('[score-tracker] Score:', score.scoreGlobal, '| Crisis:', crisis?.severidad ?? 'ninguna', '| Régimen:', regimen);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tendencia
// ---------------------------------------------------------------------------

/**
 * Compara el score de los últimos N snapshots y devuelve la tendencia.
 *
 * @param {number} [n=5]  - número de snapshots a comparar
 * @returns {Promise<'mejorando' | 'estable' | 'cayendo'>}
 */
export async function getScoreTendencia(n = 5) {
  const { data: historia, error } = await getScoreHistory(n * 2);
  if (error || !historia?.length || historia.length < 4) return 'estable';

  const recientes  = historia.slice(0, n).map(h => h.score_global ?? h.scoreGlobal ?? 0);
  const anteriores = historia.slice(n, n * 2).map(h => h.score_global ?? h.scoreGlobal ?? 0);

  if (!recientes.length || !anteriores.length) return 'estable';

  const avgReciente  = recientes.reduce((a, b) => a + b, 0) / recientes.length;
  const avgAnterior  = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
  const delta        = avgReciente - avgAnterior;

  if (delta > 0.03)  return 'mejorando';
  if (delta < -0.03) return 'cayendo';
  return 'estable';
}

// ---------------------------------------------------------------------------
// Resumen para UI
// ---------------------------------------------------------------------------

/**
 * Devuelve un resumen legible del estado del sistema.
 *
 * @param {object} score - de calcularScoreActual()
 * @returns {string} texto corto para panel
 */
export function buildScoreResumen(score) {
  if (!score || !score.suficiente) {
    return `⏳ Acumulando evaluaciones (${score?.evaluaciones ?? 0}/${MIN_EVALS_SCORE} mín.)`;
  }
  const pct = (score.scoreGlobal * 100).toFixed(0);
  if (score.enCrisis)   return `🚨 Score ${pct}% — Sistema en crisis. Ajustando pesos...`;
  if (score.scoreGlobal > 0.45) return `🔥 Score ${pct}% — Sistema en buen rendimiento`;
  if (score.scoreGlobal > 0.30) return `✅ Score ${pct}% — Rendimiento aceptable`;
  return `⚠ Score ${pct}% — Rendimiento bajo. Monitoreando.`;
}
