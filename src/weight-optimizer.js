/**
 * weight-optimizer.js
 *
 * Ajusta automáticamente los pesos del signal-engine basándose en
 * qué motores contribuyeron a aciertos reales en las últimas N evaluaciones.
 *
 * Algoritmo: Gradient Ascent sobre una ventana rolling de evaluaciones.
 *   - Por cada evaluación, identifica qué motores señalaron el número ganador
 *   - Sube el peso de motores que acertaron, baja los que fallaron
 *   - Aplica restricciones: ningún peso < MIN_PESO ni > MAX_PESO
 *   - Normaliza para que la suma sea 1.0
 *   - Persiste en la tabla knowledge de Supabase
 *   - Aplica adicionalmente los ajustes de régimen de regime-detector
 *
 * Exports:
 *   optimizarPesos(opts)           → PesosOptimizados
 *   getPesosActivos()              → SOURCE_WEIGHTS actualizados
 *   resetPesos()                   → restaura pesos por defecto
 */

import { supabase } from './supabaseClient.js';
import { getRecentEvaluations, insertScoreSnapshot } from './intelligence-storage.js';
import { getAjustesPorRegimen } from './regime-detector.js';

// ---------------------------------------------------------------------------
// Pesos por defecto (del signal-engine original)
// ---------------------------------------------------------------------------

export const PESOS_DEFAULT = Object.freeze({
  markov1:  0.28,
  markov2:  0.18,
  rezago:   0.14,
  modos:    0.18,
  patrones: 0.12,
  semanal:  0.06,
  mensual:  0.04,
});

const MOTORES = Object.keys(PESOS_DEFAULT);

// Restricciones de pesos
const MIN_PESO = 0.03;
const MAX_PESO = 0.42;

// Tasa de aprendizaje del gradient step
const LEARNING_RATE = 0.015;

// Ventana de evaluaciones para el gradient
const VENTANA_EVAL = 30;

// Clave en la tabla knowledge
const KNOWLEDGE_KEY = 'weight_optimizer_pesos';

// ---------------------------------------------------------------------------
// Persistencia en Supabase (tabla knowledge)
// ---------------------------------------------------------------------------

async function cargarPesosGuardados() {
  const { data, error } = await supabase
    .from('knowledge')
    .select('data')
    .eq('key', KNOWLEDGE_KEY)
    .maybeSingle();

  if (error || !data?.data) return null;

  const pesos = data.data;
  // Validar que tenga todos los motores
  if (!MOTORES.every(m => typeof pesos[m] === 'number')) return null;

  return pesos;
}

async function guardarPesos(pesos) {
  await supabase
    .from('knowledge')
    .upsert({
      key:        KNOWLEDGE_KEY,
      scope:      'sistema',
      data:       pesos,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
}

// ---------------------------------------------------------------------------
// Gradient step
// ---------------------------------------------------------------------------

/**
 * Calcula el gradiente a partir de un conjunto de evaluaciones.
 * Para cada evaluación:
 *   - Si el número real estaba en top-5 → gradient positivo para motores que lo señalaron
 *   - Si estaba ausente → gradient negativo para todos los motores que no lo señalaron
 *
 * @param {Array} evaluaciones
 * @returns {object} gradiente por motor
 */
function calcularGradiente(evaluaciones) {
  const grad = {};
  MOTORES.forEach(m => grad[m] = 0);

  for (const ev of evaluaciones) {
    const acerto = ev.en_top5;
    const motoresCorrectos = ev.motores_correctos ?? [];
    const motoresFallidos  = ev.motores_fallidos  ?? [];

    if (acerto) {
      // Refuerza los motores que señalaron el número correcto
      for (const m of motoresCorrectos) {
        if (grad[m] !== undefined) grad[m] += 1.0;
      }
      // Penaliza suavemente los que fallaron en este sorteo (pero acertamos igual)
      for (const m of motoresFallidos) {
        if (grad[m] !== undefined) grad[m] -= 0.3;
      }
    } else {
      // Penaliza los motores que confiadamente fallaron
      for (const m of motoresFallidos) {
        if (grad[m] !== undefined) grad[m] -= 1.0;
      }
      // Neutro para los que no participaron
    }
  }

  // Normalizar gradiente a rango [-1, 1]
  const maxAbs = Math.max(...Object.values(grad).map(Math.abs), 1);
  MOTORES.forEach(m => grad[m] = grad[m] / maxAbs);

  return grad;
}

/**
 * Aplica el gradient step y devuelve los nuevos pesos normalizados.
 */
function aplicarGradient(pesosActuales, gradiente) {
  const nuevos = {};

  for (const m of MOTORES) {
    const delta = LEARNING_RATE * gradiente[m];
    nuevos[m] = Math.max(MIN_PESO, Math.min(MAX_PESO, pesosActuales[m] + delta));
  }

  return normalizar(nuevos);
}

function normalizar(pesos) {
  const suma = MOTORES.reduce((acc, m) => acc + pesos[m], 0);
  const norm = {};
  for (const m of MOTORES) {
    norm[m] = Math.round((pesos[m] / suma) * 1000) / 1000;
  }
  // Ajustar redondeo para que sume exactamente 1.0
  const diff = 1.0 - MOTORES.reduce((acc, m) => acc + norm[m], 0);
  norm[MOTORES[0]] = Math.round((norm[MOTORES[0]] + diff) * 1000) / 1000;
  return norm;
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Ejecuta el ciclo de optimización completo:
 * 1. Carga evaluaciones recientes
 * 2. Calcula gradiente
 * 3. Aplica gradient step
 * 4. Aplica ajustes de régimen
 * 5. Persiste y devuelve pesos nuevos
 *
 * @param {object} opts
 * @param {string} [opts.regimen='normal']  - régimen activo (de regime-detector)
 * @param {boolean}[opts.persistir=true]
 * @param {boolean}[opts.verbose=false]
 * @returns {Promise<PesosOptimizados>}
 */
export async function optimizarPesos(opts = {}) {
  const { regimen = 'normal', persistir = true, verbose = false } = opts;

  // 1. Cargar pesos actuales (guardados o default)
  const pesosBase = (await cargarPesosGuardados()) ?? { ...PESOS_DEFAULT };

  // 2. Cargar evaluaciones recientes
  const { data: evaluaciones, error } = await getRecentEvaluations(VENTANA_EVAL);
  if (error || !evaluaciones?.length) {
    return {
      pesos: pesosBase,
      ajustados: false,
      razon: 'Sin evaluaciones disponibles',
    };
  }

  if (evaluaciones.length < 5) {
    return {
      pesos: pesosBase,
      ajustados: false,
      razon: `Solo ${evaluaciones.length} evaluaciones — mínimo 5 para optimizar`,
    };
  }

  // 3. Calcular gradiente y aplicar step
  const gradiente  = calcularGradiente(evaluaciones);
  const pesosGrad  = aplicarGradient(pesosBase, gradiente);

  // 4. Aplicar ajustes de régimen (multiplicadores de regime-detector)
  const ajustes    = getAjustesPorRegimen(regimen);
  const pesosRegimen = {};
  for (const m of MOTORES) {
    pesosRegimen[m] = pesosGrad[m] * (ajustes[m] ?? 1.0);
  }
  const pesosFinal = normalizar(pesosRegimen);

  // 5. Calcular métricas de las evaluaciones
  const hitTop1 = evaluaciones.filter(e => e.en_top1).length / evaluaciones.length;
  const hitTop3 = evaluaciones.filter(e => e.en_top3).length / evaluaciones.length;
  const hitTop5 = evaluaciones.filter(e => e.en_top5).length / evaluaciones.length;
  const scoreGlobal = hitTop1 * 0.40 + hitTop3 * 0.35 + hitTop5 * 0.15;
  const enCrisis = hitTop3 < 0.20;

  if (verbose) {
    console.log('[weight-optimizer] Gradiente:', gradiente);
    console.log('[weight-optimizer] Pesos antes:', pesosBase);
    console.log('[weight-optimizer] Pesos después:', pesosFinal);
    console.log('[weight-optimizer] Score global:', scoreGlobal.toFixed(3));
  }

  if (persistir) {
    await guardarPesos(pesosFinal);

    // Snapshot en system_score_history
    await insertScoreSnapshot({
      fecha:            new Date().toISOString().slice(0, 10),
      ventanaSorteos:   evaluaciones.length,
      hitRateTop1:      hitTop1,
      hitRateTop3:      hitTop3,
      hitRateTop5:      hitTop5,
      scoreGlobal,
      regimen,
      pesosActivos:     pesosFinal,
      modoCrisis:       enCrisis,
      diagnostico:      enCrisis ? _diagnosticarCrisis(evaluaciones, gradiente) : null,
    }).catch(() => {});
  }

  return {
    pesos:        pesosFinal,
    pesosAntes:   pesosBase,
    gradiente,
    ajustados:    true,
    enCrisis,
    hitRateTop1:  hitTop1,
    hitRateTop3:  hitTop3,
    hitRateTop5:  hitTop5,
    scoreGlobal,
    evaluaciones: evaluaciones.length,
    regimen,
    diagnostico:  enCrisis ? _diagnosticarCrisis(evaluaciones, gradiente) : null,
  };
}

/**
 * Devuelve los pesos activos (cargados de Supabase o default).
 * Para que el signal-engine los use en cada ejecución.
 */
export async function getPesosActivos(regimen = 'normal') {
  const guardados = await cargarPesosGuardados();
  const base      = guardados ?? { ...PESOS_DEFAULT };

  // Aplicar ajustes de régimen sobre los pesos guardados
  const ajustes = getAjustesPorRegimen(regimen);
  const ajustados = {};
  for (const m of MOTORES) {
    ajustados[m] = base[m] * (ajustes[m] ?? 1.0);
  }

  return normalizar(ajustados);
}

/**
 * Resetea los pesos al valor por defecto y borra los guardados.
 */
export async function resetPesos() {
  await guardarPesos({ ...PESOS_DEFAULT });
  return { ...PESOS_DEFAULT };
}

/**
 * Compara pesos actuales vs default para mostrar en UI.
 */
export async function diffPesos() {
  const actuales = (await cargarPesosGuardados()) ?? { ...PESOS_DEFAULT };
  const diff = {};
  for (const m of MOTORES) {
    const delta = actuales[m] - PESOS_DEFAULT[m];
    diff[m] = {
      actual:    actuales[m],
      default:   PESOS_DEFAULT[m],
      delta:     Math.round(delta * 1000) / 1000,
      direccion: delta > 0.005 ? '↑' : delta < -0.005 ? '↓' : '→',
    };
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Diagnóstico de crisis
// ---------------------------------------------------------------------------

function _diagnosticarCrisis(evaluaciones, gradiente) {
  // Detectar patrón en los errores
  const ausentes = evaluaciones.filter(e => e.ausente);
  if (ausentes.length / evaluaciones.length > 0.60) {
    return 'CRÍTICO: más del 60% de sorteos con número ausente en lista. ' +
           'El sistema no está capturando la señal correcta. ' +
           'Revisar si La Casa está en modo_camuflaje o post_superpremio.';
  }

  // Detectar motor dominante que falla
  const motorMasFallido = Object.entries(gradiente)
    .filter(([, g]) => g < -0.5)
    .sort((a, b) => a[1] - b[1])[0];

  if (motorMasFallido) {
    return `Motor con bajo rendimiento sistemático: ${motorMasFallido[0]} ` +
           `(gradiente: ${motorMasFallido[1].toFixed(2)}). ` +
           'Posible cambio de régimen no capturado.';
  }

  return 'Score bajo sostenido. Considerar ejecutar batch histórico para recalibrar.';
}
