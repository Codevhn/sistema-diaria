/**
 * backtest-v4.js
 *
 * Extiende el backtest v3 con los módulos de inteligencia adversarial:
 *   - Presión pública (pressure-engine) aplicada como factor adversarial
 *   - Detección de régimen (regime-detector) para ajustar pesos dinámicamente
 *   - Simulación de weight-optimizer con gradient rolling dentro del histórico
 *   - Comparación directa v3 vs v4 en la misma ventana de datos
 *
 * La simulación es honesta: para cada punto t solo usa datos de t-1 hacia atrás.
 * No hay look-ahead. Los pesos evolucionan igual que en producción.
 *
 * Exports:
 *   backtestV4(rawDraws, opts)         → BacktestV4Result
 *   compararV3vsV4(rawDraws, opts)     → ComparacionResult
 */

import {
  buildMarkov1, normalizeMarkov1,
  buildMarkov2, normalizeMarkov2,
  calcularRezago,
  agregarSeñales,
  enrich,
} from './signal-engine.js';
import { calcularPopularidad, popularidadAFactor } from './popularity-model.js';
import { presionAFactor } from './pressure-engine.js';
import { getRegimenActual, getAjustesPorRegimen } from './regime-detector.js';
import { PESOS_DEFAULT } from './weight-optimizer.js';
import { backtest as backtestV3 } from './backtest.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const DEFAULT_TOP_KS    = [5, 10, 20];
const YIELD_EVERY       = 20;
const VENTANA_GRAD      = 25;   // evaluaciones antes de recalcular pesos
const LEARNING_RATE_SIM = 0.015;
const MIN_PESO          = 0.03;
const MAX_PESO          = 0.42;
const MOTORES           = Object.keys(PESOS_DEFAULT);

// ---------------------------------------------------------------------------
// Simulación de presión pública (sin DB — puramente estadística)
// ---------------------------------------------------------------------------

/**
 * Calcula la presión de cada número usando solo el gap histórico y si es saladito.
 * Versión síncrona y ligera para correr miles de veces en backtest.
 */
function calcularPresionSync(history) {
  const SALADITOS = new Set([
    0, 11, 22, 33, 44, 55, 66, 77, 88, 99,
    10, 20, 30, 40, 50, 60, 70, 80, 90,
    5, 15, 25, 35, 45, 65, 75, 85, 95,
  ]);

  // Calcular gap actual de cada número
  const lastIdx = new Array(100).fill(-1);
  for (let i = 0; i < history.length; i++) {
    const n = history[i].numero;
    if (Number.isFinite(n) && lastIdx[n] === -1) lastIdx[n] = i;
  }

  // Media global de gaps
  const gaps      = lastIdx.map((idx, n) => idx === -1 ? history.length : idx);
  const mediaGap  = gaps.reduce((a, b) => a + b, 0) / 100;
  const UMBRAL    = 2.2 * mediaGap;

  const presion = new Map();
  for (let n = 0; n < 100; n++) {
    const gap    = gaps[n];
    const esSal  = SALADITOS.has(n);
    let p        = esSal ? 0.20 : 0.05;

    // Presión por gap largo (número "esperado" → el público lo sigue)
    if (gap > UMBRAL) {
      p += Math.min(0.40, (gap - UMBRAL) / (UMBRAL * 1.5) * 0.40);
    } else if (gap < 3) {
      // Cayó muy recientemente → presión baja (el jugador "ya lo jugó")
      p = Math.max(0, p - 0.25);
    }

    presion.set(n, Math.min(1, p));
  }

  return presion;
}

// ---------------------------------------------------------------------------
// Simulación de gradient step en el backtest
// ---------------------------------------------------------------------------

/**
 * Mantiene el estado de pesos simulados a lo largo del backtest.
 * Cada VENTANA_GRAD evaluaciones aplica un step de gradient.
 */
class WeightSimulator {
  constructor() {
    this.pesos   = { ...PESOS_DEFAULT };
    this._buffer = [];   // últimas evaluaciones acumuladas
  }

  /**
   * Registra el resultado de una evaluación.
   * @param {boolean} enTop5
   * @param {string[]} motoresCorrectos
   * @param {string[]} motoresFallidos
   */
  registrar(enTop5, motoresCorrectos, motoresFallidos) {
    this._buffer.push({ enTop5, motoresCorrectos, motoresFallidos });
    if (this._buffer.length >= VENTANA_GRAD) {
      this._step();
      this._buffer = [];
    }
  }

  _step() {
    const grad = {};
    MOTORES.forEach(m => grad[m] = 0);

    for (const ev of this._buffer) {
      if (ev.enTop5) {
        for (const m of ev.motoresCorrectos) {
          if (grad[m] !== undefined) grad[m] += 1.0;
        }
        for (const m of ev.motoresFallidos) {
          if (grad[m] !== undefined) grad[m] -= 0.3;
        }
      } else {
        for (const m of ev.motoresFallidos) {
          if (grad[m] !== undefined) grad[m] -= 1.0;
        }
      }
    }

    // Normalizar gradiente
    const maxAbs = Math.max(...Object.values(grad).map(Math.abs), 1);
    MOTORES.forEach(m => grad[m] /= maxAbs);

    // Aplicar step
    const nuevos = {};
    for (const m of MOTORES) {
      nuevos[m] = Math.max(MIN_PESO, Math.min(MAX_PESO, this.pesos[m] + LEARNING_RATE_SIM * grad[m]));
    }

    // Normalizar suma = 1
    const suma = MOTORES.reduce((acc, m) => acc + nuevos[m], 0);
    for (const m of MOTORES) {
      this.pesos[m] = Math.round((nuevos[m] / suma) * 1000) / 1000;
    }
  }

  get() { return { ...this.pesos }; }
}

// ---------------------------------------------------------------------------
// Backtest V4 core
// ---------------------------------------------------------------------------

/**
 * Ejecuta el backtest v4 completo.
 *
 * @param {Array}  rawDraws
 * @param {object} opts
 * @param {number}  [opts.warmup=300]
 * @param {number[]}[opts.topKs]
 * @param {boolean} [opts.usePresion=true]   - activar factor adversarial de presión
 * @param {boolean} [opts.useRegimen=true]   - activar ajustes por régimen
 * @param {boolean} [opts.useDynamicWeights=true] - activar gradient rolling de pesos
 * @param {function}[opts.onProgress]
 * @param {AbortSignal}[opts.signal]
 * @returns {Promise<BacktestV4Result>}
 */
export async function backtestV4(rawDraws, opts = {}) {
  const {
    warmup             = 300,
    topKs              = DEFAULT_TOP_KS,
    usePresion         = true,
    useRegimen         = true,
    useDynamicWeights  = true,
    onProgress         = null,
    signal             = null,
  } = opts;

  const draws = enrich(rawDraws);
  if (draws.length < warmup + 20) {
    return { error: `Insuficientes sorteos: ${draws.length} (mínimo ${warmup + 20})`, evaluados: 0 };
  }

  const N        = draws.length;
  const total    = N - warmup;
  const hitsK    = new Map(topKs.map(k => [k, 0]));
  const ranksReg = [];
  const weightSim = new WeightSimulator();

  // Seguimiento de régimen
  const regimenCounts = {};
  // Por régimen: hits
  const hitsKPorRegimen = {};

  let evaluados     = 0;
  let lastYieldTs   = Date.now();

  // Seguimiento de qué motor señaló al ganador (por source)
  const sourceCorrectCount = {};
  const sourceTotalCount   = {};

  for (let t = warmup; t < N; t++) {
    if (signal?.aborted) break;

    const history = draws.slice(0, t);
    const actual  = draws[t];
    if (!Number.isFinite(actual.numero)) continue;

    // ── Construir señales base ──
    const lastNums = history.slice(-3).map(d => d.numero);
    if (lastNums.length < 1) continue;

    const markov1 = normalizeMarkov1(buildMarkov1(history));
    const markov2 = normalizeMarkov2(buildMarkov2(history));
    const rezago  = calcularRezago(history);

    // Obtener pesos actuales (dinámicos o default)
    const pesosActivos = useDynamicWeights ? weightSim.get() : { ...PESOS_DEFAULT };

    // Ajustes de régimen
    let ajustesRegimen = {};
    let regimenActivo  = 'normal';
    if (useRegimen && history.length >= 60) {
      regimenActivo = getRegimenActual(history.slice().reverse());
      ajustesRegimen = getAjustesPorRegimen(regimenActivo);
    }

    // SOURCE_WEIGHTS ponderados por pesos dinámicos + régimen
    const pesosFinales = {};
    for (const m of MOTORES) {
      pesosFinales[m] = (pesosActivos[m] ?? PESOS_DEFAULT[m]) * (ajustesRegimen[m] ?? 1.0);
    }

    // Construir scores con pesos aplicados
    const composed = _agregarConPesos({ markov1, markov2, rezago }, lastNums, pesosFinales);

    // ── Aplicar presión adversarial ──
    if (usePresion) {
      const presionMap = calcularPresionSync(history);
      presionMap.forEach((p, n) => {
        const entry = composed.get(n);
        if (!entry) return;
        const factor = presionAFactor(p);
        entry.score = Math.max(0, Math.min(1, entry.score * factor));
      });
    }

    // ── Aplicar factor de popularidad (igual que v3) ──
    const popMap = calcularPopularidad(history, { lookback: 20 });
    popMap.forEach((data, n) => {
      const entry = composed.get(n);
      if (!entry) return;
      const factor = popularidadAFactor(data.score);
      entry.score = Math.max(0, Math.min(1, entry.score * factor));
    });

    // ── Construir ranking ──
    const ranking = [];
    for (let n = 0; n <= 99; n++) {
      const e = composed.get(n);
      ranking.push({ numero: n, score: e?.score || 0, sources: e?.sources || [] });
    }
    ranking.sort((a, b) => b.score - a.score || a.numero - b.numero);

    const rankActual = ranking.findIndex(r => r.numero === actual.numero);
    if (rankActual < 0) continue;

    ranksReg.push(rankActual);
    const enTop5 = rankActual < 5;

    topKs.forEach(k => {
      if (rankActual < k) hitsK.set(k, hitsK.get(k) + 1);
    });

    // Fuentes que señalaron al ganador
    const ganadorEntry = ranking[rankActual];
    const motoresCorrectos = ganadorEntry.sources.filter(s => (ganadorEntry.score > 0));
    const motoresFallidos  = ranking.slice(0, 5).flatMap(r => r.sources).filter(s => !motoresCorrectos.includes(s));

    for (const s of ganadorEntry.sources) {
      sourceCorrectCount[s] = (sourceCorrectCount[s] || 0) + 1;
      sourceTotalCount[s]   = (sourceTotalCount[s]   || 0) + 1;
    }

    // Retroalimentar weight simulator
    if (useDynamicWeights) {
      weightSim.registrar(enTop5, ganadorEntry.sources, motoresFallidos);
    }

    // Tracking por régimen
    if (!hitsKPorRegimen[regimenActivo]) {
      hitsKPorRegimen[regimenActivo] = { evaluados: 0, hitsK: new Map(topKs.map(k => [k, 0])) };
    }
    const reg = hitsKPorRegimen[regimenActivo];
    reg.evaluados++;
    topKs.forEach(k => { if (rankActual < k) reg.hitsK.set(k, reg.hitsK.get(k) + 1); });

    evaluados++;

    if (evaluados % YIELD_EVERY === 0) {
      const now = Date.now();
      if (onProgress && now - lastYieldTs > 200) {
        onProgress({ done: evaluados, total, fase: 'v4' });
        lastYieldTs = now;
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ── Resultados ──
  const resultados = topKs.map(k => {
    const hits    = hitsK.get(k);
    const hitRate = evaluados ? hits / evaluados : 0;
    const baseline = k / 100;
    const lift     = baseline > 0 ? hitRate / baseline : 0;
    return { k, hits, evaluados, hitRate, baseline, lift, pctMejor: (lift - 1) * 100 };
  });

  const meanRank   = ranksReg.length ? ranksReg.reduce((a, b) => a + b, 0) / ranksReg.length : null;
  const medianRank = ranksReg.length
    ? [...ranksReg].sort((a, b) => a - b)[Math.floor(ranksReg.length / 2)]
    : null;

  // Por régimen
  const porRegimen = Object.entries(hitsKPorRegimen).map(([reg, info]) => {
    const k5  = info.hitsK.get(5)  || 0;
    const k10 = info.hitsK.get(10) || 0;
    return {
      regimen:    reg,
      evaluados:  info.evaluados,
      hitRateK5:  info.evaluados ? k5 / info.evaluados : 0,
      hitRateK10: info.evaluados ? k10 / info.evaluados : 0,
      liftK5:     info.evaluados ? (k5 / info.evaluados) / 0.05 : 0,
      liftK10:    info.evaluados ? (k10 / info.evaluados) / 0.10 : 0,
    };
  });

  // Contribución final de fuentes
  const fuentesContrib = Object.entries(sourceCorrectCount)
    .map(([s, hits]) => ({ source: s, hits, total: sourceTotalCount[s] || 0, hitRate: hits / (sourceTotalCount[s] || 1) }))
    .sort((a, b) => b.hitRate - a.hitRate);

  return {
    version:     'v4',
    evaluados,
    desde:       draws[warmup]?.fecha,
    hasta:       draws[N - 1]?.fecha,
    resultados,
    meanRank:    meanRank != null ? Number(meanRank.toFixed(2)) : null,
    medianRank,
    porRegimen,
    fuentesContrib,
    pesosFinales: weightSim.get(),
    config: { usePresion, useRegimen, useDynamicWeights },
  };
}

// ---------------------------------------------------------------------------
// Comparación v3 vs v4
// ---------------------------------------------------------------------------

/**
 * Ejecuta ambos backtests y devuelve la comparación lado a lado.
 *
 * @param {Array}  rawDraws
 * @param {object} opts
 * @param {function}[opts.onProgress]
 * @param {AbortSignal}[opts.signal]
 * @returns {Promise<ComparacionResult>}
 */
export async function compararV3vsV4(rawDraws, opts = {}) {
  const { onProgress, signal } = opts;

  const _prog = (fase, pct) => {
    if (onProgress) onProgress({ fase, pct });
  };

  _prog('v3', 0);
  const v3 = await backtestV3(rawDraws, {
    warmup: opts.warmup ?? 300,
    topKs:  [5, 10, 20],
    usePopularity: true,
    onProgress: ({ done, total }) => _prog('v3', Math.round(done / total * 50)),
    signal,
  });

  if (signal?.aborted) return { aborted: true };

  _prog('v4', 50);
  const v4 = await backtestV4(rawDraws, {
    ...opts,
    topKs: [5, 10, 20],
    onProgress: ({ done, total }) => _prog('v4', 50 + Math.round(done / total * 50)),
    signal,
  });

  if (v3.error || v4.error) {
    return { error: v3.error ?? v4.error, v3, v4 };
  }

  // Calcular mejora por K
  const mejoras = [5, 10, 20].map(k => {
    const r3 = v3.resultados?.find(r => r.k === k) ?? {};
    const r4 = v4.resultados?.find(r => r.k === k) ?? {};
    return {
      k,
      v3HitRate:  r3.hitRate ?? 0,
      v4HitRate:  r4.hitRate ?? 0,
      v3Lift:     r3.lift    ?? 0,
      v4Lift:     r4.lift    ?? 0,
      deltaLift:  ((r4.lift ?? 0) - (r3.lift ?? 0)),
      mejora:     r3.hitRate > 0 ? ((r4.hitRate - r3.hitRate) / r3.hitRate * 100) : 0,
    };
  });

  const veredicto = _buildVeredicto(mejoras);

  return {
    v3,
    v4,
    mejoras,
    veredicto,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// agregarConPesos: versión de agregarSeñales con pesos explícitos
// ---------------------------------------------------------------------------

function _agregarConPesos({ markov1, markov2, rezago }, lastNums, pesos) {
  const scores = new Map();

  const add = (n, source, val) => {
    if (!Number.isFinite(val) || val <= 0) return;
    if (!scores.has(n)) scores.set(n, { score: 0, sources: [] });
    const e = scores.get(n);
    const w = pesos[source] ?? 0.10;
    e.score += Math.min(1, val) * w;
    if (!e.sources.includes(source)) e.sources.push(source);
  };

  // Markov O1
  if (lastNums.length >= 1) {
    const last = lastNums[lastNums.length - 1];
    const m1 = markov1.get(last);
    if (m1) m1.top.forEach(({ numero, prob }) => add(numero, 'markov1', prob));
  }

  // Markov O2
  if (lastNums.length >= 2) {
    const key = `${lastNums[lastNums.length - 2]}:${lastNums[lastNums.length - 1]}`;
    const m2 = markov2.get(key);
    if (m2) m2.top.forEach(({ numero, prob }) => add(numero, 'markov2', prob));
  }

  // Rezago
  rezago.forEach((info, n) => {
    if (info.estado === 'en_ventana') {
      add(n, 'rezago', Math.min(1, (info.zScore - 0.5) / 1.5));
    }
  });

  // Normalizar scores al rango [0,1]
  const maxScore = Math.max(...Array.from(scores.values()).map(e => e.score), 1);
  scores.forEach(e => { e.score = e.score / maxScore; });

  return scores;
}

// ---------------------------------------------------------------------------
// Veredicto
// ---------------------------------------------------------------------------

function _buildVeredicto(mejoras) {
  const k10 = mejoras.find(m => m.k === 10);
  if (!k10) return { texto: 'Datos insuficientes', positivo: false };

  const deltaLift = k10.deltaLift;
  const mejoraPct = k10.mejora;

  if (deltaLift > 0.15) {
    return {
      texto:    `V4 supera a V3 en +${deltaLift.toFixed(2)}× lift (top-10). Mejora real del ${mejoraPct.toFixed(0)}%.`,
      positivo: true,
      icono:    '🚀',
    };
  }
  if (deltaLift > 0.05) {
    return {
      texto:    `V4 muestra mejora modesta (+${deltaLift.toFixed(2)}× lift top-10). Los módulos de presión/régimen suman valor.`,
      positivo: true,
      icono:    '✅',
    };
  }
  if (deltaLift > -0.05) {
    return {
      texto:    `V4 y V3 estadísticamente equivalentes (Δlift=${deltaLift.toFixed(2)}). El dataset histórico puede no capturar cambios recientes de régimen.`,
      positivo: false,
      icono:    '≈',
    };
  }
  return {
    texto:    `V3 supera a V4 en este período histórico (Δlift=${deltaLift.toFixed(2)}). Considerar ajustar learning rate o ventana de gradient.`,
    positivo: false,
    icono:    '⚠',
  };
}
