/**
 * variant-resolver.js
 *
 * Resuelve TODAS las formas posibles de un número: matemáticas, semánticas
 * y por catálogo. Es el vocabulario compartido de todos los motores nuevos.
 *
 * Extiende conversion-engine.js agregando:
 *   - Relativos oficiales (relativos_diaria.json)
 *   - Familia semántica (guia_suenos.json)
 *   - Decena y terminación
 *   - Detección del tipo de relación entre dos números cualesquiera
 *
 * Exports principales:
 *   resolverFormas(numero, opts)          → FormasCompletas
 *   clasificarRelacion(numA, numB, opts)  → RelacionDetallada | null
 *   esVarianteDe(numA, numB, opts)        → boolean
 *   getPeso(tipo)                         → number (0-1)
 */

import {
  generarVariantes,
  variantesSet,
  getMirror,
  getSimpleConversions,
  convertBothDigits,
  getEquivalencias,
  classifyRelation as classifyMath,
} from './conversion-engine.js';

// ---------------------------------------------------------------------------
// Pesos por tipo de relación — de mayor a menor "cercanía"
// ---------------------------------------------------------------------------
export const PESOS_RELACION = Object.freeze({
  mismo:            1.00,
  relativo:         0.95,  // del catálogo oficial
  simple_d0:        0.92,
  simple_d1:        0.92,
  mirror:           0.88,
  compound:         0.85,
  equiv_directa:    0.82,
  equiv_espejo:     0.70,
  compound_mirror:  0.70,
  encadenado:       0.50,
  familia:          0.40,  // mismo grupo semántico
  decena:           0.30,  // misma decena
  terminacion:      0.25,  // misma terminación
});

export function getPeso(tipo) {
  return PESOS_RELACION[tipo] ?? 0.20;
}

// ---------------------------------------------------------------------------
// Carga de datos externos (con caché en memoria)
// ---------------------------------------------------------------------------

let _relativosCache = null;
let _guiaCache = null;

async function loadRelativos() {
  if (_relativosCache) return _relativosCache;
  try {
    const res = await fetch('data/relativos_diaria.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const map = new Map();
    for (const [pad, entry] of Object.entries(json.pares || {})) {
      const num = parseInt(pad, 10);
      const targets = (entry.relativos || []).map(r => r.numero);
      if (targets.length) map.set(num, targets);
    }
    _relativosCache = map;
    return map;
  } catch {
    _relativosCache = new Map();
    return _relativosCache;
  }
}

async function loadGuia() {
  if (_guiaCache) return _guiaCache;
  try {
    const res = await fetch('data/guia_suenos.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _guiaCache = await res.json();
    return _guiaCache;
  } catch {
    _guiaCache = {};
    return _guiaCache;
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const PAD = n => String(n).padStart(2, '0');

function decena(n)     { return Math.floor(n / 10) * 10; }
function terminacion(n){ return n % 10; }

function mismaDecena(a, b) {
  return a !== b && Math.floor(a / 10) === Math.floor(b / 10);
}

function mismaTerminacion(a, b) {
  return a !== b && (a % 10) === (b % 10);
}

function getFamilia(guia, numero) {
  const entry = guia[PAD(numero)] || guia[String(numero)];
  return entry?.familia ?? null;
}

function getSimboloYFamilia(guia, numero) {
  const entry = guia[PAD(numero)] || guia[String(numero)];
  return {
    simbolo: entry?.simbolo ?? null,
    familia: entry?.familia ?? null,
    elemento: entry?.elemento ?? null,
    polaridad: entry?.polaridad ?? null,
  };
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Devuelve TODAS las formas posibles de un número agrupadas por tipo.
 *
 * @param {number} numero  - Número semilla (0-99)
 * @param {object} opts
 * @param {boolean} [opts.incluirFamilia=true]   - Incluir números de la misma familia semántica
 * @param {boolean} [opts.incluirDecena=true]    - Incluir números de la misma decena
 * @param {boolean} [opts.incluirTerminacion=false] - Incluir misma terminación
 * @returns {Promise<FormasCompletas>}
 */
export async function resolverFormas(numero, opts = {}) {
  const {
    incluirFamilia    = true,
    incluirDecena     = true,
    incluirTerminacion = false,
  } = opts;

  const [relativos, guia] = await Promise.all([loadRelativos(), loadGuia()]);

  // --- Variantes matemáticas (del conversion-engine existente) ---
  const varsMath = generarVariantes(numero, { encadenadas: true, incluirSemilla: false });

  // Agrupar por tipo para el objeto de salida
  const matematicas = {};
  for (const v of varsMath) {
    if (!matematicas[v.tipo]) matematicas[v.tipo] = [];
    matematicas[v.tipo].push(v.numero);
  }

  // Set rápido de todas las variantes matemáticas
  const setMath = new Set(varsMath.map(v => v.numero));

  // --- Relativos oficiales ---
  const relativosOficiales = relativos.get(numero) ?? [];

  // --- Familia semántica ---
  const infoSemilla = getSimboloYFamilia(guia, numero);
  const familiaNumeros = [];
  if (incluirFamilia && infoSemilla.familia) {
    for (let n = 0; n <= 99; n++) {
      if (n === numero) continue;
      const info = getSimboloYFamilia(guia, n);
      if (info.familia === infoSemilla.familia) familiaNumeros.push(n);
    }
  }

  // --- Decena ---
  const decenaNumeros = [];
  if (incluirDecena) {
    const base = decena(numero);
    for (let n = base; n < base + 10; n++) {
      if (n !== numero && n <= 99) decenaNumeros.push(n);
    }
  }

  // --- Terminación ---
  const terminacionNumeros = [];
  if (incluirTerminacion) {
    const term = terminacion(numero);
    for (let n = term; n <= 99; n += 10) {
      if (n !== numero) terminacionNumeros.push(n);
    }
  }

  // --- Set completo para búsqueda rápida ---
  const setCompleto = new Set([
    ...setMath,
    ...relativosOficiales,
    ...familiaNumeros,
    ...decenaNumeros,
    ...terminacionNumeros,
  ]);

  return {
    semilla:       numero,
    semillaPad:    PAD(numero),
    simbolo:       infoSemilla.simbolo,
    familia:       infoSemilla.familia,
    elemento:      infoSemilla.elemento,
    polaridad:     infoSemilla.polaridad,

    // Matemáticas (agrupadas por tipo)
    matematicas,                       // { simple_d0: [], mirror: [], ... }
    todasMath: [...setMath],           // lista plana de variantes matemáticas

    // Catálogo
    relativos:     relativosOficiales, // [n1, n2] del catálogo oficial

    // Semánticas
    familia:       infoSemilla.familia,
    familiaNumeros,                    // números de la misma familia
    decenaNumeros,
    terminacionNumeros,

    // Set completo (para búsqueda O(1))
    setCompleto,

    // Orden por peso (útil para ranking de candidatos)
    porPeso: _ordenarPorPeso(numero, varsMath, relativosOficiales, familiaNumeros),
  };
}

function _ordenarPorPeso(semilla, varsMath, relativos, familia) {
  const map = new Map();

  for (const v of varsMath) {
    map.set(v.numero, { numero: v.numero, tipo: v.tipo, peso: v.peso });
  }

  for (const r of relativos) {
    if (!map.has(r)) {
      map.set(r, { numero: r, tipo: 'relativo', peso: PESOS_RELACION.relativo });
    } else if (PESOS_RELACION.relativo > map.get(r).peso) {
      map.get(r).tipo = 'relativo';
      map.get(r).peso = PESOS_RELACION.relativo;
    }
  }

  for (const f of familia) {
    if (!map.has(f)) {
      map.set(f, { numero: f, tipo: 'familia', peso: PESOS_RELACION.familia });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.peso - a.peso);
}

// ---------------------------------------------------------------------------
// Clasificador de relación entre dos números
// ---------------------------------------------------------------------------

/**
 * Determina qué tipo de relación existe entre numA y numB.
 * Si no hay relación conocida, devuelve null.
 *
 * @param {number} numA
 * @param {number} numB
 * @param {object} [ctx] - contexto precargado (para no recargar datos)
 * @param {Map}    [ctx.relativos]
 * @param {object} [ctx.guia]
 * @returns {Promise<RelacionDetallada | null>}
 */
export async function clasificarRelacion(numA, numB, ctx = {}) {
  if (numA === numB) {
    return { tipo: 'mismo', peso: 1.0, descripcion: 'Mismo número' };
  }

  const relativos = ctx.relativos ?? await loadRelativos();
  const guia      = ctx.guia      ?? await loadGuia();

  // 1. Relativo oficial (A → B)
  const relOfA = relativos.get(numA) ?? [];
  if (relOfA.includes(numB)) {
    return {
      tipo: 'relativo',
      peso: PESOS_RELACION.relativo,
      descripcion: `${PAD(numA)} → ${PAD(numB)} (relativo oficial)`,
      direccion: 'directa',
    };
  }

  // 2. Relativo inverso (B → A, por si acaso)
  const relOfB = relativos.get(numB) ?? [];
  if (relOfB.includes(numA)) {
    return {
      tipo: 'relativo',
      peso: PESOS_RELACION.relativo * 0.85,
      descripcion: `${PAD(numB)} → ${PAD(numA)} (relativo inverso)`,
      direccion: 'inversa',
    };
  }

  // 3. Variantes matemáticas
  const tipoMath = classifyMath(numA, numB);
  if (tipoMath && tipoMath !== 'encadenado') {
    const tipo = _normalizarTipoMath(tipoMath);
    return {
      tipo,
      peso: PESOS_RELACION[tipo] ?? 0.5,
      descripcion: _descMath(numA, numB, tipo),
    };
  }

  // 4. Encadenado (variante de variante)
  const setMath = variantesSet(numA, { encadenadas: true });
  if (setMath.has(numB)) {
    return {
      tipo: 'encadenado',
      peso: PESOS_RELACION.encadenado,
      descripcion: `${PAD(numB)} es variante encadenada de ${PAD(numA)}`,
    };
  }

  // 5. Familia semántica
  const famA = getFamilia(guia, numA);
  const famB = getFamilia(guia, numB);
  if (famA && famB && famA === famB) {
    return {
      tipo: 'familia',
      peso: PESOS_RELACION.familia,
      descripcion: `Misma familia semántica: ${famA}`,
      familia: famA,
    };
  }

  // 6. Misma decena
  if (mismaDecena(numA, numB)) {
    return {
      tipo: 'decena',
      peso: PESOS_RELACION.decena,
      descripcion: `Misma decena (${decena(numA)}-${decena(numA) + 9})`,
    };
  }

  // 7. Misma terminación
  if (mismaTerminacion(numA, numB)) {
    return {
      tipo: 'terminacion',
      peso: PESOS_RELACION.terminacion,
      descripcion: `Misma terminación: ${terminacion(numA)}`,
    };
  }

  return null; // Sin relación conocida
}

/**
 * Versión síncrona rápida (solo variantes matemáticas, sin datos externos).
 * Usar cuando los datos de relativos/guia ya están cargados en ctx.
 */
export function clasificarRelacionSync(numA, numB, ctx = {}) {
  if (numA === numB) return { tipo: 'mismo', peso: 1.0 };

  const relativos = ctx.relativos ?? new Map();
  const guia      = ctx.guia      ?? {};

  const relA = relativos.get(numA) ?? [];
  if (relA.includes(numB)) {
    return { tipo: 'relativo', peso: PESOS_RELACION.relativo, direccion: 'directa' };
  }

  const tipoMath = classifyMath(numA, numB);
  if (tipoMath) {
    const tipo = _normalizarTipoMath(tipoMath);
    return { tipo, peso: PESOS_RELACION[tipo] ?? 0.5 };
  }

  const famA = getFamilia(guia, numA);
  const famB = getFamilia(guia, numB);
  if (famA && famB && famA === famB) {
    return { tipo: 'familia', peso: PESOS_RELACION.familia, familia: famA };
  }

  if (mismaDecena(numA, numB)) return { tipo: 'decena', peso: PESOS_RELACION.decena };
  if (mismaTerminacion(numA, numB)) return { tipo: 'terminacion', peso: PESOS_RELACION.terminacion };

  return null;
}

export async function esVarianteDe(numA, numB, opts = {}) {
  const rel = await clasificarRelacion(numA, numB, opts);
  return rel !== null;
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function _normalizarTipoMath(tipo) {
  const MAP = {
    'same':                 'mismo',
    'conversion-simple':    'simple_d0',
    'conversion-compound':  'compound',
    'equivalencia':         'equiv_directa',
    'mirror':               'mirror',
    'encadenado':           'encadenado',
  };
  return MAP[tipo] ?? tipo;
}

function _descMath(numA, numB, tipo) {
  const DESCS = {
    simple_d0:       `${PAD(numB)} es conversión simple (decena) de ${PAD(numA)}`,
    simple_d1:       `${PAD(numB)} es conversión simple (unidad) de ${PAD(numA)}`,
    compound:        `${PAD(numB)} es conversión compuesta de ${PAD(numA)}`,
    compound_mirror: `${PAD(numB)} es espejo de compuesta de ${PAD(numA)}`,
    equiv_directa:   `${PAD(numB)} es equivalencia de ${PAD(numA)}`,
    equiv_espejo:    `${PAD(numB)} es espejo de equivalencia de ${PAD(numA)}`,
    mirror:          `${PAD(numB)} es espejo de ${PAD(numA)}`,
    encadenado:      `${PAD(numB)} es variante encadenada de ${PAD(numA)}`,
  };
  return DESCS[tipo] ?? `${PAD(numA)} → ${PAD(numB)} (${tipo})`;
}

// ---------------------------------------------------------------------------
// Utilidad: dado un sorteo reciente, ¿qué número del catálogo "llamó" a este?
// ---------------------------------------------------------------------------

/**
 * Para un número recién sorteado, busca en los últimos N sorteos si alguno
 * de ellos tiene a este número como relativo/variante.
 * Devuelve lista de posibles "orígenes" con su tipo de relación.
 *
 * @param {number} numeroSorteado
 * @param {Array<{numero, fecha, horario}>} sorteosPrevios
 * @param {object} ctx - { relativos, guia } precargados
 * @returns {Array<{origen, sorteo, relacion}>}
 */
export function buscarOrigen(numeroSorteado, sorteosPrevios, ctx = {}) {
  const relativos = ctx.relativos ?? new Map();

  const resultados = [];
  for (const s of sorteosPrevios) {
    const rel = clasificarRelacionSync(s.numero, numeroSorteado, ctx);
    if (rel) {
      resultados.push({
        origen:   s.numero,
        sorteo:   s,
        relacion: rel,
      });
    }
  }

  // Ordenar por peso de la relación descendente
  return resultados.sort((a, b) => b.relacion.peso - a.relacion.peso);
}
