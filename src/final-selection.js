import { parseDrawDate, getTodayISODate } from "./date-utils.js";

const TURNOS = ["11AM", "3PM", "9PM"];
const TURN_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEIGHTS = {
  fuerte: 0.6,
  moderado: 0.25,
  debil: 0.1,
  reciente: 0.05,
};
const REGIONAL_CODES = ["ni", "nicaragua", "sv", "el salvador"];

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeNumero(numero) {
  const value = typeof numero === "number" ? numero : parseInt(numero, 10);
  if (!Number.isFinite(value)) return null;
  const mod = value % 100;
  return mod < 0 ? mod + 100 : mod;
}

function computeTimestamp(draw) {
  if (!draw) return null;
  const fechaDate = parseDrawDate(draw.fecha);
  if (!fechaDate) return null;
  const base = fechaDate.getTime();
  const turno = TURNOS.includes(draw.horario) ? draw.horario : null;
  const offset = turno ? TURNOS.indexOf(turno) * TURN_OFFSET_MS : 0;
  return base + offset;
}

function ensureScoreEntry(map, numero) {
  if (!map.has(numero)) {
    map.set(numero, {
      numero,
      total: 0,
      components: {
        fuerte: 0,
        moderado: 0,
        debil: 0,
        reciente: 0,
      },
    });
  }
  return map.get(numero);
}

function addTierContribution(entries, weight, key, map) {
  if (!Array.isArray(entries) || !entries.length || weight <= 0) return;
  entries.forEach((entry) => {
    const numero = normalizeNumero(entry?.numero);
    if (numero === null) return;
    const baseScore = clamp01(entry?.score ?? 0);
    const weighted = baseScore * weight;
    if (weighted <= 0) return;
    const bucket = ensureScoreEntry(map, numero);
    bucket.components[key] = Math.max(bucket.components[key], weighted);
    bucket.total =
      bucket.components.fuerte +
      bucket.components.moderado +
      bucket.components.debil +
      bucket.components.reciente;
  });
}

function computeRecentActivityRatios(draws, days = 10) {
  const ratios = new Map();
  if (!Array.isArray(draws) || !draws.length) return ratios;
  const now = Date.now();
  const cutoff = now - days * DAY_MS;
  let total = 0;
  draws.forEach((raw) => {
    const numero = normalizeNumero(raw?.numero);
    if (numero === null) return;
    const ts = computeTimestamp(raw);
    if (ts === null || ts < cutoff) return;
    total += 1;
    ratios.set(numero, (ratios.get(numero) || 0) + 1);
  });
  if (!total) return new Map();
  ratios.forEach((count, numero) => {
    ratios.set(numero, count / total);
  });
  return ratios;
}

function addRecentContribution(ratios, weight, map) {
  if (!ratios?.size || weight <= 0) return;
  ratios.forEach((ratio, numero) => {
    if (!map.has(numero)) return;
    const bucket = ensureScoreEntry(map, numero);
    const weighted = clamp01(ratio) * weight;
    bucket.components.reciente = Math.max(bucket.components.reciente, weighted);
    bucket.total =
      bucket.components.fuerte +
      bucket.components.moderado +
      bucket.components.debil +
      bucket.components.reciente;
  });
}

function sortEntries(entries) {
  return entries
    .map((entry) => ({
      ...entry,
      total: clamp01(entry.total),
      percent: clamp01(entry.total) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

function computeTurnTarget(draws) {
  const todayIso = getTodayISODate();
  const seenTurns = new Set();
  (draws || []).forEach((draw) => {
    if (!draw || draw.fecha !== todayIso) return;
    const turno = draw.horario;
    if (TURNOS.includes(turno)) seenTurns.add(turno);
  });
  const count = seenTurns.size;
  if (count <= 0) {
    return { turno: "11AM", label: "próximo 11AM", registros: count };
  }
  if (count === 1) {
    return { turno: "3PM", label: "próximo 3PM", registros: count };
  }
  if (count === 2) {
    return { turno: "9PM", label: "próximo 9PM", registros: count };
  }
  return { turno: "11AM", label: "mañana 11AM", registros: count };
}

function selectRegionalWildcard(draws, excludeSet = new Set()) {
  if (!Array.isArray(draws) || !draws.length) return null;
  const now = Date.now();
  const cutoff = now - DAY_MS;
  const map = new Map();
  draws.forEach((raw) => {
    const numero = normalizeNumero(raw?.numero);
    if (numero === null) return;
    const pais = (raw?.pais || "").trim().toLowerCase();
    if (!REGIONAL_CODES.includes(pais)) return;
    const ts = computeTimestamp(raw);
    if (ts === null || ts < cutoff) return;
    if (!map.has(numero)) {
      map.set(numero, { count: 0, lastTs: 0 });
    }
    const bucket = map.get(numero);
    bucket.count += 1;
    bucket.lastTs = Math.max(bucket.lastTs, ts);
  });
  if (!map.size) return null;
  let preferred = null;
  let fallback = null;
  map.forEach((value, numero) => {
    const candidate = { numero, ...value };
    if (!excludeSet.has(numero)) {
      if (
        !preferred ||
        candidate.count > preferred.count ||
        (candidate.count === preferred.count && candidate.lastTs > preferred.lastTs)
      ) {
        preferred = candidate;
      }
    } else if (
      !fallback ||
      candidate.count > fallback.count ||
      (candidate.count === fallback.count && candidate.lastTs > fallback.lastTs)
    ) {
      fallback = candidate;
    }
  });
  return (preferred || fallback)?.numero ?? null;
}

function gapScore(entry) {
  if (!entry?.gap) return null;
  const { mode, daysSince, matches } = entry.gap;
  if (!Number.isFinite(mode) || !Number.isFinite(daysSince)) return null;
  const delta = Math.abs(daysSince - mode);
  return {
    numero: entry.numero,
    score: 1 / (1 + delta) + (matches || 0) * 0.05,
  };
}

function selectGapWildcard(candidates, excludeSet = new Set()) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  let preferred = null;
  let fallback = null;
  candidates.forEach((entry) => {
    const numero = normalizeNumero(entry?.numero);
    if (numero === null) return;
    const candidate = gapScore(entry);
    if (!candidate) return;
    if (!excludeSet.has(numero)) {
      if (!preferred || candidate.score > preferred.score) preferred = candidate;
    } else if (!fallback || candidate.score > fallback.score) {
      fallback = candidate;
    }
  });
  return (preferred || fallback)?.numero ?? null;
}

function invertNumber(numero) {
  if (numero === null || numero === undefined) return null;
  const complement = (100 - numero + 100) % 100;
  const mirror = parseInt(String(numero).padStart(2, "0").split("").reverse().join(""), 10);
  return { complement, mirror };
}

function selectInversionWildcard(entries, excludeSet = new Set()) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const available = new Set(entries.map((entry) => normalizeNumero(entry.numero)).filter((n) => n !== null));
  let preferred = null;
  let fallback = null;
  entries.forEach((entry) => {
    const numero = normalizeNumero(entry?.numero);
    if (numero === null) return;
    const inverted = invertNumber(numero);
    const hasPair =
      (Number.isFinite(inverted?.complement) && available.has(inverted.complement)) ||
      (Number.isFinite(inverted?.mirror) && available.has(inverted.mirror));
    if (!hasPair) return;
    if (!excludeSet.has(numero)) {
      if (!preferred || entry.total > preferred.total) preferred = entry;
    } else if (!fallback || entry.total > fallback.total) {
      fallback = entry;
    }
  });
  return (preferred || fallback)?.numero ?? null;
}

function selectWildcard({ draws, tierCandidates = [], rankedEntries = [] }) {
  const excludeSet = new Set(rankedEntries.slice(0, 5).map((entry) => entry.numero));
  const regional = selectRegionalWildcard(draws, excludeSet);
  if (regional !== null && regional !== undefined) return regional;
  const gapCandidate = selectGapWildcard(tierCandidates, excludeSet);
  if (gapCandidate !== null && gapCandidate !== undefined) return gapCandidate;
  const inversionCandidate = selectInversionWildcard(rankedEntries, excludeSet);
  if (inversionCandidate !== null && inversionCandidate !== undefined) return inversionCandidate;
  return rankedEntries[0]?.numero ?? null;
}

function determineTopCount(totalEntries) {
  if (totalEntries >= 5) return 5;
  if (totalEntries >= 3) return totalEntries;
  return totalEntries;
}

export function calcularSeleccionFinal({
  fuertes = [],
  moderados = [],
  debiles = [],
  draws = [],
} = {}) {
  const scoreMap = new Map();
  addTierContribution(fuertes, WEIGHTS.fuerte, "fuerte", scoreMap);
  addTierContribution(moderados, WEIGHTS.moderado, "moderado", scoreMap);
  addTierContribution(debiles, WEIGHTS.debil, "debil", scoreMap);
  const recentRatios = computeRecentActivityRatios(draws);
  addRecentContribution(recentRatios, WEIGHTS.reciente, scoreMap);

  const rankedEntries = sortEntries(Array.from(scoreMap.values()));
  const turnoObjetivo = computeTurnTarget(draws);
  if (!rankedEntries.length) {
    const comodinVacio = selectWildcard({
      draws,
      tierCandidates: [...fuertes, ...moderados, ...debiles],
      rankedEntries,
    });
    return {
      topPicks: [],
      secundarios: [],
      comodin: comodinVacio,
      turnoObjetivo,
    };
  }

  const topCount = determineTopCount(rankedEntries.length);
  const topPicks = rankedEntries.slice(0, topCount);
  const secundarios = rankedEntries
    .slice(topCount)
    .filter((entry) => entry.total >= 0.3)
    .slice(0, 3);
  const comodin = selectWildcard({
    draws,
    tierCandidates: [...fuertes, ...moderados, ...debiles],
    rankedEntries,
  });

  return {
    topPicks,
    secundarios,
    comodin,
    turnoObjetivo,
  };
}
