/**
 * strategy-classifier.js
 *
 * Analiza cada sorteo registrado y determina qué estrategia usó La Casa.
 * Opera en dos modos:
 *
 *   MODO TIEMPO REAL: se llama al registrar un nuevo sorteo.
 *     → Clasifica el sorteo recién ingresado.
 *     → Actualiza active_sequences, sequence_resolutions, intraday_patterns.
 *     → Inserta en strategy_events.
 *
 *   MODO BATCH HISTÓRICO: procesa todo el histórico de draws.
 *     → Puebla sequence_resolutions con datos reales desde el principio.
 *     → Base para que sequence-engine calcule distribuciones estadísticas.
 *
 * Catálogo de estrategias:
 *   S01 Pago Directo Tardío      — pagó el número esperado, pero tarde
 *   S02 Pago por Variante        — pagó una variante en lugar del directo
 *   S03 Vuelta Intra-Día         — mismo día, turno distinto, número relacionado
 *   S04 Pago Anticipado          — pagó antes del intervalo esperado
 *   S05 Desvío de Secuencia      — activó otra secuencia para distraer
 *   S06 Modo Recuperación        — distribución anómala post-superpremio
 *   S07 Bloqueo de Populares     — período sin saladitos / populares
 *   S08 Liberación de Cluster    — varios vencidos caen en ventana corta
 *   S09 Secuencia Fragmentada    — secuencia con variantes intercaladas
 *   S10 Espejo de Turno          — turno 1 y turno 3 del mismo día relacionados
 *   S11 Repetición Controlada    — repite en gap muy corto
 *   S12 Fin de Ciclo Mensual     — patrón cambia últimos días del mes
 */

import { clasificarRelacionSync, buscarOrigen } from './variant-resolver.js';
import {
  insertStrategyEvent,
  insertSequenceResolution,
  insertIntradayPattern,
  openSequence,
  getOpenSequences,
  resolveSequence,
  incrementSequenceCounters,
  expireStaleSequences,
} from './intelligence-storage.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SALADITOS = new Set([
  0, 11, 22, 33, 44, 55, 66, 77, 88, 99,   // dobles
  10, 20, 30, 40, 50, 60, 70, 80, 90,       // redondos
  5, 15, 25, 35, 45, 65, 75, 85, 95,        // terminación 5
]);

const TURNOS_ORDEN = { '11AM': 0, '12PM': 1, '3PM': 2, '6PM': 3, '9PM': 4 };

function turnoOrd(t) { return TURNOS_ORDEN[t] ?? -1; }

const PAD = n => String(n).padStart(2, '0');

// Días entre dos fechas
function diasEntre(fechaA, fechaB) {
  const a = new Date(fechaA);
  const b = new Date(fechaB);
  return Math.round(Math.abs(b - a) / 86400000);
}

// Sorteos entre dos índices en el array de draws (más reciente primero)
function sorteosEntre(draws, idxOrigen, idxActual) {
  return Math.abs(idxActual - idxOrigen);
}

// ---------------------------------------------------------------------------
// Carga de contexto de relativos (caché local para el clasificador)
// ---------------------------------------------------------------------------

let _relCtxCache = null;
async function loadRelCtx() {
  if (_relCtxCache) return _relCtxCache;
  try {
    const [rRes, gRes] = await Promise.all([
      fetch('data/relativos_diaria.json'),
      fetch('data/guia_suenos.json'),
    ]);
    const rJson = rRes.ok ? await rRes.json() : {};
    const gJson = gRes.ok ? await gRes.json() : {};

    const relMap = new Map();
    for (const [pad, entry] of Object.entries(rJson.pares || {})) {
      const num = parseInt(pad, 10);
      relMap.set(num, (entry.relativos || []).map(r => r.numero));
    }

    _relCtxCache = { relativos: relMap, guia: gJson };
    return _relCtxCache;
  } catch {
    _relCtxCache = { relativos: new Map(), guia: {} };
    return _relCtxCache;
  }
}

// ---------------------------------------------------------------------------
// CLASIFICADOR PRINCIPAL — tiempo real
// ---------------------------------------------------------------------------

/**
 * Clasifica el sorteo recién ingresado y actualiza todas las tablas.
 *
 * @param {object} drawNuevo    - { id, numero, fecha, horario, pais }
 * @param {Array}  drawsRecientes - últimos 30 sorteos (reciente primero), incluye drawNuevo
 * @param {object} [opts]
 * @param {boolean} [opts.dry=false] - solo clasifica, no persiste en BD
 * @returns {Promise<ClasificacionResult>}
 */
export async function clasificarSorteo(drawNuevo, drawsRecientes, opts = {}) {
  const { dry = false } = opts;
  const ctx = await loadRelCtx();

  // Sorteos previos (excluye el actual)
  const previos = drawsRecientes.filter(d =>
    d.id !== drawNuevo.id &&
    (d.fecha < drawNuevo.fecha ||
      (d.fecha === drawNuevo.fecha && turnoOrd(d.horario) < turnoOrd(drawNuevo.horario)))
  );

  const eventos = [];

  // ── 1. Detectar patrones intra-día (S03 / S10) ──────────────────────────
  const intradayEvts = await _detectarIntraday(drawNuevo, previos, ctx, dry);
  eventos.push(...intradayEvts);

  // ── 2. Actualizar active_sequences (incrementar contador + resolver) ────
  const seqEvts = await _procesarSecuenciasActivas(drawNuevo, ctx, dry);
  eventos.push(...seqEvts);

  // ── 3. Abrir nuevas secuencias disparadas por este número ───────────────
  await _abrirNuevasSecuencias(drawNuevo, ctx, dry);

  // ── 4. Detectar S11 — Repetición Controlada ────────────────────────────
  const repEvt = _detectarRepeticion(drawNuevo, previos);
  if (repEvt && !dry) {
    await insertStrategyEvent({
      drawId:      drawNuevo.id,
      strategyId:  'S11',
      numero:      drawNuevo.numero,
      fecha:       drawNuevo.fecha,
      turno:       drawNuevo.horario,
      confianza:   repEvt.confianza,
      notas:       repEvt.notas,
    });
    eventos.push(repEvt);
  }

  // ── 5. Detectar S12 — Fin de Ciclo Mensual ─────────────────────────────
  const finMesEvt = _detectarFinMes(drawNuevo, previos);
  if (finMesEvt && !dry) {
    await insertStrategyEvent({
      drawId:     drawNuevo.id,
      strategyId: 'S12',
      numero:     drawNuevo.numero,
      fecha:      drawNuevo.fecha,
      turno:      drawNuevo.horario,
      confianza:  finMesEvt.confianza,
      notas:      finMesEvt.notas,
    });
    eventos.push(finMesEvt);
  }

  // ── 6. Expirar secuencias viejas ────────────────────────────────────────
  if (!dry) await expireStaleSequences(35);

  return {
    draw:    drawNuevo,
    eventos,
    resumen: _buildResumen(eventos),
  };
}

// ---------------------------------------------------------------------------
// Intra-Día — S03 (vuelta distinto turno) y S10 (espejo de turno)
// ---------------------------------------------------------------------------

async function _detectarIntraday(draw, previos, ctx, dry) {
  const eventos = [];

  // Buscar sorteos del mismo día en turnos anteriores
  const mismosDia = previos.filter(p =>
    p.fecha === draw.fecha && turnoOrd(p.horario) < turnoOrd(draw.horario)
  );

  for (const prev of mismosDia) {
    const rel = clasificarRelacionSync(prev.numero, draw.numero, ctx);
    if (!rel) continue;

    const estrategia = rel.tipo === 'mirror' ? 'S10' : 'S03';
    const evt = {
      strategyId: estrategia,
      numero:     draw.numero,
      numeroOrigen: prev.numero,
      tipoVariante: rel.tipo,
      turno:      draw.horario,
      fecha:      draw.fecha,
      confianza:  rel.peso,
      notas:      `${PAD(prev.numero)} en ${prev.horario} → ${PAD(draw.numero)} en ${draw.horario}`,
      mismoDia:   true,
    };
    eventos.push(evt);

    if (!dry) {
      await Promise.all([
        insertStrategyEvent({
          drawId:      draw.id,
          strategyId:  estrategia,
          numero:      draw.numero,
          numeroOrigen: prev.numero,
          tipoVariante: rel.tipo,
          turno:       draw.horario,
          fecha:       draw.fecha,
          confianza:   rel.peso,
          notas:       evt.notas,
        }),
        insertIntradayPattern({
          turnoA:    prev.horario,
          numeroA:   prev.numero,
          turnoB:    draw.horario,
          numeroB:   draw.numero,
          relacion:  rel.tipo,
          fecha:     draw.fecha,
          strategyId: estrategia,
        }),
        insertSequenceResolution({
          numeroOrigen:      prev.numero,
          numeroResolucion:  draw.numero,
          tipoVariante:      rel.tipo,
          sorteosGap:        0,
          diasGap:           0,
          mismoDia:          true,
          turnoOrigen:       prev.horario,
          turnoResolucion:   draw.horario,
          fechaOrigen:       prev.fecha,
          fechaResolucion:   draw.fecha,
          drawOrigenId:      prev.id,
          drawResolucionId:  draw.id,
          strategyId:        estrategia,
        }),
      ]);
    }
  }

  return eventos;
}

// ---------------------------------------------------------------------------
// Procesamiento de secuencias activas
// ---------------------------------------------------------------------------

async function _procesarSecuenciasActivas(draw, ctx, dry) {
  const eventos = [];

  const { data: secuenciasAbiertas } = await getOpenSequences();
  if (!secuenciasAbiertas?.length) return eventos;

  // IDs a incrementar (todas menos las que se resuelven)
  const idsIncrementar = [];

  for (const seq of secuenciasAbiertas) {
    const esDestinoCrudo = seq.numero_destino === draw.numero;

    // ¿El número actual es el destino directo o una variante?
    const relConDestino = clasificarRelacionSync(seq.numero_destino, draw.numero, ctx);
    const esVariante = relConDestino !== null && !esDestinoCrudo;

    if (esDestinoCrudo) {
      // Resolución directa — S01 o S04
      const sorteosGap = seq.sorteos_transcurridos + 1;
      const diasGap    = diasEntre(seq.fecha_activacion, draw.fecha);
      const esAnticipado = seq.gap_media_historica &&
        sorteosGap < (seq.gap_media_historica - (seq.gap_sigma_historica ?? 1));
      const estrategia = esAnticipado ? 'S04' : 'S01';

      if (!dry) {
        await Promise.all([
          resolveSequence(seq.id, {
            estado:      'resuelta_directa',
            fechaCierre: draw.fecha,
          }),
          insertSequenceResolution({
            numeroOrigen:      seq.numero_origen,
            numeroResolucion:  draw.numero,
            tipoVariante:      'crudo',
            sorteosGap,
            diasGap,
            mismoDia:          diasGap === 0,
            turnoOrigen:       seq.turno_activacion,
            turnoResolucion:   draw.horario,
            fechaOrigen:       seq.fecha_activacion,
            fechaResolucion:   draw.fecha,
            drawOrigenId:      seq.draw_origen_id,
            drawResolucionId:  draw.id,
            strategyId:        estrategia,
          }),
          insertStrategyEvent({
            drawId:       draw.id,
            strategyId:   estrategia,
            numero:       draw.numero,
            numeroOrigen: seq.numero_origen,
            tipoVariante: 'crudo',
            turno:        draw.horario,
            fecha:        draw.fecha,
            confianza:    0.85,
            notas: `Sec. ${PAD(seq.numero_origen)}→${PAD(draw.numero)} resuelta en ${sorteosGap} sorteos`,
          }),
        ]);
      }

      eventos.push({
        strategyId:  estrategia,
        secuenciaId: seq.id,
        origen:      seq.numero_origen,
        destino:     draw.numero,
        tipoVariante: 'crudo',
        sorteosGap,
      });

    } else if (esVariante && relConDestino.peso >= 0.65) {
      // Resolución por variante — S02 o S09 (fragmentada)
      const sorteosGap = seq.sorteos_transcurridos + 1;
      const diasGap    = diasEntre(seq.fecha_activacion, draw.fecha);

      // S09 si ya había una variante pagada antes en esta secuencia
      const estrategia = seq.variante_pagada ? 'S09' : 'S02';

      if (!dry) {
        await Promise.all([
          resolveSequence(seq.id, {
            numeroVariante:   draw.numero,
            tipoVariante:     relConDestino.tipo,
            estado:           'resuelta_variante',
            fechaCierre:      draw.fecha,
          }),
          insertSequenceResolution({
            numeroOrigen:      seq.numero_origen,
            numeroResolucion:  draw.numero,
            tipoVariante:      relConDestino.tipo,
            sorteosGap,
            diasGap,
            mismoDia:          diasGap === 0,
            turnoOrigen:       seq.turno_activacion,
            turnoResolucion:   draw.horario,
            fechaOrigen:       seq.fecha_activacion,
            fechaResolucion:   draw.fecha,
            drawOrigenId:      seq.draw_origen_id,
            drawResolucionId:  draw.id,
            strategyId:        estrategia,
          }),
          insertStrategyEvent({
            drawId:       draw.id,
            strategyId:   estrategia,
            numero:       draw.numero,
            numeroOrigen: seq.numero_origen,
            tipoVariante: relConDestino.tipo,
            turno:        draw.horario,
            fecha:        draw.fecha,
            confianza:    relConDestino.peso,
            notas: `Sec. ${PAD(seq.numero_origen)}→${PAD(seq.numero_destino)} pagada como ${relConDestino.tipo}: ${PAD(draw.numero)}`,
          }),
        ]);
      }

      eventos.push({
        strategyId:  estrategia,
        secuenciaId: seq.id,
        origen:      seq.numero_origen,
        destino:     seq.numero_destino,
        variante:    draw.numero,
        tipoVariante: relConDestino.tipo,
        sorteosGap,
      });

    } else {
      // La secuencia sigue abierta — incrementar contador
      idsIncrementar.push(seq.id);
    }
  }

  if (!dry && idsIncrementar.length) {
    await incrementSequenceCounters(idsIncrementar);
  }

  return eventos;
}

// ---------------------------------------------------------------------------
// Abrir nuevas secuencias
// ---------------------------------------------------------------------------

async function _abrirNuevasSecuencias(draw, ctx, dry) {
  const relativos = ctx.relativos;
  const destinos  = relativos.get(draw.numero) ?? [];

  for (const destino of destinos) {
    if (!dry) {
      await openSequence({
        numeroOrigen:      draw.numero,
        numeroDestino:     destino,
        tipoRelacion:      'relativo',
        drawOrigenId:      draw.id,
        fechaActivacion:   draw.fecha,
        turnoActivacion:   draw.horario,
        gapMediaHistorica: null, // Se calculará del histórico en Sprint 3
        gapSigmaHistorica: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// S11 — Repetición Controlada
// ---------------------------------------------------------------------------

function _detectarRepeticion(draw, previos) {
  // Número que ya cayó en los últimos 4 sorteos
  const recientes = previos.slice(0, 4);
  const repeticion = recientes.find(p => p.numero === draw.numero);
  if (!repeticion) return null;

  const dias = diasEntre(repeticion.fecha, draw.fecha);
  if (dias > 5) return null;

  return {
    strategyId: 'S11',
    confianza:  dias <= 1 ? 0.95 : 0.75,
    notas: `${PAD(draw.numero)} repitió en ${dias} día(s). Sorteo anterior: ${repeticion.fecha} ${repeticion.horario}`,
  };
}

// ---------------------------------------------------------------------------
// S12 — Fin de Ciclo Mensual
// ---------------------------------------------------------------------------

function _detectarFinMes(draw, previos) {
  const dia = new Date(draw.fecha).getDate();
  if (dia < 26) return null; // Solo aplica últimos 5 días del mes

  // Verificar si hay un cambio de distribución vs. inicio del mes
  const mismoMes = previos.filter(p => {
    const d = new Date(p.fecha);
    return d.getMonth() === new Date(draw.fecha).getMonth() &&
           d.getFullYear() === new Date(draw.fecha).getFullYear();
  });

  if (mismoMes.length < 10) return null;

  // Proporción de saladitos en inicio vs. fin del mes
  const inicioMes = mismoMes.filter(p => new Date(p.fecha).getDate() <= 10);
  const finMes    = mismoMes.filter(p => new Date(p.fecha).getDate() >= 26);

  if (inicioMes.length < 3 || finMes.length < 2) return null;

  const ratioInicio = inicioMes.filter(p => SALADITOS.has(p.numero)).length / inicioMes.length;
  const ratioFin    = finMes.filter(p => SALADITOS.has(p.numero)).length / finMes.length;
  const delta = Math.abs(ratioFin - ratioInicio);

  if (delta < 0.15) return null;

  return {
    strategyId: 'S12',
    confianza:  Math.min(0.9, 0.5 + delta),
    notas: `Día ${dia} del mes. Ratio saladitos: inicio=${(ratioInicio * 100).toFixed(0)}% vs fin=${(ratioFin * 100).toFixed(0)}%`,
  };
}

// ---------------------------------------------------------------------------
// MODO BATCH HISTÓRICO
// ---------------------------------------------------------------------------

/**
 * Procesa TODOS los draws históricos para poblar sequence_resolutions.
 * Se ejecuta una sola vez tras el despliegue del Sprint 1.
 *
 * @param {Array} allDraws   - todos los sorteos, ordenados por fecha+turno ASC
 * @param {object} [opts]
 * @param {number} [opts.ventanaMax=45]   - sorteos máximos para buscar resolución
 * @param {Function} [opts.onProgress]   - callback(procesados, total)
 * @returns {Promise<{ procesados, resoluciones, errores }>}
 */
export async function procesarHistoricoCompleto(allDraws, opts = {}) {
  const { ventanaMax = 45, onProgress } = opts;
  const ctx = await loadRelCtx();

  let procesados  = 0;
  let resoluciones = 0;
  let errores     = 0;

  for (let i = 0; i < allDraws.length; i++) {
    const drawOrigen = allDraws[i];
    const relativos  = ctx.relativos.get(drawOrigen.numero) ?? [];

    if (!relativos.length) {
      procesados++;
      continue;
    }

    // Ventana de búsqueda hacia adelante
    const ventana = allDraws.slice(i + 1, i + 1 + ventanaMax);

    for (const destino of relativos) {
      for (let j = 0; j < ventana.length; j++) {
        const drawCandidato = ventana[j];

        const relConDestino = clasificarRelacionSync(destino, drawCandidato.numero, ctx);
        if (!relConDestino) continue;

        const esDirecto  = drawCandidato.numero === destino;
        const mismoDia   = drawCandidato.fecha === drawOrigen.fecha;
        const sorteosGap = j + 1;
        const diasGap    = diasEntre(drawOrigen.fecha, drawCandidato.fecha);

        // Determinar estrategia
        let strategyId;
        if (mismoDia && turnoOrd(drawCandidato.horario) > turnoOrd(drawOrigen.horario)) {
          strategyId = relConDestino.tipo === 'mirror' ? 'S10' : 'S03';
        } else if (esDirecto) {
          strategyId = 'S01';
        } else {
          strategyId = 'S02';
        }

        try {
          await insertSequenceResolution({
            numeroOrigen:      drawOrigen.numero,
            numeroResolucion:  drawCandidato.numero,
            tipoVariante:      relConDestino.tipo,
            sorteosGap,
            diasGap,
            mismoDia,
            turnoOrigen:       drawOrigen.horario,
            turnoResolucion:   drawCandidato.horario,
            fechaOrigen:       drawOrigen.fecha,
            fechaResolucion:   drawCandidato.fecha,
            drawOrigenId:      drawOrigen.id,
            drawResolucionId:  drawCandidato.id,
            strategyId,
          });
          resoluciones++;
        } catch {
          errores++;
        }

        // Si fue resolución directa, no buscar más para este destino
        if (esDirecto) break;
      }
    }

    // Intra-día: buscar en mismo día turnos posteriores
    const mismosDia = ventana.filter(d =>
      d.fecha === drawOrigen.fecha &&
      turnoOrd(d.horario) > turnoOrd(drawOrigen.horario)
    );

    for (const dMismoDia of mismosDia) {
      const rel = clasificarRelacionSync(drawOrigen.numero, dMismoDia.numero, ctx);
      if (!rel) continue;

      const estrategia = rel.tipo === 'mirror' ? 'S10' : 'S03';
      try {
        await insertIntradayPattern({
          turnoA:    drawOrigen.horario,
          numeroA:   drawOrigen.numero,
          turnoB:    dMismoDia.horario,
          numeroB:   dMismoDia.numero,
          relacion:  rel.tipo,
          fecha:     drawOrigen.fecha,
          strategyId: estrategia,
        });
      } catch {
        // Ignorar duplicados del índice único
      }
    }

    procesados++;
    if (onProgress && procesados % 50 === 0) onProgress(procesados, allDraws.length);
  }

  return { procesados, resoluciones, errores };
}

// ---------------------------------------------------------------------------
// Resumen legible
// ---------------------------------------------------------------------------

function _buildResumen(eventos) {
  if (!eventos.length) return 'Sin estrategias detectadas en este sorteo.';
  const ids = [...new Set(eventos.map(e => e.strategyId))];
  return `Estrategias detectadas: ${ids.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Descripciones del catálogo (para UI)
// ---------------------------------------------------------------------------

export const CATALOGO_ESTRATEGIAS = Object.freeze({
  S01: { nombre: 'Pago Directo Tardío',     descripcion: 'La Casa pagó el número esperado fuera del intervalo típico.' },
  S02: { nombre: 'Pago por Variante',       descripcion: 'En lugar del directo, pagó una conversión, espejo o equivalencia.' },
  S03: { nombre: 'Vuelta Intra-Día',        descripcion: 'Mismo día, turno distinto: cayó un número relacionado al de un turno anterior.' },
  S04: { nombre: 'Pago Anticipado',         descripcion: 'Pagó antes del intervalo histórico típico.' },
  S05: { nombre: 'Desvío de Secuencia',     descripcion: 'Activó otra secuencia para desviar la atención del jugador.' },
  S06: { nombre: 'Modo Recuperación',       descripcion: 'Distribución anómala detectada (post-superpremio u otro evento).' },
  S07: { nombre: 'Bloqueo de Populares',    descripcion: 'Período prolongado sin pagar números saladitos o populares.' },
  S08: { nombre: 'Liberación de Cluster',   descripcion: 'Varios números vencidos cayeron en una ventana corta.' },
  S09: { nombre: 'Secuencia Fragmentada',   descripcion: 'Secuencia resuelta con variantes intercaladas, no un solo pago directo.' },
  S10: { nombre: 'Espejo de Turno',         descripcion: 'Turno 1 y turno 3 del mismo día tienen relación de espejo.' },
  S11: { nombre: 'Repetición Controlada',   descripcion: 'El mismo número repitió en un gap muy corto.' },
  S12: { nombre: 'Fin de Ciclo Mensual',    descripcion: 'El patrón de distribución cambia en los últimos días del mes.' },
});
