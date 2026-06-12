/**
 * sequence-engine.js
 *
 * Motor explícito de secuencias. Define, detecta y rastrea el estado activo
 * de cada secuencia, integrando presión pública y variantes.
 *
 * Opera en tres modos:
 *
 *   MODO A — Aprendizaje histórico (batch)
 *     populateStatsFromHistory(draws) → puebla sequence_resolution_stats
 *     con distribuciones reales de gaps por par A→B.
 *
 *   MODO B — Detección en tiempo real
 *     procesarSorteoNuevo(draw, draws) → actualiza secuencias abiertas,
 *     las resuelve si corresponde, abre nuevas.
 *
 *   MODO C — Proyección (para generador de candidatos)
 *     proyectarSecuencias(draws, presionMap) → lista de secuencias activas
 *     con probabilidad estimada de resolución en el próximo sorteo.
 *
 * Una "secuencia" es: número origen A → número destino B (o variante de B),
 * con una distribución histórica de gaps (sorteos entre A y B).
 * La Casa puede pagar B directamente o en cualquiera de sus formas
 * (espejo, conversión, equivalencia) y en distintos intervalos.
 *
 * El sistema NO asume que la secuencia se resolverá mañana.
 * Aprende del histórico real cuándo y cómo La Casa la resuelve.
 */

import { clasificarRelacionSync, resolverFormas } from './variant-resolver.js';
import { calcularPresion, presionAFactor } from './pressure-engine.js';
import {
  getOpenSequences,
  getSequenceStats,
  openSequence,
  resolveSequence,
  incrementSequenceCounters,
  expireStaleSequences,
  insertSequenceResolution,
} from './intelligence-storage.js';
import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PAD = n => String(n).padStart(2, '0');

// Sorteos máximos antes de expirar una secuencia abierta
const MAX_SORTEOS_ABIERTA = 40;

// Confianza mínima de relación para considerar resolución por variante
const MIN_PESO_VARIANTE = 0.65;

// Sorteos que se miran hacia atrás para buscar gap_media en BD
const MIN_INSTANCIAS_STATS = 3;

// Probabilidad base cuando no hay histórico suficiente
const PROB_DEFAULT = 0.12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function diasEntre(fechaA, fechaB) {
  return Math.round(Math.abs(new Date(fechaB) - new Date(fechaA)) / 86400000);
}

/**
 * Distribución normal acumulada aproximada (función erf).
 * Calcula P(X ≤ x) para X ~ N(media, sigma).
 */
function probNormal(x, media, sigma) {
  if (!sigma || sigma <= 0) return x >= media ? 0.7 : 0.3;
  const z = (x - media) / (sigma * Math.SQRT2);
  // Aproximación de erf
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 +
    t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  const cdf = 0.5 * (1 + (z >= 0 ? erf : -erf));
  return Math.max(0.01, Math.min(0.99, cdf));
}

// ---------------------------------------------------------------------------
// MODO A — Aprendizaje histórico (batch, ejecutar una vez)
// ---------------------------------------------------------------------------

/**
 * Procesa todo el histórico para poblar sequence_resolutions con
 * la distribución real de gaps de cada par A→B.
 * Llama internamente a strategy-classifier en modo batch.
 *
 * @param {Array}    allDraws    - todos los draws ordenados ASC por fecha+turno
 * @param {Function} onProgress  - callback(procesados, total)
 */
export async function populateStatsFromHistory(allDraws, onProgress) {
  const { procesarHistoricoCompleto } = await import('./strategy-classifier.js');
  return procesarHistoricoCompleto(allDraws, { ventanaMax: 45, onProgress });
}

// ---------------------------------------------------------------------------
// MODO B — Tiempo real
// ---------------------------------------------------------------------------

/**
 * Llamar cada vez que se registra un sorteo nuevo.
 * Delega en strategy-classifier para la clasificación;
 * aquí calculamos las estadísticas de proyección.
 *
 * @param {object} drawNuevo    - { id, numero, fecha, horario }
 * @param {Array}  drawsRecientes - últimos 60 sorteos (reciente primero)
 */
export async function procesarSorteoNuevo(drawNuevo, drawsRecientes) {
  const { clasificarSorteo } = await import('./strategy-classifier.js');
  const resultado = await clasificarSorteo(drawNuevo, drawsRecientes);

  // Actualizar gap_media y gap_sigma en active_sequences abiertas
  // para las que tengamos suficientes datos históricos
  await _actualizarStatsSecuenciasAbiertas();

  return resultado;
}

async function _actualizarStatsSecuenciasAbiertas() {
  const { data: abiertas } = await getOpenSequences();
  if (!abiertas?.length) return;

  for (const seq of abiertas) {
    if (seq.gap_media_historica !== null) continue; // ya tiene stats

    const { data: stats } = await getSequenceStats(seq.numero_origen, seq.numero_destino);
    if (!stats?.length) continue;

    // Usar la entrada "crudo" si existe, sino la de mayor instancias
    const statCrudo = stats.find(s => s.tipo_variante === 'crudo');
    const statPrincipal = statCrudo ?? stats.sort((a, b) => b.total_instancias - a.total_instancias)[0];

    if (statPrincipal.total_instancias < MIN_INSTANCIAS_STATS) continue;

    await supabase
      .from('active_sequences')
      .update({
        gap_media_historica: statPrincipal.gap_media,
        gap_sigma_historica: statPrincipal.gap_sigma,
      })
      .eq('id', seq.id);
  }
}

// ---------------------------------------------------------------------------
// MODO C — Proyección
// ---------------------------------------------------------------------------

/**
 * Devuelve las secuencias activas con probabilidad estimada de resolución
 * en el próximo sorteo.
 *
 * @param {Array}  drawsRecientes - últimos 60 sorteos (reciente primero)
 * @param {Map}    [presionMap]   - resultado de calcularPresion() (opcional)
 * @returns {Promise<Array<SecuenciaProyectada>>}
 */
export async function proyectarSecuencias(drawsRecientes, presionMap = null) {
  const { data: abiertas, error } = await getOpenSequences();
  if (error || !abiertas?.length) return [];

  if (!presionMap) {
    presionMap = await calcularPresion(drawsRecientes);
  }

  const ctx = await _loadCtx();
  const proyecciones = [];

  for (const seq of abiertas) {
    const proj = await _proyectarUna(seq, drawsRecientes, presionMap, ctx);
    if (proj) proyecciones.push(proj);
  }

  // Ordenar por probabilidad descendente
  return proyecciones.sort((a, b) => b.probResolucion - a.probResolucion);
}

async function _proyectarUna(seq, draws, presionMap, ctx) {
  const sorteosTranscurridos = seq.sorteos_transcurridos ?? 0;

  // ── Stats históricas del par ────────────────────────────────────────────
  const { data: stats } = await getSequenceStats(seq.numero_origen, seq.numero_destino);

  const statCrudo    = stats?.find(s => s.tipo_variante === 'crudo');
  const statAny      = stats?.sort((a, b) => b.total_instancias - a.total_instancias)[0];
  const statPrincipal = statCrudo ?? statAny;

  const gapMedia = seq.gap_media_historica ?? statPrincipal?.gap_media ?? null;
  const gapSigma = seq.gap_sigma_historica ?? statPrincipal?.gap_sigma ?? null;

  // ── Probabilidad de resolución en el sorteo actual ──────────────────────
  let probBase;
  if (gapMedia && gapSigma && statPrincipal?.total_instancias >= MIN_INSTANCIAS_STATS) {
    // P(resolución en sorteo N) ≈ derivada de la CDF normal
    const pHastaAhora    = probNormal(sorteosTranscurridos,     gapMedia, gapSigma);
    const pHastaProximo  = probNormal(sorteosTranscurridos + 1, gapMedia, gapSigma);
    probBase = Math.max(0.01, pHastaProximo - pHastaAhora);
  } else {
    probBase = PROB_DEFAULT;
  }

  // ── Ajuste por presión pública ──────────────────────────────────────────
  const psDestino  = presionMap.get(seq.numero_destino) ?? { presion: 0.5 };
  const factorAdv  = presionAFactor(psDestino.presion);

  // ── Ajuste por variante ya pagada ───────────────────────────────────────
  //    Si ya cayó una variante del destino, el directo podría liberarse pronto
  //    O bien la secuencia ya fue "saldada" en variante.
  let factorVariante = 1.0;
  if (seq.variante_pagada) {
    // La Casa ya pagó algo relacionado; puede pagar el directo pronto
    const diasDesdeVariante = diasEntre(seq.fecha_activacion, new Date().toISOString().slice(0, 10));
    factorVariante = diasDesdeVariante <= 5 ? 1.30 : 0.85;
  }

  // ── Ajuste por expiración próxima ───────────────────────────────────────
  let factorExpiracion = 1.0;
  if (gapMedia && sorteosTranscurridos > gapMedia * 2.0) {
    // Muy vencida: el jugador se cansó → La Casa la puede pagar pronto
    factorExpiracion = 1.20;
  }

  const probFinal = Math.min(0.95, probBase * factorAdv * factorVariante * factorExpiracion);

  // ── Determinar candidatos a resolver la secuencia ───────────────────────
  const formas = await resolverFormas(seq.numero_destino, { incluirTerminacion: false });

  // Filtrar formas que tengan peso suficiente
  const candidatos = formas.porPeso
    .filter(f => f.peso >= MIN_PESO_VARIANTE)
    .slice(0, 8)
    .map(f => ({
      numero:       f.numero,
      tipo:         f.tipo,
      peso:         f.peso,
      presion:      presionMap.get(f.numero)?.presion ?? 0.5,
      factorLiber:  presionAFactor(presionMap.get(f.numero)?.presion ?? 0.5),
    }));

  // El candidato con menor presión es el más probable para la resolución
  const mejorCandidato = candidatos.sort((a, b) =>
    (b.factorLiber * b.peso) - (a.factorLiber * a.peso)
  )[0] ?? null;

  // ── Barra de progreso visual ────────────────────────────────────────────
  const progresoMax = gapMedia ? Math.min(1, sorteosTranscurridos / (gapMedia + (gapSigma ?? 0))) : null;

  return {
    id:               seq.id,
    origen:           seq.numero_origen,
    destino:          seq.numero_destino,
    origenPad:        PAD(seq.numero_origen),
    destinoPad:       PAD(seq.numero_destino),
    tipoRelacion:     seq.tipo_relacion,
    fechaActivacion:  seq.fecha_activacion,
    sorteosTranscurridos,
    gapMedia,
    gapSigma,
    probResolucion:   probFinal,
    presionDestino:   psDestino.presion,
    liberacionCerca:  psDestino.liberacion?.cerca ?? false,
    variantePagada:   seq.variante_pagada,
    tipoVariantePagada: seq.tipo_variante_pagada,
    candidatos,
    mejorCandidato,
    progresoMax,
    estado:           seq.estado,
    // Texto para UI
    resumen: _buildResumen(seq, sorteosTranscurridos, gapMedia, gapSigma, probFinal),
  };
}

// ---------------------------------------------------------------------------
// Integración con el generador de candidatos (signal-engine)
// ---------------------------------------------------------------------------

/**
 * Genera señales de score adicionales para el signal-engine
 * basadas en secuencias activas.
 *
 * @param {Array<SecuenciaProyectada>} proyecciones
 * @returns {Map<numero, { score: 0-100, razones: string[] }>}
 */
export function seqSignals(proyecciones) {
  const signals = new Map();

  for (const proj of proyecciones) {
    if (proj.probResolucion < 0.05) continue;

    const baseScore = Math.round(proj.probResolucion * 100);

    // Señal para el destino directo
    _addSignal(signals, proj.destino, baseScore, [
      `Secuencia activa ${proj.origenPad}→${proj.destinoPad} ` +
      `(${proj.sorteosTranscurridos} sorteos, media ${proj.gapMedia?.toFixed(1) ?? '?'})`
    ]);

    // Señal para el mejor candidato (si es distinto del destino)
    if (proj.mejorCandidato && proj.mejorCandidato.numero !== proj.destino) {
      const scoreVar = Math.round(baseScore * proj.mejorCandidato.peso * proj.mejorCandidato.factorLiber);
      _addSignal(signals, proj.mejorCandidato.numero, scoreVar, [
        `Variante probable de sec. ${proj.origenPad}→${proj.destinoPad} ` +
        `(${proj.mejorCandidato.tipo}, baja presión)`
      ]);
    }
  }

  return signals;
}

function _addSignal(map, numero, score, razones) {
  if (!map.has(numero)) {
    map.set(numero, { score: 0, razones: [] });
  }
  const s = map.get(numero);
  s.score   = Math.min(100, s.score + score);
  s.razones = [...s.razones, ...razones];
}

// ---------------------------------------------------------------------------
// Verificador de secuencia activa para un número dado
// ---------------------------------------------------------------------------

/**
 * ¿Hay alguna secuencia abierta que apunte a este número (o variante)?
 * Útil para el internal-reasoner.
 *
 * @param {number}  numero
 * @param {Map}     [presionMap]
 * @returns {Promise<Array<SecuenciaProyectada>>}
 */
export async function secuenciasQueApuntan(numero, presionMap = null) {
  const { data: abiertas } = await getOpenSequences();
  if (!abiertas?.length) return [];

  const ctx  = await _loadCtx();
  const proj = [];

  for (const seq of abiertas) {
    const esDestino = seq.numero_destino === numero;
    const relConDest = clasificarRelacionSync(seq.numero_destino, numero, ctx);
    const esVariante = relConDest !== null && !esDestino;

    if (esDestino || (esVariante && relConDest.peso >= MIN_PESO_VARIANTE)) {
      proj.push({
        secuenciaId:      seq.id,
        origen:           seq.numero_origen,
        destino:          seq.numero_destino,
        esDirecto:        esDestino,
        tipoVariante:     esVariante ? relConDest.tipo : 'crudo',
        pesoCandidato:    esVariante ? relConDest.peso : 1.0,
        sorteosTranscurridos: seq.sorteos_transcurridos,
        gapMedia:         seq.gap_media_historica,
      });
    }
  }

  return proj;
}

// ---------------------------------------------------------------------------
// Carga de contexto compartido
// ---------------------------------------------------------------------------

let _ctxCache = null;
async function _loadCtx() {
  if (_ctxCache) return _ctxCache;
  try {
    const [rRes, gRes] = await Promise.all([
      fetch('data/relativos_diaria.json'),
      fetch('data/guia_suenos.json'),
    ]);
    const rJson = rRes.ok ? await rRes.json() : {};
    const gJson = gRes.ok ? await gRes.json() : {};
    const relMap = new Map();
    for (const [pad, entry] of Object.entries(rJson.pares || {})) {
      relMap.set(parseInt(pad, 10), (entry.relativos || []).map(r => r.numero));
    }
    _ctxCache = { relativos: relMap, guia: gJson };
  } catch {
    _ctxCache = { relativos: new Map(), guia: {} };
  }
  return _ctxCache;
}

// ---------------------------------------------------------------------------
// Texto para UI
// ---------------------------------------------------------------------------

function _buildResumen(seq, gap, media, sigma, prob) {
  const pct   = (prob * 100).toFixed(1);
  const prog  = media ? `${gap}/${media.toFixed(0)} sorteos` : `${gap} sorteos`;
  const mismoDia = ''; // placeholder para S03/S10

  let texto = `${PAD(seq.numero_origen)}→${PAD(seq.numero_destino)}: ${prog} transcurridos`;

  if (media && sigma) {
    const estado = gap < media - sigma ? 'pronto' :
                   gap < media + sigma ? 'en rango' : 'vencida';
    texto += ` — ${estado}`;
  }

  if (seq.variante_pagada !== null) {
    texto += ` — variante ${PAD(seq.variante_pagada)} ya pagada`;
  }

  texto += ` (prob. próx. sorteo: ${pct}%)`;
  return texto;
}
