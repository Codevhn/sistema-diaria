/**
 * regime-detector.js
 *
 * Detecta automáticamente cuando La Casa cambió su distribución de juego.
 * No solo post-superpremio — cualquier cambio estadístico significativo.
 *
 * Algoritmo:
 *   Cada 10 sorteos, compara la distribución de los últimos 30
 *   contra los 30 anteriores usando divergencia KL + chi-cuadrado.
 *   Si el cambio es significativo → registra changepoint + actualiza régimen.
 *
 * Regímenes definidos:
 *   normal           — distribución típica histórica
 *   post_superpremio — tras pago mayor, evita populares
 *   bloqueo_saladitos — período sin dobles/terminación-0/5
 *   liberacion_masiva — varios vencidos caen en ventana corta
 *   secuencia_activa  — patrón de secuencia dominando
 *   modo_camuflaje    — alta ratio variante/directo
 *   fin_mes           — cambio en últimos 5 días del mes
 *
 * Exports:
 *   detectarRegimen(draws, opts)         → RegimenActual
 *   evaluarCambioRegimen(draws, opts)    → ChangepointResult | null
 *   getRegimenActual(draws)              → string (nombre del régimen)
 */

import { insertChangepoint, getLastChangepoint } from './intelligence-storage.js';
import { variantesSet } from './conversion-engine.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SALADITOS = new Set([
  0, 11, 22, 33, 44, 55, 66, 77, 88, 99,
  10, 20, 30, 40, 50, 60, 70, 80, 90,
  5, 15, 25, 35, 45, 65, 75, 85, 95,
]);

const DOBLES = new Set([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);

// Ventana de sorteos para comparar distribuciones
const VENTANA = 30;

// Umbral de divergencia KL para considerar cambio significativo
const KL_UMBRAL = 0.08;

// Mínimo de sorteos necesarios para detectar cambio
const MIN_DRAWS_DETECCION = 60;

// Sorteos entre cada evaluación automática
const INTERVALO_EVALUACION = 10;

// ---------------------------------------------------------------------------
// Perfilado estadístico de una ventana de sorteos
// ---------------------------------------------------------------------------

function perfilarVentana(draws) {
  if (!draws.length) return null;

  const n = draws.length;

  // Frecuencias relativas por número (distribución empírica)
  const freq = new Array(100).fill(0);
  for (const d of draws) freq[d.numero]++;
  const dist = freq.map(f => f / n);

  // Métricas agregadas
  const pctDobles    = draws.filter(d => DOBLES.has(d.numero)).length / n;
  const pctSaladitos = draws.filter(d => SALADITOS.has(d.numero)).length / n;
  const pctPares     = draws.filter(d => d.numero % 2 === 0).length / n;

  // Ratio variante/directo (cuántos números son variantes del anterior)
  let varianteCount = 0;
  for (let i = 1; i < draws.length; i++) {
    const prev = draws[i - 1].numero;
    const curr = draws[i].numero;
    const vars = variantesSet(prev, { encadenadas: false });
    if (vars.has(curr)) varianteCount++;
  }
  const ratioVariante = n > 1 ? varianteCount / (n - 1) : 0;

  // Repeticiones en ventana de 5 sorteos
  let repCount = 0;
  for (let i = 5; i < draws.length; i++) {
    const ventana5 = draws.slice(i - 5, i).map(d => d.numero);
    if (ventana5.includes(draws[i].numero)) repCount++;
  }
  const ratioRepeticion = n > 5 ? repCount / (n - 5) : 0;

  // Entropía de Shannon (diversidad)
  let entropia = 0;
  for (const p of dist) {
    if (p > 0) entropia -= p * Math.log2(p);
  }

  // Vencidos que cayeron (números que superaron su media de gap)
  // Aproximación: números que no habían caído en las 15 anteriores
  const setUltimos15 = new Set(draws.slice(0, Math.min(15, n)).map(d => d.numero));
  const nuevos = draws.slice(15).filter(d => !setUltimos15.has(d.numero)).length;
  const ratioNuevos = n > 15 ? nuevos / (n - 15) : 0;

  return {
    dist,
    pctDobles,
    pctSaladitos,
    pctPares,
    ratioVariante,
    ratioRepeticion,
    entropia,
    ratioNuevos,
    n,
  };
}

// ---------------------------------------------------------------------------
// Divergencia KL (P || Q)
// ---------------------------------------------------------------------------

function klDivergence(p, q) {
  let kl = 0;
  const eps = 1e-10;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] + eps;
    const qi = q[i] + eps;
    kl += pi * Math.log(pi / qi);
  }
  return kl;
}

// ---------------------------------------------------------------------------
// Clasificador de régimen
// ---------------------------------------------------------------------------

function clasificarRegimen(perfil, perfilBase) {
  if (!perfil || !perfilBase) return 'normal';

  const scores = {};

  // Bloqueo de saladitos: pct muy por debajo del baseline
  const deltaSaladitos = perfilBase.pctSaladitos - perfil.pctSaladitos;
  scores.bloqueo_saladitos = deltaSaladitos > 0.12 ? deltaSaladitos * 3 : 0;

  // Modo camuflaje: ratio variante muy por encima del baseline
  const deltaVariante = perfil.ratioVariante - perfilBase.ratioVariante;
  scores.modo_camuflaje = deltaVariante > 0.10 ? deltaVariante * 4 : 0;

  // Liberación masiva: muchos "nuevos" cayeron en la ventana
  const deltaNuevos = perfil.ratioNuevos - perfilBase.ratioNuevos;
  scores.liberacion_masiva = deltaNuevos > 0.15 ? deltaNuevos * 2.5 : 0;

  // Secuencia activa: repetición baja (La Casa juega variado) + variante alta
  scores.secuencia_activa = (deltaVariante > 0.08 && perfil.ratioRepeticion < 0.05) ? 0.6 : 0;

  // Post superpremio: entropía alta (La Casa se vuelve impredecible) + saladitos bajos
  const deltaEntropia = perfil.entropia - perfilBase.entropia;
  scores.post_superpremio = (deltaEntropia > 0.3 && deltaSaladitos > 0.08) ? 0.7 : 0;

  // Normal: KL baja, sin anomalías claras
  const kl = klDivergence(perfil.dist, perfilBase.dist);
  scores.normal = kl < KL_UMBRAL ? 1.0 : 0.2;

  // El régimen con mayor score gana
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Evalúa si ocurrió un changepoint comparando las últimas dos ventanas.
 * Si lo detecta, lo registra en Supabase.
 *
 * @param {Array}  draws  - todos los sorteos, reciente primero
 * @param {object} opts
 * @param {boolean}[opts.persistir=true]
 * @param {boolean}[opts.force=false]     - evaluar aunque no sean 10 sorteos nuevos
 * @returns {Promise<ChangepointResult | null>}
 */
export async function evaluarCambioRegimen(draws, opts = {}) {
  const { persistir = true, force = false } = opts;

  if (draws.length < MIN_DRAWS_DETECCION) return null;

  // Dividir en ventana reciente y ventana de referencia
  const reciente   = draws.slice(0, VENTANA);
  const referencia = draws.slice(VENTANA, VENTANA * 2);

  if (referencia.length < VENTANA * 0.7) return null;

  const perfilRec = perfilarVentana(reciente);
  const perfilRef = perfilarVentana(referencia);

  const kl = klDivergence(perfilRec.dist, perfilRef.dist);

  if (kl < KL_UMBRAL && !force) return null;

  // El régimen anterior se clasifica comparando la ventana de referencia con
  // la ventana previa a ella; compararla consigo misma siempre daba "normal".
  const refPrevia       = draws.slice(VENTANA * 2, VENTANA * 3);
  const perfilRefPrevia = refPrevia.length >= VENTANA * 0.7 ? perfilarVentana(refPrevia) : null;
  const regimenAnterior = perfilRefPrevia
    ? clasificarRegimen(perfilRef, perfilRefPrevia)
    : clasificarRegimen(perfilRef, perfilRef); // sin histórico suficiente: asume estable
  const regimenNuevo    = clasificarRegimen(perfilRec, perfilRef);

  const cambioSignificativo = kl >= KL_UMBRAL || regimenNuevo !== regimenAnterior;
  if (!cambioSignificativo) return null;

  // Confianza proporcional a la divergencia
  const confianza = Math.min(0.95, kl / (KL_UMBRAL * 3));

  const result = {
    fecha:            reciente[0]?.fecha ?? new Date().toISOString().slice(0, 10),
    regimenAnterior,
    regimenNuevo,
    klDivergence:     kl,
    confianza,
    metricas: {
      deltaSaladitos:  perfilRef.pctSaladitos - perfilRec.pctSaladitos,
      deltaVariante:   perfilRec.ratioVariante - perfilRef.ratioVariante,
      deltaEntropia:   perfilRec.entropia - perfilRef.entropia,
      deltaNuevos:     perfilRec.ratioNuevos - perfilRef.ratioNuevos,
    },
    descripcion: _buildDescripcion(regimenNuevo, kl, perfilRec, perfilRef),
  };

  if (persistir) {
    await insertChangepoint({
      fecha:            result.fecha,
      regimenAnterior:  result.regimenAnterior,
      regimenNuevo:     result.regimenNuevo,
      klDivergence:     result.klDivergence,
      confianza:        result.confianza,
      descripcion:      result.descripcion,
    }).catch(() => {});
  }

  return result;
}

/**
 * Devuelve el régimen activo actual (sin necesariamente detectar changepoint).
 *
 * @param {Array} draws - sorteos recientes, reciente primero
 * @returns {string} nombre del régimen
 */
export function getRegimenActual(draws) {
  if (draws.length < VENTANA * 2) return 'normal';

  const reciente   = draws.slice(0, VENTANA);
  const referencia = draws.slice(VENTANA, VENTANA * 2);

  const perfilRec = perfilarVentana(reciente);
  const perfilRef = perfilarVentana(referencia);

  return clasificarRegimen(perfilRec, perfilRef);
}

/**
 * Perfil completo del régimen actual con todas sus métricas.
 *
 * @param {Array} draws
 * @returns {RegimenActual}
 */
export function detectarRegimen(draws) {
  if (draws.length < VENTANA) {
    return { regimen: 'normal', confianza: 0, metricas: {}, descripcion: 'Datos insuficientes' };
  }

  const reciente   = draws.slice(0, VENTANA);
  const referencia = draws.slice(VENTANA, Math.min(draws.length, VENTANA * 2));

  const perfilRec = perfilarVentana(reciente);
  const perfilRef = referencia.length >= 10 ? perfilarVentana(referencia) : perfilRec;

  const kl      = referencia.length >= 10 ? klDivergence(perfilRec.dist, perfilRef.dist) : 0;
  const regimen = referencia.length >= 10 ? clasificarRegimen(perfilRec, perfilRef) : 'normal';
  const confianza = Math.min(0.95, kl / (KL_UMBRAL * 2));

  return {
    regimen,
    confianza,
    kl,
    metricas: {
      pctDobles:       perfilRec.pctDobles,
      pctSaladitos:    perfilRec.pctSaladitos,
      ratioVariante:   perfilRec.ratioVariante,
      ratioRepeticion: perfilRec.ratioRepeticion,
      entropia:        perfilRec.entropia,
      deltaSaladitos:  perfilRef.pctSaladitos - perfilRec.pctSaladitos,
      deltaVariante:   perfilRec.ratioVariante - perfilRef.ratioVariante,
    },
    descripcion: _buildDescripcion(regimen, kl, perfilRec, perfilRef),
  };
}

// ---------------------------------------------------------------------------
// Ajuste de pesos según régimen (para weight-optimizer)
// ---------------------------------------------------------------------------

/**
 * Devuelve multiplicadores de ajuste para los SOURCE_WEIGHTS del signal-engine
 * según el régimen activo. NO reemplaza el weight-optimizer — lo complementa.
 *
 * @param {string} regimen
 * @returns {object} multiplicadores por motor (1.0 = sin cambio)
 */
export function getAjustesPorRegimen(regimen) {
  const AJUSTES = {
    normal: {
      markov1: 1.0, markov2: 1.0, rezago: 1.0,
      modos: 1.0, patrones: 1.0, semanal: 1.0, mensual: 1.0,
    },
    post_superpremio: {
      // Markov histórico menos fiable — La Casa cambió su distribución
      markov1: 0.60, markov2: 0.55, rezago: 0.70,
      // Modos custom y patrones más relevantes en recuperación
      modos: 1.40, patrones: 1.30, semanal: 0.80, mensual: 0.70,
    },
    bloqueo_saladitos: {
      markov1: 1.10, markov2: 1.00, rezago: 1.20,
      modos: 1.00, patrones: 0.90, semanal: 1.00, mensual: 1.00,
    },
    liberacion_masiva: {
      // Rezago es la señal más fuerte cuando hay liberación masiva
      markov1: 0.90, markov2: 0.80, rezago: 1.50,
      modos: 0.90, patrones: 1.10, semanal: 0.80, mensual: 0.70,
    },
    secuencia_activa: {
      // Secuencias dominan — Markov sigue bien
      markov1: 1.20, markov2: 1.10, rezago: 0.90,
      modos: 1.10, patrones: 1.20, semanal: 0.90, mensual: 0.80,
    },
    modo_camuflaje: {
      // La Casa usa variantes — las señales de variante deben subir
      markov1: 0.80, markov2: 0.75, rezago: 1.00,
      modos: 1.20, patrones: 1.30, semanal: 0.90, mensual: 0.80,
    },
    fin_mes: {
      markov1: 0.90, markov2: 0.85, rezago: 1.10,
      modos: 1.00, patrones: 1.00, semanal: 1.20, mensual: 1.40,
    },
  };

  return AJUSTES[regimen] ?? AJUSTES.normal;
}

// ---------------------------------------------------------------------------
// Helper privado
// ---------------------------------------------------------------------------

function _buildDescripcion(regimen, kl, rec, ref) {
  const klStr = kl.toFixed(3);
  const DESCS = {
    normal:           `Distribución estable (KL=${klStr}). Sin anomalías detectadas.`,
    post_superpremio: `Distribución anómala (KL=${klStr}). Saladitos ↓${((ref.pctSaladitos - rec.pctSaladitos) * 100).toFixed(0)}%, entropía ↑. Posible post-superpremio.`,
    bloqueo_saladitos:`Bloqueo de saladitos activo (KL=${klStr}). Dobles/redondos ↓${((ref.pctSaladitos - rec.pctSaladitos) * 100).toFixed(0)}%.`,
    liberacion_masiva:`Liberación masiva detectada (KL=${klStr}). Muchos números vencidos cayendo.`,
    secuencia_activa: `Patrón de secuencias dominando (KL=${klStr}). Alta consistencia de variantes.`,
    modo_camuflaje:   `Modo camuflaje (KL=${klStr}). La Casa usa variantes (+${((rec.ratioVariante - ref.ratioVariante) * 100).toFixed(0)}% vs baseline).`,
    fin_mes:          `Cambio de fin de mes detectado (KL=${klStr}).`,
  };
  return DESCS[regimen] ?? `Cambio de régimen (KL=${klStr}).`;
}
