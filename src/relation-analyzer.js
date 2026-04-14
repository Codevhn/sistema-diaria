// relation-analyzer.js — v1.0
// Analiza el historial de sorteos para detectar qué relaciones matemáticas
// (conversión simple, compuesta, equivalencia, espejo) ocurren entre sorteos
// consecutivos, y con qué frecuencia. Esto permite presentar candidatos con
// respaldo estadístico real en lugar de supuestos teóricos.

import { classifyRelation, getAllRelated } from "./conversion-map.js";
import { GUIA } from "./loader.js";

const HORARIO_ORDER = ["11AM", "3PM", "9PM"];
const RELATION_TYPES = [
  "conversion-simple",
  "conversion-compound",
  "equivalencia",
  "mirror",
  "same",
];
const RELATION_LABELS = {
  "conversion-simple": "Conversión simple",
  "conversion-compound": "Conversión compuesta",
  "equivalencia": "Equivalencia",
  "mirror": "Espejo",
  "same": "Repetición",
};

// ─── utilidades ───────────────────────────────────────────────────────────

function sortDraws(draws) {
  return [...draws].sort((a, b) => {
    const d = (a.fecha || "").localeCompare(b.fecha || "");
    if (d !== 0) return d;
    return HORARIO_ORDER.indexOf(a.horario) - HORARIO_ORDER.indexOf(b.horario);
  });
}

function safeInt(n) {
  const v = parseInt(n, 10);
  return Number.isNaN(v) ? null : v;
}

// ─── análisis de pares ────────────────────────────────────────────────────

/**
 * Procesa el historial y clasifica cada par de sorteos consecutivos.
 * Devuelve estadísticas globales, por horario y por día de semana.
 *
 * @param {Array} draws - Lista de sorteos de DB.listDraws()
 * @returns {Object} stats
 */
export function buildRelationStats(draws) {
  const sorted = sortDraws(draws);

  // Contadores
  const overall = { total: 0 };
  const byHorario = {};   // "3PM" → { total, "conversion-simple": n, ... }
  const byDow = {};       // 1 (lunes) → { total, "conversion-simple": n, ... }

  // Tabla de apariciones por número: cuántas veces salió cada número
  const numCount = {};

  RELATION_TYPES.forEach((t) => { overall[t] = 0; });

  for (let i = 0; i < sorted.length; i++) {
    const num = safeInt(sorted[i].numero);
    if (num !== null) numCount[num] = (numCount[num] || 0) + 1;

    if (i === 0) continue;
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const nA = safeInt(prev.numero);
    const nB = safeInt(curr.numero);
    if (nA === null || nB === null) continue;

    const rel = classifyRelation(nA, nB) || "none";
    const dow = new Date(`${curr.fecha}T12:00:00`).getDay();
    const horario = curr.horario || "?";

    // Global
    overall.total++;
    overall[rel] = (overall[rel] || 0) + 1;

    // Por horario
    if (!byHorario[horario]) {
      byHorario[horario] = { total: 0 };
      RELATION_TYPES.forEach((t) => { byHorario[horario][t] = 0; });
    }
    byHorario[horario].total++;
    byHorario[horario][rel] = (byHorario[horario][rel] || 0) + 1;

    // Por día de semana
    if (!byDow[dow]) {
      byDow[dow] = { total: 0 };
      RELATION_TYPES.forEach((t) => { byDow[dow][t] = 0; });
    }
    byDow[dow].total++;
    byDow[dow][rel] = (byDow[dow][rel] || 0) + 1;
  }

  return { overall, byHorario, byDow, numCount, totalDraws: sorted.length };
}

// ─── candidatos ───────────────────────────────────────────────────────────

/**
 * Dado el último número sorteado y las estadísticas del historial,
 * devuelve candidatos agrupados por tipo de relación con su frecuencia histórica.
 *
 * @param {number} lastNum
 * @param {Object} stats - Resultado de buildRelationStats()
 * @param {Object} opts
 * @param {string|null} opts.horario - Turno del próximo sorteo ("11AM", "3PM", "9PM")
 * @returns {Object} { groups: [{tipo, label, items:[{numero, pct}]}], signal }
 */
export function getCandidates(lastNum, stats, { horario = null } = {}) {
  const related = getAllRelated(lastNum);

  // Contexto: usar stats del horario indicado si hay suficientes datos
  const ctx = horario && stats.byHorario[horario]?.total >= 10
    ? stats.byHorario[horario]
    : stats.overall;
  const ctxTotal = ctx.total || 1;

  const groups = [];

  for (const tipo of RELATION_TYPES) {
    if (tipo === "same") continue; // repetición no es candidato útil

    const nums = related[tipo === "conversion-simple" ? "simple"
                        : tipo === "conversion-compound" ? "compound"
                        : tipo === "equivalencia" ? "equivalencias"
                        : "mirror"] || [];
    if (!nums.length) continue;

    const typeCount = ctx[tipo] || 0;
    const pct = Math.round((typeCount / ctxTotal) * 100);

    groups.push({
      tipo,
      label: RELATION_LABELS[tipo],
      pct,            // % de veces que esta relación ocurrió históricamente
      items: nums.map((numero) => ({
        numero,
        simbolo: GUIA?.[String(numero).padStart(2, "0")]?.simbolo || "",
        familia: GUIA?.[String(numero).padStart(2, "0")]?.familia || "",
        apariciones: stats.numCount[numero] || 0,
      })),
    });
  }

  // Ordenar grupos: primero los de mayor frecuencia histórica
  groups.sort((a, b) => b.pct - a.pct);

  return groups;
}

// ─── señal contextual ─────────────────────────────────────────────────────

const DOW_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Detecta si en el contexto actual (horario + día) algún tipo de relación
 * ocurre más frecuentemente que el promedio histórico.
 * Devuelve un mensaje legible o null si no hay señal significativa.
 */
export function getContextSignal(stats, { horario = null, dow = null } = {}) {
  const overall = stats.overall;
  const oTotal = overall.total || 1;

  const ctx = horario && stats.byHorario[horario]?.total >= 10
    ? stats.byHorario[horario]
    : null;

  if (!ctx) return null;

  const ctxTotal = ctx.total || 1;
  let bestType = null;
  let bestRatio = 0;

  for (const tipo of RELATION_TYPES) {
    if (tipo === "same") continue;
    const oFreq = (overall[tipo] || 0) / oTotal;
    if (oFreq === 0) continue;
    const cFreq = (ctx[tipo] || 0) / ctxTotal;
    const ratio = cFreq / oFreq;
    if (ratio > bestRatio) { bestRatio = ratio; bestType = tipo; }
  }

  if (!bestType || bestRatio < 1.4) return null;

  const label = RELATION_LABELS[bestType];
  const pct = Math.round(((ctx[bestType] || 0) / ctxTotal) * 100);
  const horaLabel = horario || "";
  return `En el turno ${horaLabel}, la ${label.toLowerCase()} ocurre ${bestRatio.toFixed(1)}× más de lo normal (${pct}% de casos).`;
}

export { RELATION_LABELS };
