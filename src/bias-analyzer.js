import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const TURNOS = ["11AM", "3PM", "9PM"];
const TURN_OFFSET_MS = 6 * 60 * 60 * 1000;

function hydrateDraw(raw) {
  if (!raw) return null;
  const fechaDate = parseDrawDate(raw.fecha);
  if (!fechaDate) return null;
  const numero = typeof raw.numero === "number" ? raw.numero : parseInt(raw.numero, 10);
  if (!Number.isFinite(numero)) return null;
  const turno = raw.horario || null;
  const baseTs = fechaDate.getTime();
  const offset = (HORARIO_ORDER[turno] ?? 0) * TURN_OFFSET_MS;
  return {
    numero,
    fecha: raw.fecha,
    fechaDate,
    horario: turno,
    pais: raw.pais || null,
    timestamp: baseTs + offset,
    dayOfWeek: fechaDate.getDay(),
  };
}

function prepareTimeline(draws) {
  return draws
    .map(hydrateDraw)
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function buildStats(draws) {
  const total = draws.length;
  const map = new Map();
  draws.forEach((draw) => {
    if (!map.has(draw.numero)) {
      map.set(draw.numero, {
        numero: draw.numero,
        total: 0,
        turnCounts: {},
        dowCounts: {},
        last: null,
      });
    }
    const entry = map.get(draw.numero);
    entry.total += 1;
    const turno = draw.horario || "—";
    entry.turnCounts[turno] = (entry.turnCounts[turno] || 0) + 1;
    const dow = draw.dayOfWeek;
    if (dow !== null && dow !== undefined) {
      entry.dowCounts[dow] = (entry.dowCounts[dow] || 0) + 1;
    }
    if (!entry.last || draw.timestamp > entry.last.timestamp) {
      entry.last = draw;
    }
  });

  map.forEach((entry) => {
    const count = entry.total || 1;
    entry.freq = total ? entry.total / total : 0;
    entry.turnRatios = {};
    TURNOS.forEach((turno) => {
      entry.turnRatios[turno] = (entry.turnCounts[turno] || 0) / count;
    });
    entry.dowRatios = {};
    for (let i = 0; i < 7; i += 1) {
      entry.dowRatios[i] = (entry.dowCounts[i] || 0) / count;
    }
  });

  return { total, map };
}

function computeGapInfo(perfil, tolerance = 1) {
  const historial = Array.isArray(perfil?.gaps?.historial) ? perfil.gaps.historial : [];
  const daysSince = perfil?.gaps?.daysSince ?? null;
  if (!historial.length) {
    return { mode: null, matches: 0, daysSince, isActive: false };
  }
  const freq = new Map();
  historial.forEach((item) => {
    const gap = Number.isFinite(item?.gap) ? Math.round(item.gap) : null;
    if (gap === null) return;
    freq.set(gap, (freq.get(gap) || 0) + 1);
  });
  let mode = null;
  let matches = 0;
  freq.forEach((count, gap) => {
    if (count > matches) {
      matches = count;
      mode = gap;
    }
  });
  const isActive = mode !== null && Number.isFinite(daysSince) && Math.abs(daysSince - mode) <= tolerance;
  return { mode, matches, daysSince, isActive };
}

function findNarrative(perfil, referenceTs, days = 30) {
  const windowMs = days * DAY_MS;
  const hipos = Array.isArray(perfil?.hipotesis?.detalles) ? perfil.hipotesis.detalles : [];
  for (let i = hipos.length - 1; i >= 0; i -= 1) {
    const detalle = hipos[i];
    if (!detalle || detalle.estado !== "confirmada") continue;
    const fecha = parseDrawDate(detalle.fecha);
    if (!fecha) continue;
    if (referenceTs - fecha.getTime() <= windowMs) {
      return {
        active: true,
        fecha: detalle.fecha,
        fuente: detalle.texto || detalle.simbolo || "",
        tipo: "hipotesis",
      };
    }
  }
  const ultimo = perfil?.aprendizaje?.ultimoResultado;
  if (ultimo?.estado === "confirmada" && ultimo.fecha) {
    const fecha = parseDrawDate(ultimo.fecha);
    if (fecha && referenceTs - fecha.getTime() <= windowMs) {
      return {
        active: true,
        fecha: ultimo.fecha,
        fuente: ultimo.horario || "",
        tipo: "aprendizaje",
      };
    }
  }
  return { active: false };
}

function normalizeLast(last) {
  if (!last) return null;
  return {
    fecha: last.fecha || null,
    horario: last.horario || null,
    pais: last.pais || null,
  };
}

export function analizarSesgos({
  draws = [],
  perfiles = [],
  predicciones = [],
  contexto = {},
  targetTurn = "9PM",
  windowDays = 120,
  narrativeDays = 30,
  maxActivos = 12,
} = {}) {
  if (!draws.length || !perfiles.length || !predicciones.length) {
    return { activos: [], historicos: [], window: null };
  }
  const timeline = prepareTimeline(draws);
  if (!timeline.length) return { activos: [], historicos: [], window: null };
  const latest = timeline[timeline.length - 1];
  const cutoffTs = latest.timestamp - windowDays * DAY_MS;
  const windowDraws = timeline.filter((draw) => draw.timestamp >= cutoffTs);
  const historicDraws = timeline.filter((draw) => draw.timestamp < cutoffTs);
  const windowStats = buildStats(windowDraws);
  const historicStats = buildStats(historicDraws);
  const predMap = new Map(predicciones.map((entry) => [entry.numero, entry]));
  const dow = Number.isFinite(contexto?.dow) ? contexto.dow : null;
  const turn = TURNOS.includes(targetTurn) ? targetTurn : TURNOS[TURNOS.length - 1];

  const activos = [];
  if (windowDraws.length && windowStats.total > 0) {
    perfiles.forEach((perfil) => {
      const pred = predMap.get(perfil.numero);
      if (!pred) return;
      const stats = windowStats.map.get(perfil.numero);
      if (!stats || !stats.total) return;
      const freqWindow = stats.freq || 0;
      if (freqWindow <= 0.02) return;
      const recencia = pred.recencia ?? perfil.scoreRecencia ?? 0;
      if (recencia <= 0.25) return;
      const turnRatio = stats.turnRatios[turn] || 0;
      if (turnRatio <= 0.4) return;
      const dowRatio = dow !== null ? stats.dowRatios[dow] || 0 : 0;
      if (dowRatio <= 0.4) return;
      const gapInfo = computeGapInfo(perfil);
      if (!gapInfo.isActive) return;
      const narrativa = findNarrative(perfil, latest.timestamp, narrativeDays);
      if (!narrativa.active) return;
      activos.push({
        period: "active",
        numero: perfil.numero,
        score: pred.score || 0,
        frecuencia: pred.frecuencia || 0,
        recencia,
        hipotesis: pred.hipotesis || 0,
        contextoScore: pred.contexto || 0,
        turnRatio,
        dowRatio,
        windowFreq: freqWindow,
        windowCount: stats.total,
        last: normalizeLast(stats.last) || normalizeLast(perfil.lastSeen),
        gap: gapInfo,
        narrativa,
      });
    });
  }

  activos.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (activos.length > maxActivos) activos.length = maxActivos;
  const activeSet = new Set(activos.map((entry) => entry.numero));

  const historicos = [];
  if (historicDraws.length && historicStats.total > 0) {
    perfiles.forEach((perfil) => {
      if (activeSet.has(perfil.numero)) return;
      const pred = predMap.get(perfil.numero);
      if (!pred) return;
      const stats = historicStats.map.get(perfil.numero);
      if (!stats || !stats.total) return;
      const freqHist = stats.freq || 0;
      if (freqHist <= 0.01) return;
      const turnRatio = stats.turnRatios[turn] || 0;
      if (turnRatio <= 0.3) return;
      const dowRatio = dow !== null ? stats.dowRatios[dow] || 0 : 0;
      if (dowRatio <= 0.3) return;
      historicos.push({
        period: "historic",
        numero: perfil.numero,
        score: pred.score || 0,
        frecuencia: pred.frecuencia || 0,
        recencia: pred.recencia || 0,
        hipotesis: pred.hipotesis || 0,
        contextoScore: pred.contexto || 0,
        turnRatio,
        dowRatio,
        windowFreq: freqHist,
        windowCount: stats.total,
        last: normalizeLast(stats.last) || normalizeLast(perfil.lastSeen),
      });
    });
    historicos.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (historicos.length > maxActivos) historicos.length = maxActivos;
  }

  const windowInfo = windowDraws.length
    ? {
        start: windowDraws[0].fechaDate,
        end: latest.fechaDate,
      }
    : null;

  return {
    activos,
    historicos,
    window: windowInfo,
  };
}
