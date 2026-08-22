/**
 * learning/calibration.js — Calibración de probabilidades (Nivel 2)
 *
 * Una probabilidad está calibrada si "70%" cae ~70% de las veces.
 * Herramientas: Brier score, bins de confiabilidad (curva de
 * confiabilidad) y escalamiento de Platt (regresión logística 1D sobre
 * scores crudos). Todo puro y testeable.
 */

/**
 * Brier score binario: media de (p − y)². Puntuaciones: 0 = perfecto,
 * 0.25 = adivinar siempre 50%, predecir siempre la base rate r da r(1−r).
 */
export function brierScore(pares) {
  const validos = pares.filter(([p, y]) => Number.isFinite(p) && (y === 0 || y === 1));
  if (!validos.length) return null;
  return validos.reduce((acc, [p, y]) => acc + (p - y) ** 2, 0) / validos.length;
}

/**
 * Brier multinomial: Σ_n (p_n − y_n)² sobre la distribución completa.
 */
export function brierMultinomial(p, y) {
  let s = 0;
  for (let n = 0; n < p.length; n += 1) {
    const yn = n === y ? 1 : 0;
    s += (p[n] - yn) ** 2;
  }
  return s;
}

/**
 * Bins de confiabilidad: agrupa predicciones por rango de p y compara
 * la frecuencia empírica. La base de un diagrama de confiabilidad.
 *
 * @returns {Array<{bin, n, pPromedio, tasaReal, gap}>}
 */
export function binsConfiabilidad(pares, { nBins = 10 } = {}) {
  const validos = pares.filter(([p, y]) => Number.isFinite(p) && (y === 0 || y === 1));
  const bins = Array.from({ length: nBins }, (_, i) => ({
    bin: `${(i / nBins).toFixed(1)}–${((i + 1) / nBins).toFixed(1)}`,
    n: 0,
    pSuma: 0,
    hits: 0,
  }));
  validos.forEach(([p, y]) => {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor(p * nBins)));
    bins[idx].n += 1;
    bins[idx].pSuma += p;
    bins[idx].hits += y;
  });
  return bins
    .filter((b) => b.n > 0)
    .map((b) => {
      const pPromedio = b.pSuma / b.n;
      const tasaReal = b.hits / b.n;
      return { bin: b.bin, n: b.n, pPromedio, tasaReal, gap: Math.abs(tasaReal - pPromedio) };
    });
}

/**
 * Escalamiento de Platt: calibra un score crudo s mediante
 * p = σ(a·s + b), con (a, b) ajustados por máxima verosimilitud
 * (Newton–Raphson sobre la log-likelihood, con regularización débil).
 *
 * @returns {{ a, b, calibrar(s:number):number }} o null si no converge.
 */
export function plattScaling(datos, { maxIter = 100, tol = 1e-8 } = {}) {
  const pts = datos.filter(([, y]) => y === 0 || y === 1);
  if (pts.length < 10) return null;

  let a = 1;
  let b = 0;
  for (let it = 0; it < maxIter; it += 1) {
    let ga = 0;
    let gb = 0;
    let haa = 0;
    let hbb = 0;
    let hab = 0;
    pts.forEach(([s, y]) => {
      const p = 1 / (1 + Math.exp(-(a * s + b)));
      const err = y - p;
      ga += err * s;
      gb += err;
      const w = p * (1 - p) + 1e-9;
      haa -= w * s * s;
      hbb -= w;
      hab -= w * s;
    });
    // regularización ridge débil para estabilidad
    haa -= 1e-3;
    hbb -= 1e-3;
    const det = haa * hbb - hab * hab;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    const da = (ga * hbb - gb * hab) / det;
    const db = (gb * haa - ga * hab) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < tol && Math.abs(db) < tol) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b, calibrar: (s) => 1 / (1 + Math.exp(-(a * s + b))) };
}
