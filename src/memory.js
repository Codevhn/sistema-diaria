import { DB } from "./storage.js";
import {
  convertBothDigits,
  getSimpleConversions,
  getCompositeConversions,
} from "./conversion-map.js";
import { parseDrawDate } from "./date-utils.js";

const HORARIO_ORDER = {
  "11AM": 0,
  "3PM": 1,
  "9PM": 2,
};
const TURN_OFFSET_MS = 6 * 60 * 60 * 1000; // offset artificial para ordenar turnos
const REL_KEYS = ["mismo", "invertido", "100-n", "vecino", "mapa simple", "mapa compuesta"];
const MAX_GAP_SAMPLES = 30;

const pad2 = (value) => String(value).padStart(2, "0");
const clampNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return ((num % 100) + 100) % 100;
};
const invertNumber = (n) => {
  const digits = pad2(n).split("");
  return parseInt(digits.reverse().join(""), 10);
};
const adjustNumber = (n) => {
  const base = clampNumber(n);
  if (base === null) return null;
  return (100 - base + 100) % 100;
};

const differenceInDays = (from, to) => {
  if (from === null || to === null) return null;
  const fromMs = from instanceof Date ? from.getTime() : from;
  const toMs = to instanceof Date ? to.getTime() : to;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  const diff = fromMs - toMs;
  return diff / (24 * 60 * 60 * 1000);
};

const sanitizeDraws = (raw = [], { includeTest = false, pais, horario } = {}) => {
  const result = [];
  for (const draw of raw) {
    if (!draw) continue;
    if (!includeTest && draw.isTest) continue;
    if (pais && draw.pais !== pais) continue;
    if (horario && draw.horario !== horario) continue;

    const fechaDate = parseDrawDate(draw.fecha);
    if (!fechaDate) continue;
    const numero = Number(draw.numero);
    if (!Number.isFinite(numero)) continue;
    const turnoOffset = HORARIO_ORDER[draw.horario] ?? 0;
    const timestamp = fechaDate.getTime() + turnoOffset * TURN_OFFSET_MS;

    result.push({
      ...draw,
      numero,
      fechaDate,
      timestamp,
      year: fechaDate.getFullYear(),
      month: fechaDate.getMonth() + 1,
      day: fechaDate.getDate(),
    });
  }
  return result;
};

const buildRelationContext = (numeroBase) => {
  const base = clampNumber(numeroBase);
  if (base === null) return null;
  const neighbors = [clampNumber(base + 1), clampNumber(base - 1)].filter(
    (value, idx, arr) => value !== null && arr.indexOf(value) === idx && value !== base
  );
  const simpleConversions = Array.from(
    new Set(getSimpleConversions(base).map((n) => clampNumber(n)).filter((n) => n !== null))
  ).filter((n) => n !== base);
  const compositeConversions = Array.from(
    new Set(getCompositeConversions(base).map((n) => clampNumber(n)).filter((n) => n !== null))
  ).filter((n) => n !== base);
  return {
    base,
    mirror: invertNumber(base),
    adjust: adjustNumber(base),
    neighbors,
    simpleConversions,
    compositeConversions,
  };
};

const describeRelations = (ctx, candidate) => {
  if (!ctx) return [];
  const relations = [];
  const pushRelation = (key, value) => {
    relations.push({ key, value });
  };
  if (candidate === ctx.base) pushRelation("mismo", ctx.base);
  if (ctx.mirror !== null && candidate === ctx.mirror) pushRelation("invertido", ctx.mirror);
  if (ctx.adjust !== null && candidate === ctx.adjust) pushRelation("100-n", ctx.adjust);
  ctx.neighbors.forEach((neighbor) => {
    if (candidate === neighbor) pushRelation("vecino", neighbor);
  });
  ctx.simpleConversions.forEach((converted) => {
    if (candidate === converted) pushRelation("mapa simple", converted);
  });
  ctx.compositeConversions.forEach((converted) => {
    if (candidate === converted) pushRelation("mapa compuesta", converted);
  });
  return relations;
};

export function last3PM(draws) {
  return draws.filter((d) => d.horario === "3PM").slice(-1)[0];
}

export async function candidatosNoObvios(guia) {
  const ds = await DB.listDraws({ excludeTest: true });
  const last = last3PM(ds);
  if (!last) return [];
  const conv = convertBothDigits(last.numero);
  if (conv === null) return [];
  const simb = guia[pad2(conv)]?.simbolo || "";
  const expl = `Conversión del 3PM (${pad2(last.numero)}) usando el mapa de usuario`;
  return [{ numero: conv, simbolo: simb, etiqueta: "no-obvio", razones: [expl] }];
}

export function resumirActividadNumeros(rawDraws, options = {}) {
  const draws = sanitizeDraws(rawDraws, options);
  const referenceDate =
    options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const summary = Array.from({ length: 100 }, (_, numero) => ({
    numero,
    total: 0,
    last: null,
    lastTimestamp: null,
  }));
  draws.forEach((draw) => {
    const entry = summary[draw.numero];
    entry.total += 1;
    if (!entry.lastTimestamp || draw.timestamp > entry.lastTimestamp) {
      entry.lastTimestamp = draw.timestamp;
      entry.last = {
        fecha: draw.fecha,
        horario: draw.horario,
        pais: draw.pais,
      };
    }
  });
  return summary.map((entry) => ({
    numero: entry.numero,
    total: entry.total,
    last: entry.last,
    daysSinceLast:
      entry.lastTimestamp !== null
        ? differenceInDays(referenceDate.getTime(), entry.lastTimestamp)
        : null,
  }));
}

export function construirPerfilNumero(
  rawDraws,
  numeroBase,
  { includeTest = false, referenceDate = new Date() } = {}
) {
  const base = clampNumber(numeroBase);
  if (base === null) {
    return {
      base: null,
      timeline: [],
      relationCounts: {},
      turnStats: {},
      variantStats: {},
      gaps: {},
      totals: { total: 0, direct: 0, transforms: 0 },
      ctx: null,
    };
  }
  const ctx = buildRelationContext(base);
  const draws = sanitizeDraws(rawDraws, { includeTest });
  const timeline = [];
  const relationCounts = {};
  const turnStats = {};
  const variantStats = {};

  draws.forEach((draw) => {
    const relations = describeRelations(ctx, draw.numero);
    if (!relations.length) return;
    const entry = {
      base,
      numero: draw.numero,
      fecha: draw.fecha,
      horario: draw.horario,
      pais: draw.pais,
      timestamp: draw.timestamp,
      relaciones: relations.map((rel) => rel.key),
      relationDetails: relations,
      isTest: !!draw.isTest,
    };
    timeline.push(entry);
    relations.forEach((rel) => {
      relationCounts[rel.key] = (relationCounts[rel.key] || 0) + 1;
      const variantKey = `${rel.key}-${rel.value}`;
      const existing = variantStats[variantKey];
      if (!existing || draw.timestamp > existing.timestamp) {
        variantStats[variantKey] = {
          key: rel.key,
          value: rel.value,
          fecha: draw.fecha,
          horario: draw.horario,
          pais: draw.pais,
          timestamp: draw.timestamp,
        };
      }
    });
    const turno = draw.horario || "—";
    const prevTurn = turnStats[turno];
    const nextCount = (prevTurn?.count || 0) + 1;
    const shouldReplace =
      !prevTurn || draw.timestamp > (prevTurn.lastTimestamp ?? -Infinity);
    turnStats[turno] = {
      count: nextCount,
      lastFecha: shouldReplace ? draw.fecha : prevTurn.lastFecha,
      lastPais: shouldReplace ? draw.pais : prevTurn.lastPais,
      lastTimestamp: shouldReplace ? draw.timestamp : prevTurn.lastTimestamp,
    };
  });

  timeline.sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < timeline.length; i += 1) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    const prev = timeline[i - 1];
    curr.gapToNextDays = next ? differenceInDays(next.timestamp, curr.timestamp) : null;
    curr.gapFromPrevDays = prev ? differenceInDays(curr.timestamp, prev.timestamp) : null;
  }

  const gaps = (() => {
    if (timeline.length < 2) {
      const last = timeline[timeline.length - 1] || null;
      return {
        average: null,
        max: null,
        current:
          last?.timestamp !== undefined
            ? differenceInDays(referenceDate.getTime(), last.timestamp)
            : null,
      };
    }
    const diffs = [];
    for (let i = 1; i < timeline.length; i += 1) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      const diffDays = differenceInDays(curr.timestamp, prev.timestamp);
      if (diffDays !== null) diffs.push(diffDays);
    }
    const sum = diffs.reduce((acc, value) => acc + value, 0);
    const average = diffs.length ? sum / diffs.length : null;
    const max = diffs.length ? Math.max(...diffs) : null;
    const last = timeline[timeline.length - 1];
    const current =
      last?.timestamp !== undefined
        ? differenceInDays(referenceDate.getTime(), last.timestamp)
        : null;
    return { average, max, current };
  })();

  const totals = {
    total: timeline.length,
    direct: relationCounts.mismo || 0,
    transforms: timeline.length - (relationCounts.mismo || 0),
  };

  return {
    base,
    ctx,
    timeline,
    relationCounts,
    turnStats,
    variantStats,
    gaps,
    totals,
  };
}

export function construirGapSummary(
  rawDraws,
  { includeTest = false, referenceDate = new Date() } = {}
) {
  const draws = sanitizeDraws(rawDraws, { includeTest });
  const refMs =
    referenceDate instanceof Date
      ? referenceDate.getTime()
      : Number(referenceDate) || Date.now();
  const groups = Array.from({ length: 100 }, () => []);
  draws.forEach((draw) => {
    groups[draw.numero].push(draw);
  });
  return groups.map((list, numero) => {
    if (list.length > 1) {
      list.sort((a, b) => a.timestamp - b.timestamp);
    }
    const gaps = [];
    for (let i = list.length - 1; i > 0 && gaps.length < MAX_GAP_SAMPLES; i -= 1) {
      const current = list[i];
      const prev = list[i - 1];
      const diff = differenceInDays(current.timestamp, prev.timestamp);
      if (Number.isFinite(diff)) gaps.push(diff);
    }
    const sum = gaps.reduce((acc, value) => acc + value, 0);
    const avgGap = gaps.length ? sum / gaps.length : null;
    const maxGap = gaps.length ? Math.max(...gaps) : null;
    const last = list[list.length - 1] || null;
    const currentGap =
      last && Number.isFinite(last.timestamp)
        ? differenceInDays(refMs, last.timestamp)
        : null;
    return {
      numero,
      count: list.length,
      avgGap,
      maxGap,
      currentGap,
      lastFecha: last?.fecha || null,
      lastHorario: last?.horario || null,
      lastPais: last?.pais || null,
      lastTimestamp: last?.timestamp ?? null,
    };
  });
}
