// weekly-patterns.js — análisis de ciclos semanales por día/turno
import { parseDrawDate, formatDateISO } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };

function toNumber(value) {
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function detectCycle(values, { minLength = 2, maxLength = 6, minRepeats = 2 } = {}) {
  const serie = values.filter((n) => Number.isFinite(n));
  if (serie.length < minLength * minRepeats) return null;
  const maxCandidateLength = Math.min(maxLength, serie.length - 1);

  for (let len = minLength; len <= maxCandidateLength; len++) {
    const pattern = serie.slice(-len);
    if (pattern.length < len) break;
    let matchedEntries = 0;
    let matchedCycles = 0;
    for (let start = serie.length - len; start >= 0; start -= len) {
      const chunk = serie.slice(start, start + len);
      if (chunk.length < len) break;
      const equals = chunk.every((value, idx) => value === pattern[idx]);
      if (!equals) break;
      matchedEntries += len;
      matchedCycles += 1;
    }
    if (matchedCycles >= minRepeats) {
      const coverage = matchedEntries / serie.length;
      const projectedIndex = matchedEntries % len;
      const nextNumero = pattern[projectedIndex] ?? pattern[0] ?? null;
      const bonus = Math.max(0, matchedCycles - minRepeats) * 0.12;
      const score = Math.min(1, coverage * 0.7 + bonus);
      return {
        length: len,
        pattern,
        matchedCycles,
        matchedEntries,
        coverage,
        nextNumero,
        score,
      };
    }
  }
  return null;
}

function buildGroupKey({ dow, horario }) {
  return `${dow}|${horario}`;
}

function parseDraw(draw) {
  const fecha = draw?.fecha;
  const fechaDate = parseDrawDate(fecha);
  if (!fechaDate) return null;
  const numero = toNumber(draw?.numero);
  if (numero === null) return null;
  return {
    id: draw.id,
    fecha,
    fechaDate,
    timestamp: fechaDate.getTime(),
    dayOfWeek: fechaDate.getDay(),
    horario: draw?.horario || null,
    pais: draw?.pais || null,
    numero,
  };
}

function summarizeTimeline(entries = [], maxSamples = 12) {
  const trimmed = entries.slice(-maxSamples);
  const numeros = trimmed.map((entry) => entry.numero);
  const last = trimmed[trimmed.length - 1] || null;
  const windowStart = trimmed[0]?.fechaDate || null;
  const windowEnd = last?.fechaDate || null;
  return {
    serie: numeros,
    trimmed,
    last,
    windowStart,
    windowEnd,
  };
}

export function analizarSecuenciasSemanales(draws = [], options = {}) {
  const {
    pais = null,
    turno = null,
    maxSamples = 12,
    minRepeats = 2,
    minEntries = 4,
    maxCycleLength = 6,
  } = options;

  const filterPais = pais && pais !== "ALL" ? pais : null;
  const filterTurno = turno && turno !== "ALL" ? turno : null;
  const maxSerieSamples = Math.max(4, maxSamples);
  const validDraws = Array.isArray(draws) ? draws : [];
  const groups = new Map();

  validDraws.forEach((raw) => {
    if (raw?.isTest) return;
    if (filterPais && raw.pais !== filterPais) return;
    if (filterTurno && raw.horario !== filterTurno) return;
    const parsed = parseDraw(raw);
    if (!parsed || !parsed.horario) return;
    const key = buildGroupKey({ dow: parsed.dayOfWeek, horario: parsed.horario });
    if (!groups.has(key)) {
      groups.set(key, { dow: parsed.dayOfWeek, horario: parsed.horario, entries: [] });
    }
    groups.get(key).entries.push(parsed);
  });

  const combos = [];
  groups.forEach((group) => {
    const sorted = group.entries
      .slice()
      .sort((a, b) => a.fechaDate - b.fechaDate || (HORARIO_ORDER[a.horario] ?? 0) - (HORARIO_ORDER[b.horario] ?? 0));
    if (sorted.length < minEntries) return;
    const { serie, trimmed, last, windowStart, windowEnd } = summarizeTimeline(sorted, maxSerieSamples);
    const cycle = detectCycle(serie, {
      minLength: 2,
      maxLength: Math.max(2, Math.min(maxCycleLength, serie.length - 1)),
      minRepeats,
    });
    const nextDate = last?.fechaDate ? formatDateISO(new Date(last.fechaDate.getTime() + 7 * DAY_MS)) : null;
    combos.push({
      dow: group.dow,
      horario: group.horario,
      total: sorted.length,
      serie,
      muestra: trimmed,
      windowStart: windowStart ? formatDateISO(windowStart) : null,
      windowEnd: windowEnd ? formatDateISO(windowEnd) : null,
      lastFecha: last?.fecha || null,
      lastPais: last?.pais || null,
      nextDate,
      cycle,
    });
  });

  combos.sort((a, b) => {
    if (a.dow !== b.dow) return a.dow - b.dow;
    return (HORARIO_ORDER[a.horario] ?? 0) - (HORARIO_ORDER[b.horario] ?? 0);
  });

  const withCycle = combos.filter((combo) => combo.cycle);
  const strongest = withCycle
    .slice()
    .sort((a, b) => (b.cycle?.score || 0) - (a.cycle?.score || 0))
    .slice(0, 5);

  return {
    filtro: {
      pais: filterPais,
      turno: filterTurno,
      maxSamples: maxSerieSamples,
      minRepeats,
    },
    combos,
    stats: {
      totalCombos: combos.length,
      combosConCiclo: withCycle.length,
      destacados: strongest,
    },
  };
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function sortByTimestamp(a, b) {
  return (a.timestamp || 0) - (b.timestamp || 0);
}

export function analizarComparacionMensual(draws = [], options = {}) {
  const {
    pais = null,
    turno = null,
    dow = null,
    monthsBack = 8,
    minRepeats = 2,
  } = options || {};
  const filterPais = pais && pais !== "ALL" ? pais : null;
  const filterTurno = turno || null;
  const filterDow = Number.isFinite(dow) ? dow : null;

  if (!Number.isFinite(filterDow)) {
    return {
      mensaje: "Selecciona un día de la semana para comparar meses.",
      filtro: { pais: filterPais, turno: filterTurno, dow: filterDow, monthsBack },
      months: [],
      stats: null,
      sequences: { start: [], end: [] },
    };
  }

  const validDraws = Array.isArray(draws) ? draws : [];
  const months = new Map();

  validDraws.forEach((raw) => {
    if (raw?.isTest) return;
    if (filterPais && raw.pais !== filterPais) return;
    if (filterTurno && raw.horario !== filterTurno) return;
    const parsed = parseDraw(raw);
    if (!parsed || !parsed.horario) return;
    if (parsed.dayOfWeek !== filterDow) return;
    const key = getMonthKey(parsed.fechaDate);
    if (!months.has(key)) {
      months.set(key, { key, entries: [] });
    }
    months.get(key).entries.push(parsed);
  });

  const ordered = Array.from(months.values())
    .map((group) => {
      const sortedEntries = group.entries
        .slice()
        .sort((a, b) => sortByTimestamp(a, b) || (HORARIO_ORDER[a.horario] ?? 0) - (HORARIO_ORDER[b.horario] ?? 0));
      const first = sortedEntries[0] || null;
      const last = sortedEntries[sortedEntries.length - 1] || null;
      const midIndex = Math.floor(sortedEntries.length / 2);
      const mid = sortedEntries[midIndex] || null;
      const midWindow = sortedEntries.slice(Math.max(0, midIndex - 1), Math.min(sortedEntries.length, midIndex + 2));
      return {
        key: group.key,
        year: first?.fechaDate?.getFullYear() ?? null,
        month: first?.fechaDate?.getMonth() ?? null,
        first,
        last,
        total: sortedEntries.length,
        head: sortedEntries.slice(0, 3),
        tail: sortedEntries.slice(-3),
        mid,
        midWindow,
        entries: sortedEntries,
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  const limited = ordered.slice(-Math.max(3, monthsBack || 6));
  const startSequence = limited.map((month) => ({ key: month.key, numero: month.first?.numero ?? null }));
  const endSequence = limited.map((month) => ({ key: month.key, numero: month.last?.numero ?? null }));

  const startCycle = detectCycle(
    startSequence.map((entry) => entry.numero).filter((n) => Number.isFinite(n)),
    { minLength: 2, maxLength: Math.min(6, startSequence.length), minRepeats },
  );
  const endCycle = detectCycle(
    endSequence.map((entry) => entry.numero).filter((n) => Number.isFinite(n)),
    { minLength: 2, maxLength: Math.min(6, endSequence.length), minRepeats },
  );

  return {
    filtro: { pais: filterPais, turno: filterTurno, dow: filterDow, monthsBack },
    months: limited,
    stats: {
      totalMonths: limited.length,
      startCycle,
      endCycle,
    },
    sequences: {
      start: startSequence,
      end: endSequence,
    },
  };
}
