import { parseDrawDate } from "./date-utils.js";
import { GUIA } from "./loader.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const TURNOS = ["11AM", "3PM", "9PM"];

function hydrateDraw(raw) {
  if (!raw) return null;
  const fechaDate = parseDrawDate(raw.fecha);
  if (!fechaDate) return null;
  const numero = typeof raw.numero === "number" ? raw.numero : parseInt(raw.numero, 10);
  if (!Number.isFinite(numero)) return null;
  const turno = raw.horario || null;
  const baseTs = fechaDate.getTime();
  const offset = (HORARIO_ORDER[turno] ?? 0) * 6 * 60 * 60 * 1000;
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
  const total = draws.length || 0;
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

function findNarrative(perfil, referenceTs, days = 45) {
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
        windowDays: days,
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
        windowDays: days,
      };
    }
  }
  return { active: false, windowDays: days };
}

function normalizeLast(last) {
  if (!last) return null;
  return {
    fecha: last.fecha || null,
    horario: last.horario || null,
    pais: last.pais || null,
  };
}

function buildTurnRepetitionMap(draws, { windowDays = 30 } = {}) {
  const map = new Map();
  if (!draws.length) return map;
  const latestTs = draws[draws.length - 1].timestamp;
  const cutoff = latestTs - windowDays * DAY_MS;
  const buffer = new Map();
  draws.forEach((draw) => {
    if (draw.timestamp < cutoff) return;
    if (!buffer.has(draw.numero)) {
      buffer.set(draw.numero, new Map());
    }
    const turnCounts = buffer.get(draw.numero);
    const turno = draw.horario || "—";
    turnCounts.set(turno, (turnCounts.get(turno) || 0) + 1);
    const maxCount = Math.max(...turnCounts.values());
    map.set(draw.numero, maxCount);
  });
  return map;
}

function buildRegionalInfluenceSet(timeline, latest) {
  const set = new Set();
  if (!timeline.length || !latest?.fechaDate) return set;
  const dayStart = new Date(latest.fechaDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + DAY_MS;
  const targetCountries = ["nicaragua", "ni", "el salvador", "sv"];
  timeline.forEach((draw) => {
    if (!draw.fechaDate) return;
    const ts = draw.fechaDate.getTime();
    if (ts < dayStart.getTime() || ts >= dayEnd) return;
    const pais = (draw.pais || "").toLowerCase();
    if (targetCountries.includes(pais)) {
      set.add(draw.numero);
    }
  });
  return set;
}

function buildTransitionTargetSet(patrones) {
  const set = new Set();
  if (!patrones?.hallazgos?.length) return set;
  patrones.hallazgos.forEach((hallazgo) => {
    if (!hallazgo?.id?.startsWith("transition-")) return;
    const destino = hallazgo?.datos?.destino;
    const historial = hallazgo?.datos?.historial ?? 0;
    if (Number.isFinite(destino) && historial > 0) {
      set.add(destino);
    }
  });
  return set;
}

function buildFamilyActiveSet(patrones) {
  const set = new Set();
  const familia = patrones?.familiaDominante;
  if (!familia || !GUIA) return set;
  const normalized = familia.toString().trim().toLowerCase();
  Object.entries(GUIA).forEach(([key, info]) => {
    const fam = info?.familia ? info.familia.toString().trim().toLowerCase() : "";
    if (fam && fam === normalized) {
      const numero = parseInt(key, 10);
      if (Number.isFinite(numero)) set.add(numero);
    }
  });
  return set;
}

function clamp(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function evaluarSesgosExtendidos({
  draws = [],
  perfiles = [],
  predicciones = [],
  contexto = {},
  targetTurn = "9PM",
  windowDays = 120,
  maxModerados = 20,
  maxDebiles = 36,
  fuertes = [],
  patrones = null,
} = {}) {
  if (!draws.length || !perfiles.length) return { moderados: [], debiles: [] };
  const timeline = prepareTimeline(draws);
  if (!timeline.length) return { moderados: [], debiles: [] };
  const latest = timeline[timeline.length - 1];
  const cutoffTs = latest.timestamp - windowDays * DAY_MS;
  const windowDraws = timeline.filter((draw) => draw.timestamp >= cutoffTs);
  if (!windowDraws.length) return { moderados: [], debiles: [] };
  const windowStats = buildStats(windowDraws);
  if (!windowStats.total) return { moderados: [], debiles: [] };

  const predMap = new Map(predicciones.map((entry) => [entry.numero, entry]));
  const dow = Number.isFinite(contexto?.dow) ? contexto.dow : null;
  const turn = TURNOS.includes(targetTurn) ? targetTurn : TURNOS[TURNOS.length - 1];
  const strongSet = new Set((fuertes || []).map((entry) => entry.numero));
  const turnRepeatMap = buildTurnRepetitionMap(windowDraws, { windowDays: 30 });
  const transitionTargets = buildTransitionTargetSet(patrones);
  const familyActiveSet = buildFamilyActiveSet(patrones);
  const regionalSet = buildRegionalInfluenceSet(timeline, latest);

  const moderados = [];
  const debiles = [];
  const moderateSet = new Set();

  perfiles.forEach((perfil) => {
    const numero = perfil?.numero;
    if (!Number.isFinite(numero) || strongSet.has(numero)) return;
    const pred = predMap.get(numero);
    const stats = windowStats.map.get(numero);
    const windowFreq = stats?.freq || 0;
    const windowCount = stats?.total || 0;
    const recencia = pred?.recencia ?? perfil?.scoreRecencia ?? 0;
    const turnRatio = stats?.turnRatios?.[turn] || 0;
    const dowRatio = dow !== null && stats?.dowRatios ? stats.dowRatios[dow] || 0 : 0;
    const gapModerado = computeGapInfo(perfil, 2);
    const gapDebil = computeGapInfo(perfil, 3);
    const narrativa = findNarrative(perfil, latest.timestamp, 45);
    const repeatCount = turnRepeatMap.get(numero) || 0;
    const transitionHit = transitionTargets.has(numero);
    const recencyDays = perfil?.gaps?.daysSince ?? null;
    const recentHit = Number.isFinite(recencyDays) && recencyDays <= 10;
    const familyHit = familyActiveSet.has(numero);
    const regionalHit = regionalSet.has(numero);

    const moderateTriggers = [];
    if (turnRatio >= 0.25) moderateTriggers.push("ratio horario ≥ 25%");
    if (dow !== null && dowRatio >= 0.25) moderateTriggers.push("sesgo semanal ≥ 25%");
    if (windowFreq >= 0.015) moderateTriggers.push("frecuencia ≥ 1.5%");
    if (recencia >= 0.15) moderateTriggers.push("recencia ≥ 15%");
    if (gapModerado.isActive) moderateTriggers.push("gap dominante activo");
    if (repeatCount >= 2) moderateTriggers.push("turno repetido 2×/30d");
    if (narrativa.active) moderateTriggers.push("narrativa ≤ 45d");
    if (transitionHit) moderateTriggers.push("transición histórica");
    const moderateCount = moderateTriggers.length;

    if (moderateCount >= 3) {
      moderados.push({
        period: "moderate",
        numero,
        level: "moderado",
        score: clamp(pred?.score ?? perfil?.scoreFrecuencia ?? 0),
        frecuencia: pred?.frecuencia || perfil?.scoreFrecuencia || 0,
        recencia,
        hipotesis: pred?.hipotesis || perfil?.scoreHipotesis || 0,
        contextoScore: pred?.contexto || perfil?.scoreContexto || 0,
        turnRatio,
        dowRatio,
        windowFreq,
        windowCount,
        last: normalizeLast(stats?.last) || normalizeLast(perfil?.lastSeen),
        gap: gapModerado,
        narrativa,
        narrativaWindow: narrativa?.windowDays || 45,
        triggers: moderateTriggers,
        criteria: moderateCount,
      });
      moderateSet.add(numero);
      return;
    }

    const weakTriggers = [];
    if (turnRatio >= 0.15) weakTriggers.push("ratio horario ≥ 15%");
    if (dow !== null && dowRatio >= 0.15) weakTriggers.push("sesgo semanal ≥ 15%");
    if (windowFreq > 0.01) weakTriggers.push("frecuencia > 1%");
    if (recentHit) weakTriggers.push("aparición ≤ 10d");
    if (gapDebil.isActive) weakTriggers.push("gap dentro ±3");
    if (familyHit) weakTriggers.push("familia dominante activa");
    if (regionalHit) weakTriggers.push("influencia regional");
    const weakCount = weakTriggers.length;
    if (weakCount >= 1 && !moderateSet.has(numero)) {
      const baseScore = clamp(pred?.score ?? perfil?.scoreFrecuencia ?? 0);
      const leveScore = clamp(baseScore * 0.4 + windowFreq * 5 * 0.3 + (weakCount / 7) * 0.3);
      debiles.push({
        period: "weak",
        numero,
        level: "debil",
        score: leveScore,
        frecuencia: pred?.frecuencia || perfil?.scoreFrecuencia || 0,
        recencia,
        hipotesis: pred?.hipotesis || perfil?.scoreHipotesis || 0,
        contextoScore: pred?.contexto || perfil?.scoreContexto || 0,
        turnRatio,
        dowRatio,
        windowFreq,
        windowCount,
        last: normalizeLast(stats?.last) || normalizeLast(perfil?.lastSeen),
        gap: gapDebil,
        narrativa: narrativa,
        narrativaWindow: narrativa?.windowDays || 45,
        triggers: weakTriggers,
        criteria: weakCount,
        recentHit,
        familyHit,
        regionalHit,
      });
    }
  });

  moderados.sort((a, b) => (b.score || 0) - (a.score || 0));
  debiles.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (moderados.length > maxModerados) moderados.length = maxModerados;
  if (debiles.length > maxDebiles) debiles.length = maxDebiles;
  return { moderados, debiles };
}
