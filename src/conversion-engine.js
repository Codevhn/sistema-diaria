/**
 * conversion-engine.js — Generador dinámico de variantes de un número
 *
 * Tesis: Cuando el público "espera" un número N (porque acaba de caer, está
 * caliente, o pertenece a una cadena activa), La Diaria NO paga N. En su
 * lugar, tira un número del UNIVERSO DE VARIANTES de N, manteniendo el
 * "guiño" matemático/simbólico sin pagar el número evidente.
 *
 * Reglas matemáticas oficiales:
 *   CONVERSIÓN   : 0↔1  2↔5  3↔8  4↔7  6↔9
 *   EQUIVALENCIA : 0↔5  1↔6  2↔7  3↔8  4↔9
 *   ESPEJO       : invierte dígitos
 *
 * Universo de variantes (8 categorías):
 *   1. simple_d0       — un dígito convertido (decena)
 *   2. simple_d1       — un dígito convertido (unidad)
 *   3. compound        — ambos dígitos convertidos
 *   4. compound_mirror — espejo del compuesto
 *   5. equiv_directa   — ambos dígitos equivalencia
 *   6. equiv_espejo    — espejo de equivalencia
 *   7. mirror          — espejo simple
 *   8. encadenado      — composición (conversión + equivalencia o espejo)
 *
 * Cada variante lleva un peso "distancia": cuanto más simple la transformación,
 * mayor el peso (la operadora prefiere transformaciones que el público
 * RECONOZCA como guiño).
 */

// ─── Reglas atómicas ──────────────────────────────────────────────────────────

const CONV_RAW  = { 0:1, 1:0, 2:5, 5:2, 3:8, 8:3, 4:7, 7:4, 6:9, 9:6 };
const EQUIV_RAW = { 0:5, 5:0, 1:6, 6:1, 2:7, 7:2, 3:8, 8:3, 4:9, 9:4 };

export const CONVERSION_MAP   = Object.freeze(CONV_RAW);
export const EQUIVALENCIAS_MAP = Object.freeze(EQUIV_RAW);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAD = (n) => String(n).padStart(2, "0");

function toDigits(num) {
  const s = PAD(num);
  return [parseInt(s[0], 10), parseInt(s[1], 10)];
}

function fromDigits(d0, d1) {
  if (d0 < 0 || d0 > 9 || d1 < 0 || d1 > 9) return null;
  return d0 * 10 + d1;
}

// ─── Operaciones atómicas ─────────────────────────────────────────────────────

export function convertDigit(digit) {
  const d = typeof digit === "string" ? parseInt(digit, 10) : digit;
  return CONV_RAW[d] ?? null;
}

export function getMirror(num) {
  const [d0, d1] = toDigits(num);
  const m = fromDigits(d1, d0);
  return m !== null && m !== num ? m : null;
}

export function getSimpleConversions(num) {
  const [d0, d1] = toDigits(num);
  const out = new Set();
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 !== undefined) {
    const n = fromDigits(c0, d1);
    if (n !== null && n !== num) out.add(n);
  }
  if (c1 !== undefined) {
    const n = fromDigits(d0, c1);
    if (n !== null && n !== num) out.add(n);
  }
  return Array.from(out);
}

export function convertBothDigits(num) {
  const [d0, d1] = toDigits(num);
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 === undefined || c1 === undefined) return null;
  return fromDigits(c0, c1);
}

export function getCompositeConversions(num, { includeMirror = true } = {}) {
  const [d0, d1] = toDigits(num);
  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  if (c0 === undefined || c1 === undefined) return [];
  const out = new Set();
  const compound = fromDigits(c0, c1);
  if (compound !== null && compound !== num) out.add(compound);
  if (includeMirror) {
    const mir = fromDigits(c1, c0);
    if (mir !== null && mir !== num) out.add(mir);
  }
  return Array.from(out);
}

export function getEquivalencias(num) {
  const [d0, d1] = toDigits(num);
  const e0 = EQUIV_RAW[d0];
  const e1 = EQUIV_RAW[d1];
  if (e0 === undefined || e1 === undefined) return [];
  const out = new Set();
  const direct = fromDigits(e0, e1);
  if (direct !== null && direct !== num) out.add(direct);
  const swapped = fromDigits(e1, e0);
  if (swapped !== null && swapped !== num) out.add(swapped);
  return Array.from(out);
}

// ─── Generador dinámico de TODAS las variantes ────────────────────────────────

/**
 * Pesos por categoría (cuán "fuerte" es la sustitución como guiño).
 * Mayor peso = más probable que la operadora la use.
 */
const PESOS_VARIANTE = {
  simple_d0:       0.95,
  simple_d1:       0.95,
  compound:        0.85,
  compound_mirror: 0.70,
  equiv_directa:   0.80,
  equiv_espejo:    0.65,
  mirror:          0.75,
  encadenado:      0.45,
};

const ETIQUETAS = {
  simple_d0:       "Conversión simple (decena)",
  simple_d1:       "Conversión simple (unidad)",
  compound:        "Conversión compuesta",
  compound_mirror: "Espejo de compuesta",
  equiv_directa:   "Equivalencia directa",
  equiv_espejo:    "Espejo de equivalencia",
  mirror:          "Espejo simple",
  encadenado:      "Encadenado (conv+equiv)",
};

/**
 * Genera el universo completo de variantes de un número.
 *
 * @param {number} seed - Número semilla (0-99)
 * @param {object} opts
 * @param {boolean} [opts.encadenadas=true] - Incluir transformaciones encadenadas
 * @param {boolean} [opts.incluirSemilla=false] - Incluir el propio seed en la salida
 * @returns {Array<{numero, pad, tipo, peso, descripcion, ruta:string[]}>}
 *          Ordenado por peso desc, sin duplicados (el de mayor peso gana).
 */
export function generarVariantes(seed, opts = {}) {
  const { encadenadas = true, incluirSemilla = false } = opts;
  const [d0, d1] = toDigits(seed);
  const variantes = new Map(); // numero → mejor variante

  function add(numero, tipo, ruta) {
    if (numero === null || numero === undefined) return;
    if (!incluirSemilla && numero === seed) return;
    const peso = PESOS_VARIANTE[tipo] ?? 0.5;
    const cur = variantes.get(numero);
    if (!cur || peso > cur.peso) {
      variantes.set(numero, {
        numero,
        pad: PAD(numero),
        tipo,
        peso,
        descripcion: ETIQUETAS[tipo] || tipo,
        ruta: ruta.slice(),
      });
    }
  }

  const c0 = CONV_RAW[d0];
  const c1 = CONV_RAW[d1];
  const e0 = EQUIV_RAW[d0];
  const e1 = EQUIV_RAW[d1];

  // 1. Conversión simple (decena)
  if (c0 !== undefined) add(fromDigits(c0, d1), "simple_d0", [`d0:${d0}→${c0}`]);
  // 2. Conversión simple (unidad)
  if (c1 !== undefined) add(fromDigits(d0, c1), "simple_d1", [`d1:${d1}→${c1}`]);
  // 3. Conversión compuesta
  if (c0 !== undefined && c1 !== undefined) {
    add(fromDigits(c0, c1), "compound", [`d0:${d0}→${c0}`, `d1:${d1}→${c1}`]);
    // 4. Espejo de compuesta
    add(fromDigits(c1, c0), "compound_mirror", [`d0:${d0}→${c0}`, `d1:${d1}→${c1}`, "espejo"]);
  }
  // 5. Equivalencia directa
  if (e0 !== undefined && e1 !== undefined) {
    add(fromDigits(e0, e1), "equiv_directa", [`d0:${d0}↔${e0}`, `d1:${d1}↔${e1}`]);
    // 6. Espejo de equivalencia
    add(fromDigits(e1, e0), "equiv_espejo", [`d0:${d0}↔${e0}`, `d1:${d1}↔${e1}`, "espejo"]);
  }
  // 7. Espejo simple
  add(getMirror(seed), "mirror", ["espejo"]);

  // 8. Encadenadas: aplicar equivalencia sobre la conversión compuesta y viceversa
  if (encadenadas && c0 !== undefined && c1 !== undefined) {
    const compound = fromDigits(c0, c1);
    if (compound !== null) {
      const [cd0, cd1] = toDigits(compound);
      const ce0 = EQUIV_RAW[cd0];
      const ce1 = EQUIV_RAW[cd1];
      if (ce0 !== undefined && ce1 !== undefined) {
        add(fromDigits(ce0, ce1), "encadenado", [`compound:${PAD(compound)}`, "equivalencia"]);
        add(fromDigits(ce1, ce0), "encadenado", [`compound:${PAD(compound)}`, "equiv-espejo"]);
      }
      // espejo del compuesto
      const mc = getMirror(compound);
      if (mc !== null) add(mc, "encadenado", [`compound:${PAD(compound)}`, "espejo"]);
    }
  }
  if (encadenadas && e0 !== undefined && e1 !== undefined) {
    const equiv = fromDigits(e0, e1);
    if (equiv !== null) {
      const [ed0, ed1] = toDigits(equiv);
      const ec0 = CONV_RAW[ed0];
      const ec1 = CONV_RAW[ed1];
      if (ec0 !== undefined && ec1 !== undefined) {
        add(fromDigits(ec0, ec1), "encadenado", [`equiv:${PAD(equiv)}`, "conversión"]);
      }
      const me = getMirror(equiv);
      if (me !== null) add(me, "encadenado", [`equiv:${PAD(equiv)}`, "espejo"]);
    }
  }

  return Array.from(variantes.values()).sort((a, b) => b.peso - a.peso);
}

/**
 * Devuelve solo los números (sin metadata) — útil para sets rápidos.
 */
export function variantesSet(seed, opts = {}) {
  return new Set(generarVariantes(seed, opts).map((v) => v.numero));
}

/**
 * Para una lista de semillas (p.ej. los últimos N sorteos), genera la unión
 * ponderada de todas sus variantes. Si una variante aparece desde múltiples
 * semillas, su peso se ACUMULA (capped a 1.0).
 *
 * @param {Array<number|{numero:number, peso?:number}>} seeds
 * @param {object} [opts]
 * @returns {Map<number, {peso, fuentes:Array<{seed:number, tipo:string, peso:number}>}>}
 */
export function generarVariantesMulti(seeds = [], opts = {}) {
  const acc = new Map();
  seeds.forEach((s) => {
    const seed   = typeof s === "number" ? s : s.numero;
    const wSeed  = (typeof s === "object" && s.peso) ? s.peso : 1.0;
    const vars   = generarVariantes(seed, opts);
    vars.forEach((v) => {
      const contribucion = v.peso * wSeed;
      if (!acc.has(v.numero)) acc.set(v.numero, { peso: 0, fuentes: [] });
      const e = acc.get(v.numero);
      e.peso = Math.min(1.0, e.peso + contribucion * 0.4); // saturación suave
      e.fuentes.push({ seed, tipo: v.tipo, peso: v.peso });
    });
  });
  return acc;
}

// ─── API de compatibilidad: agrupado y clasificador ──────────────────────────

export function getAllRelated(num) {
  return {
    simple:        getSimpleConversions(num),
    compound:      getCompositeConversions(num, { includeMirror: false }),
    equivalencias: getEquivalencias(num),
    mirror: (() => { const m = getMirror(num); return m !== null ? [m] : []; })(),
  };
}

export function classifyRelation(numA, numB) {
  if (numA === numB) return "same";
  if (getSimpleConversions(numA).includes(numB)) return "conversion-simple";
  if (convertBothDigits(numA) === numB)          return "conversion-compound";
  if (getEquivalencias(numA).includes(numB))     return "equivalencia";
  if (getMirror(numA) === numB)                  return "mirror";
  // ¿variante encadenada?
  const set = variantesSet(numA, { encadenadas: true });
  if (set.has(numB)) return "encadenado";
  return null;
}

export const CONVERSION_MAP_NOTE =
  "Conversión: 0↔1 2↔5 3↔8 4↔7 6↔9 | Equivalencia: 0↔5 1↔6 2↔7 3↔8 4↔9 | + variantes encadenadas";
