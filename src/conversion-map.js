// conversion-map.js — v4.0
// Reglas matemáticas oficiales de La Diaria
//
// CONVERSIÓN   : 0↔1  2↔5  3↔8  4↔7  6↔9
//   Simple      → un dígito convertido
//   Compuesta   → ambos dígitos convertidos
//
// EQUIVALENCIA : 0↔5  1↔6  2↔7  3↔8  4↔9
//   → ambos dígitos, más el espejo del resultado

const CONV_RAW = { 0:1, 1:0, 2:5, 5:2, 3:8, 8:3, 4:7, 7:4, 6:9, 9:6 };
const EQUIV_RAW = { 0:5, 5:0, 1:6, 6:1, 2:7, 7:2, 3:8, 8:3, 4:9, 9:4 };

export const CONVERSION_MAP = Object.freeze(
  Object.fromEntries(Object.entries(CONV_RAW).map(([k, v]) => [k, String(v)]))
);
export const EQUIVALENCIAS_MAP = Object.freeze(EQUIV_RAW);

// ─── helpers internos ──────────────────────────────────────────────────────

const PAD = (n) => String(n).padStart(2, "0");

function toDigits(num) {
  const s = PAD(num);
  return [parseInt(s[0], 10), parseInt(s[1], 10)];
}

function fromDigits(d0, d1) {
  if (d0 < 0 || d0 > 9 || d1 < 0 || d1 > 9) return null;
  return d0 * 10 + d1;
}

// ─── conversión ────────────────────────────────────────────────────────────

/** Convierte un dígito individual (devuelve número o null). */
export function convertDigit(digit) {
  const d = typeof digit === "string" ? parseInt(digit, 10) : digit;
  return CONV_RAW[d] ?? null;
}

/**
 * Conversión simple: un dígito cambia, el otro se mantiene.
 * Para 23 → [28, 53]
 */
export function getSimpleConversions(num) {
  const [d0, d1] = toDigits(num);
  const results = new Set();
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 !== undefined) {
    const n = fromDigits(c0, d1);
    if (n !== null && n !== num) results.add(n);
  }
  if (c1 !== undefined) {
    const n = fromDigits(d0, c1);
    if (n !== null && n !== num) results.add(n);
  }
  return Array.from(results);
}

/**
 * Conversión compuesta: ambos dígitos se convierten.
 * Para 23 → [58]
 * Incluye también el espejo del resultado para compatibilidad con módulos existentes.
 */
export function getCompositeConversions(num, { includeMirror = true } = {}) {
  const [d0, d1] = toDigits(num);
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 === undefined || c1 === undefined) return [];
  const results = new Set();
  const compound = fromDigits(c0, c1);
  if (compound !== null && compound !== num) results.add(compound);
  if (includeMirror) {
    const mirror = fromDigits(c1, c0);
    if (mirror !== null && mirror !== num) results.add(mirror);
  }
  return Array.from(results);
}

/**
 * Conversión compuesta (solo el valor principal, sin espejo).
 * Para 23 → 58
 */
export function convertBothDigits(num) {
  const [d0, d1] = toDigits(num);
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 === undefined || c1 === undefined) return null;
  return fromDigits(c0, c1);
}

// ─── equivalencias ─────────────────────────────────────────────────────────

/**
 * Equivalencias: ambos dígitos se reemplazan según el mapa 0↔5 1↔6 2↔7 3↔8 4↔9.
 * Devuelve el resultado directo y su espejo.
 * Para 23 → [78, 87]
 */
export function getEquivalencias(num) {
  const [d0, d1] = toDigits(num);
  const e0 = EQUIV_RAW[d0];
  const e1 = EQUIV_RAW[d1];
  if (e0 === undefined || e1 === undefined) return [];
  const results = new Set();
  const direct = fromDigits(e0, e1);
  if (direct !== null && direct !== num) results.add(direct);
  const swapped = fromDigits(e1, e0);
  if (swapped !== null && swapped !== num) results.add(swapped);
  return Array.from(results);
}

// ─── espejo ────────────────────────────────────────────────────────────────

/**
 * Espejo: invierte los dígitos.
 * Para 23 → 32, para 11 → null (igual).
 */
export function getMirror(num) {
  const [d0, d1] = toDigits(num);
  const m = fromDigits(d1, d0);
  return m !== null && m !== num ? m : null;
}

// ─── agrupado ──────────────────────────────────────────────────────────────

/**
 * Devuelve todos los números relacionados, agrupados por tipo.
 * Para 23 → { simple:[28,53], compound:[58], equivalencias:[78,87], mirror:[32] }
 */
export function getAllRelated(num) {
  return {
    simple: getSimpleConversions(num),
    compound: getCompositeConversions(num, { includeMirror: false }),
    equivalencias: getEquivalencias(num),
    mirror: (() => { const m = getMirror(num); return m !== null ? [m] : []; })(),
  };
}

// ─── clasificador ─────────────────────────────────────────────────────────

/**
 * Clasifica la relación matemática entre dos números.
 * Retorna: 'same' | 'conversion-simple' | 'conversion-compound' | 'equivalencia' | 'mirror' | null
 */
export function classifyRelation(numA, numB) {
  if (numA === numB) return "same";
  if (getSimpleConversions(numA).includes(numB)) return "conversion-simple";
  if (convertBothDigits(numA) === numB) return "conversion-compound";
  if (getEquivalencias(numA).includes(numB)) return "equivalencia";
  if (getMirror(numA) === numB) return "mirror";
  return null;
}

// ─── metadata ─────────────────────────────────────────────────────────────

export const CONVERSION_MAP_NOTE =
  "Conversión: 0↔1 2↔5 3↔8 4↔7 6↔9 | Equivalencia: 0↔5 1↔6 2↔7 3↔8 4↔9";
