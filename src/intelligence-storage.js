/**
 * intelligence-storage.js
 * Capa de acceso a datos para las tablas del sistema de inteligencia adversarial.
 * Todas las funciones son async y devuelven { data, error }.
 * No modifica ninguna tabla existente del sistema original.
 */

import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// STRATEGY EVENTS
// ---------------------------------------------------------------------------

export async function insertStrategyEvent(event) {
  const { data, error } = await supabase
    .from('strategy_events')
    .insert({
      draw_id:       event.drawId       ?? null,
      strategy_id:   event.strategyId,
      numero:        event.numero,
      numero_origen: event.numeroOrigen ?? null,
      tipo_variante: event.tipoVariante ?? null,
      turno:         event.turno        ?? null,
      fecha:         event.fecha,
      confianza:     event.confianza    ?? 0,
      validado:      false,
      notas:         event.notas        ?? null,
    })
    .select()
    .single();
  return { data, error };
}

export async function getStrategyEventsByFecha(fechaDesde, fechaHasta) {
  const { data, error } = await supabase
    .from('strategy_events')
    .select('*')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta)
    .order('fecha', { ascending: false });
  return { data, error };
}

export async function getStrategyFrequency(windowDays = 60) {
  const desde = new Date();
  desde.setDate(desde.getDate() - windowDays);
  const { data, error } = await supabase
    .from('strategy_events')
    .select('strategy_id, confianza')
    .gte('fecha', desde.toISOString().slice(0, 10));
  if (error) return { data: null, error };
  const freq = {};
  for (const row of data) {
    freq[row.strategy_id] = (freq[row.strategy_id] || 0) + 1;
  }
  return { data: freq, error: null };
}

// ---------------------------------------------------------------------------
// SEQUENCE RESOLUTIONS
// ---------------------------------------------------------------------------

export async function insertSequenceResolution(res) {
  const { data, error } = await supabase
    .from('sequence_resolutions')
    .insert({
      numero_origen:       res.numeroOrigen,
      numero_resolucion:   res.numeroResolucion,
      tipo_variante:       res.tipoVariante      ?? 'crudo',
      sorteos_gap:         res.sorteosGap,
      dias_gap:            res.diasGap,
      mismo_dia:           res.mismoDia          ?? false,
      turno_origen:        res.turnoOrigen        ?? null,
      turno_resolucion:    res.turnoResolucion    ?? null,
      fecha_origen:        res.fechaOrigen,
      fecha_resolucion:    res.fechaResolucion,
      draw_origen_id:      res.drawOrigenId       ?? null,
      draw_resolucion_id:  res.drawResolucionId   ?? null,
      strategy_id:         res.strategyId         ?? null,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Devuelve los stats agregados de un par origen→destino.
 * Usa la vista sequence_resolution_stats.
 */
export async function getSequenceStats(numeroOrigen, numeroResolucion = null) {
  let query = supabase
    .from('sequence_resolution_stats')
    .select('*')
    .eq('numero_origen', numeroOrigen);
  if (numeroResolucion !== null) {
    query = query.eq('numero_resolucion', numeroResolucion);
  }
  const { data, error } = await query.order('total_instancias', { ascending: false });
  return { data, error };
}

/**
 * Devuelve todas las resoluciones históricas de un origen,
 * ordenadas por fecha descendente. Útil para análisis detallado.
 */
export async function getSequenceHistory(numeroOrigen, limit = 50) {
  const { data, error } = await supabase
    .from('sequence_resolutions')
    .select('*')
    .eq('numero_origen', numeroOrigen)
    .order('fecha_origen', { ascending: false })
    .limit(limit);
  return { data, error };
}

export async function getIntradayResolutions(limit = 100) {
  const { data, error } = await supabase
    .from('sequence_resolutions')
    .select('*')
    .eq('mismo_dia', true)
    .order('fecha_origen', { ascending: false })
    .limit(limit);
  return { data, error };
}

// ---------------------------------------------------------------------------
// RECOVERY EPISODES
// ---------------------------------------------------------------------------

export async function insertRecoveryEpisode(episode) {
  const { data, error } = await supabase
    .from('recovery_episodes')
    .insert({
      tipo_evento:          episode.tipoEvento,
      fecha_inicio:         episode.fechaInicio,
      fecha_fin:            episode.fechaFin             ?? null,
      duracion_sorteos:     episode.duracionSorteos       ?? null,
      numeros_evitados:     episode.numerosEvitados       ?? [],
      numeros_favorecidos:  episode.numerosFavorecidos    ?? [],
      estrategia_activa:    episode.estrategiaActiva      ?? null,
      regimen_detectado:    episode.regimenDetectado      ?? null,
      resolucion:           episode.resolucion            ?? null,
      score_impacto:        episode.scoreImpacto          ?? null,
      notas:                episode.notas                 ?? null,
    })
    .select()
    .single();
  return { data, error };
}

export async function closeRecoveryEpisode(id, { fechaFin, duracionSorteos, resolucion, notas }) {
  const { data, error } = await supabase
    .from('recovery_episodes')
    .update({ fecha_fin: fechaFin, duracion_sorteos: duracionSorteos, resolucion, notas })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function getOpenRecoveryEpisode() {
  const { data, error } = await supabase
    .from('recovery_episodes')
    .select('*')
    .is('fecha_fin', null)
    .order('fecha_inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function getRecoveryEpisodesByTipo(tipoEvento) {
  const { data, error } = await supabase
    .from('recovery_episodes')
    .select('*')
    .eq('tipo_evento', tipoEvento)
    .not('fecha_fin', 'is', null)
    .order('fecha_inicio', { ascending: false });
  return { data, error };
}

// ---------------------------------------------------------------------------
// PUBLIC PRESSURE
// ---------------------------------------------------------------------------

export async function upsertPublicPressure(entry) {
  const { data, error } = await supabase
    .from('public_pressure')
    .upsert({
      numero:  entry.numero,
      fecha:   entry.fecha,
      turno:   entry.turno ?? null,
      presion: entry.presion,
      fuentes: entry.fuentes ?? {},
    }, { onConflict: 'numero,fecha,turno' })
    .select()
    .single();
  return { data, error };
}

export async function getPressureForFecha(fecha, turno = null) {
  let query = supabase
    .from('public_pressure')
    .select('numero, presion, fuentes')
    .eq('fecha', fecha);
  if (turno) query = query.eq('turno', turno);
  const { data, error } = await query;
  if (error) return { data: null, error };
  const map = {};
  for (const row of data) map[row.numero] = { presion: row.presion, fuentes: row.fuentes };
  return { data: map, error: null };
}

// ---------------------------------------------------------------------------
// INTRADAY PATTERNS
// ---------------------------------------------------------------------------

export async function insertIntradayPattern(pattern) {
  const { data, error } = await supabase
    .from('intraday_patterns')
    .insert({
      turno_a:     pattern.turnoA,
      numero_a:    pattern.numeroA,
      turno_b:     pattern.turnoB,
      numero_b:    pattern.numeroB,
      relacion:    pattern.relacion,
      fecha:       pattern.fecha,
      confirmado:  pattern.confirmado  ?? true,
      strategy_id: pattern.strategyId ?? 'S03',
    })
    .select()
    .single();
  return { data, error };
}

/**
 * ¿Con qué frecuencia La Casa juega vuelta intra-día en turnos A→B?
 */
export async function getIntradayFrequency(turnoA, turnoB, windowDays = 90) {
  const desde = new Date();
  desde.setDate(desde.getDate() - windowDays);
  const { data, error } = await supabase
    .from('intraday_patterns')
    .select('relacion, numero_a, numero_b')
    .eq('turno_a', turnoA)
    .eq('turno_b', turnoB)
    .gte('fecha', desde.toISOString().slice(0, 10));
  return { data, error };
}

// ---------------------------------------------------------------------------
// SYSTEM EVALUATIONS
// ---------------------------------------------------------------------------

export async function insertEvaluation(evaluation) {
  const { data, error } = await supabase
    .from('system_evaluations')
    .insert({
      draw_id:            evaluation.drawId            ?? null,
      prediction_log_id:  evaluation.predictionLogId   ?? null,
      fecha:              evaluation.fecha,
      turno:              evaluation.turno              ?? null,
      numero_real:        evaluation.numeroReal,
      posicion_en_lista:  evaluation.posicionEnLista    ?? null,
      en_top1:            evaluation.enTop1             ?? false,
      en_top3:            evaluation.enTop3             ?? false,
      en_top5:            evaluation.enTop5             ?? false,
      en_top10:           evaluation.enTop10            ?? false,
      ausente:            evaluation.ausente            ?? false,
      score_asignado:     evaluation.scoreAsignado      ?? null,
      tipo_evaluacion:    evaluation.tipoEvaluacion     ?? 'B',
      razon_coherente:    evaluation.razonCoherente     ?? null,
      regimen_activo:     evaluation.regimenActivo      ?? null,
      estrategia_activa:  evaluation.estrategiaActiva   ?? null,
      motores_correctos:  evaluation.motoresCorrectos   ?? [],
      motores_fallidos:   evaluation.motoresFallidos    ?? [],
      score_global_30d:   evaluation.scoreGlobal30d     ?? null,
      en_modo_crisis:     evaluation.enModoCrisis       ?? false,
      notas_diagnostico:  evaluation.notasDiagnostico   ?? null,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Devuelve las últimas N evaluaciones para calcular el score global.
 */
export async function getRecentEvaluations(limit = 30) {
  const { data, error } = await supabase
    .from('system_evaluations')
    .select('*')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  return { data, error };
}

/**
 * Devuelve el score global actual desde la vista materializada.
 */
export async function getCurrentScore() {
  const { data, error } = await supabase
    .from('system_current_score')
    .select('*')
    .single();
  return { data, error };
}

/**
 * Rendimiento por motor en las últimas N evaluaciones.
 * Devuelve un mapa: { markov_o1: { aciertos, total, rate }, ... }
 */
export async function getMotorPerformance(limit = 30) {
  const { data: evals, error } = await getRecentEvaluations(limit);
  if (error) return { data: null, error };

  const motores = {};
  for (const ev of evals) {
    const acertaron = ev.en_top5;
    for (const m of (ev.motores_correctos || [])) {
      if (!motores[m]) motores[m] = { aciertos: 0, total: 0 };
      motores[m].total++;
      if (acertaron) motores[m].aciertos++;
    }
    for (const m of (ev.motores_fallidos || [])) {
      if (!motores[m]) motores[m] = { aciertos: 0, total: 0 };
      motores[m].total++;
    }
  }
  for (const m of Object.keys(motores)) {
    const { aciertos, total } = motores[m];
    motores[m].rate = total > 0 ? aciertos / total : 0;
  }
  return { data: motores, error: null };
}

// ---------------------------------------------------------------------------
// SYSTEM SCORE HISTORY
// ---------------------------------------------------------------------------

export async function insertScoreSnapshot(snapshot) {
  const { data, error } = await supabase
    .from('system_score_history')
    .insert({
      fecha:              snapshot.fecha,
      ventana_sorteos:    snapshot.ventanaSorteos    ?? 30,
      hit_rate_top1:      snapshot.hitRateTop1       ?? 0,
      hit_rate_top3:      snapshot.hitRateTop3       ?? 0,
      hit_rate_top5:      snapshot.hitRateTop5       ?? 0,
      coherencia:         snapshot.coherencia        ?? 0,
      score_global:       snapshot.scoreGlobal       ?? 0,
      regimen:            snapshot.regimen           ?? null,
      pesos_activos:      snapshot.pesosActivos      ?? {},
      modo_crisis:        snapshot.modoCrisis        ?? false,
      sorteos_en_crisis:  snapshot.sorteosEnCrisis   ?? 0,
      diagnostico:        snapshot.diagnostico       ?? null,
    })
    .select()
    .single();
  return { data, error };
}

export async function getScoreHistory(limit = 90) {
  const { data, error } = await supabase
    .from('system_score_history')
    .select('fecha, hit_rate_top1, hit_rate_top3, hit_rate_top5, score_global, modo_crisis, regimen')
    .order('fecha', { ascending: false })
    .limit(limit);
  return { data, error };
}

// ---------------------------------------------------------------------------
// REGIME CHANGEPOINTS
// ---------------------------------------------------------------------------

export async function insertChangepoint(cp) {
  const { data, error } = await supabase
    .from('regime_changepoints')
    .insert({
      fecha:             cp.fecha,
      sorteo_numero:     cp.sorteoNumero    ?? null,
      regimen_anterior:  cp.regimenAnterior ?? null,
      regimen_nuevo:     cp.regimenNuevo,
      kl_divergence:     cp.klDivergence    ?? null,
      p_valor:           cp.pValor          ?? null,
      confianza:         cp.confianza       ?? 0,
      descripcion:       cp.descripcion     ?? null,
      confirmado:        false,
    })
    .select()
    .single();
  return { data, error };
}

export async function getLastChangepoint() {
  const { data, error } = await supabase
    .from('regime_changepoints')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

// ---------------------------------------------------------------------------
// ACTIVE SEQUENCES
// ---------------------------------------------------------------------------

export async function openSequence(seq) {
  const { data, error } = await supabase
    .from('active_sequences')
    .insert({
      numero_origen:         seq.numeroOrigen,
      numero_destino:        seq.numeroDestino,
      tipo_relacion:         seq.tipoRelacion          ?? 'relativo',
      draw_origen_id:        seq.drawOrigenId          ?? null,
      fecha_activacion:      seq.fechaActivacion,
      turno_activacion:      seq.turnoActivacion       ?? null,
      sorteos_transcurridos: 0,
      gap_media_historica:   seq.gapMediaHistorica     ?? null,
      gap_sigma_historica:   seq.gapSigmaHistorica     ?? null,
      estado:                'abierta',
    })
    .select()
    .single();
  return { data, error };
}

export async function getOpenSequences() {
  const { data, error } = await supabase
    .from('active_sequences')
    .select('*')
    .eq('estado', 'abierta')
    .order('fecha_activacion', { ascending: false });
  return { data, error };
}

export async function incrementSequenceCounters(ids) {
  if (!ids || ids.length === 0) return { data: null, error: null };
  const { data, error } = await supabase.rpc('increment_sequence_counters', { ids });
  return { data, error };
}

export async function resolveSequence(id, { numeroVariante, tipoVariante, estado, fechaCierre }) {
  const { data, error } = await supabase
    .from('active_sequences')
    .update({
      variante_pagada:      numeroVariante  ?? null,
      tipo_variante_pagada: tipoVariante    ?? null,
      estado:               estado          ?? 'resuelta_directa',
      fecha_cierre:         fechaCierre,
    })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function expireStaleSequences(maxSorteos = 30) {
  const { data, error } = await supabase
    .from('active_sequences')
    .update({ estado: 'expirada' })
    .eq('estado', 'abierta')
    .gt('sorteos_transcurridos', maxSorteos)
    .select();
  return { data, error };
}
