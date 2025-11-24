import { parseDrawDate, formatDateISO } from "./date-utils.js";

const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTH_LABELS = MONTH_NAMES.map((name) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`);
const MAX_TREND_POINTS = 240;
const LINE_STEP = 10;

function clampMonthIndex(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0 || value > 11) return fallback;
  return value;
}

function toNumber(value) {
  const num = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

function getLineBand(numero) {
  if (!Number.isFinite(numero)) return null;
  const base = Math.floor(numero / LINE_STEP) * LINE_STEP;
  return Math.max(0, Math.min(90, base));
}

function formatLineLabel(band) {
  if (!Number.isFinite(band)) return "";
  const start = Math.max(0, Math.min(90, band));
  const end = Math.min(99, start + LINE_STEP - 1);
  return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

function average(values = []) {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeTrend(numbers = []) {
  if (!numbers.length) {
    return { startAvg: null, endAvg: null, delta: 0 };
  }
  const chunk = Math.max(1, Math.floor(numbers.length / 3));
  const startAvg = average(numbers.slice(0, chunk));
  const endAvg = average(numbers.slice(-chunk));
  const delta =
    startAvg !== null && endAvg !== null
      ? Number.isFinite(endAvg - startAvg)
        ? endAvg - startAvg
        : 0
      : 0;
  return { startAvg, endAvg, delta };
}

function parseEntries(draws = [], { monthIndex, pais, turno }) {
  const entries = [];
  const limitPais = pais && pais !== "ALL" ? pais : null;
  const limitTurno = turno && turno !== "ALL" ? turno : null;

  draws.forEach((raw) => {
    if (!raw || raw.isTest) return;
    if (limitPais && raw.pais !== limitPais) return;
    if (limitTurno && raw.horario !== limitTurno) return;
    const numero = toNumber(raw.numero);
    if (numero === null || numero < 0 || numero > 99) return;
    const fechaDate = parseDrawDate(raw.fecha);
    if (!fechaDate) return;
    if (fechaDate.getMonth() !== monthIndex) return;
    const fecha = formatDateISO(fechaDate);
    const timestamp = fechaDate.getTime() + (HORARIO_ORDER[raw.horario] ?? 0) * 1_000;
    entries.push({
      id: raw.id,
      numero,
      fecha,
      fechaDate,
      horario: raw.horario || null,
      pais: raw.pais || null,
      timestamp,
      year: fechaDate.getFullYear(),
      dayOfMonth: fechaDate.getDate(),
    });
  });
  return entries;
}

function buildStreaks(timeline = []) {
  if (!timeline.length) return [];
  const streaks = [];
  let active = null;
  for (let i = 0; i < timeline.length; i++) {
    const current = timeline[i];
    const prev = i > 0 ? timeline[i - 1] : null;
    if (!prev || prev.numero !== current.numero) {
      if (active && active.length > 1) streaks.push(active);
      active = { numero: current.numero, length: 1, start: current, end: current };
    } else {
      active.length += 1;
      active.end = current;
    }
  }
  if (active && active.length > 1) streaks.push(active);
  return streaks.sort((a, b) => b.length - a.length);
}

export function analizarPatronesMensuales(draws = [], options = {}) {
  const {
    month = null,
    pais = null,
    turno = null,
    yearsBack = 5,
    minEntries = 18,
  } = options || {};
  const now = new Date();
  const targetMonth = clampMonthIndex(month, now.getMonth());
  const entries = parseEntries(draws, { monthIndex: targetMonth, pais, turno });
  if (!entries.length) {
    return {
      filtro: { month: targetMonth, pais, turno, yearsBack },
      timeline: [],
      yearBreakdown: [],
      stats: {
        totalDraws: 0,
        alerts: [],
        topNumbers: [],
        lineStats: [],
        repeatShare: 0,
        consecutiveShare: 0,
        yearsCount: 0,
        uniqueNumbers: 0,
        trend: { startAvg: null, endAvg: null, delta: 0 },
        longestStreak: null,
      },
      monthLabel: MONTH_LABELS[targetMonth] || "Mes",
    };
  }

  const years = Array.from(new Set(entries.map((entry) => entry.year))).sort((a, b) => a - b);
  const limitYears = Math.max(1, Math.min(yearsBack || 5, years.length));
  const recentYears = years.slice(-limitYears);
  const timeline = entries
    .filter((entry) => recentYears.includes(entry.year))
    .sort(
      (a, b) =>
        (a.timestamp || 0) - (b.timestamp || 0) ||
        (HORARIO_ORDER[a.horario] ?? 0) - (HORARIO_ORDER[b.horario] ?? 0),
    );

  if (!timeline.length) {
    return {
      filtro: { month: targetMonth, pais, turno, yearsBack },
      timeline: [],
      yearBreakdown: [],
      stats: {
        totalDraws: 0,
        alerts: [],
        topNumbers: [],
        lineStats: [],
        repeatShare: 0,
        consecutiveShare: 0,
        yearsCount: 0,
        uniqueNumbers: 0,
        trend: { startAvg: null, endAvg: null, delta: 0 },
        longestStreak: null,
      },
      monthLabel: MONTH_LABELS[targetMonth] || "Mes",
    };
  }

  const countsByNumber = new Map();
  const countsByLine = new Map();
  const yearStats = new Map();
  const seenNumbers = new Map();
  const totalScope = Math.max(minEntries, timeline.length);
  let repeatCount = 0;
  let consecutiveRepeats = 0;

  timeline.forEach((entry, index) => {
    const numero = entry.numero;
    const line = getLineBand(numero);
    const countInfo = countsByNumber.get(numero) || {
      numero,
      count: 0,
      years: new Set(),
      lastFecha: null,
      lastHorario: null,
      lastPais: null,
    };
    countInfo.count += 1;
    countInfo.years.add(entry.year);
    countInfo.lastFecha = entry.fecha;
    countInfo.lastHorario = entry.horario;
    countInfo.lastPais = entry.pais;
    countsByNumber.set(numero, countInfo);

    if (Number.isFinite(line)) {
      const lineInfo = countsByLine.get(line) || { band: line, count: 0 };
      lineInfo.count += 1;
      countsByLine.set(line, lineInfo);
    }

    const yearInfo = yearStats.get(entry.year) || { year: entry.year, total: 0, repeats: 0, unique: new Set(), lastFecha: null };
    yearInfo.total += 1;
    yearInfo.unique.add(numero);
    yearInfo.lastFecha = entry.fecha;
    yearStats.set(entry.year, yearInfo);

    const prev = seenNumbers.get(numero);
    entry.isRepeat = !!prev;
    if (entry.isRepeat) repeatCount += 1;
    const prevEntry = index > 0 ? timeline[index - 1] : null;
    entry.isConsecutive = !!(prevEntry && prevEntry.numero === numero);
    if (entry.isConsecutive) consecutiveRepeats += 1;
    if (entry.isRepeat) {
      yearInfo.repeats = (yearInfo.repeats || 0) + 1;
    }
    entry.lineBand = line;
    seenNumbers.set(numero, entry);
  });

  const totalDraws = timeline.length;
  const repeatShare = totalDraws ? repeatCount / totalDraws : 0;
  const consecutiveShare = totalDraws ? consecutiveRepeats / totalDraws : 0;
  const uniqueNumbers = countsByNumber.size;
  const topNumbers = Array.from(countsByNumber.values())
    .map((item) => ({
      numero: item.numero,
      count: item.count,
      years: Array.from(item.years).sort((a, b) => a - b),
      lastFecha: item.lastFecha,
      lastHorario: item.lastHorario,
      lastPais: item.lastPais,
    }))
    .sort((a, b) => b.count - a.count || a.numero - b.numero)
    .slice(0, 6);

  const lineStats = Array.from(countsByLine.values())
    .map((item) => ({
      band: item.band,
      label: formatLineLabel(item.band),
      count: item.count,
      share: totalDraws ? item.count / totalDraws : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const yearBreakdown = recentYears
    .map((year) => {
      const info = yearStats.get(year);
      if (!info) {
        return { year, total: 0, repeatShare: 0, unique: 0, lastFecha: null };
      }
      return {
        year,
        total: info.total,
        repeatShare: info.total ? (info.repeats || 0) / info.total : 0,
        unique: info.unique.size,
        lastFecha: info.lastFecha,
      };
    })
    .sort((a, b) => b.year - a.year);

  const numbersForTrend = timeline
    .slice(-Math.min(totalScope, MAX_TREND_POINTS))
    .map((entry) => entry.numero);
  const trend = computeTrend(numbersForTrend);
  const streaks = buildStreaks(timeline);
  const longestStreak = streaks.length ? streaks[0] : null;

  const alerts = [];
  const monthLabel = MONTH_LABELS[targetMonth] || "Mes";
  if (repeatShare >= 0.34) {
    alerts.push({
      type: "repeat",
      title: "Mes reincidente",
      detail: `El ${Math.round(repeatShare * 100)}% de los sorteos repiten números ya vistos en ${monthLabel}.`,
    });
  }
  const strongest = topNumbers[0];
  const yearsCount = recentYears.length;
  if (strongest && strongest.count >= Math.max(3, Math.round(yearsCount * 0.6))) {
    alerts.push({
      type: "number",
      title: `Número faro ${String(strongest.numero).padStart(2, "0")}`,
      detail: `Aparece ${strongest.count} veces en los últimos ${yearsCount} años (${strongest.years.length} temporadas).`,
    });
  }
  if (longestStreak && longestStreak.length >= 3) {
    alerts.push({
      type: "streak",
      title: "Rachas consecutivas",
      detail: `${String(longestStreak.numero).padStart(2, "0")} se repitió ${longestStreak.length} turnos seguidos (${longestStreak.start.fecha} → ${longestStreak.end.fecha}).`,
    });
  } else if (consecutiveShare >= 0.12) {
    alerts.push({
      type: "streak",
      title: "Duplicados frecuentes",
      detail: `${Math.round(consecutiveShare * 100)}% de los sorteos repite el número inmediatamente anterior.`,
    });
  }
  const topLine = lineStats[0];
  if (topLine && topLine.share >= 0.42) {
    alerts.push({
      type: "line",
      title: "Línea dominante",
      detail: `${topLine.label} concentra ${Math.round(topLine.share * 100)}% de las apariciones.`,
    });
  }
  if (trend && trend.startAvg !== null && trend.endAvg !== null) {
    const delta = Math.round(trend.delta);
    if (Math.abs(delta) >= 7) {
      alerts.push({
        type: "trend",
        title: delta > 0 ? "Escala ascendente" : "Escala descendente",
        detail: `El promedio del mes pasó de ${Math.round(trend.startAvg)} a ${Math.round(trend.endAvg)} (${delta > 0 ? "+" : ""}${delta}).`,
      });
    }
  }
  const highestRepeatYear = yearBreakdown.find((entry) => entry.repeatShare >= 0.45);
  if (highestRepeatYear) {
    alerts.push({
      type: "year",
      title: `Temporada ${highestRepeatYear.year}`,
      detail: `Tuvo ${Math.round(highestRepeatYear.repeatShare * 100)}% de repeticiones internas.`,
    });
  }

  return {
    filtro: { month: targetMonth, pais, turno, yearsBack },
    timeline,
    yearBreakdown,
    stats: {
      totalDraws,
      repeatShare,
      consecutiveShare,
      topNumbers,
      lineStats,
      alerts,
      yearsCount,
      uniqueNumbers,
      trend,
      longestStreak,
    },
    monthLabel,
  };
}
