/**
 * signal/markov.js — Markov O1/O2 puro
 *
 * Funciones puras: construyen y normalizan matrices de transición.
 * Sin dependencias de DB ni de otros motores.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MARKOV_MIN_SOPORTE = 3;
const MARKOV2_MIN_SOPORTE = 2;
const MARKOV_DECAY_PER_DAY = 0.97;

export { MARKOV_MIN_SOPORTE, MARKOV2_MIN_SOPORTE };

/**
 * Construye la matriz de transición A→B (Markov Orden 1).
 * @returns {Map<number, Map<number, {count, wsum}>>}
 */
export function buildMarkov1(draws) {
  const matrix = new Map();
  const now = Date.now();

  for (let i = 0; i < draws.length - 1; i++) {
    const cur = draws[i];
    const next = draws[i + 1];

    if (cur.pais && next.pais && cur.pais !== next.pais) continue;
    const dayDiff = Math.round((next.fechaDate - cur.fechaDate) / DAY_MS);
    if (dayDiff < 0 || dayDiff > 2) continue;

    const ageInDays = Math.max(0, (now - cur.fechaDate) / DAY_MS);
    const weight = Math.pow(MARKOV_DECAY_PER_DAY, ageInDays);

    const from = cur.numero;
    const to = next.numero;

    if (!matrix.has(from)) matrix.set(from, new Map());
    const row = matrix.get(from);
    const cell = row.get(to) || { count: 0, wsum: 0 };
    cell.count++;
    cell.wsum += weight;
    row.set(to, cell);
  }

  return matrix;
}

/**
 * Calcula probabilidades normalizadas desde la matriz cruda O1.
 * @returns {Map<number, {total, top: [{numero, prob, count}]}>}
 */
export function normalizeMarkov1(matrix) {
  const result = new Map();
  matrix.forEach((row, from) => {
    const totalCount = Array.from(row.values()).reduce((s, c) => s + c.count, 0);
    const totalWsum = Array.from(row.values()).reduce((s, c) => s + c.wsum, 0);
    if (totalCount < MARKOV_MIN_SOPORTE) return;
    const top = Array.from(row.entries())
      .map(([to, cell]) => ({ numero: to, count: cell.count, prob: cell.wsum / totalWsum }))
      .sort((a, b) => b.prob - a.prob);
    result.set(from, { total: totalCount, top });
  });
  return result;
}

/**
 * Construye la matriz de transición (A,B)→C (Markov Orden 2).
 * @returns {Map<string, Map<number, {count, wsum}>>}
 */
export function buildMarkov2(draws) {
  const matrix = new Map();
  const now = Date.now();

  for (let i = 0; i < draws.length - 2; i++) {
    const a = draws[i];
    const b = draws[i + 1];
    const c = draws[i + 2];

    if (a.pais && b.pais && a.pais !== b.pais) continue;
    if (b.pais && c.pais && b.pais !== c.pais) continue;

    const dayDiff1 = Math.round((b.fechaDate - a.fechaDate) / DAY_MS);
    const dayDiff2 = Math.round((c.fechaDate - b.fechaDate) / DAY_MS);
    if (dayDiff1 < 0 || dayDiff1 > 2) continue;
    if (dayDiff2 < 0 || dayDiff2 > 2) continue;

    const ageInDays = Math.max(0, (now - a.fechaDate) / DAY_MS);
    const weight = Math.pow(MARKOV_DECAY_PER_DAY, ageInDays);

    const key = `${a.numero}:${b.numero}`;
    if (!matrix.has(key)) matrix.set(key, new Map());
    const row = matrix.get(key);
    const cell = row.get(c.numero) || { count: 0, wsum: 0 };
    cell.count++;
    cell.wsum += weight;
    row.set(c.numero, cell);
  }

  return matrix;
}

/**
 * Calcula probabilidades normalizadas desde la matriz cruda O2.
 * @returns {Map<string, {total, top: [{numero, prob, count}]}>}
 */
export function normalizeMarkov2(matrix) {
  const result = new Map();
  matrix.forEach((row, key) => {
    const totalCount = Array.from(row.values()).reduce((s, c) => s + c.count, 0);
    const totalWsum = Array.from(row.values()).reduce((s, c) => s + c.wsum, 0);
    if (totalCount < MARKOV2_MIN_SOPORTE) return;
    const top = Array.from(row.entries())
      .map(([to, cell]) => ({ numero: to, count: cell.count, prob: cell.wsum / totalWsum }))
      .sort((a, b) => b.prob - a.prob);
    result.set(key, { total: totalCount, top });
  });
  return result;
}
