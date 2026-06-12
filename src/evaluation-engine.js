/**
 * evaluation-engine.js
 *
 * Evalúa cada sorteo real contra las predicciones guardadas en prediction_logs.
 * Clasifica el resultado en 4 tipos:
 *   A — ranking error: el número cayó pero estaba debajo del top-3
 *   B — ausente:       el número no estaba en la lista del motor
 *   C — acierto:       el número estaba en top-5 (o en la posición que cayó)
 *   D — falso positivo peligroso: motor predijo número popular que NO cayó,
 *                                  y ese número llevaba presión acumulada alta
 *
 * Después de clasificar, inserta un registro en system_evaluations con:
 *   - tipo A/B/C/D
 *   - motores_correctos / motores_fallidos
 *   - en_top1, en_top3, en_top5
 *   - delta_ranking, ausente
 *
 * Exports:
 *   evaluarSorteo(draw, opts)        → EvaluacionResult
 *   evaluarLote(draws, opts)         → EvaluacionResult[]   (batch histórico)
 *   getMotorContributions(draws)     → Map<motor, {hits, total}>
 */

import { DB } from './storage.js';
import { supabase } from './supabaseClient.js';
import { insertEvaluation, getRecentEvaluations } from './intelligence-storage.js';
import { separarPorSellado } from './prediction-integrity.js';

// Posición máxima que sigue contando como "acierto de ranking"
const TOP_ACIERTO = 5;

// Cuántos sorteos hacia atrás buscar predicciones activas
const VENTANA_BUSQUEDA_DIAS = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Traduce los candidatos del motor a una lista ordenada por score descendente.
 * Maneja tanto el formato nuevo (array de objetos con .numero / .score)
 * como el formato viejo (array de números).
 */
function normalizarCandidatos(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (typeof rows[0] === 'number') {
    // Formato viejo: el orden de la lista ya es el ranking. No se inventan
    // scores (antes se asignaba 1, 0.99, 0.98… y eso inflaba métricas que
    // dependen del score, como los falsos positivos peligrosos).
    return rows.map((n) => ({ numero: n, score: null, motores: [], legacy: true }));
  }
  return rows
    .filter(r => r.estado !== 'descartado')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(r => ({
      numero:  r.numero,
      score:   r.score ?? 0,
      motores: r.motores ?? r.fuentes ?? [],
    }));
}

/**
 * A partir de los candidatos rankeados, extrae qué motores señalaron el número
 * ganador (motores_correctos) y cuáles lo ignoraron (motores_fallidos).
 */
function extraerMotores(candidatos, numeroGanador) {
  const ganadoreRow = candidatos.find(c => c.numero === numeroGanador);
  if (!ganadoreRow) {
    // Número ausente — todos los motores que participaron fallaron
    const todosMotores = [...new Set(candidatos.flatMap(c => c.motores))];
    return { motoresCorrectos: [], motoresFallidos: todosMotores };
  }
  const correctos = ganadoreRow.motores ?? [];
  const fallidos  = [...new Set(
    candidatos
      .filter(c => c.numero !== numeroGanador)
      .flatMap(c => c.motores)
      .filter(m => !correctos.includes(m))
  )];
  return { motoresCorrectos: correctos, motoresFallidos: fallidos };
}

/**
 * Clasifica el tipo de error:
 *   C → número en top-5
 *   A → número presente pero fuera de top-5
 *   B → número completamente ausente
 *   D → se determina externamente (número popular muy señalado que NO cayó)
 */
function clasificarTipo(ranking) {
  if (ranking === -1)             return 'B';  // ausente
  if (ranking < TOP_ACIERTO)     return 'C';  // acierto
  return 'A';                                  // ranking error
}

// ---------------------------------------------------------------------------
// Core: evaluar un sorteo individual
// ---------------------------------------------------------------------------

/**
 * Evalúa el resultado de un sorteo real contra los prediction_logs activos.
 *
 * @param {object} draw         - { numero, fecha, turno, pais, ... }
 * @param {object} [opts]
 * @param {boolean}[opts.persistir=true]
 * @param {boolean}[opts.verbose=false]
 * @returns {Promise<EvaluacionResult>}
 */
export async function evaluarSorteo(draw, opts = {}) {
  const { persistir = true, verbose = false } = opts;

  const numero = draw.numero ?? draw.numero_sorteado;
  if (numero === undefined || numero === null) {
    return { error: 'draw.numero requerido', evaluado: false };
  }

  // 1. Obtener prediction_logs para esta fecha/turno/pais
  let logs;
  try {
    logs = await DB.getPredictionLogs();
  } catch (err) {
    return { error: err?.message, evaluado: false };
  }

  // Filtrar logs del sorteo correspondiente
  const matchingLogs = (logs ?? []).filter(row => {
    const f = row.targetFecha ?? row.target_fecha;
    const t = row.turno;
    const p = row.targetPais ?? row.target_pais;
    return (
      f === draw.fecha &&
      (!draw.turno || t === draw.turno) &&
      (!draw.pais  || p === draw.pais)
    );
  });

  if (!matchingLogs.length) {
    // Sin predicción para este sorteo — evaluación vacía, no puntúa
    return {
      evaluado:    false,
      razon:       'Sin predicciones registradas para este sorteo',
      fecha:       draw.fecha,
      turno:       draw.turno,
      pais:        draw.pais,
      numeroReal:  numero,
    };
  }

  // Sellado: solo cuentan como evidencia las predicciones registradas ANTES
  // del sorteo. Las post-hoc (típicas de sesiones de ingreso histórico) se
  // marcan como descartadas para que el hit-tracker no las compute.
  const { sellados, postHoc } = separarPorSellado(matchingLogs);

  if (persistir && postHoc.length) {
    await _descartarLogs(postHoc).catch(e =>
      console.warn('[evaluation-engine] _descartarLogs:', e?.message)
    );
  }

  if (!sellados.length) {
    return {
      evaluado:    false,
      razon:       `Solo predicciones post-hoc (${postHoc.length}) — registradas después del sorteo, no cuentan como evidencia`,
      fecha:       draw.fecha,
      turno:       draw.turno,
      pais:        draw.pais,
      numeroReal:  numero,
      postHocDescartados: postHoc.length,
    };
  }

  const candidatos   = normalizarCandidatos(sellados);
  const ranking      = candidatos.findIndex(c => c.numero === numero); // 0-indexed, -1=ausente
  const enTop1       = ranking === 0;
  const enTop3       = ranking >= 0 && ranking < 3;
  const enTop5       = ranking >= 0 && ranking < 5;
  const ausente      = ranking === -1;
  const tipo         = clasificarTipo(ranking);

  const { motoresCorrectos, motoresFallidos } = extraerMotores(candidatos, numero);

  // Detectar tipo D: falso positivo peligroso
  // (número en top-3 que NO cayó, con score muy alto — motor sobreconfiado)
  // Umbral 0.5 para la nueva escala compuesta (fracción del máximo posible);
  // el 0.7 anterior correspondía a la escala saturada donde todo llegaba a 1.0
  const falsoPositivoPeligroso = candidatos
    .slice(0, 3)
    .filter(c => c.numero !== numero && Number.isFinite(c.score) && c.score > 0.5)
    .map(c => c.numero);

  const evaluacion = {
    fecha:             draw.fecha,
    turno:             draw.turno   ?? null,
    pais:              draw.pais    ?? null,
    numeroReal:        numero,
    rankingObtenido:   ranking,
    enTop1,
    enTop3,
    enTop5,
    ausente,
    tipo,
    motoresCorrectos,
    motoresFallidos,
    falsoPositivoPeligroso,
    candidatos:        candidatos.slice(0, 10).map(c => c.numero),
    scoreNumeroReal:   ranking >= 0 ? (candidatos[ranking].score ?? 0) : 0,
    evaluado:          true,
  };

  if (verbose) {
    console.log(`[evaluation-engine] ${draw.fecha} ${draw.turno} → ${pad(numero)} | tipo=${tipo} | ranking=${ranking}`);
  }

  if (persistir) {
    await insertEvaluation({
      fecha:           evaluacion.fecha,
      turno:           evaluacion.turno,
      pais:            evaluacion.pais,
      numeroReal:      numero,
      en_top1:         enTop1,
      en_top3:         enTop3,
      en_top5:         enTop5,
      ausente,
      tipo,
      motores_correctos: motoresCorrectos,
      motores_fallidos:  motoresFallidos,
      delta_ranking:     ranking,
      score_prediccion:  evaluacion.scoreNumeroReal,
    }).catch(e => verbose && console.warn('[evaluation-engine] insertEvaluation:', e?.message));

    // Marcar prediction_logs sellados: el que acertó como "acierto", el resto como "fallo"
    await _marcarLogs(sellados, numero).catch(e =>
      console.warn('[evaluation-engine] _marcarLogs:', e?.message)
    );
  }

  return evaluacion;
}

/**
 * Marca como 'descartado' los logs post-hoc (creados después del sorteo)
 * para que el hit-tracker no los cuente como evidencia.
 */
async function _descartarLogs(logs) {
  for (const row of logs) {
    if (row.estado === 'descartado') continue;
    const { error } = await supabase
      .from('prediction_logs')
      .update({ estado: 'descartado', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      console.warn(`[evaluation-engine] No se pudo descartar log post-hoc ${row.id}:`, error.message);
    }
  }
}

/**
 * Marca los prediction_logs del batch como acierto/fallo en Supabase.
 * Los fallos de actualización se loguean: silenciarlos dejaba logs en estados
 * inconsistentes que luego sesgaban el hit-tracker sin ninguna pista.
 */
async function _marcarLogs(logs, numeroGanador) {
  let fallos = 0;
  for (const row of logs) {
    const nuevoEstado = row.numero === numeroGanador ? 'acierto' : 'fallo';
    if (row.estado === nuevoEstado) continue;
    const { error } = await supabase
      .from('prediction_logs')
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      fallos += 1;
      console.warn(`[evaluation-engine] No se pudo marcar log ${row.id} como ${nuevoEstado}:`, error.message);
    }
  }
  if (fallos) {
    console.warn(`[evaluation-engine] ${fallos}/${logs.length} logs quedaron sin marcar; el hit-tracker puede reflejar datos parciales.`);
  }
}

// ---------------------------------------------------------------------------
// Lote histórico
// ---------------------------------------------------------------------------

/**
 * Evalúa múltiples sorteos en lote, útil para backfill de evaluaciones.
 *
 * @param {Array}  draws   - sorteos reales [ { numero, fecha, turno, pais } ]
 * @param {object} opts
 * @returns {Promise<EvaluacionResult[]>}
 */
export async function evaluarLote(draws, opts = {}) {
  const resultados = [];
  for (const draw of draws) {
    const r = await evaluarSorteo(draw, opts);
    resultados.push(r);
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// Contribución por motor
// ---------------------------------------------------------------------------

/**
 * Agrega estadísticas de contribución por motor a partir de evaluaciones recientes.
 * Útil para el diagnóstico de qué motores funcionan mejor.
 *
 * @param {number} [ventana=30]
 * @returns {Promise<Map<string, {hits, total, hitRate}>>}
 */
export async function getMotorContributions(ventana = 30) {
  const { data: evals, error } = await getRecentEvaluations(ventana);
  if (error || !evals?.length) return new Map();

  const stats = new Map();

  const _ensure = (m) => {
    if (!stats.has(m)) stats.set(m, { hits: 0, total: 0 });
  };

  for (const ev of evals) {
    const correctos = ev.motores_correctos ?? [];
    const fallidos  = ev.motores_fallidos  ?? [];

    for (const m of correctos) {
      _ensure(m);
      const s = stats.get(m);
      s.hits++;
      s.total++;
    }
    for (const m of fallidos) {
      _ensure(m);
      stats.get(m).total++;
    }
  }

  for (const [m, s] of stats) {
    s.hitRate = s.total > 0 ? s.hits / s.total : 0;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Hook de integración: llamar al registrar un nuevo sorteo
// ---------------------------------------------------------------------------

/**
 * Punto de entrada integrado con el flujo principal de registro de sorteos.
 * Se llama desde storage.js / el flujo de registrarResultado.
 *
 * @param {object} draw  - sorteo recién registrado
 */
export async function onSorteoRegistrado(draw) {
  try {
    const result = await evaluarSorteo(draw, { persistir: true, verbose: false });
    return result;
  } catch (e) {
    console.warn('[evaluation-engine] onSorteoRegistrado error:', e?.message);
    return null;
  }
}
