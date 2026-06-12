/**
 * stats-utils.js — Utilidades estadísticas honestas
 *
 * Herramientas compartidas para que las tasas y métricas del sistema se
 * reporten con su incertidumbre en vez de como certezas:
 *   - Suavizado bayesiano Beta-Binomial (tasas con muestras pequeñas)
 *   - Intervalos de credibilidad / bootstrap
 *   - p-valor exacto de chi-cuadrado (gamma incompleta regularizada)
 *   - Test de rachas (Wald–Wolfowitz) y autocorrelación
 */

// ─── Suavizado bayesiano ──────────────────────────────────────────────────────

/**
 * Tasa suavizada con prior Beta(alpha, beta).
 * Con prior uniforme Beta(1,1): 2 aciertos de 3 → 0.6 en vez de 0.667,
 * y la diferencia crece cuanto menor sea la muestra.
 */
export function bayesRate(hits, total, { alphaPrior = 1, betaPrior = 1 } = {}) {
  const h = Math.max(0, hits || 0);
  const n = Math.max(0, total || 0);
  return (h + alphaPrior) / (n + alphaPrior + betaPrior);
}

/**
 * Intervalo de credibilidad aproximado para una proporción con prior Beta(1,1).
 * Usa la aproximación normal sobre la posterior Beta (suficiente para UI;
 * con n < 5 el intervalo se ensancha de forma conservadora).
 */
export function betaCredibleInterval(hits, total, level = 0.95) {
  const a = (hits || 0) + 1;
  const b = (total || 0) - (hits || 0) + 1;
  const mean = a / (a + b);
  const variance = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const z = zForLevel(level);
  const half = z * Math.sqrt(variance);
  return {
    mean,
    low: Math.max(0, mean - half),
    high: Math.min(1, mean + half),
    level,
  };
}

/**
 * IC bootstrap para un hit-rate binomial (h aciertos de n ensayos).
 * Remuestrea Binomial(n, h/n) `iterations` veces y toma percentiles.
 */
export function bootstrapRateCI(hits, total, { iterations = 2000, level = 0.95 } = {}) {
  const n = total || 0;
  if (n === 0) return { low: 0, high: 0, level, n };
  const p = hits / n;
  const rates = new Array(iterations);
  for (let it = 0; it < iterations; it++) {
    let h = 0;
    for (let i = 0; i < n; i++) if (Math.random() < p) h++;
    rates[it] = h / n;
  }
  rates.sort((x, y) => x - y);
  const lo = Math.floor(((1 - level) / 2) * iterations);
  const hi = Math.min(iterations - 1, Math.ceil((1 - (1 - level) / 2) * iterations));
  return { low: rates[lo], high: rates[hi], level, n };
}

function zForLevel(level) {
  if (level >= 0.99) return 2.576;
  if (level >= 0.95) return 1.96;
  if (level >= 0.9) return 1.645;
  return 1.0;
}

// ─── Funciones gamma / chi-cuadrado ──────────────────────────────────────────

// ln Γ(x) — aproximación de Lanczos (precisión ~1e-10, suficiente aquí)
function lnGamma(x) {
  const g = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let xx = x;
  let y = x;
  let tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / xx);
}

// P(a, x): gamma incompleta regularizada inferior (serie + fracción continua)
function gammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Serie
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let i = 0; i < 200; i++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // Fracción continua (Lentz) para Q(a, x); P = 1 - Q
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  return 1 - q;
}

/**
 * p-valor (cola superior) de un estadístico chi-cuadrado con df grados
 * de libertad: P(X² >= chi2).
 */
export function chi2PValue(chi2, df) {
  if (!Number.isFinite(chi2) || chi2 < 0 || df <= 0) return NaN;
  return 1 - gammaP(df / 2, chi2 / 2);
}

/**
 * Chi-cuadrado de uniformidad sobre conteos observados.
 * counts: array de conteos por categoría (se asume esperado uniforme).
 */
export function chi2Uniform(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  const k = counts.length;
  if (!total || k < 2) return { chi2: NaN, df: k - 1, pValue: NaN, total };
  const expected = total / k;
  const chi2 = counts.reduce((s, c) => s + ((c - expected) ** 2) / expected, 0);
  const df = k - 1;
  return { chi2, df, pValue: chi2PValue(chi2, df), total, expected };
}

// ─── Test de rachas y autocorrelación ────────────────────────────────────────

// CDF normal estándar vía erf (Abramowitz & Stegun 7.1.26, error < 1.5e-7)
export function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Test de rachas de Wald–Wolfowitz sobre una secuencia binaria.
 * Detecta tanto exceso de alternancia como exceso de agrupamiento.
 */
export function runsTest(binary) {
  const seq = binary.filter((v) => v === 0 || v === 1);
  const n = seq.length;
  const n1 = seq.filter((v) => v === 1).length;
  const n0 = n - n1;
  if (n0 === 0 || n1 === 0 || n < 20) {
    return { runs: null, expected: null, z: null, pValue: null, n, insuficiente: true };
  }
  let runs = 1;
  for (let i = 1; i < n; i++) if (seq[i] !== seq[i - 1]) runs++;
  const expected = (2 * n0 * n1) / n + 1;
  const variance = (2 * n0 * n1 * (2 * n0 * n1 - n)) / (n * n * (n - 1));
  const z = (runs - expected) / Math.sqrt(variance);
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { runs, expected, z, pValue, n, insuficiente: false };
}

/**
 * Autocorrelación muestral en un lag dado + p-valor aproximado
 * (bajo H0 de independencia, r·√n ~ N(0,1)).
 */
export function autocorrelation(values, lag = 1) {
  const n = values.length;
  if (n <= lag + 2) return { r: null, z: null, pValue: null, n, insuficiente: true };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (values[i] - mean) ** 2;
    if (i + lag < n) num += (values[i] - mean) * (values[i + lag] - mean);
  }
  if (den === 0) return { r: null, z: null, pValue: null, n, insuficiente: true };
  const r = num / den;
  const z = r * Math.sqrt(n);
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { r, z, pValue, n, insuficiente: false };
}

/**
 * Entropía de Shannon normalizada (0-1) de un array de conteos.
 * 1.0 = distribución perfectamente uniforme.
 */
export function entropyRatio(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return null;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(counts.length);
}

/**
 * Corrección de Benjamini-Hochberg (FDR) sobre una lista de tests.
 * Recibe [{pValue, ...}] y devuelve los mismos objetos con
 * `significativoFDR` al nivel q indicado.
 */
export function benjaminiHochberg(tests, q = 0.05) {
  const valid = tests.filter((t) => Number.isFinite(t.pValue));
  const sorted = valid.slice().sort((a, b) => a.pValue - b.pValue);
  const m = sorted.length;
  let cutoff = -1;
  sorted.forEach((t, i) => {
    if (t.pValue <= ((i + 1) / m) * q) cutoff = t.pValue;
  });
  return tests.map((t) => ({
    ...t,
    significativoFDR: Number.isFinite(t.pValue) && cutoff >= 0 && t.pValue <= cutoff,
  }));
}
