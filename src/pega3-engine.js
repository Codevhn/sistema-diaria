import { parseDrawDate } from "./date-utils.js";

const TURNOS = ["11AM", "3PM", "9PM"];
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeDraw(raw) {
  if (!raw) return null;
  const fechaDate = parseDrawDate(raw.fecha);
  if (!fechaDate) return null;
  const horario = TURNOS.includes(raw.horario) ? raw.horario : TURNOS[0];
  const pais = (raw.pais || "").trim().toUpperCase() || "HN";
  const pares = Array.isArray(raw.pares) ? raw.pares.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n)) : [];
  if (pares.length !== 3) return null;
  const baseTs = fechaDate.getTime();
  const offset = TURNOS.indexOf(horario) * 6 * 60 * 60 * 1000;
  return {
    fecha: raw.fecha,
    horario,
    pais,
    pares,
    fechaDate,
    timestamp: baseTs + offset,
    dayOfWeek: fechaDate.getDay(),
    month: fechaDate.getMonth(),
  };
}

function prepareTimeline(draws = []) {
  return draws.map(normalizeDraw).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
}

function ensureNumeroEntry(map, numero) {
  if (!map.has(numero)) {
    map.set(numero, {
      numero,
      total: 0,
      turnCounts: {},
      positionCounts: {},
      dowCounts: {},
      monthCounts: {},
      partners: new Map(),
      gap: { total: 0, count: 0, last: null, hist: new Map() },
      lastTs: null,
      lastSeen: null,
    });
  }
  return map.get(numero);
}

function buildExternalMap(draws = []) {
  const map = new Map();
  draws.forEach((draw) => {
    if (!draw?.fecha || !draw?.horario) return;
    const numero = typeof draw.numero === "number" ? draw.numero : parseInt(draw.numero, 10);
    if (!Number.isFinite(numero)) return;
    const key = `${draw.fecha}|${draw.horario}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(numero);
  });
  return map;
}

function reverseNumber(value) {
  const str = String(value).padStart(2, "0");
  return parseInt(str.split("").reverse().join(""), 10);
}

function computeRecentMap(timeline, windowSize = 20) {
  const map = new Map();
  if (!timeline.length) return map;
  const recent = timeline.slice(-Math.max(1, Math.min(windowSize, timeline.length)));
  recent.forEach((draw) => {
    draw.pares.forEach((numero) => {
      map.set(numero, (map.get(numero) || 0) + 1);
    });
  });
  return map;
}

function finalizeNumeroEntry(entry, { totalSamples, latestTs, recentMap, externalHits }) {
  const freq = entry.total / Math.max(1, totalSamples);
  const daysSince = entry.lastTs ? Math.max(0, Math.round((latestTs - entry.lastTs) / DAY_MS)) : null;
  const recencyScore = entry.lastTs ? Math.exp(-Math.max(0, daysSince) / 7) : 0;
  const turnPeakEntry = Object.entries(entry.turnCounts || {}).sort((a, b) => b[1] - a[1])[0] || [TURNOS[0], 0];
  const positionPeakEntry = Object.entries(entry.positionCounts || {}).sort((a, b) => b[1] - a[1])[0] || ["0", 0];
  const dowPeakEntry = Object.entries(entry.dowCounts || {}).sort((a, b) => b[1] - a[1])[0] || ["0", 0];
  const monthPeakEntry = Object.entries(entry.monthCounts || {}).sort((a, b) => b[1] - a[1])[0] || ["0", 0];
  const partnerTopEntry = Array.from(entry.partners.entries()).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const avgGap = entry.gap.count ? entry.gap.total / entry.gap.count : null;
  let gapMode = null;
  let modeHits = 0;
  entry.gap.hist.forEach((count, gapValue) => {
    if (count > modeHits) {
      modeHits = count;
      gapMode = gapValue;
    }
  });
  const gapScore =
    daysSince !== null && avgGap
      ? clamp01(1 - Math.abs(daysSince - avgGap) / Math.max(1, avgGap * 1.5))
      : daysSince !== null
        ? clamp01(1 / (1 + daysSince / 12))
        : 0;
  const recentCount = recentMap.get(entry.numero) || 0;
  const recentRatio = clamp01(recentCount / Math.max(1, recentMap.size * 3));
  const externalShare = clamp01((externalHits.get(entry.numero) || 0) / Math.max(1, entry.total));
  return {
    numero: entry.numero,
    total: entry.total,
    freq,
    turnRatios: TURNOS.reduce((acc, turno) => {
      acc[turno] = (entry.turnCounts[turno] || 0) / Math.max(1, entry.total);
      return acc;
    }, {}),
    positionRatios: [0, 1, 2].reduce((acc, pos) => {
      acc[pos] = (entry.positionCounts[pos] || 0) / Math.max(1, entry.total);
      return acc;
    }, {}),
    dowRatios: entry.dowCounts,
    monthRatios: entry.monthCounts,
    partnerTop: partnerTopEntry[0],
    partnerTopCount: partnerTopEntry[1],
    pairStrength: clamp01(partnerTopEntry[1] / Math.max(1, entry.total - 1)),
    lastSeen: entry.lastSeen,
    daysSince,
    recencyScore,
    gap: {
      avg: avgGap,
      mode: gapMode,
      last: entry.gap.last,
    },
    gapScore,
    recentCount,
    recentRatio,
    externalShare,
    turnoFuerte: turnPeakEntry[0],
    turnPeak: clamp01(turnPeakEntry[1] / Math.max(1, entry.total)),
    positionPeak: clamp01(positionPeakEntry[1] / Math.max(1, entry.total)),
    dowPeak: parseInt(dowPeakEntry[0], 10),
    dowPeakRatio: clamp01(dowPeakEntry[1] / Math.max(1, entry.total)),
    monthPeak: parseInt(monthPeakEntry[0], 10),
    monthPeakRatio: clamp01(monthPeakEntry[1] / Math.max(1, entry.total)),
  };
}

function determineTurnTarget(draws = []) {
  if (!draws.length) {
    return { turno: "11AM", label: "próximo 11AM" };
  }
  const latest = draws[draws.length - 1].fecha;
  const seen = new Set();
  draws.forEach((draw) => {
    if (draw.fecha === latest) seen.add(draw.horario);
  });
  const count = seen.size;
  if (count === 0) return { turno: "11AM", label: "próximo 11AM" };
  if (count === 1) return { turno: "3PM", label: "próximo 3PM" };
  if (count === 2) return { turno: "9PM", label: "próximo 9PM" };
  return { turno: "11AM", label: "mañana 11AM" };
}

function computeStats(timeline, externa = []) {
  const numeroStats = new Map();
  const pairStats = new Map();
  const patternSummary = { repetidos: 0, vecinos: 0, espejos: 0, escaleras: 0 };
  const crossTurn = { directas: 0, espejos: 0, repeticiones: 0 };
  const externalMap = buildExternalMap(externa);
  const externalHits = new Map();
  const lastOccurrence = new Map();
  const lastTurnRecord = new Map();
  const totalDraws = timeline.length;
  const totalSamples = totalDraws * 3;
  const latestTs = timeline.length ? timeline[timeline.length - 1].timestamp : 0;

  timeline.forEach((draw) => {
    const unique = new Set(draw.pares);
    if (unique.size < draw.pares.length) patternSummary.repetidos += 1;
    const sorted = [...draw.pares].sort((a, b) => a - b);
    if (sorted[2] - sorted[0] <= 4) patternSummary.vecinos += 1;
    if (
      draw.pares.some((value, idx) => {
        const next = draw.pares[(idx + 1) % draw.pares.length];
        return reverseNumber(value) === next;
      })
    ) {
      patternSummary.espejos += 1;
    }
    if (sorted[1] - sorted[0] === sorted[2] - sorted[1]) patternSummary.escaleras += 1;

    const turnoIndex = TURNOS.indexOf(draw.horario);
    const prevTurno = TURNOS[(turnoIndex + TURNOS.length - 1) % TURNOS.length];
    const prevTurnDraw = lastTurnRecord.get(prevTurno);
    if (prevTurnDraw && prevTurnDraw.fecha === draw.fecha) {
      if (prevTurnDraw.pares[0] === draw.pares[0]) crossTurn.directas += 1;
      if (reverseNumber(prevTurnDraw.pares[2]) === draw.pares[2]) crossTurn.espejos += 1;
      const anyShared = prevTurnDraw.pares.some((numero) => draw.pares.includes(numero));
      if (anyShared) crossTurn.repeticiones += 1;
    }
    lastTurnRecord.set(draw.horario, draw);

    const extKey = `${draw.fecha}|${draw.horario}`;
    const extSet = externalMap.get(extKey);

    draw.pares.forEach((numero, pos) => {
      const entry = ensureNumeroEntry(numeroStats, numero);
      entry.total += 1;
      entry.turnCounts[draw.horario] = (entry.turnCounts[draw.horario] || 0) + 1;
      entry.positionCounts[pos] = (entry.positionCounts[pos] || 0) + 1;
      entry.dowCounts[draw.dayOfWeek] = (entry.dowCounts[draw.dayOfWeek] || 0) + 1;
      entry.monthCounts[draw.month] = (entry.monthCounts[draw.month] || 0) + 1;
      entry.lastSeen = {
        fecha: draw.fecha,
        horario: draw.horario,
        pais: draw.pais,
        position: pos,
      };
      entry.lastTs = draw.timestamp;
      const prevTs = lastOccurrence.get(numero);
      if (prevTs !== undefined) {
        const gapDays = Math.max(1, Math.round((draw.timestamp - prevTs) / DAY_MS));
        entry.gap.last = gapDays;
        entry.gap.total += gapDays;
        entry.gap.count += 1;
        entry.gap.hist.set(gapDays, (entry.gap.hist.get(gapDays) || 0) + 1);
      }
      lastOccurrence.set(numero, draw.timestamp);
      draw.pares.forEach((other, idx) => {
        if (idx === pos) return;
        entry.partners.set(other, (entry.partners.get(other) || 0) + 1);
      });
      if (extSet?.has(numero)) {
        externalHits.set(numero, (externalHits.get(numero) || 0) + 1);
      }
    });

    for (let i = 0; i < draw.pares.length; i += 1) {
      for (let j = i + 1; j < draw.pares.length; j += 1) {
        const pairKey = `${i}${j}|${draw.pares[i]}-${draw.pares[j]}`;
        if (!pairStats.has(pairKey)) {
          pairStats.set(pairKey, {
            positions: `${i}-${j}`,
            numeros: [draw.pares[i], draw.pares[j]],
            total: 0,
            turnCounts: {},
            lastSeen: null,
          });
        }
        const pairEntry = pairStats.get(pairKey);
        pairEntry.total += 1;
        pairEntry.turnCounts[draw.horario] = (pairEntry.turnCounts[draw.horario] || 0) + 1;
        pairEntry.lastSeen = { fecha: draw.fecha, horario: draw.horario };
      }
    }
  });

  const recentMap = computeRecentMap(timeline);
  const numeroList = Array.from(numeroStats.values())
    .map((entry) => finalizeNumeroEntry(entry, { totalSamples, latestTs, recentMap, externalHits }))
    .sort((a, b) => b.freq - a.freq);
  const pairList = Array.from(pairStats.values()).sort((a, b) => b.total - a.total);
  const externalSummary = Array.from(externalHits.entries())
    .map(([numero, count]) => ({
      numero,
      coef: clamp01(count / Math.max(1, numeroStats.get(numero)?.total || 1)),
    }))
    .sort((a, b) => b.coef - a.coef);

  return {
    totalDraws,
    totalSamples,
    numeroList,
    pairList,
    patternSummary,
    crossTurn,
    externalSummary,
    timeline,
  };
}

function clasificarSesgos(stats) {
  const fuertes = [];
  const moderados = [];
  const debiles = [];
  stats.numeroList.forEach((entry) => {
    const composite =
      entry.freq * 0.35 +
      entry.recencyScore * 0.2 +
      entry.pairStrength * 0.15 +
      entry.gapScore * 0.15 +
      entry.recentRatio * 0.1 +
      entry.externalShare * 0.05;
    const enriched = { ...entry, score: clamp01(composite) };
    if (
      entry.freq >= 0.022 &&
      entry.pairStrength >= 0.2 &&
      entry.recencyScore >= 0.4 &&
      entry.gapScore >= 0.4
    ) {
      fuertes.push(enriched);
    } else if (
      entry.freq >= 0.015 &&
      (entry.recencyScore >= 0.25 || entry.pairStrength >= 0.15 || entry.turnPeak >= 0.35 || entry.positionPeak >= 0.4)
    ) {
      moderados.push(enriched);
    } else if (
      entry.freq >= 0.01 ||
      entry.recencyScore >= 0.15 ||
      entry.recentRatio >= 0.12 ||
      entry.externalShare >= 0.08
    ) {
      debiles.push(enriched);
    }
  });
  fuertes.sort((a, b) => b.score - a.score);
  moderados.sort((a, b) => b.score - a.score);
  debiles.sort((a, b) => b.score - a.score);
  return {
    fuertes: fuertes.slice(0, 12),
    moderados: moderados.slice(0, 20),
    debiles: debiles.slice(0, 32),
  };
}

function seleccionarComodin(ranked, stats, top) {
  const used = new Set(top.map((item) => item.numero));
  const rest = stats.numeroList.filter((entry) => !used.has(entry.numero));
  const externalCandidate = rest.sort((a, b) => b.externalShare - a.externalShare)[0];
  if (externalCandidate && externalCandidate.externalShare >= 0.05) return externalCandidate.numero;
  const pairCandidate = rest.sort((a, b) => b.pairStrength - a.pairStrength)[0];
  if (pairCandidate) return pairCandidate.numero;
  return ranked.find((item) => !used.has(item.numero))?.numero ?? top[top.length - 1].numero;
}

function generarSeleccion(stats, sesgos) {
  const candidateScores = new Map();
  const numeroMap = new Map(stats.numeroList.map((entry) => [entry.numero, entry]));
  const accumulate = (lista, weight) => {
    lista.forEach((entry) => {
      if (!candidateScores.has(entry.numero)) {
        candidateScores.set(entry.numero, { numero: entry.numero, base: 0, score: 0 });
      }
      const bucket = candidateScores.get(entry.numero);
      bucket.base += (entry.score || 0) * weight;
    });
  };
  accumulate(sesgos.fuertes, 0.6);
  accumulate(sesgos.moderados, 0.25);
  accumulate(sesgos.debiles, 0.1);
  candidateScores.forEach((bucket, numero) => {
    const entry = numeroMap.get(numero);
    if (!entry) {
      candidateScores.delete(numero);
      return;
    }
    const stability = entry.pairStrength * 0.15 + entry.gapScore * 0.15 + Math.max(entry.dowPeakRatio || 0, entry.monthPeakRatio || 0) * 0.1;
    const momentum = entry.recencyScore * 0.2 + entry.recentRatio * 0.1 + entry.externalShare * 0.05;
    bucket.score = clamp01(bucket.base + stability + momentum + entry.freq * 0.2);
  });
  const ranked = Array.from(candidateScores.values())
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    return {
      top: [],
      secundarios: [],
      comodin: null,
      turnoObjetivo: determineTurnTarget(stats.timeline),
    };
  }
  const topCount = Math.min(5, Math.max(3, ranked.length));
  const top = ranked.slice(0, topCount);
  const secundarios = ranked.slice(topCount).filter((entry) => entry.score >= 0.35).slice(0, 3);
  const comodin = seleccionarComodin(ranked, stats, top);
  return {
    top,
    secundarios,
    comodin,
    turnoObjetivo: determineTurnTarget(stats.timeline),
  };
}

export function evaluarMotorPega3(draws = [], { externa = [] } = {}) {
  const timeline = prepareTimeline(draws);
  if (!timeline.length) {
    return {
      stats: null,
      sesgos: { fuertes: [], moderados: [], debiles: [] },
      seleccion: null,
    };
  }
  const stats = computeStats(timeline, externa);
  const sesgos = clasificarSesgos(stats);
  const seleccion = generarSeleccion(stats, sesgos);
  return { stats, sesgos, seleccion };
}
