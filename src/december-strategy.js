import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = {
  "11AM": 0,
  "3PM": 1,
  "9PM": 2,
};

const defaultSymbolGetter = () => "";

const clampNumero = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return ((num % 100) + 100) % 100;
};

const toISODate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const addDays = (date, days = 0) => {
  if (!(date instanceof Date)) return null;
  const result = new Date(date);
  result.setDate(result.getDate() + Math.trunc(days));
  return result;
};

const diffDays = (later, earlier) => {
  if (!(later instanceof Date) || !(earlier instanceof Date)) return null;
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
};

const sanitizeDecemberDraws = (rawDraws = [], { includeTest = false } = {}) => {
  const draws = [];
  rawDraws.forEach((draw) => {
    if (!draw) return;
    if (!includeTest && draw.isTest) return;
    const numero = clampNumero(draw.numero);
    if (numero === null) return;
    const fechaDate = parseDrawDate(draw.fecha);
    if (!fechaDate) return;
    const month = fechaDate.getMonth() + 1;
    if (month !== 12) return;
    const turnoOffset = HORARIO_ORDER[draw.horario] ?? 0;
    const timestamp = fechaDate.getTime() + turnoOffset * 60 * 60 * 1000;
    draws.push({
      id: draw.id,
      numero,
      fecha: draw.fecha,
      horario: draw.horario,
      pais: draw.pais,
      isTest: !!draw.isTest,
      timestamp,
      fechaDate,
      year: fechaDate.getFullYear(),
      month,
      day: fechaDate.getDate(),
    });
  });
  return draws.sort((a, b) => a.timestamp - b.timestamp);
};

const buildWindowsFromEvents = (events = [], totalRepeats = 0) => {
  if (!events.length) return [];
  const statMap = new Map();
  events.forEach((event) => {
    const baseGap = Number.isFinite(event.gapFromPrev) ? event.gapFromPrev : event.gapFromStart;
    if (!Number.isFinite(baseGap) || baseGap <= 0) return;
    const gap = Math.max(1, Math.round(baseGap));
    let stat = statMap.get(gap);
    if (!stat) {
      stat = { gap, count: 0, turnPairs: new Map() };
      statMap.set(gap, stat);
    }
    stat.count += 1;
    const fromTurn = event.from?.horario || "—";
    const toTurn = event.to?.horario || "—";
    const pairKey = `${fromTurn}->${toTurn}`;
    stat.turnPairs.set(pairKey, (stat.turnPairs.get(pairKey) || 0) + 1);
  });
  if (!statMap.size) return [];
  return Array.from(statMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.gap - b.gap;
    })
    .map((stat) => {
      const confidence = totalRepeats > 0 ? stat.count / totalRepeats : 0;
      const tolerance = stat.gap <= 3 ? 0 : stat.gap <= 6 ? 1 : stat.gap <= 10 ? 2 : 3;
      const turnHints = Array.from(stat.turnPairs.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([pair, count]) => ({
          pair,
          count,
          weight: stat.count ? count / stat.count : 0,
        }));
      return {
        gap: stat.gap,
        count: stat.count,
        confidence,
        tolerance,
        turnHints,
      };
    });
};

const buildWatcherForYear = (entry, yearData, { referenceDate }) => {
  if (!entry || !yearData || !Array.isArray(yearData.hits) || !yearData.hits.length) {
    return null;
  }
  const baseDate = parseDrawDate(yearData.hits[0]?.fecha);
  if (!baseDate) return null;
  const windows = entry.windows || [];
  const evaluationDate =
    yearData.year === referenceDate.getFullYear()
      ? referenceDate
      : new Date(`${yearData.year}-12-31T23:59:59`);
  const windowsDetail = windows.map((window) => {
    const targetDate = addDays(baseDate, window.gap);
    if (!targetDate) return null;
    const start = addDays(targetDate, -window.tolerance);
    const end = addDays(targetDate, window.tolerance);
    const match = yearData.hits.slice(1).find((hit) => {
      const hitDate = parseDrawDate(hit.fecha);
      if (!hitDate) return false;
      const delta = diffDays(hitDate, baseDate);
      return (
        delta !== null &&
        delta >= window.gap - window.tolerance &&
        delta <= window.gap + window.tolerance
      );
    });
    let status = "upcoming";
    if (match) {
      status = "hit";
    } else if (evaluationDate && start && evaluationDate < start) {
      status = "tracking";
    } else if (evaluationDate && end && evaluationDate > end) {
      status = "missed";
    } else {
      status = "due";
    }
    return {
      gap: window.gap,
      tolerance: window.tolerance,
      confidence: window.confidence,
      expectedDate: toISODate(targetDate),
      windowStart: toISODate(start),
      windowEnd: toISODate(end),
      hit: match
        ? {
            fecha: match.fecha,
            horario: match.horario,
            pais: match.pais,
          }
        : null,
      status,
      turnHints: window.turnHints,
    };
  });
  const statusPriority = (state) => {
    switch (state) {
      case "due":
        return 0;
      case "tracking":
        return 1;
      case "hit":
        return 2;
      case "missed":
        return 3;
      default:
        return 4;
    }
  };
  const activeWindow =
    windowsDetail.find((win) => win.status === "due") ||
    windowsDetail.find((win) => win.status === "tracking") ||
    windowsDetail.find((win) => win.status === "hit") ||
    windowsDetail[0] ||
    null;
  const status = activeWindow ? activeWindow.status : yearData.hits.length > 1 ? "completed" : "origin";
  const sortedWindows = windowsDetail
    .slice()
    .sort((a, b) => statusPriority(a.status) - statusPriority(b.status) || b.confidence - a.confidence);
  return {
    numero: entry.numero,
    symbol: entry.symbol,
    year: yearData.year,
    origin: yearData.hits[0],
    last: yearData.hits[yearData.hits.length - 1],
    totalHits: yearData.hits.length,
    windows: sortedWindows,
    status,
    activeWindow,
    events: yearData.events,
    hits: yearData.hits,
    windowsRaw: windowsDetail,
  };
};

export function computeDecemberStrategy(rawDraws, options = {}) {
  const {
    includeTest = false,
    referenceDate = new Date(),
    getSymbol = defaultSymbolGetter,
  } = options;
  const decemberDraws = sanitizeDecemberDraws(rawDraws, { includeTest });
  const yearsSet = new Set();
  const perNumber = new Map();

  decemberDraws.forEach((draw) => {
    yearsSet.add(draw.year);
    let entry = perNumber.get(draw.numero);
    if (!entry) {
      entry = {
        numero: draw.numero,
        symbol: "",
        timelines: new Map(),
      };
      perNumber.set(draw.numero, entry);
    }
    const perYear = entry.timelines.get(draw.year) || [];
    perYear.push(draw);
    entry.timelines.set(draw.year, perYear);
  });

  const watchersByYear = new Map();
  perNumber.forEach((entry) => {
    entry.symbol = getSymbol(entry.numero) || "";
    const history = [];
    let repeats = 0;
    entry.timelines.forEach((timeline, year) => {
      const sorted = timeline.slice().sort((a, b) => a.timestamp - b.timestamp);
      const hits = sorted.map((item) => ({
        fecha: item.fecha,
        horario: item.horario,
        pais: item.pais,
        timestamp: item.timestamp,
        day: item.day,
      }));
      const events = [];
      sorted.forEach((item, index) => {
        if (index === 0) return;
        const prev = sorted[index - 1];
        const gapFromPrev = diffDays(item.fechaDate, prev.fechaDate);
        const gapFromStart = diffDays(item.fechaDate, sorted[0].fechaDate);
        events.push({
          year,
          gapFromPrev,
          gapFromStart,
          from: { fecha: prev.fecha, horario: prev.horario },
          to: { fecha: item.fecha, horario: item.horario },
        });
      });
      repeats += events.length;
      history.push({ year, hits, events });
    });
    history.sort((a, b) => a.year - b.year);
    entry.history = history;
    entry.totalRepeats = repeats;
    entry.windows = buildWindowsFromEvents(
      history.flatMap((segment) => segment.events || []),
      repeats
    );
    history.forEach((segment) => {
      const watcher = buildWatcherForYear(entry, segment, { referenceDate });
      if (!watcher) return;
      if (!watchersByYear.has(segment.year)) {
        watchersByYear.set(segment.year, []);
      }
      watchersByYear.get(segment.year).push(watcher);
    });
  });

  const watchersOrder = (status) => {
    switch (status) {
      case "due":
        return 0;
      case "tracking":
        return 1;
      case "hit":
      case "completed":
        return 2;
      case "missed":
        return 3;
      case "origin":
      default:
        return 4;
    }
  };

  watchersByYear.forEach((list) => {
    list.sort((a, b) => {
      const rank = watchersOrder(a.status) - watchersOrder(b.status);
      if (rank !== 0) return rank;
      const confidenceA = a.activeWindow?.confidence || 0;
      const confidenceB = b.activeWindow?.confidence || 0;
      if (confidenceB !== confidenceA) return confidenceB - confidenceA;
      if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
      return a.numero - b.numero;
    });
  });

  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const totalRepeats = Array.from(perNumber.values()).reduce(
    (sum, entry) => sum + (entry.totalRepeats || 0),
    0
  );
  return {
    years,
    summary: {
      totalNumbers: perNumber.size,
      totalRepeats,
      draws: decemberDraws.length,
      yearsTracked: years.length,
    },
    perNumber,
    watchersByYear,
  };
}
