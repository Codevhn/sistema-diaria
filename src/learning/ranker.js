/**
 * learning/ranker.js — Ranker de aprendizaje real (Nivel 2)
 *
 * Sustituye la torre de multiplicadores mágicos por un modelo con función
 * de pérdida definida: regresión logística condicional (softmax sobre los
 * 100 números) entrenada ONLINE con SGD y log-loss, regularizada con L2.
 *
 * Características por número (todas computadas SOLO con sorteos previos
 * al momento de predecir — walk-forward sin look-ahead):
 *   0. freq30    — frecuencia en los últimos 30 sorteos
 *   1. freq365   — frecuencia en los últimos 365 sorteos
 *   2. gapLog    — días desde su última caída, log-escalado y acotado
 *   3. markov1JM — P(último→n) con suavizado Jelinek-Mercer (counts)
 *   4. markov2JM — P(penúltimo:último→n) con JM
 *   5. repetido5 — 1 si cayó en los últimos 5 sorteos
 *   6. bias      — 1 (intercept)
 *
 * Cada número tiene su propio vector de pesos (100×7). El gradiente del
 * log-loss es (y_n − p_n)·x_n: si el modelo sobreestima un número que no
 * cayó, sus pesos bajan; el que cayó sube. Sin recompensas mágicas:
 * el azar recibe su calibración por construcción.
 *
 * Sin dependencias de DB ni de UI: puro y testeable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NUM_FEATURES = 7;
const N_NUMEROS = 100;

const JM_K1 = 6;
const JM_K2 = 8;
const PRIOR = 1 / N_NUMEROS;

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const probJM = (count, rowTotal, k) => {
  if (!count) return PRIOR;
  const lam = count / (count + k);
  return lam * (count / rowTotal) + (1 - lam) * PRIOR;
};

/**
 * Normaliza sorteos crudos de DB o enriquecidos: fecha como Date real,
 * sin tests, con número válido. Orden cronológico estable por horario.
 */
const normalizarDraws = (draws) => draws
  .map((d) => ({
    ...d,
    fechaDate: d.fechaDate instanceof Date ? d.fechaDate : new Date(d.fechaDate ?? d.fecha),
  }))
  .filter((d) => d && !d.isTest && Number.isFinite(d.numero)
    && d.fechaDate instanceof Date && !Number.isNaN(d.fechaDate.getTime()))
  .sort((a, b) => a.fechaDate - b.fechaDate
    || String(a.horario ?? a.turno ?? "").localeCompare(String(b.horario ?? b.turno ?? "")));

/**
 * Contexto de features incremental. Se alimenta sorteo a sorteo (en orden
 * cronológico) y produce el vector de features de los 100 números para el
 * PRÓXIMO sorteo. O(100) por paso.
 */
export function crearContextoFeatures() {
  const w30 = [];
  const w365 = [];
  const counts30 = new Int16Array(N_NUMEROS);
  const counts365 = new Int16Array(N_NUMEROS);
  const lastSeenTs = new Float64Array(N_NUMEROS).fill(-Infinity);
  const mk1 = new Map();
  const mk2 = new Map();
  let prev1 = null;
  let prev2 = null;

  const registrar = (numero, tsMs) => {
    w30.push(numero); w365.push(numero);
    counts30[numero]++; counts365[numero]++;
    if (w30.length > 30) counts30[w30.shift()]--;
    if (w365.length > 365) counts365[w365.shift()]--;
    lastSeenTs[numero] = tsMs;
    if (prev1 !== null) {
      if (!mk1.has(prev1)) mk1.set(prev1, new Map());
      const row = mk1.get(prev1);
      row.set(numero, (row.get(numero) || 0) + 1);
    }
    if (prev2 !== null && prev1 !== null) {
      const key = prev2 * 100 + prev1;
      if (!mk2.has(key)) mk2.set(key, new Map());
      const row = mk2.get(key);
      row.set(numero, (row.get(numero) || 0) + 1);
    }
    prev2 = prev1;
    prev1 = numero;
  };

  /**
   * Features para el próximo sorteo dados (tsRef = timestamp de predicción).
   * @returns {Float64Array} longitud 100×7, fila n = features del número n.
   */
  const features = (tsRefMs) => {
    const X = new Float64Array(N_NUMEROS * NUM_FEATURES);
    const row1 = prev1 !== null ? mk1.get(prev1) : null;
    const row2 = prev2 !== null && prev1 !== null ? mk2.get(prev2 * 100 + prev1) : null;
    const total1 = row1 ? Array.from(row1.values()).reduce((s, v) => s + v, 0) : 0;
    const total2 = row2 ? Array.from(row2.values()).reduce((s, v) => s + v, 0) : 0;

    for (let n = 0; n < N_NUMEROS; n += 1) {
      const o = n * NUM_FEATURES;
      X[o + 0] = counts30[n] / 30;
      X[o + 1] = counts365[n] / 365;
      const gapDays = Number.isFinite(lastSeenTs[n])
        ? Math.max(0, (tsRefMs - lastSeenTs[n]) / DAY_MS)
        : 120;
      X[o + 2] = Math.min(1, Math.log1p(gapDays) / Math.log(61));
      X[o + 3] = row1 ? probJM(row1.get(n) || 0, total1, JM_K1) : PRIOR;
      X[o + 4] = row2 ? probJM(row2.get(n) || 0, total2, JM_K2) : PRIOR;
      X[o + 5] = w30.slice(-5).includes(n) ? 1 : 0;
      X[o + 6] = 1;
    }
    return X;
  };

  return { registrar, features };
}

/**
 * Crea el modelo. Pesos pequeños init aleatorios (rompe simetrías).
 */
export function crearRanker({ lr = 0.08, l2 = 1e-4, seed = 20260821 } = {}) {
  const rng = mulberry32(seed);
  const W = new Float64Array(N_NUMEROS * NUM_FEATURES);
  for (let i = 0; i < W.length; i += 1) W[i] = (rng() - 0.5) * 0.02;
  const estado = { lr, l2, pasos: 0 };

  const scores = (X) => {
    const z = new Float64Array(N_NUMEROS);
    for (let n = 0; n < N_NUMEROS; n += 1) {
      const o = n * NUM_FEATURES;
      let s = 0;
      for (let f = 0; f < NUM_FEATURES; f += 1) s += W[o + f] * X[o + f];
      z[n] = s;
    }
    return z;
  };

  const softmax = (z) => {
    let max = -Infinity;
    for (let n = 0; n < N_NUMEROS; n += 1) if (z[n] > max) max = z[n];
    let sum = 0;
    const p = new Float64Array(N_NUMEROS);
    for (let n = 0; n < N_NUMEROS; n += 1) { p[n] = Math.exp(z[n] - max); sum += p[n]; }
    for (let n = 0; n < N_NUMEROS; n += 1) p[n] /= sum;
    return p;
  };

  /** Distribución predictiva para el próximo sorteo. */
  const predecir = (X) => softmax(scores(X));

  /**
   * Un paso de SGD con log-loss del sorteo observado `y`.
   * w_n ← w_n + lr·(𝟙[y=n] − p_n)·x_n − lr·l2·w_n
   */
  const actualizar = (X, y, lrOverride) => {
    const p = softmax(scores(X));
    const lrNow = lrOverride ?? estado.lr;
    for (let n = 0; n < N_NUMEROS; n += 1) {
      const err = (n === y ? 1 : 0) - p[n];
      if (err === 0 && estado.l2 === 0) continue;
      const o = n * NUM_FEATURES;
      for (let f = 0; f < NUM_FEATURES; f += 1) {
        W[o + f] += lrNow * (err * X[o + f] - estado.l2 * W[o + f]);
      }
    }
    estado.pasos += 1;
    return -Math.log(Math.max(1e-12, p[y]));
  };

  /** Log-loss del sorteo y SIN actualizar (para validación). */
  const logLoss = (X, y) => {
    const p = softmax(scores(X));
    return -Math.log(Math.max(1e-12, p[y]));
  };

  const pesos = () => {
    const out = [];
    for (let n = 0; n < N_NUMEROS; n += 1) {
      const o = n * NUM_FEATURES;
      out.push(Array.from(W.slice(o, o + NUM_FEATURES)));
    }
    return out;
  };

  return { predecir, actualizar, logLoss, pesos, estado };
}

/**
 * Importancia aprendida por feature: desviación estándar de los pesos de
 * cada feature entre números (un peso que no discrimina no varía).
 */
export function importanciaFeatures(pesosPorNumero) {
  const nombres = ["freq30", "freq365", "gapLog", "markov1JM", "markov2JM", "repetido5", "bias"];
  const out = [];
  for (let f = 0; f < NUM_FEATURES; f += 1) {
    let mean = 0;
    pesosPorNumero.forEach((w) => { mean += w[f]; });
    mean /= pesosPorNumero.length;
    let variance = 0;
    pesosPorNumero.forEach((w) => { variance += (w[f] - mean) ** 2; });
    variance /= pesosPorNumero.length;
    out.push({ feature: nombres[f], dispersion: Math.sqrt(variance) });
  }
  return out.sort((a, b) => b.dispersion - a.dispersion);
}

/**
 * Evaluación walk-forward del ranker sobre el histórico completo.
 *
 * Para cada sorteo t (tras warmup): predice con TODO lo anterior,
 * registra si el real estaba en el top-K y el log-loss/Brier, y recién
 * entonces aprende de ese sorteo. Cero look-ahead por construcción.
 *
 * @returns {{nEvals, hits, hitRate, esperadoAzar, lift, logLossPromedio, logLossBaseline, brier, brierBaseline, importancia}}
 */
export function evaluarWalkForward(draws = [], { topK = 10, warmup = 150, lr = 0.08, l2 = 1e-4, seed } = {}) {
  const limpio = normalizarDraws(draws);
  if (limpio.length <= warmup + 30) {
    return { nEvals: 0, hits: 0, hitRate: 0, esperadoAzar: topK / 100, lift: 0, logLossPromedio: 0, logLossBaseline: 0, brier: 0, brierBaseline: 0, importancia: [] };
  }

  const ranker = crearRanker({ lr, l2, seed });
  const ctx = crearContextoFeatures();

  let hits = 0;
  let nEvals = 0;
  let llSum = 0;
  let brierSum = 0;
  const LL_BASE = -Math.log(1 / N_NUMEROS); // log-loss del modelo uniforme
  const BRIER_BASE = (() => {
    let s = 0;
    for (let n = 0; n < N_NUMEROS; n += 1) s += (1 / N_NUMEROS - (n === 0 ? 1 : 0)) ** 2;
    return s;
  })();

  for (let t = 0; t < limpio.length; t += 1) {
    const draw = limpio[t];
    const ts = draw.fechaDate.getTime();
    const X = ctx.features(ts);
    if (t >= warmup) {
      const p = ranker.predecir(X);
      const orden = Array.from(p.keys()).sort((a, b) => p[b] - p[a]);
      if (orden.slice(0, topK).includes(draw.numero)) hits += 1;
      nEvals += 1;
      llSum += -Math.log(Math.max(1e-12, p[draw.numero]));
      let bs = 0;
      for (let n = 0; n < N_NUMEROS; n += 1) bs += (p[n] - (n === draw.numero ? 1 : 0)) ** 2;
      brierSum += bs;
    }
    // El aprendizaje ocurre DESPUÉS de predecir: walk-forward puro.
    ranker.actualizar(X, draw.numero, t < warmup + 50 ? 0.12 : undefined);
    ctx.registrar(draw.numero, ts);
  }

  const hitRate = nEvals ? hits / nEvals : 0;
  return {
    nEvals,
    hits,
    hitRate,
    esperadoAzar: topK / N_NUMEROS,
    lift: nEvals ? hitRate / (topK / N_NUMEROS) : 0,
    logLossPromedio: nEvals ? llSum / nEvals : 0,
    logLossBaseline: LL_BASE,
    brier: nEvals ? brierSum / nEvals : 0,
    brierBaseline: BRIER_BASE,
    importancia: importanciaFeatures(ranker.pesos()),
  };
}

/**
 * Uso en producción: entrena sobre el final del histórico (época a época,
 * contexto reconstruido por época para no filtrar futuro hacia el pasado)
 * y puntúa el PRÓXIMO sorteo.
 *
 * @returns {{top: Array<{numero, prob}>, pasos: number} | null}
 */
export function puntuarProximoSorteo(draws = [], { ventana = 600, epochs = 2, topN = 15, lr, l2, seed } = {}) {
  const limpio = normalizarDraws(draws).slice(-ventana);
  if (limpio.length < 60) return null;

  const ranker = crearRanker({ lr, l2, seed });
  let ctxFinal = null;
  for (let e = 0; e < epochs; e += 1) {
    const ctx = crearContextoFeatures();
    const pasoLr = e === 0 ? 0.1 : 0.04;
    for (const d of limpio) {
      const ts = d.fechaDate.getTime();
      ranker.actualizar(ctx.features(ts), d.numero, pasoLr);
      ctx.registrar(d.numero, ts);
    }
    ctxFinal = ctx;
  }
  const tsNext = limpio[limpio.length - 1].fechaDate.getTime() + 6 * 3600 * 1000;
  const p = ranker.predecir(ctxFinal.features(tsNext));
  const orden = Array.from(p.keys()).sort((a, b) => p[b] - p[a]);
  return {
    top: orden.slice(0, topN).map((n) => ({ numero: n, prob: p[n] })),
    pasos: ranker.estado.pasos,
  };
}
