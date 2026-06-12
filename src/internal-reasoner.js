/**
 * internal-reasoner.js
 *
 * El "diálogo interno" del sistema. Se ejecuta antes de generar candidatos
 * y produce un contexto enriquecido que el signal-engine y la UI consumen.
 *
 * Pregunta secuencialmente:
 *   1. ¿Qué régimen está activo?
 *   2. ¿Hay secuencias activas? ¿Ya fueron resueltas (directa o variante)?
 *   3. ¿Hay patrones intra-día relevantes para el turno actual?
 *   4. ¿Qué números tienen momento de liberación cercano?
 *   5. ¿Qué alertas críticas existen (vencidos extremos, anomalías)?
 *   6. Para cada candidato preliminar: auditoría individual completa
 *   7. Síntesis: recomendaciones con narrativa coherente
 *
 * Exports:
 *   razonar(draws, opts)                → ContextoRazonado
 *   auditarCandidato(numero, ctx)       → AuditoriaNumero
 *   buildNarrativa(candidato, ctx)      → string
 */

import { detectarRegimen, getAjustesPorRegimen } from './regime-detector.js';
import { calcularPresion, getMomentoLiberacion, reportePresion } from './pressure-engine.js';
import { proyectarSecuencias, secuenciasQueApuntan, seqSignals } from './sequence-engine.js';
import { clasificarRelacionSync }  from './variant-resolver.js';
import { getRecentEvaluations, getCurrentScore } from './intelligence-storage.js';
import { getPesosActivos }         from './weight-optimizer.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PAD = n => String(n).padStart(2, '0');

const SALADITOS = new Set([
  0, 11, 22, 33, 44, 55, 66, 77, 88, 99,
  10, 20, 30, 40, 50, 60, 70, 80, 90,
  5, 15, 25, 35, 45, 65, 75, 85, 95,
]);

// ---------------------------------------------------------------------------
// Carga de contexto compartido
// ---------------------------------------------------------------------------

let _ctxCache = null;
async function loadCtx() {
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

function getFamilia(guia, n) {
  const e = guia[PAD(n)] || guia[String(n)];
  return e?.familia ?? null;
}

function getSimbolo(guia, n) {
  const e = guia[PAD(n)] || guia[String(n)];
  return e?.simbolo ?? PAD(n);
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Ejecuta el razonamiento completo y devuelve el contexto enriquecido.
 *
 * @param {Array}  draws - sorteos recientes (reciente primero, últimos 60+)
 * @param {object} opts
 * @param {string} [opts.turno]           - turno objetivo (ej: '3PM')
 * @param {string} [opts.fecha]           - fecha objetivo
 * @param {Array}  [opts.candidatosPrev]  - candidatos del signal-engine para auditar
 * @returns {Promise<ContextoRazonado>}
 */
export async function razonar(draws, opts = {}) {
  const { turno, fecha, candidatosPrev = [] } = opts;

  const ctx = await loadCtx();

  // ── Paso 1: Régimen activo ─────────────────────────────────────────────
  const regimenInfo = detectarRegimen(draws);

  // ── Paso 2: Salud del sistema ──────────────────────────────────────────
  const [scoreInfo, pesosActivos] = await Promise.all([
    getCurrentScore().catch(() => ({ data: null })),
    getPesosActivos(regimenInfo.regimen),
  ]);

  // ── Paso 3: Presión pública ────────────────────────────────────────────
  const presionMap = await calcularPresion(draws, { turno });

  // ── Paso 4: Secuencias activas con proyección ──────────────────────────
  const secuencias = await proyectarSecuencias(draws, presionMap);

  // ── Paso 5: Señales de secuencia para candidatos ───────────────────────
  const seqSigs = seqSignals(secuencias);

  // ── Paso 6: Liberaciones cercanas ─────────────────────────────────────
  const { alta: presionAlta, cerca: liberacionesCercanas } = reportePresion(presionMap, 8);

  // ── Paso 7: Alertas ────────────────────────────────────────────────────
  const alertas = _generarAlertas(draws, presionMap, regimenInfo, ctx);

  // ── Paso 8: Patrones intra-día ─────────────────────────────────────────
  const intradayContext = turno ? _analizarContextoIntraday(draws, turno, ctx) : null;

  // ── Paso 9: Auditoría individual de candidatos previos ─────────────────
  const candidatosAuditados = await Promise.all(
    candidatosPrev.slice(0, 10).map(c =>
      auditarCandidato(c.numero ?? c, {
        draws, presionMap, secuencias, seqSigs, ctx, regimenInfo, turno,
      })
    )
  );

  // ── Paso 10: Síntesis ──────────────────────────────────────────────────
  const sintesis = _construirSintesis(
    regimenInfo, secuencias, liberacionesCercanas, alertas, candidatosAuditados
  );

  return {
    fecha:            fecha ?? draws[0]?.fecha,
    turno:            turno ?? null,
    regimen:          regimenInfo,
    pesosActivos,
    scoreInfo:        scoreInfo?.data ?? null,
    presionAlta:      presionAlta.slice(0, 6),
    liberacionesCercanas: liberacionesCercanas.slice(0, 6),
    secuencias:       secuencias.slice(0, 8),
    seqSigs,
    alertas,
    intradayContext,
    candidatosAuditados,
    sintesis,
  };
}

// ---------------------------------------------------------------------------
// Auditoría individual de un número
// ---------------------------------------------------------------------------

/**
 * Para un número candidato, genera una auditoría completa respondiendo:
 * - ¿Tiene secuencias activas que lo llamen?
 * - ¿Cuál es su presión pública y momento de liberación?
 * - ¿Cayó alguna variante suya recientemente?
 * - ¿Está en la familia de un número muy reciente?
 * - ¿Qué recomendación da el sistema?
 *
 * @param {number} numero
 * @param {object} ctx - { draws, presionMap, secuencias, seqSigs, ctx, regimenInfo, turno }
 * @returns {Promise<AuditoriaNumero>}
 */
export async function auditarCandidato(numero, ctx = {}) {
  const { draws = [], presionMap = new Map(), secuencias = [], seqSigs = new Map(),
          ctx: relCtx, regimenInfo = {} } = ctx;

  const relCtxFull = relCtx ?? await loadCtx();
  const ps  = presionMap.get(numero) ?? { presion: 0.5 };
  const sig = seqSigs.get(numero)    ?? null;

  // ── Secuencias que apuntan a este número ──────────────────────────────
  const secsApuntando = secuencias.filter(s =>
    s.destino === numero ||
    s.candidatos?.some(c => c.numero === numero)
  );

  // ── Variante pagada recientemente ─────────────────────────────────────
  const recientes10 = (draws ?? []).slice(0, 10);
  const variantesPagadas = recientes10
    .map(d => {
      const rel = clasificarRelacionSync(numero, d.numero, relCtxFull);
      return rel ? { sorteo: d, relacion: rel } : null;
    })
    .filter(Boolean);

  // ── Familia del número reciente ───────────────────────────────────────
  const familiaNum = getFamilia(relCtxFull.guia, numero);
  const conflictoFamilia = recientes10.slice(0, 3).some(d => {
    const fam = getFamilia(relCtxFull.guia, d.numero);
    return fam && fam === familiaNum && d.numero !== numero;
  });

  // ── Recomendación ─────────────────────────────────────────────────────
  const recomendacion = _calcularRecomendacion({
    presion:          ps.presion,
    liberacionCerca:  ps.liberacion?.cerca ?? false,
    secsApuntando:    secsApuntando.length,
    variantesPagadas: variantesPagadas.length,
    conflictoFamilia,
    seqScore:         sig?.score ?? 0,
    regimen:          regimenInfo.regimen ?? 'normal',
  });

  return {
    numero,
    simbolo:          getSimbolo(relCtxFull.guia, numero),
    familia:          familiaNum,
    presion:          ps.presion,
    liberacionCerca:  ps.liberacion?.cerca ?? false,
    momentoLib:       ps.liberacion,
    secsApuntando,
    variantesPagadas,
    conflictoFamilia,
    seqScore:         sig?.score ?? 0,
    seqRazones:       sig?.razones ?? [],
    recomendacion,
    narrativa:        buildNarrativa(numero, {
      simbolo:         getSimbolo(relCtxFull.guia, numero),
      presion:         ps.presion,
      liberacionCerca: ps.liberacion?.cerca ?? false,
      momentoLib:      ps.liberacion,
      secsApuntando,
      variantesPagadas,
      conflictoFamilia,
      recomendacion,
    }),
  };
}

// ---------------------------------------------------------------------------
// Narrativa textual (para UI)
// ---------------------------------------------------------------------------

/**
 * Genera el texto explicativo que el sistema muestra al usuario para un candidato.
 */
export function buildNarrativa(numero, info = {}) {
  const {
    simbolo = PAD(numero),
    presion = 0.5,
    liberacionCerca = false,
    momentoLib,
    secsApuntando = [],
    variantesPagadas = [],
    conflictoFamilia = false,
    recomendacion = 'observar',
  } = info;

  const partes = [];

  // Secuencias activas
  if (secsApuntando.length) {
    const s = secsApuntando[0];
    partes.push(
      `Secuencia activa: ${PAD(s.origen)}→${PAD(s.destino)} ` +
      `(${s.sorteosTranscurridos} sorteos transcurridos` +
      (s.gapMedia ? `, media histórica: ${s.gapMedia.toFixed(1)}` : '') + ').'
    );
  }

  // Presión y liberación
  if (liberacionCerca) {
    partes.push(`Momento de liberación detectado: ${momentoLib?.descripcion ?? 'presión baja y gap en rango óptimo'}.`);
  } else if (presion > 0.65) {
    partes.push(`Presión pública ALTA (${(presion * 100).toFixed(0)}%) — La Casa lo evita activamente.`);
  } else if (presion < 0.30) {
    partes.push(`Presión pública BAJA (${(presion * 100).toFixed(0)}%) — número libre de presión.`);
  }

  // Variantes pagadas
  if (variantesPagadas.length) {
    const v = variantesPagadas[0];
    partes.push(
      `Variante pagada recientemente: ${PAD(v.sorteo.numero)} ` +
      `(${v.relacion.tipo}, hace ${_diasDesde(v.sorteo.fecha)} día(s)).`
    );
  }

  // Conflicto de familia
  if (conflictoFamilia) {
    partes.push('Familia semántica activa en los últimos 3 sorteos — riesgo de bloqueo.');
  }

  if (!partes.length) {
    partes.push('Sin señales contextuales fuertes en este momento.');
  }

  // Conclusión
  const concl = {
    fuerte:    `✅ CANDIDATO FUERTE — ${simbolo} reúne señales convergentes.`,
    moderado:  `🟡 CANDIDATO MODERADO — ${simbolo} con señales mixtas.`,
    esperar:   `⏳ ESPERAR — ${simbolo} tiene presión alta; mejor aguardar liberación.`,
    descartar: `❌ DESCARTAR — ${simbolo} no tiene señales favorables actualmente.`,
    observar:  `👁 OBSERVAR — ${simbolo} con contexto neutro.`,
  };

  partes.push(concl[recomendacion] ?? concl.observar);
  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Alertas del sistema
// ---------------------------------------------------------------------------

function _generarAlertas(draws, presionMap, regimenInfo, ctx) {
  const alertas = [];

  // Alerta: régimen no normal
  if (regimenInfo.regimen !== 'normal' && regimenInfo.confianza > 0.4) {
    alertas.push({
      nivel:    'warning',
      tipo:     'regimen',
      mensaje:  `Régimen activo: ${regimenInfo.regimen}. ${regimenInfo.descripcion}`,
    });
  }

  // Alerta: números muy vencidos (gap > media * 2.5)
  for (const [n, ps] of presionMap) {
    if (ps.gapActual && ps.media && ps.gapActual > ps.media * 2.5) {
      alertas.push({
        nivel:   'danger',
        tipo:    'vencido',
        numero:   n,
        simbolo:  getSimbolo(ctx.guia, n),
        mensaje: `${PAD(n)} ${getSimbolo(ctx.guia, n)} lleva ${ps.gapActual.toFixed(0)} días (media: ${ps.media.toFixed(1)}, ${(ps.gapActual / ps.media).toFixed(1)}× sobrepasada).`,
      });
    }
  }

  // Alerta: sin dobles en los últimos 15 sorteos
  const ultimos15 = draws.slice(0, 15);
  const dobles15  = ultimos15.filter(d => d.numero % 11 === 0 && d.numero <= 99).length;
  if (dobles15 === 0 && ultimos15.length >= 15) {
    alertas.push({
      nivel:   'info',
      tipo:    'bloqueo_dobles',
      mensaje: 'Sin dobles en los últimos 15 sorteos — bloqueo posiblemente activo.',
    });
  }

  // Alerta: repetición reciente (S11)
  const ultimos5 = draws.slice(0, 5).map(d => d.numero);
  const repetidos = ultimos5.filter((n, i) => ultimos5.indexOf(n) !== i);
  for (const r of new Set(repetidos)) {
    alertas.push({
      nivel:   'info',
      tipo:    'repeticion',
      numero:   r,
      mensaje: `${PAD(r)} repitió en los últimos 5 sorteos (S11 activo).`,
    });
  }

  return alertas.slice(0, 10); // máximo 10 alertas
}

// ---------------------------------------------------------------------------
// Contexto intra-día
// ---------------------------------------------------------------------------

function _analizarContextoIntraday(draws, turnoActual, ctx) {
  const TURNOS_ORDEN = { '11AM': 0, '12PM': 1, '3PM': 2, '6PM': 3, '9PM': 4 };
  const ordenActual  = TURNOS_ORDEN[turnoActual] ?? -1;

  // Sorteos de hoy en turnos anteriores
  const hoy       = draws[0]?.fecha;
  const prevHoy   = draws.filter(d =>
    d.fecha === hoy && (TURNOS_ORDEN[d.horario] ?? -1) < ordenActual
  );

  if (!prevHoy.length) return null;

  const posiblesRelaciones = [];
  for (const prev of prevHoy) {
    // Números relacionados con el sorteo previo
    const relCtxFull = ctx;
    for (let n = 0; n <= 99; n++) {
      const rel = clasificarRelacionSync(prev.numero, n, relCtxFull);
      if (rel && rel.peso >= 0.70) {
        posiblesRelaciones.push({
          origen:    prev.numero,
          turnoOrig: prev.horario,
          candidato: n,
          relacion:  rel,
        });
      }
    }
  }

  // Ordenar por peso
  posiblesRelaciones.sort((a, b) => b.relacion.peso - a.relacion.peso);

  return {
    sorteosPrevHoy:    prevHoy,
    candidatosIntraday: posiblesRelaciones.slice(0, 8),
    descripcion: prevHoy.length
      ? `Hoy cayeron: ${prevHoy.map(d => PAD(d.numero)).join(', ')}. ` +
        `${posiblesRelaciones.length} candidatos intra-día potenciales.`
      : 'Sin sorteos previos hoy.',
  };
}

// ---------------------------------------------------------------------------
// Síntesis narrativa del contexto completo
// ---------------------------------------------------------------------------

function _construirSintesis(regimenInfo, secuencias, liberaciones, alertas, auditados) {
  const partes = [];

  // Estado general
  const regimenNombre = regimenInfo.regimen.replace(/_/g, ' ');
  partes.push(`Régimen: ${regimenNombre}.`);

  // Secuencias más urgentes
  const secsUrgentes = secuencias.filter(s => s.probResolucion > 0.15).slice(0, 3);
  if (secsUrgentes.length) {
    const lista = secsUrgentes.map(s =>
      `${s.origenPad}→${s.destinoPad} (${(s.probResolucion * 100).toFixed(0)}%)`
    ).join(', ');
    partes.push(`Secuencias urgentes: ${lista}.`);
  }

  // Liberaciones cercanas
  if (liberaciones.length) {
    const lista = liberaciones.slice(0, 3)
      .map(s => `${PAD(s.numero)} (lib. ${(s.liberacion.score * 100).toFixed(0)}%)`)
      .join(', ');
    partes.push(`Posibles liberaciones: ${lista}.`);
  }

  // Alertas críticas
  const peligros = alertas.filter(a => a.nivel === 'danger');
  if (peligros.length) {
    partes.push(`⚠ ${peligros.length} número(s) extremadamente vencido(s).`);
  }

  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Recomendación por número
// ---------------------------------------------------------------------------

function _calcularRecomendacion({ presion, liberacionCerca, secsApuntando,
    variantesPagadas, conflictoFamilia, seqScore, regimen }) {

  let score = 0;

  if (liberacionCerca)     score += 3;
  if (secsApuntando > 0)   score += 2;
  if (seqScore > 60)       score += 2;
  if (variantesPagadas > 0) score += 1;
  if (presion < 0.30)      score += 2;
  if (presion > 0.65)      score -= 3;
  if (conflictoFamilia)    score -= 2;
  if (regimen === 'post_superpremio' && presion > 0.5) score -= 2;

  if (score >= 5) return 'fuerte';
  if (score >= 3) return 'moderado';
  if (score >= 1) return 'observar';
  if (score <= -2) return 'esperar';
  return 'observar';
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function _diasDesde(fechaStr) {
  if (!fechaStr) return '?';
  return Math.round((Date.now() - new Date(fechaStr)) / 86400000);
}
