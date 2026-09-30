/**
 * query-engine.js — Motor de consulta histórica (anotador avanzado)
 *
 * NO genera candidatos ni predicciones. Responde preguntas puntuales sobre
 * un número ("¿cada cuánto cae?", "¿cuál es su vuelta?", "¿qué suele caer
 * después?") con su frecuencia observada Y su comparación honesta contra
 * lo que el azar produciría, usando la misma metodología que
 * randomness-audit.js / honesty-panel.js (IC bayesiano, test binomial exacto).
 *
 * Nada aquí se etiqueta como "recomendación": cada resultado se presenta
 * como evidencia cruda + su contraste contra azar, para que la decisión
 * final quede del lado del jugador.
 */

import { getMirror } from "./conversion-engine.js";
import { betaCredibleInterval, binomialTailP } from "./stats-utils.js";
import { parseDrawDate } from "./date-utils.js";

const N_NUMEROS = 100;
const PRIOR = 1 / N_NUMEROS;

// Ventana (en sorteos, no días) para buscar la "vuelta" tras la caída de un número
const VENTANA_VUELTA = 5;
// Cuántos "siguientes número" reportar en la tabla de transición
const TOP_TRANSICIONES = 5;

const HORARIO_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };

/**
 * Orden cronológico estable + filtro de test/pendientes/país.
 * Deliberadamente NO importa signal/index.js ni storage.js: este módulo
 * es puro y testeable, sin depender de Supabase ni del DOM.
 */
function limpiar(draws, { pais = null } = {}) {
  return (draws || [])
    .filter((d) => d && !d.isTest && !d.isPending && Number.isFinite(d.numero))
    .filter((d) => !pais || (d.pais || "").toUpperCase() === pais.toUpperCase())
    .map((d) => ({ ...d, fechaDate: parseDrawDate(d.fecha), turnoOrder: HORARIO_ORDER[d.horario] ?? -1 }))
    .filter((d) => d.fechaDate && d.turnoOrder >= 0)
    .sort((a, b) => {
      const diff = a.fechaDate - b.fechaDate;
      return diff !== 0 ? diff : a.turnoOrder - b.turnoOrder;
    });
}

/**
 * Frecuencia observada del número + IC bayesiano + comparación contra 1/100.
 */
function analizarFrecuencia(numeros, numero) {
  const total = numeros.length;
  const hits = numeros.filter((n) => n === numero).length;
  const ic = betaCredibleInterval(hits, total);
  return {
    hits,
    total,
    tasaObservada: total ? hits / total : null,
    esperadoAzar: PRIOR,
    ic,
    // p-valor de que la frecuencia observada sea compatible con el azar
    pValue: total ? binomialTailP(hits >= total * PRIOR ? hits : 0, total, PRIOR) : null,
  };
}

/**
 * Gaps (en cantidad de sorteos, no días) entre apariciones consecutivas
 * del número, más el gap actual (sorteos desde la última vez que cayó).
 */
function analizarGap(numeros, numero) {
  const ocurrencias = [];
  numeros.forEach((n, i) => { if (n === numero) ocurrencias.push(i); });
  if (ocurrencias.length < 2) {
    return { ocurrencias: ocurrencias.length, gapPromedio: null, gapActual: null, gaps: [] };
  }
  const gaps = [];
  for (let i = 1; i < ocurrencias.length; i++) gaps.push(ocurrencias[i] - ocurrencias[i - 1]);
  const gapPromedio = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const gapActual = (numeros.length - 1) - ocurrencias[ocurrencias.length - 1];
  return { ocurrencias: ocurrencias.length, gapPromedio, gapActual, gaps };
}

/**
 * Vuelta (espejo de dígitos): frecuencia con la que, tras caer `numero`,
 * su espejo cae dentro de los siguientes VENTANA_VUELTA sorteos —
 * comparado contra lo que el azar produciría con esa misma ventana.
 */
function analizarVueltaNumero(numeros, numero) {
  const mirror = getMirror(numero);
  if (mirror === null || mirror === undefined || mirror === numero) {
    return { mirror: null, aplica: false };
  }
  let total = 0;
  let hits = 0;
  for (let i = 0; i < numeros.length; i++) {
    if (numeros[i] !== numero) continue;
    const ventana = numeros.slice(i + 1, i + 1 + VENTANA_VUELTA);
    if (ventana.length < VENTANA_VUELTA) continue;
    total++;
    if (ventana.includes(mirror)) hits++;
  }
  const esperado = 1 - (1 - PRIOR) ** VENTANA_VUELTA;
  const pValue = total > 0 ? binomialTailP(hits, total, esperado) : null;
  return {
    mirror,
    aplica: true,
    total,
    hits,
    tasaObservada: total ? hits / total : null,
    esperadoAzar: esperado,
    pValue,
  };
}

/**
 * Top N números que más veces cayeron inmediatamente después de `numero`,
 * cada uno con su comparación contra 1/100 (SIN corrección por comparaciones
 * múltiples — eso se aplica explícitamente al presentar el resultado, ver
 * nota en `advertencia`).
 */
function analizarTransiciones(numeros, numero) {
  const conteo = new Map();
  let total = 0;
  for (let i = 0; i < numeros.length - 1; i++) {
    if (numeros[i] !== numero) continue;
    total++;
    const sig = numeros[i + 1];
    conteo.set(sig, (conteo.get(sig) || 0) + 1);
  }
  const filas = [...conteo.entries()]
    .map(([sucesor, hits]) => ({
      sucesor,
      hits,
      total,
      tasaObservada: total ? hits / total : null,
      esperadoAzar: PRIOR,
      pValue: total ? binomialTailP(hits, total, PRIOR) : null,
    }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, TOP_TRANSICIONES);
  return {
    total,
    filas,
    advertencia: total > 0
      ? `Se comparó contra los 100 números posibles; con ${total} observaciones, ver una frecuencia alta en 1 de ellos por puro azar es esperable. No corregido por comparaciones múltiples — para eso, usar el panel de auditoría.`
      : null,
  };
}

/**
 * Consulta completa de un número: evidencia cruda + contraste contra azar
 * en cada dimensión. No produce un score ni una recomendación.
 *
 * @param {number} numero
 * @param {Array} draws  — historial crudo de DB.listDraws()
 * @param {object} [opts] { pais }
 */
export function consultarNumero(numero, draws, opts = {}) {
  const num = parseInt(numero, 10);
  if (!Number.isInteger(num) || num < 0 || num > 99) {
    throw new Error("consultarNumero: número inválido (0-99)");
  }
  const limpios = limpiar(draws, opts);
  const numeros = limpios.map((d) => d.numero);

  return {
    numero: num,
    totalSorteos: numeros.length,
    frecuencia: analizarFrecuencia(numeros, num),
    gap: analizarGap(numeros, num),
    vuelta: analizarVueltaNumero(numeros, num),
    transiciones: analizarTransiciones(numeros, num),
  };
}
