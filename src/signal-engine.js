/**
 * signal-engine.js — Motor unificado de señales
 *
 * Orquesta todos los analizadores existentes + Markov O1/O2 + rezago/Poisson
 * y devuelve un ranking de candidatos con argumentos, listo para la UI.
 *
 * Enfoque: eliminación primero, luego puntuación.
 * El sistema no predice; descubre condiciones históricas favorables.
 */

import { DB } from "./storage.js";
import { GUIA } from "./loader.js";
import { parseDrawDate } from "./date-utils.js";
import { detectarPatrones } from "./pattern-detector.js";
import { evaluarModos } from "./mode-engine.js";
import { analizarPatronesMensuales } from "./monthly-trends.js";
import { analizarSecuenciasSemanales } from "./weekly-patterns.js";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };
const TURNOS_BASE = ["11AM", "3PM", "9PM"];

// Pesos de cada fuente en la puntuación final (deben sumar 1.0)
const SOURCE_WEIGHTS = {
  markov1:  0.28,
  markov2:  0.18,
  rezago:   0.14,
  modos:    0.18,
  patrones: 0.12,
  semanal:  0.06,
  mensual:  0.04,
};

// Umbrales de eliminación
const ELIM_RECIENTE_DIAS     = 1;    // Cayó hace ≤1 día → eliminado (salvo diciembre)
const ELIM_FAMILIA_TURNOS    = 2;    // Misma familia en últimos N turnos → penalizado
const MARKOV_MIN_SOPORTE     = 3;    // Mínimo de transiciones para confiar
const MARKOV2_MIN_SOPORTE    = 2;
const REZAGO_MIN_APARICIONES = 4;    // Mínimo de apariciones para calcular ciclo
const TOP_CANDIDATES         = 10;   // Cuántos candidatos devolver

// ─── Utilidades internas ──────────────────────────────────────────────────────

function padNum(n) {
  return String(n).padStart(2, "0");
}

function getSymboloFamilia(numero) {
  const key = padNum(numero);
  const info = GUIA?.[key];
  return {
    simbolo: info?.simbolo || key,
    familia: info?.familia || null,
    polaridad: info?.polaridad || null,
  };
}

/** Enriquece cada draw con fechaDate y turnoOrder */
function enrich(draws) {
  return draws
    .map((d) => ({
      ...d,
      fechaDate: parseDrawDate(d.fecha),
      turnoOrder: HORARIO_ORDER[d.horario] ?? -1,
    }))
    .filter((d) => d.fechaDate && d.turnoOrder >= 0)
    .sort((a, b) => {
      const da = a.fechaDate - b.fechaDate;
      return da !== 0 ? da : a.turnoOrder - b.turnoOrder;
    });
}

/** ¿Es diciembre? */
function isDiciembre(fecha) {
  if (!fecha) return false;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.getMonth() === 11;
}

// ─── Markov Orden 1 ───────────────────────────────────────────────────────────

/**
 * Construye la matriz de transición A→B.
 * Solo considera transiciones consecutivas (turno siguiente o mismo día siguiente turno).
 * @returns {Map<number, Map<number, number>>} transitions[from][to] = count
 */
function buildMarkov1(draws) {
  const matrix = new Map(); // from → Map(to → count)

  for (let i = 0; i < draws.length - 1; i++) {
    const cur  = draws[i];
    const next = draws[i + 1];

    // Solo transiciones dentro del mismo país y máximo 2 días de diferencia
    if (cur.pais && next.pais && cur.pais !== next.pais) continue;
    const dayDiff = Math.round((next.fechaDate - cur.fechaDate) / DAY_MS);
    if (dayDiff < 0 || dayDiff > 2) continue;

    const from = cur.numero;
    const to   = next.numero;

    if (!matrix.has(from)) matrix.set(from, new Map());
    const row = matrix.get(from);
    row.set(to, (row.get(to) || 0) + 1);
  }

  return matrix;
}

/**
 * Calcula probabilidades normalizadas desde la matriz cruda.
 * @returns {Map<number, {total, top: [{numero, prob, count}]}>}
 */
function normalizeMarkov1(matrix) {
  const result = new Map();
  matrix.forEach((row, from) => {
    const total = Array.from(row.values()).reduce((s, c) => s + c, 0);
    if (total < MARKOV_MIN_SOPORTE) return;
    const top = Array.from(row.entries())
      .map(([to, count]) => ({ numero: to, count, prob: count / total }))
      .sort((a, b) => b.prob - a.prob);
    result.set(from, { total, top });
  });
  return result;
}

// ─── Markov Orden 2 ───────────────────────────────────────────────────────────

/**
 * Construye la matriz de transición (A,B)→C.
 * @returns {Map<string, Map<number, number>>} transitions["A:B"][to] = count
 */
function buildMarkov2(draws) {
  const matrix = new Map();

  for (let i = 0; i < draws.length - 2; i++) {
    const a = draws[i];
    const b = draws[i + 1];
    const c = draws[i + 2];

    if (a.pais && b.pais && a.pais !== b.pais) continue;
    if (b.pais && c.pais && b.pais !== c.pais) continue;

    const dayDiff1 = Math.round((b.fechaDate - a.fechaDate) / DAY_MS);
    const dayDiff2 = Math.round((c.fechaDate - b.fechaDate) / DAY_MS);
    if (dayDiff1 < 0 || dayDiff1 > 2) continue;
    if (dayDiff2 < 0 || dayDiff2 > 2) continue;

    const key = `${a.numero}:${b.numero}`;
    if (!matrix.has(key)) matrix.set(key, new Map());
    const row = matrix.get(key);
    row.set(c.numero, (row.get(c.numero) || 0) + 1);
  }

  return matrix;
}

function normalizeMarkov2(matrix) {
  const result = new Map();
  matrix.forEach((row, key) => {
    const total = Array.from(row.values()).reduce((s, c) => s + c, 0);
    if (total < MARKOV2_MIN_SOPORTE) return;
    const top = Array.from(row.entries())
      .map(([to, count]) => ({ numero: to, count, prob: count / total }))
      .sort((a, b) => b.prob - a.prob);
    result.set(key, { total, top });
  });
  return result;
}

// ─── Rezago / Análisis de Ciclo en días reales (ventana 180 días) ─────────────

const REZAGO_VENTANA_DIAS = 180; // solo miramos los últimos 180 días para el ciclo

/**
 * Calcula el rezago de cada número usando días reales y una ventana reciente.
 *
 * Para cada número:
 *   - Toma todas sus apariciones dentro de los últimos REZAGO_VENTANA_DIAS días
 *   - Calcula los gaps en días entre apariciones consecutivas (ciclo real)
 *   - Compara cuántos días lleva sin caer vs su ciclo promedio reciente
 *   - zScore = (díasDesdeÚltima - promedioGap) / desviación
 *
 * Estados:
 *   "reciente"     — cayó hace ≤3 días
 *   "normal"       — dentro del rango esperado (zScore < 0.5)
 *   "en_ventana"   — comenzando a entrar en su zona de aparición (0.5 ≤ z < 2.0)
 *   "vencido"      — lleva mucho más de lo normal sin caer (z ≥ 2.0)
 *   "ausente"      — no apareció en la ventana de análisis (ignorar para señales)
 *   "insuficiente" — apareció pero muy pocas veces para calcular ciclo confiable
 */
function calcularRezago(draws) {
  const ahora     = Date.now();
  const ventanaMs = REZAGO_VENTANA_DIAS * DAY_MS;
  const corte     = ahora - ventanaMs;

  // Separar apariciones dentro y fuera de ventana por número
  const porNumero = new Map(); // numero → {enVentana: [fechaMs], todas: [fechaMs]}
  draws.forEach((d) => {
    const ts = d.fechaDate ? d.fechaDate.getTime() : 0;
    if (!ts) return;
    if (!porNumero.has(d.numero)) porNumero.set(d.numero, { enVentana: [], ultima: 0 });
    const entry = porNumero.get(d.numero);
    if (ts > entry.ultima) entry.ultima = ts;
    if (ts >= corte) entry.enVentana.push(ts);
  });

  const resultado = new Map();

  for (let n = 0; n <= 99; n++) {
    const entry = porNumero.get(n);

    if (!entry) {
      resultado.set(n, { estado: "ausente", diasDesdeUltima: null, cicloPromedio: null, zScore: null });
      continue;
    }

    const diasDesdeUltima = entry.ultima
      ? Math.round((ahora - entry.ultima) / DAY_MS)
      : null;

    // Reciente: cayó hace 3 días o menos
    if (diasDesdeUltima !== null && diasDesdeUltima <= 3) {
      resultado.set(n, { estado: "reciente", diasDesdeUltima, cicloPromedio: null, zScore: null, ultimaFecha: entry.ultima });
      continue;
    }

    const apariciones = entry.enVentana.sort((a, b) => a - b);

    if (apariciones.length < REZAGO_MIN_APARICIONES) {
      // Pocas apariciones en la ventana — no podemos calcular ciclo confiable
      resultado.set(n, {
        estado: diasDesdeUltima !== null && diasDesdeUltima <= REZAGO_VENTANA_DIAS ? "insuficiente" : "ausente",
        diasDesdeUltima,
        cicloPromedio: null,
        zScore: null,
        ultimaFecha: entry.ultima,
      });
      continue;
    }

    // Calcular gaps en días entre apariciones consecutivas
    const gaps = [];
    for (let i = 1; i < apariciones.length; i++) {
      gaps.push((apariciones[i] - apariciones[i - 1]) / DAY_MS);
    }

    const mean     = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + Math.pow(g - mean, 2), 0) / gaps.length;
    const std      = Math.sqrt(variance) || 1;
    const zScore   = diasDesdeUltima !== null ? (diasDesdeUltima - mean) / std : 0;

    let estado;
    if      (zScore >= 2.0) estado = "vencido";
    else if (zScore >= 0.5) estado = "en_ventana";
    else                    estado = "normal";

    resultado.set(n, {
      estado,
      diasDesdeUltima,
      cicloPromedio: Math.round(mean * 10) / 10,
      cicloStd:      Math.round(std * 10) / 10,
      zScore:        Math.round(zScore * 100) / 100,
      aparicionesEnVentana: apariciones.length,
      ultimaFecha: entry.ultima,
    });
  }

  return resultado;
}

// ─── Filtros de eliminación ───────────────────────────────────────────────────

/**
 * Devuelve el conjunto de números eliminados y la razón.
 * La eliminación NO es absoluta para todos los casos — en diciembre
 * el filtro de recientes se relaja.
 */
function aplicarEliminacion(draws, rezago, diciembre) {
  const eliminados = new Map(); // numero → {razon, regla}

  // Últimos N draws para contexto inmediato
  const recientes = draws.slice(-6);
  const hoy       = draws[draws.length - 1]?.fecha;

  // Regla 1: Cayó hace ≤3 días → baja probabilidad de repetición (excepto diciembre)
  if (!diciembre) {
    recientes.forEach((d) => {
      const info = rezago.get(d.numero);
      if (info && info.estado === "reciente") {
        if (!eliminados.has(d.numero)) {
          eliminados.set(d.numero, {
            razon: `Cayó hace ${info.diasDesdeUltima === 0 ? "hoy" : `${info.diasDesdeUltima} día${info.diasDesdeUltima > 1 ? "s" : ""}`}`,
            regla: "reciente",
          });
        }
      }
    });
  }

  // Regla 2: Número "sobrecalentado" — llevan demasiado tiempo sin caer
  // (>3σ = el sistema tiende a evitarlos porque el jugador los espera)
  rezago.forEach((info, numero) => {
    if (info.zScore >= 3.0 && info.estado !== "reciente") {
      eliminados.set(numero, {
        razon: `${info.diasDesdeUltima} días sin caer (${info.zScore}σ sobre su promedio de ${info.cicloPromedio} días — sobrecalentado)`,
        regla: "sobrecalentado",
      });
    }
  });

  // Regla 3: Misma familia en los últimos ELIM_FAMILIA_TURNOS turnos → penalización fuerte
  // (no elimina pero marca para reducir peso)
  const familiasPenalizadas = new Set();
  draws.slice(-ELIM_FAMILIA_TURNOS).forEach((d) => {
    const { familia } = getSymboloFamilia(d.numero);
    if (familia) familiasPenalizadas.add(familia);
  });

  return { eliminados, familiasPenalizadas };
}

// ─── Agregación de señales ────────────────────────────────────────────────────

/**
 * Construye un score compuesto [0-1] para cada número combinando todas las fuentes.
 * @param {object} signals - Todas las señales calculadas
 * @param {number[]} lastNums - Últimos números sorteados (contexto Markov)
 * @returns {Map<number, {score, signals: []}>}
 */
function agregarSeñales({ markov1, markov2, rezago, modos, hallazgos, semanales }, lastNums, familiasPenalizadas) {
  const scores = new Map(); // numero → {rawScores: {source: val}, signals: []}

  function addScore(numero, source, value, label) {
    if (!Number.isFinite(value) || value <= 0) return;
    if (!scores.has(numero)) scores.set(numero, { rawScores: {}, signals: [] });
    const entry = scores.get(numero);
    entry.rawScores[source] = Math.max(entry.rawScores[source] || 0, Math.min(1, value));
    entry.signals.push({ source, label, value: Math.min(1, value) });
  }

  // ── Markov O1 ──
  if (lastNums.length >= 1) {
    const last = lastNums[lastNums.length - 1];
    const m1 = markov1.get(last);
    if (m1) {
      m1.top.forEach(({ numero, prob, count }) => {
        if (count < MARKOV_MIN_SOPORTE) return;
        addScore(numero, "markov1",
          prob,
          `Markov: sigue a ${padNum(last)} en ${Math.round(prob * 100)}% de casos (${count} veces)`
        );
      });
    }
  }

  // ── Markov O2 ──
  if (lastNums.length >= 2) {
    const key = `${lastNums[lastNums.length - 2]}:${lastNums[lastNums.length - 1]}`;
    const m2 = markov2.get(key);
    if (m2) {
      m2.top.forEach(({ numero, prob, count }) => {
        if (count < MARKOV2_MIN_SOPORTE) return;
        addScore(numero, "markov2",
          prob,
          `Markov O2: secuencia …→${padNum(lastNums[lastNums.length - 2])}→${padNum(lastNums[lastNums.length - 1])}→este en ${Math.round(prob * 100)}%`
        );
      });
    }
  }

  // ── Rezago (números en ventana = candidatos naturales) ──
  rezago.forEach((info, numero) => {
    if (info.estado === "en_ventana") {
      const rezagoScore = Math.min(1, (info.zScore - 0.5) / 1.5);
      addScore(numero, "rezago",
        rezagoScore,
        `Rezago: ${info.diasDesdeUltima} días sin caer (ciclo promedio ${info.cicloPromedio} días — en ventana)`
      );
    }
  });

  // ── Motor de modos ──
  if (modos?.scorePorNumero) {
    Object.entries(modos.scorePorNumero).forEach(([pad, score]) => {
      const n = parseInt(pad, 10);
      if (score > 0.15) {
        const detalle = modos.detallePorNumero?.[pad]?.[0];
        addScore(n, "modos",
          score,
          detalle ? `Modo ${detalle.modeNombre}: ${detalle.nota || "transformación"}` : `Modo activo (score ${Math.round(score * 100)}%)`
        );
      }
    });
  }

  // ── Hallazgos del pattern-detector ──
  if (hallazgos?.length) {
    hallazgos.forEach((h) => {
      if (h.numero != null && h.confianza > 0.3) {
        addScore(h.numero, "patrones",
          h.confianza,
          `Patrón: ${h.titulo}`
        );
      }
      // También los destinos de transición
      if (h.datos?.destino != null && h.datos?.ratio > 0.3) {
        addScore(h.datos.destino, "patrones",
          h.datos.ratio * 0.8,
          h.titulo
        );
      }
    });
  }

  // ── Patrones semanales ──
  if (semanales?.stats?.destacados?.length) {
    semanales.stats.destacados.forEach((ciclo) => {
      if (ciclo.cycle?.nextNumero != null) {
        addScore(ciclo.cycle.nextNumero, "semanal",
          ciclo.cycle.score || 0.4,
          `Ciclo semanal (${ciclo.dow} ${ciclo.horario}): siguiente en patrón`
        );
      }
    });
  }

  // ── Score compuesto ──
  const composed = new Map();
  scores.forEach((entry, numero) => {
    let total = 0;
    let weightUsed = 0;
    Object.entries(entry.rawScores).forEach(([source, val]) => {
      const w = SOURCE_WEIGHTS[source] || 0;
      total      += val * w;
      weightUsed += w;
    });
    // Normalizar por peso usado (si solo hay algunas fuentes)
    const score = weightUsed > 0 ? Math.min(1, total / weightUsed) : 0;

    // Penalización por familia activa
    const { familia } = getSymboloFamilia(numero);
    const penalizado = familia && familiasPenalizadas.has(familia);

    composed.set(numero, {
      score: penalizado ? score * 0.6 : score,
      penalizado,
      signals: entry.signals.sort((a, b) => b.value - a.value),
    });
  });

  return composed;
}

// ─── Punto de entrada principal ───────────────────────────────────────────────

/**
 * Ejecuta el motor unificado de señales.
 *
 * @param {object} opts
 * @param {string}   opts.pais       - País del sorteo
 * @param {string}   [opts.turno]    - Turno objetivo (opcional, para contexto)
 * @param {string}   [opts.fecha]    - Fecha objetivo ISO (default: hoy)
 * @param {number}   [opts.topN]     - Cuántos candidatos devolver (default: 10)
 * @returns {Promise<SignalResult>}
 */
export async function ejecutarMotorSeñales({ pais, turno, fecha, topN = TOP_CANDIDATES, recuperacion = null } = {}) {
  // 1. Cargar todos los sorteos
  const rawDraws = await DB.listDraws({ excludeTest: true });
  if (rawDraws.length < 20) {
    return { candidatos: [], eliminados: [], universo: 100, contexto: { error: "Insuficientes sorteos registrados (mínimo 20)." } };
  }

  const draws = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  if (!draws.length) {
    return { candidatos: [], eliminados: [], universo: 100, contexto: { error: `Sin sorteos para país: ${pais}` } };
  }

  // Contexto de fecha
  const fechaRef     = fecha ? new Date(fecha) : draws[draws.length - 1]?.fechaDate || new Date();
  const enDiciembre  = isDiciembre(fechaRef);
  const lastDraw     = draws[draws.length - 1];
  const lastNums     = draws.slice(-3).map((d) => d.numero);

  // 2. Calcular señales en paralelo
  const [modos, patronesResult, semanalesResult] = await Promise.allSettled([
    evaluarModos(),
    detectarPatrones({ cantidad: 12 }),
    Promise.resolve(analizarSecuenciasSemanales(draws, { pais, turno })),
  ]);

  const modos2     = modos.status     === "fulfilled" ? modos.value     : null;
  const patronesOk = patronesResult.status === "fulfilled" ? patronesResult.value : null;
  const semanales  = semanalesResult.status === "fulfilled" ? semanalesResult.value : null;

  // 3. Markov O1 y O2
  const matrix1  = buildMarkov1(draws);
  const markov1  = normalizeMarkov1(matrix1);
  const matrix2  = buildMarkov2(draws);
  const markov2  = normalizeMarkov2(matrix2);

  // 4. Rezago / Poisson
  const rezago = calcularRezago(draws);

  // 5. Eliminación
  const { eliminados, familiasPenalizadas } = aplicarEliminacion(draws, rezago, enDiciembre);

  // 6. Agregar señales para todos los números no eliminados
  const hallazgos = patronesOk?.hallazgos || [];
  const composed  = agregarSeñales(
    { markov1, markov2, rezago, modos: modos2, hallazgos, semanales },
    lastNums,
    familiasPenalizadas
  );

  // 6b. Modo recuperación: boost numbers repeating after the super premio payment
  if (recuperacion?.activo && recuperacion.repetidosPostEvento?.length) {
    const repMap = new Map(recuperacion.repetidosPostEvento.map(({ numero, veces }) => [Number(numero), veces]));
    composed.forEach((data, numero) => {
      if (repMap.has(numero)) {
        const veces = repMap.get(numero);
        // More repetitions = stronger boost (cap at 1.8x)
        const boostFactor = Math.min(1.8, 1.3 + (veces - 2) * 0.15);
        data.score = Math.min(1, data.score * boostFactor);
        data.signals.unshift({
          source: "recuperacion",
          label: `Modo recuperación: repitió ${veces}× desde el último pago super premio (+${Math.round((boostFactor-1)*100)}% peso)`,
          value: Math.min(0.95, 0.6 + veces * 0.1),
        });
      }
    });
  }

  // 7. Rankear candidatos (excluyendo eliminados)
  const candidatos = [];
  composed.forEach((data, numero) => {
    if (eliminados.has(numero)) return;
    if (data.score < 0.05)      return;

    const { simbolo, familia, polaridad } = getSymboloFamilia(numero);
    const rez = rezago.get(numero) || {};

    candidatos.push({
      numero,
      pad:       padNum(numero),
      simbolo,
      familia,
      polaridad,
      score:     Math.round(data.score * 1000) / 1000,
      penalizado: data.penalizado,
      signals:   data.signals,
      rezago: {
        estado:     rez.estado,
        gapActual:  rez.gapActual,
        gapMedio:   rez.gapMedio,
        zScore:     rez.zScore,
        apariciones: rez.apariciones,
      },
    });
  });

  candidatos.sort((a, b) => b.score - a.score);
  const topCandidatos = candidatos.slice(0, topN);

  // 8. Resumen de eliminados para la UI
  const eliminadosArr = Array.from(eliminados.entries()).map(([numero, info]) => ({
    numero,
    pad: padNum(numero),
    simbolo: getSymboloFamilia(numero).simbolo,
    ...info,
  }));

  // 9. Cobertura de Markov (calidad del dato)
  const markovCoverage = markov1.size / 100;
  let dataQuality = "bajo";
  if (draws.length > 5000)      dataQuality = "alto";
  else if (draws.length > 2000) dataQuality = "medio";

  return {
    candidatos:  topCandidatos,
    eliminados:  eliminadosArr,
    universo:    100 - eliminados.size,
    diciembre:   enDiciembre,
    recuperacion: recuperacion || null,
    contexto: {
      totalSorteos:    draws.length,
      ultimoSorteo:    { numero: lastDraw?.numero, horario: lastDraw?.horario, fecha: lastDraw?.fecha },
      markovCobertura: Math.round(markovCoverage * 100),
      dataQuality,
      turno:           turno || null,
      fecha:           fecha || null,
    },
  };
}

/**
 * Versión simplificada: dado un número que acaba de caer,
 * devuelve sus sucesores Markov O1 más probables.
 * Útil para el chip inline bajo el slot del día.
 *
 * @param {number} numero - Número que cayó
 * @param {string} pais
 * @param {number} [topN=4]
 * @returns {Promise<{numero, pad, simbolo, prob, count}[]>}
 */
export async function sucesoresMarkov(numero, pais, topN = 4) {
  const rawDraws = await DB.listDraws({ excludeTest: true });
  const draws    = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  if (draws.length < 10) return [];

  const matrix = buildMarkov1(draws);
  const markov = normalizeMarkov1(matrix);
  const row    = markov.get(numero);
  if (!row) return [];

  return row.top.slice(0, topN).map(({ numero: n, prob, count }) => {
    const { simbolo } = getSymboloFamilia(n);
    return { numero: n, pad: padNum(n), simbolo, prob: Math.round(prob * 100), count };
  });
}

/**
 * Devuelve el estado de rezago de todos los números.
 * Útil para el resumen de "números vencidos hoy".
 *
 * @param {string} pais
 * @returns {Promise<{vencidos, enVentana, recientes}>}
 */
export async function estadoRezago(pais) {
  const rawDraws = await DB.listDraws({ excludeTest: true });
  const draws    = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  const rezago   = calcularRezago(draws);

  const vencidos  = [];
  const enVentana = [];
  const recientes = [];

  rezago.forEach((info, numero) => {
    const { simbolo, familia } = getSymboloFamilia(numero);
    const entry = { numero, pad: padNum(numero), simbolo, familia, ...info };
    if      (info.estado === "vencido")    vencidos.push(entry);
    else if (info.estado === "en_ventana") enVentana.push(entry);
    else if (info.estado === "reciente")   recientes.push(entry);
  });

  // Vencidos: más días sin caer primero
  vencidos.sort((a, b) => (b.diasDesdeUltima ?? 0) - (a.diasDesdeUltima ?? 0));
  // En ventana: los más cercanos a su límite superior (z más alto) primero
  enVentana.sort((a, b) => (b.zScore ?? 0) - (a.zScore ?? 0));

  return { vencidos, enVentana, recientes };
}
