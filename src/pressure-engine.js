/**
 * pressure-engine.js
 *
 * Estima la presión pública sobre cada número en un momento dado.
 * "Presión" = qué tan intensamente el jugador promedio está apostando ese número.
 *
 * No se mide directamente — se infiere de señales observables:
 *   1. Gap largo sin caer         → el público lo sigue esperando
 *   2. Saladito                   → siempre tiene presión base
 *   3. Secuencia activa reciente  → el catálogo la activa masivamente
 *   4. Cadena semántica activada  → cayó un trigger, el público corre al target
 *   5. Evento cultural próximo    → popularidad estacional (fiestas, etc.)
 *   6. Cayó hace poco             → presión cae (el jugador "ya lo jugó")
 *   7. Variante pagada reciente   → presión baja (el jugador migró a la variante)
 *
 * Tesis adversarial:
 *   Presión alta  → La Casa lo evita (factor penalizador en signal-engine)
 *   Presión baja  → posible "momento de liberación"
 *
 * Exports:
 *   calcularPresion(draws, opts)          → Map<numero, PressureScore>
 *   getMomentoLiberacion(draws, numero)   → MomentoLiberacion
 *   getPressureMap(draws, opts)           → Map<numero, 0-1>  (simple)
 */

import { ACTIVACIONES, CADENAS } from './popularity-model.js';
import { variantesSet } from './conversion-engine.js';
import { upsertPublicPressure } from './intelligence-storage.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SALADITOS = new Set([
  0, 11, 22, 33, 44, 55, 66, 77, 88, 99,
  10, 20, 30, 40, 50, 60, 70, 80, 90,
  5, 15, 25, 35, 45, 65, 75, 85, 95,
]);

const REDONDOS = new Set([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
const DOBLES   = new Set([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);

// Días de caída de presión pública tras un pago
const DIAS_OLVIDO_BASE    = 5;   // en días normales
const DIAS_OLVIDO_SALADITO = 8;  // saladitos tardan más en olvidarse

// Umbral de gap para que el jugador "se canse" de esperar (múltiplo de media)
const UMBRAL_CANSANCIO = 2.2;

// Ventana de sorteos para buscar triggers activos
const VENTANA_TRIGGER = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAD = n => String(n).padStart(2, '0');

function diasDesde(fechaStr, refDate = new Date()) {
  const f = new Date(fechaStr);
  return Math.max(0, (refDate - f) / 86400000);
}

function calcularMedia(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function calcularSigma(nums, media) {
  if (nums.length < 2) return null;
  const variance = nums.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Cálculo de gaps por número
// ---------------------------------------------------------------------------

function construirGapsMap(draws) {
  // draws: ordenados reciente primero
  const grupos = {};
  for (const d of draws) {
    if (!grupos[d.numero]) grupos[d.numero] = [];
    grupos[d.numero].push(d);
  }

  const result = {};
  const refDate = new Date();

  for (let n = 0; n <= 99; n++) {
    const lista = (grupos[n] || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const ultima = lista[0] ?? null;

    const gapsHist = [];
    for (let i = 1; i < Math.min(lista.length, 31); i++) {
      const diff = diasDesde(lista[i].fecha, new Date(lista[i - 1].fecha));
      if (diff > 0) gapsHist.push(diff);
    }

    const media = calcularMedia(gapsHist);
    const sigma = calcularSigma(gapsHist, media);
    const gapActual = ultima ? diasDesde(ultima.fecha, refDate) : null;

    result[n] = {
      ultimaFecha:  ultima?.fecha ?? null,
      gapActual,
      media,
      sigma,
      count:        lista.length,
      vencido:      media && gapActual ? gapActual > media + (sigma ?? media * 0.5) : false,
      cansado:      media && gapActual ? gapActual > media * UMBRAL_CANSANCIO : false,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Calcula el mapa de presión pública para todos los números.
 *
 * @param {Array}  draws   - sorteos recientes (ordenados reciente primero)
 * @param {object} opts
 * @param {Date}   [opts.refDate=new Date()]
 * @param {string} [opts.turno]
 * @param {boolean}[opts.persistir=false]  - guardar en Supabase public_pressure
 * @returns {Promise<Map<numero, PressureScore>>}
 */
export async function calcularPresion(draws, opts = {}) {
  const { refDate = new Date(), turno, persistir = false } = opts;
  const hoy = refDate.toISOString().slice(0, 10);

  const gapsMap     = construirGapsMap(draws);
  const triggers    = _detectarTriggersActivos(draws);
  const presionMap  = new Map();

  for (let n = 0; n <= 99; n++) {
    const gap    = gapsMap[n];
    const fuentes = {};
    let presion   = 0;

    // ── 1. Presión base por saladito ──────────────────────────────────────
    if (DOBLES.has(n)) {
      fuentes.doble = 0.25;
      presion += 0.25;
    } else if (REDONDOS.has(n)) {
      fuentes.redondo = 0.18;
      presion += 0.18;
    } else if (SALADITOS.has(n)) {
      fuentes.saladito = 0.12;
      presion += 0.12;
    }

    // ── 2. Presión por gap largo (jugador lo sigue esperando) ────────────
    if (gap.gapActual !== null && gap.media) {
      const ratio = gap.gapActual / gap.media;
      if (ratio >= 1.0 && ratio < UMBRAL_CANSANCIO) {
        // Zona de espera activa: presión sube con el gap
        const delta = Math.min(0.40, (ratio - 1.0) * 0.22);
        fuentes.gap_largo = delta;
        presion += delta;
      } else if (ratio >= UMBRAL_CANSANCIO) {
        // El jugador SE CANSÓ → presión baja (momento de liberación próximo)
        fuentes.gap_cansancio = -0.15;
        presion -= 0.15;
      }
    }

    // ── 3. Presión por caída reciente (jugador ya lo jugó, presión baja) ─
    if (gap.gapActual !== null) {
      const diasOlvido = SALADITOS.has(n) ? DIAS_OLVIDO_SALADITO : DIAS_OLVIDO_BASE;
      if (gap.gapActual < diasOlvido) {
        const penalty = -0.30 * (1 - gap.gapActual / diasOlvido);
        fuentes.caida_reciente = penalty;
        presion += penalty;
      }
    }

    // ── 4. Presión por triggers de cadena semántica ───────────────────────
    const triggerPeso = triggers.get(n) ?? 0;
    if (triggerPeso > 0) {
      const delta = triggerPeso * 0.35;
      fuentes.cadena_semantica = delta;
      presion += delta;
    }

    // ── 5. Presión por variante pagada reciente ───────────────────────────
    //    Si una variante del número cayó en los últimos DIAS_OLVIDO sorteos,
    //    el jugador migra a la variante y baja la presión del directo.
    const variantSet = variantesSet(n, { encadenadas: false });
    const variantePagada = draws.slice(0, 12).find(d =>
      variantSet.has(d.numero) && diasDesde(d.fecha, refDate) <= DIAS_OLVIDO_BASE + 2
    );
    if (variantePagada) {
      fuentes.variante_pagada = -0.20;
      presion -= 0.20;
    }

    // Clamp final 0-1
    presion = Math.max(0, Math.min(1, presion));

    const score = {
      numero:   n,
      presion,
      fuentes,
      gapActual: gap.gapActual,
      media:     gap.media,
      sigma:     gap.sigma,
      vencido:   gap.vencido,
      cansado:   gap.cansado,
      liberacion: _calcularMomentoLiberacion(gap, presion, variantePagada),
    };

    presionMap.set(n, score);

    if (persistir) {
      await upsertPublicPressure({
        numero:  n,
        fecha:   hoy,
        turno:   turno ?? null,
        presion,
        fuentes,
      }).catch(() => {});
    }
  }

  return presionMap;
}

/**
 * Versión simplificada: devuelve solo Map<numero, 0-1>
 */
export async function getPressureMap(draws, opts = {}) {
  const full = await calcularPresion(draws, opts);
  const simple = new Map();
  for (const [n, s] of full) simple.set(n, s.presion);
  return simple;
}

// ---------------------------------------------------------------------------
// Momento de liberación
// ---------------------------------------------------------------------------

/**
 * Dado el estado de gap de un número, calcula qué tan cerca está del
 * "momento de liberación" — cuando el jugador se cansó y La Casa lo puede pagar.
 *
 * @returns {{ cerca: boolean, score: 0-1, descripcion: string }}
 */
export function getMomentoLiberacion(draws, numero) {
  const gapsMap = construirGapsMap(draws);
  const gap     = gapsMap[numero];
  const presion = 0.5; // placeholder si se llama standalone
  return _calcularMomentoLiberacion(gap, presion, null);
}

function _calcularMomentoLiberacion(gap, presion, variantePagada) {
  if (!gap.media || gap.gapActual === null) {
    return { cerca: false, score: 0, descripcion: 'Sin datos suficientes' };
  }

  const ratio = gap.gapActual / gap.media;

  // Zona óptima: gap entre media+sigma y media*UMBRAL_CANSANCIO
  // y presión bajando (jugador se cansó)
  const gapOptimo = ratio >= 1.2 && ratio <= UMBRAL_CANSANCIO;
  const presionBaja = presion < 0.35;
  const varianteLiberadora = variantePagada !== null;

  let score = 0;
  let desc  = [];

  if (gapOptimo) {
    score += 0.40;
    desc.push(`Gap en zona óptima (${ratio.toFixed(1)}× media)`);
  } else if (ratio > UMBRAL_CANSANCIO) {
    score += 0.25;
    desc.push(`Gap muy largo — jugador cansado (${ratio.toFixed(1)}× media)`);
  }

  if (presionBaja) {
    score += 0.30;
    desc.push('Presión pública baja');
  }

  if (varianteLiberadora) {
    score += 0.30;
    desc.push('Variante ya pagada — posible liberación del directo');
  }

  score = Math.min(1, score);

  return {
    cerca:       score >= 0.55,
    score,
    descripcion: desc.join('. ') || 'Sin señales de liberación',
  };
}

// ---------------------------------------------------------------------------
// Detección de triggers de cadena semántica activos
// ---------------------------------------------------------------------------

/**
 * Analiza los últimos VENTANA_TRIGGER sorteos.
 * Para cada número que cayó, activa sus ACTIVACIONES → acumula presión en targets.
 *
 * @returns {Map<target_numero, peso_acumulado>}
 */
function _detectarTriggersActivos(draws) {
  const recientes = draws.slice(0, VENTANA_TRIGGER);
  const mapa = new Map();

  for (const draw of recientes) {
    const acts = ACTIVACIONES.filter(a => a.trigger === draw.numero);
    for (const act of acts) {
      for (const target of act.targets) {
        const actual = mapa.get(target) ?? 0;
        // Decaimiento por antigüedad del trigger
        const idx    = recientes.indexOf(draw);
        const decay  = Math.pow(0.80, idx);
        mapa.set(target, Math.min(1, actual + act.peso * decay));
      }
    }
  }

  return mapa;
}

// ---------------------------------------------------------------------------
// Factor adversarial para signal-engine
// ---------------------------------------------------------------------------

/**
 * Convierte el score de presión en un multiplicador para el signal-engine.
 * Alta presión → factor bajo (La Casa evita).
 * Baja presión → factor alto (momento de pago posible).
 *
 * @param {number} presion  0-1
 * @returns {number} factor multiplicador (0.3 - 1.5)
 */
export function presionAFactor(presion) {
  // Factor inversamente proporcional a la presión
  // presion=0.0 → factor=1.50 (muy libre)
  // presion=0.5 → factor=1.00 (neutro)
  // presion=1.0 → factor=0.30 (muy penalizado)
  return Math.max(0.30, 1.50 - presion * 1.20);
}

/**
 * Genera un reporte de presión en texto, útil para el panel del analista.
 */
export function reportePresion(presionMap, top = 10) {
  const lista = Array.from(presionMap.values())
    .sort((a, b) => b.presion - a.presion);

  const alta  = lista.slice(0, top);
  const cerca = lista.filter(s => s.liberacion?.cerca).slice(0, top);

  return { alta, cerca };
}
