/**
 * diagnostic-engine.js
 *
 * Análisis de causa raíz cuando el score cae o cuando el sistema está en crisis.
 * Identifica PATRONES en los errores, no solo su cantidad.
 *
 * Diagnósticos posibles:
 *   SENIAL_AUSENTE    — tipo B dominante: el motor no ve la señal
 *   RANKING_INCORRECTO — tipo A dominante: detecta pero rankea mal
 *   VARIANTE_PAGADA   — La Casa pagó la variante del número predicho (tipo D)
 *   CAMBIO_REGIMEN    — distribución cambió, pesos desactualizados
 *   MOTOR_FALLA       — un motor específico tiene gradiente muy negativo
 *   SOBRESATURACION   — lista muy larga, señal diluida
 *   NORMAL            — sin patrón crítico detectado
 *
 * Exports:
 *   diagnosticar(opts)                   → DiagnosticoResult
 *   buildDiagnosticoHTML(diagnostico)    → string HTML para UI
 */

import { getRecentEvaluations, getMotorPerformance } from './intelligence-storage.js';
import { getScoreHistory } from './intelligence-storage.js';

const VENTANA_DIAGNOSTICO = 20;

// ---------------------------------------------------------------------------
// Análisis de patrones de error
// ---------------------------------------------------------------------------

/**
 * Analiza la distribución de tipos A/B/C/D y extrae el patrón dominante.
 */
function analizarPatronErrores(evals) {
  const n = evals.length;
  if (!n) return { patron: 'SIN_DATOS', descripcion: 'Sin evaluaciones para analizar', confianza: 0 };

  const conteo = { A: 0, B: 0, C: 0, D: 0 };
  for (const e of evals) {
    const t = e.tipo;
    if (t in conteo) conteo[t]++;
  }

  const pctA = conteo.A / n;
  const pctB = conteo.B / n;
  const pctC = conteo.C / n;

  // Patrón más crítico primero
  if (pctB > 0.55) {
    return {
      patron:      'SENIAL_AUSENTE',
      descripcion: `${(pctB * 100).toFixed(0)}% de sorteos con número completamente ausente de la lista. ` +
                   'El motor no está capturando la señal. Revisar régimen y pesos de rezago/modos.',
      confianza:   Math.min(0.95, pctB * 1.5),
      pctB,
    };
  }

  if (pctA > 0.45) {
    return {
      patron:      'RANKING_INCORRECTO',
      descripcion: `${(pctA * 100).toFixed(0)}% de errores tipo A: el número cayó pero estaba debajo de posición 5. ` +
                   'El motor detecta la señal pero rankea mal. Ajustar pesos de Markov O2 y patrones.',
      confianza:   Math.min(0.90, pctA * 1.8),
      pctA,
    };
  }

  if (pctC > 0.50) {
    return {
      patron:      'NORMAL',
      descripcion: `${(pctC * 100).toFixed(0)}% de aciertos en top-5. Sistema funcionando dentro de parámetros.`,
      confianza:   0.8,
      pctC,
    };
  }

  return {
    patron:      'MIXTO',
    descripcion: `Patrón mixto: ${(pctA*100).toFixed(0)}% ranking, ${(pctB*100).toFixed(0)}% ausente, ${(pctC*100).toFixed(0)}% aciertos.`,
    confianza:   0.5,
  };
}

/**
 * Analiza si La Casa está pagando variantes de números predichos (modo camuflaje).
 * Señal: muchos falsos positivos donde el número predicho y el ganador tienen
 * alta similitud de variante.
 */
function detectarVariantePagada(evals) {
  const casos = evals.filter(e => e.tipo === 'B' || e.tipo === 'A');
  if (casos.length < 5) return null;

  // Heurística: si hay alta concentración de errores en ciertos rangos de decena
  const decenasError = casos.map(e => Math.floor((e.numero_real ?? e.numeroReal ?? 0) / 10));
  const freqDecena   = new Array(10).fill(0);
  for (const d of decenasError) freqDecena[d]++;
  const maxFreq = Math.max(...freqDecena);

  if (maxFreq / casos.length > 0.40) {
    const decenaCaliente = freqDecena.indexOf(maxFreq);
    return {
      detectado:   true,
      descripcion: `Concentración inusual de errores en decena ${decenaCaliente}X ` +
                   `(${maxFreq}/${casos.length} fallos). ` +
                   'Posible bloqueo selectivo o pago por variante en esa decena.',
      decenaCaliente,
      confianza: maxFreq / casos.length,
    };
  }

  return null;
}

/**
 * Analiza si hay un motor específico con desempeño sistémicamente bajo.
 */
async function detectarMotorFallido(ventana = VENTANA_DIAGNOSTICO) {
  try {
    const perf = await getMotorPerformance(ventana);
    if (!perf || !Object.keys(perf).length) return null;

    const motorMasFallido = Object.entries(perf)
      .filter(([, v]) => v.total >= 5)
      .sort((a, b) => (a[1].hitRate ?? 0) - (b[1].hitRate ?? 0))[0];

    if (!motorMasFallido) return null;

    const [nombre, stats] = motorMasFallido;
    if ((stats.hitRate ?? 1) < 0.25) {
      return {
        detectado:   true,
        motor:       nombre,
        hitRate:     stats.hitRate,
        descripcion: `Motor "${nombre}" con hit rate ${(stats.hitRate * 100).toFixed(0)}% ` +
                     `en las últimas ${stats.total} participaciones. ` +
                     'Peso debería reducirse en próxima optimización.',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detecta si el score está en tendencia de caída acelerada.
 */
async function detectarTendenciaCaida() {
  try {
    const { data: historia } = await getScoreHistory(10);
    if (!historia?.length || historia.length < 4) return null;

    const scores = historia
      .slice(0, 8)
      .map(h => h.score_global ?? h.scoreGlobal ?? 0)
      .reverse(); // cronológico

    // Regresión lineal simple
    const n     = scores.length;
    const sumX  = scores.reduce((acc, _, i) => acc + i, 0);
    const sumY  = scores.reduce((acc, v) => acc + v, 0);
    const sumXY = scores.reduce((acc, v, i) => acc + i * v, 0);
    const sumX2 = scores.reduce((acc, _, i) => acc + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope < -0.01) {
      return {
        detectado:   true,
        pendiente:   slope,
        descripcion: `Score cayendo ${Math.abs(slope * 100).toFixed(1)}% por sorteo en promedio. ` +
                     'Tendencia negativa acelerada.',
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diagnóstico principal
// ---------------------------------------------------------------------------

/**
 * Ejecuta el diagnóstico completo del sistema.
 *
 * @param {object} [opts]
 * @param {number} [opts.ventana=20]
 * @param {boolean}[opts.verbose=false]
 * @returns {Promise<DiagnosticoResult>}
 */
export async function diagnosticar(opts = {}) {
  const { ventana = VENTANA_DIAGNOSTICO, verbose = false } = opts;

  const { data: evals, error } = await getRecentEvaluations(ventana);
  if (error || !evals?.length) {
    return {
      estado:      'SIN_DATOS',
      descripcion: 'Sin evaluaciones disponibles para diagnóstico',
      hallazgos:   [],
      accionable:  false,
    };
  }

  const hallazgos = [];

  // 1. Patrón de errores
  const patron = analizarPatronErrores(evals);
  hallazgos.push({
    tipo:        'patron_errores',
    severidad:   patron.patron === 'NORMAL' ? 'info' : patron.patron === 'SIN_DATOS' ? 'info' : 'advertencia',
    ...patron,
  });

  // 2. Variante pagada
  const variante = detectarVariantePagada(evals);
  if (variante?.detectado) {
    hallazgos.push({ tipo: 'variante_pagada', severidad: 'alta', ...variante });
  }

  // 3. Motor fallido
  const motorFallido = await detectarMotorFallido(ventana);
  if (motorFallido?.detectado) {
    hallazgos.push({ tipo: 'motor_fallido', severidad: 'media', ...motorFallido });
  }

  // 4. Tendencia de caída
  const tendencia = await detectarTendenciaCaida();
  if (tendencia?.detectado) {
    hallazgos.push({ tipo: 'tendencia_caida', severidad: 'alta', ...tendencia });
  }

  // Estado general
  const tienesCritico   = hallazgos.some(h => h.severidad === 'critica');
  const tieneAlta       = hallazgos.some(h => h.severidad === 'alta');
  const estado          = tienesCritico ? 'CRITICO' : tieneAlta ? 'ALERTA' : 'NORMAL';
  const accionable      = patron.patron !== 'NORMAL' && patron.patron !== 'SIN_DATOS';

  const recomendaciones = _buildRecomendaciones(patron, variante, motorFallido, tendencia);

  if (verbose) {
    console.log('[diagnostic-engine] Estado:', estado, '| Patrón:', patron.patron);
    for (const h of hallazgos) console.log(' >', h.tipo, '|', h.descripcion);
  }

  return {
    estado,
    patronDominante: patron.patron,
    descripcionPrincipal: patron.descripcion,
    hallazgos,
    recomendaciones,
    accionable,
    evaluacionesAnalizadas: evals.length,
    timestamp: new Date().toISOString(),
  };
}

function _buildRecomendaciones(patron, variante, motorFallido, tendencia) {
  const recs = [];

  switch (patron.patron) {
    case 'SENIAL_AUSENTE':
      recs.push('Ejecutar optimización de pesos con énfasis en rezago y modos');
      recs.push('Verificar si el régimen cambió (post-superpremio o modo camuflaje)');
      recs.push('Revisar si el procesamiento de estrategias históricas está actualizado');
      break;
    case 'RANKING_INCORRECTO':
      recs.push('Ajustar pesos: subir markov2 y patrones, bajar markov1');
      recs.push('Revisar si sequence-engine tiene suficientes proyecciones activas');
      break;
    case 'MIXTO':
      recs.push('Ejecutar ciclo de optimización de pesos');
      break;
  }

  if (variante?.detectado) {
    recs.push(`Investigar bloqueo en decena ${variante.decenaCaliente}X — posible cambio de régimen`);
  }

  if (motorFallido?.detectado) {
    recs.push(`Reducir peso del motor "${motorFallido.motor}" en próxima optimización`);
  }

  if (tendencia?.detectado) {
    recs.push('Score en caída acelerada — considerar reset de pesos a valores default');
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Render HTML para UI
// ---------------------------------------------------------------------------

/**
 * Genera HTML para el panel de diagnóstico en Mesa de Análisis.
 *
 * @param {object} diagnostico - resultado de diagnosticar()
 * @returns {string}
 */
export function buildDiagnosticoHTML(diagnostico) {
  if (!diagnostico || diagnostico.estado === 'SIN_DATOS') {
    return `<div class="diag-empty muted">Sin suficientes evaluaciones para diagnóstico</div>`;
  }

  const estadoIcon = { CRITICO: '🚨', ALERTA: '⚠️', NORMAL: '✅' }[diagnostico.estado] ?? '?';
  const estadoCls  = { CRITICO: 'diag--critico', ALERTA: 'diag--alerta', NORMAL: 'diag--normal' }[diagnostico.estado] ?? '';

  const hallazgosHTML = diagnostico.hallazgos
    .filter(h => h.tipo !== 'patron_errores' || h.patron !== 'NORMAL')
    .map(h => {
      const sevCls  = { critica: 'sev-critica', alta: 'sev-alta', media: 'sev-media', info: 'sev-info' }[h.severidad] ?? '';
      return `<div class="diag-hallazgo ${sevCls}">
        <span class="diag-hallazgo__tipo">${_labelTipo(h.tipo)}</span>
        <span class="diag-hallazgo__desc">${h.descripcion}</span>
      </div>`;
    }).join('');

  const recsHTML = diagnostico.recomendaciones.length
    ? `<ul class="diag-recs">${diagnostico.recomendaciones.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '';

  return `
    <div class="diag-panel ${estadoCls}">
      <div class="diag-header">
        <span class="diag-estado">${estadoIcon} ${diagnostico.estado}</span>
        <span class="diag-subtitulo muted">${diagnostico.evaluacionesAnalizadas} evaluaciones</span>
      </div>
      <div class="diag-principal">${diagnostico.descripcionPrincipal}</div>
      ${hallazgosHTML ? `<div class="diag-hallazgos">${hallazgosHTML}</div>` : ''}
      ${recsHTML ? `<div class="diag-recsTitle">Acciones recomendadas:</div>${recsHTML}` : ''}
    </div>`;
}

function _labelTipo(tipo) {
  const MAP = {
    patron_errores:  'Patrón',
    variante_pagada: 'Variante pagada',
    motor_fallido:   'Motor',
    tendencia_caida: 'Tendencia',
  };
  return MAP[tipo] ?? tipo;
}
