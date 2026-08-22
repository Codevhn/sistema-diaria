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

// Prior de Jeffreys para suavizar distribuciones empíricas (evita el
// ruido infinito del eps=1e-10 sobre categorías con frecuencia 0)
const ALPHA_SUAVIZADO = 0.5;

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
  for (let i = 0; i < p.length; i++) {
    kl += p[i] * Math.log(p[i] / q[i]);
  }
  return kl;
}

/**
 * KL entre los perfiles de dos ventanas, con suavizado Dirichlet (Jeffreys
 * α=0.5). Las distribuciones crudas de 30 sorteos sobre 100 categorías
 * tienen ~70 ceros; sin suavizar, la KL es ruido dominado por ε.
 */
function klPerfil(perfilA, perfilB) {
  const k = perfilA.dist.length;
  const nA = Math.max(1, perfilA.n);
  const nB = Math.max(1, perfilB.n);
  const p = perfilA.dist.map((v) => (v * nA + ALPHA_SUAVIZADO) / (nA + ALPHA_SUAVIZADO * k));
  const q = perfilB.dist.map((v) => (v * nB + ALPHA_SUAVIZADO) / (nB + ALPHA_SUAVIZADO * k));
  return klDivergence(p, q);
}

/**
 * Nul-model Monte Carlo de la KL entre dos ventanas del MISMO tamaño.
 *
 * Dos ventanas uniformes e independientes de n=30 sorteos sobre 100 números
 * producen por puro azar una KL esperada ≈ (k−1)/2·(1/n₁+1/n₂) ≈ 3.3 — el
 * umbral fijo anterior (0.08) disparaba "cambios de régimen" constantemente.
 * Aquí se simula la distribución nula exacta del estadístico y se usan sus
 * percentiles como umbral: solo KL ≥ p95 es evidencia real de cambio.
 */
const _klNullCache = new Map();
function nullKLPercentiles(n1, n2, iteraciones = 240, seed = 20260821) {
  const key = `${n1}|${n2}`;
  if (_klNullCache.has(key)) return _klNullCache.get(key);

  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const k = 100;
  const denomA = n1 + ALPHA_SUAVIZADO * k;
  const denomB = n2 + ALPHA_SUAVIZADO * k;
  const kls = [];
  for (let it = 0; it < iteraciones; it += 1) {
    const f1 = new Array(k).fill(0);
    const f2 = new Array(k).fill(0);
    for (let i = 0; i < n1; i += 1) f1[Math.floor(rng() * k)] += 1;
    for (let i = 0; i < n2; i += 1) f2[Math.floor(rng() * k)] += 1;
    const p = f1.map((f) => (f + ALPHA_SUAVIZADO) / denomA);
    const q = f2.map((f) => (f + ALPHA_SUAVIZADO) / denomB);
    kls.push(klDivergence(p, q));
  }
  kls.sort((x, y) => x - y);
  const pct = (qq) => kls[Math.min(kls.length - 1, Math.floor(qq * kls.length))];
  const out = { p70: pct(0.7), p95: pct(0.95), p99: pct(0.99) };
  _klNullCache.set(key, out);
  return out;
}

/**
 * Confianza calibrada: 0 bajo el ruido de muestreo (p70), lineal hasta p95,
 * tope 0.95. Sustituye las fórmulas mágicas kl/(UMBRAL×2|3).
 */
function confianzaCalibrada(kl, nul) {
  if (kl <= nul.p70) return 0;
  if (kl >= nul.p99) return 0.95;
  if (kl >= nul.p95) return 0.7 + 0.25 * ((kl - nul.p95) / Math.max(1e-9, nul.p99 - nul.p95));
  return 0.7 * ((kl - nul.p70) / Math.max(1e-9, nul.p95 - nul.p70));
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

  // Normal: KL dentro del ruido de muestreo esperado (nul-model), sin anomalías
  const kl = klPerfil(perfil, perfilBase);
  const nul = nullKLPercentiles(Math.max(1, perfil.n), Math.max(1, perfilBase.n));
  scores.normal = kl <= nul.p95 ? 1.0 : 0.2;

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

  const kl = klPerfil(perfilRec, perfilRef);
  const nul = nullKLPercentiles(perfilRec.n, perfilRef.n);

  if (kl <= nul.p95 && !force) return null;

  // El régimen anterior se clasifica comparando la ventana de referencia con
  // la ventana previa a ella; compararla consigo misma siempre daba "normal".
  const refPrevia       = draws.slice(VENTANA * 2, VENTANA * 3);
  const perfilRefPrevia = refPrevia.length >= VENTANA * 0.7 ? perfilarVentana(refPrevia) : null;
  const regimenAnterior = perfilRefPrevia
    ? clasificarRegimen(perfilRef, perfilRefPrevia)
    : clasificarRegimen(perfilRef, perfilRef); // sin histórico suficiente: asume estable
  const regimenNuevo    = clasificarRegimen(perfilRec, perfilRef);

  const cambioSignificativo = kl > nul.p95 || regimenNuevo !== regimenAnterior;
  if (!cambioSignificativo) return null;

  // Confianza calibrada contra la distribución nula Monte Carlo
  const confianza = confianzaCalibrada(kl, nul);

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

  const kl      = referencia.length >= 10 ? klPerfil(perfilRec, perfilRef) : 0;
  const regimen = referencia.length >= 10 ? clasificarRegimen(perfilRec, perfilRef) : 'normal';
  const nul = nullKLPercentiles(perfilRec.n, perfilRef.n);
  const confianza = referencia.length >= 10 ? confianzaCalibrada(kl, nul) : 0;

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
