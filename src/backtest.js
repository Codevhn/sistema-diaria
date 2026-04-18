/**
 * backtest.js — Validación honesta del motor sobre datos históricos
 *
 * Filosofía: en lugar de creer que el sistema funciona, lo medimos.
 * Para cada sorteo histórico desde el warmup, simulamos que el motor se
 * corrió EL DÍA ANTERIOR (usando solo data hasta t-1) y vemos si el número
 * que cayó en t estaba en su top-K. Comparamos contra la baseline aleatoria
 * (K/100) para detectar lift real.
 *
 * IMPORTANTE: usa exactamente los mismos building blocks que el motor live
 * (buildMarkov1/2, calcularRezago, agregarSeñales, popularity-model). Si el
 * backtest dice que algo no funciona, NO funciona en producción tampoco.
 *
 * Limitaciones honestas:
 *   - No simula evaluarModos() ni detectarPatrones() (son async/DB-bound).
 *     El backtest mide solo el núcleo determinista: Markov + rezago + popularidad.
 *   - No simula calendario adversarial ni clusters por defecto (pueden activarse).
 *   - No simula recovery mode (depende de "super premio" externo).
 */

import {
  buildMarkov1, normalizeMarkov1,
  buildMarkov2, normalizeMarkov2,
  calcularRezago,
  agregarSeñales,
  enrich,
} from "./signal-engine.js";
import { calcularPopularidad, popularidadAFactor } from "./popularity-model.js";

const DEFAULT_TOP_KS = [5, 10, 20, 30];
const YIELD_EVERY = 25; // cada N iteraciones cede el thread para que la UI respire

/**
 * Ejecuta el backtest sobre la historia.
 *
 * @param {Array} rawDraws        - sorteos crudos (NO enriquecidos)
 * @param {object} opts
 * @param {number} [opts.warmup=300]      - mínimo de sorteos antes de empezar a medir
 * @param {number[]} [opts.topKs]         - K's a evaluar
 * @param {boolean} [opts.usePopularity=true] - aplicar factor de popularidad
 * @param {function} [opts.onProgress]    - callback({done, total, hits, ts})
 * @param {AbortSignal} [opts.signal]     - para cancelar
 * @returns {Promise<object>}             - resultados agregados
 */
export async function backtest(rawDraws, opts = {}) {
  const {
    warmup = 300,
    topKs = DEFAULT_TOP_KS,
    usePopularity = true,
    onProgress = null,
    signal = null,
  } = opts;

  const draws = enrich(rawDraws);
  if (draws.length < warmup + 20) {
    return {
      error: `Insuficientes sorteos: hay ${draws.length}, se necesitan ${warmup + 20}.`,
      total: 0,
    };
  }

  const N = draws.length;
  const startIdx = warmup;
  const total = N - startIdx;

  // Acumuladores globales
  const hitsK = new Map(topKs.map((k) => [k, 0]));
  const ranksReg = []; // rank de cada acierto real
  const noScored = []; // casos donde el número actual NO recibió score
  // Por año
  const porAño = new Map(); // año → {evaluados, hitsK:Map}
  // Por fuente que más contribuye al ranking
  const sourceContribTotal = new Map(); // source → suma de val cuando estaba en top-10

  let evaluados = 0;
  let lastYieldTs = Date.now();

  for (let t = startIdx; t < N; t++) {
    if (signal?.aborted) {
      return { aborted: true, evaluados, hitsK: mapToObj(hitsK), porAño: yearMapToObj(porAño) };
    }

    const history = draws.slice(0, t);
    const actual  = draws[t];
    if (!Number.isFinite(actual.numero)) continue;

    const lastNums = history.slice(-3).map((d) => d.numero);
    if (lastNums.length < 1) continue;

    // ── Construir señales con la misma maquinaria del motor ──
    const markov1 = normalizeMarkov1(buildMarkov1(history));
    const markov2 = normalizeMarkov2(buildMarkov2(history));
    const rezago  = calcularRezago(history);

    // No simulamos eliminación dura (familia + recientes) — eso podría descartar
    // el actual y romper la métrica. En vez, dejamos que el ranking refleje el
    // score crudo. Las eliminaciones reales se evalúan aparte.
    const composed = agregarSeñales(
      { markov1, markov2, rezago, modos: null, hallazgos: [], semanales: null },
      lastNums,
      new Set(), // sin penalización de familias para no sesgar el backtest
    );

    // ── Aplicar factor de popularidad adversarial ──
    if (usePopularity) {
      const popMap = calcularPopularidad(history, { lookback: 20 });
      popMap.forEach((data, numero) => {
        const target = composed.get(numero);
        if (!target) return;
        const factor = popularidadAFactor(data.score);
        target.score = Math.max(0, Math.min(1, target.score * factor));
      });
    }

    // ── Construir ranking completo (asegurar 100 entradas) ──
    const ranking = [];
    for (let n = 0; n <= 99; n++) {
      const e = composed.get(n);
      ranking.push({ numero: n, score: e?.score || 0, signals: e?.signals || [] });
    }
    // Ordenar desc por score; tiebreak aleatorio fijo (n) para reproducibilidad
    ranking.sort((a, b) => b.score - a.score || a.numero - b.numero);

    const rankActual = ranking.findIndex((r) => r.numero === actual.numero);
    if (rankActual < 0) continue;

    ranksReg.push(rankActual);
    if (ranking[rankActual].score === 0) noScored.push(t);

    topKs.forEach((k) => {
      if (rankActual < k) hitsK.set(k, hitsK.get(k) + 1);
    });

    // Contribución de fuentes cuando el actual cae en top-10
    if (rankActual < 10) {
      ranking[rankActual].signals.forEach((s) => {
        sourceContribTotal.set(s.source, (sourceContribTotal.get(s.source) || 0) + s.value);
      });
    }

    // Por año
    const año = actual.fechaDate?.getFullYear() || "?";
    if (!porAño.has(año)) porAño.set(año, { evaluados: 0, hitsK: new Map(topKs.map((k) => [k, 0])) });
    const yEntry = porAño.get(año);
    yEntry.evaluados += 1;
    topKs.forEach((k) => {
      if (rankActual < k) yEntry.hitsK.set(k, yEntry.hitsK.get(k) + 1);
    });

    evaluados += 1;

    // Yield al loop para que la UI respire
    if (evaluados % YIELD_EVERY === 0) {
      const now = Date.now();
      if (onProgress && now - lastYieldTs > 200) {
        onProgress({ done: evaluados, total, hits: mapToObj(hitsK) });
        lastYieldTs = now;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ── Agregaciones finales ──
  const resultados = topKs.map((k) => {
    const hits = hitsK.get(k);
    const hitRate = evaluados ? hits / evaluados : 0;
    const baseline = k / 100;
    const lift = baseline > 0 ? hitRate / baseline : 0;
    return {
      k,
      hits,
      evaluados,
      hitRate,
      baseline,
      lift, // 1.0 = igual al azar; >1 = mejor que azar
      pctMejor: (lift - 1) * 100,
    };
  });

  // Distribución de rangos
  const meanRank = ranksReg.length ? ranksReg.reduce((a, b) => a + b, 0) / ranksReg.length : null;
  const medianRank = ranksReg.length ? [...ranksReg].sort((a, b) => a - b)[Math.floor(ranksReg.length / 2)] : null;

  // Por año: hitrate por K, lift
  const porAñoArr = Array.from(porAño.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([año, info]) => {
      const k10 = info.hitsK.get(10) || 0;
      const k20 = info.hitsK.get(20) || 0;
      return {
        año,
        evaluados: info.evaluados,
        hitsK: mapToObj(info.hitsK),
        liftK10: info.evaluados ? (k10 / info.evaluados) / 0.10 : 0,
        liftK20: info.evaluados ? (k20 / info.evaluados) / 0.20 : 0,
      };
    });

  // Top fuentes que más contribuyen a aciertos top-10
  const fuentes = Array.from(sourceContribTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, total]) => ({ source, totalContribucion: Number(total.toFixed(2)) }));

  return {
    evaluados,
    desde: draws[startIdx]?.fecha,
    hasta: draws[N - 1]?.fecha,
    resultados,
    meanRank: meanRank != null ? Number(meanRank.toFixed(2)) : null,
    medianRank,
    noScoredCount: noScored.length, // veces que el actual no recibió ningún score
    porAño: porAñoArr,
    fuentesTop10: fuentes,
  };
}

// ── Helpers ──
function mapToObj(m) {
  const o = {};
  m.forEach((v, k) => (o[k] = v));
  return o;
}
function yearMapToObj(m) {
  const o = {};
  m.forEach((v, k) => (o[k] = { evaluados: v.evaluados, hitsK: mapToObj(v.hitsK) }));
  return o;
}
