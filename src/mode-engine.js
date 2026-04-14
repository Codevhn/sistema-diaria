import { DB } from "./storage.js";
import { parseDrawDate } from "./date-utils.js";

function normalizeModeParams(mode) {
  if (!mode) return mode;
  const operacion = mode.operacion || "";
  const parametros = mode.parametros ?? null;
  const offset = Number.isFinite(mode.offset) ? mode.offset : null;
  return { ...mode, operacion, parametros, offset };
}

const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const MAX_LOOKAHEAD = 2;

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDraw(draw) {
  const fechaDate = parseDrawDate(draw?.fecha);
  const numero = normalizeNumber(draw?.numero);
  if (!fechaDate || numero === null) return null;
  return {
    ...draw,
    numero,
    fechaDate,
    timestamp: fechaDate.getTime() + (HORARIO_ORDER[draw?.horario] ?? 0) * 1_000,
  };
}

function sortTimeline(draws = []) {
  return draws
    .map(normalizeDraw)
    .filter(Boolean)
    .sort((a, b) => {
      const diff = a.fechaDate - b.fechaDate;
      if (diff !== 0) return diff;
      const orderA = HORARIO_ORDER[a.horario] ?? 0;
      const orderB = HORARIO_ORDER[b.horario] ?? 0;
      return orderA - orderB;
    });
}

const MAX_DAY_SPAN = 3 * 24 * 60 * 60 * 1000;

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function digitsOf(numero) {
  const tens = Math.floor(numero / 10);
  const ones = numero % 10;
  return { tens, ones };
}

function wrapNumber(value) {
  let result = value % 100;
  if (result < 0) result += 100;
  return result;
}

function getParamNumber(mode) {
  const params = mode?.parametros;
  if (params === null || params === undefined) return null;
  if (typeof params === "number") return Number.isFinite(params) ? params : null;
  if (typeof params === "string" && params.trim()) {
    const parsed = Number(params);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof params === "object") {
    const candidates = [params.valor, params.constante, params.raw];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
      if (typeof candidate === "string" && candidate.trim()) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function applyOperation(baseNumero, mode) {
  const op = mode.operacion;
  if (!op) return [];
  const param = getParamNumber(mode);
  const { tens, ones } = digitsOf(baseNumero);
  const results = new Set();

  switch (op) {
    case "mirror": {
      results.add(wrapNumber(ones * 10 + tens));
      break;
    }
    case "sum-digits": {
      const sum = (tens + ones) % 10;
      results.add(wrapNumber(sum));
      break;
    }
    case "sum-digits-keep-first": {
      const sum = (tens + ones) % 10;
      results.add(wrapNumber(tens * 10 + sum));
      break;
    }
    case "add-constant": {
      if (param === null) return [];
      results.add(wrapNumber(baseNumero + param));
      break;
    }
    case "sub-constant": {
      if (param === null) return [];
      results.add(wrapNumber(baseNumero - param));
      break;
    }
    case "neighbor": {
      const step = param === null ? 1 : Math.abs(param) || 1;
      results.add(wrapNumber(baseNumero + step));
      results.add(wrapNumber(baseNumero - step));
      break;
    }
    case "digit-map": {
      const mapping = parseDigitMap(mode);
      const digits = String(baseNumero).padStart(2, "0").split("");
      let combos = [""];
      digits.forEach((digit) => {
        const options = new Set([digit, ...(mapping.get(digit) || [])]);
        combos = combos.flatMap((prefix) => Array.from(options).map((opt) => prefix + opt));
      });
      combos.forEach((combo) => results.add(wrapNumber(Number(combo))));
      break;
    }
    default:
      return [];
  }

  return Array.from(results);
}

function parseDigitMap(mode) {
  const mapping = new Map();
  const raw = mode?.parametros?.mapa || mode?.parametro?.mapa || mode?.parametros?.valor || mode?.parametros || "";
  const text = typeof raw === "string" && raw.trim() ? raw.trim() : "0:1,2:5,3:8,4:7,6:9";
  text.split(/[,;]+/).forEach((pair) => {
    const [a, b] = pair.split(/[:=-]/).map((s) => s?.trim()).filter(Boolean);
    if (!/^[0-9]$/.test(a || "") || !/^[0-9]$/.test(b || "")) return;
    if (!mapping.has(a)) mapping.set(a, []);
    if (!mapping.has(b)) mapping.set(b, []);
    if (!mapping.get(a).includes(b)) mapping.get(a).push(b);
    if (!mapping.get(b).includes(a)) mapping.get(b).push(a);
  });
  return mapping;
}

function findMatch(timeline, startIndex, target, offset, maxLookahead) {
  const base = timeline[startIndex];
  if (!base) return null;
  if (offset !== null && Number.isFinite(offset)) {
    if (offset === 0) {
      if (base.numero === target) {
        return {
          fecha: base.fecha,
          horario: base.horario,
          hops: 0,
        };
      }
      return null;
    }
    const candidate = timeline[startIndex + offset];
    if (!candidate) return null;
    if (candidate.fechaDate.getTime() - base.fechaDate.getTime() > MAX_DAY_SPAN) return null;
    if (candidate.numero === target) {
      return {
        fecha: candidate.fecha,
        horario: candidate.horario,
        hops: offset,
      };
    }
    return null;
  }

  for (let hop = 1; hop <= maxLookahead; hop++) {
    const candidate = timeline[startIndex + hop];
    if (!candidate) break;
    if (candidate.fechaDate.getTime() - base.fechaDate.getTime() > MAX_DAY_SPAN) break;
    if (candidate.numero === target) {
      return {
        fecha: candidate.fecha,
        horario: candidate.horario,
        hops: hop,
      };
    }
  }
  return null;
}

function evaluarEjemplo(example, mode, timeline, maxLookahead = MAX_LOOKAHEAD) {
  const original = normalizeNumber(example.original);
  const resultado = normalizeNumber(example.resultado);
  if (original === null || resultado === null) return null;

  let intentos = 0;
  let aciertos = 0;
  const evidencia = [];
  const offset = Number.isFinite(mode.offset) ? mode.offset : null;

  for (let i = 0; i < timeline.length; i++) {
    const draw = timeline[i];
    if (draw.numero !== original) continue;
    intentos++;
    const match = findMatch(timeline, i, resultado, offset, maxLookahead);
    if (match) {
      aciertos++;
      evidencia.push({
        baseFecha: draw.fecha,
        baseHorario: draw.horario,
        resultadoFecha: match.fecha,
        resultadoHorario: match.horario,
        hops: match.hops,
      });
    }
  }

  if (!intentos) return null;
  const confianza = aciertos / intentos;
  const soporte = Math.min(1, intentos / 5);
  const puntaje = confianza * soporte;
  return {
    fuente: "ejemplo",
    modeId: mode.id,
    modeNombre: mode.nombre,
    operacion: mode.operacion || "",
    baseNumero: original,
    numero: resultado,
    confianza,
    soporte,
    intentos,
    aciertos,
    puntaje,
    offset,
    nota: example.nota || mode.descripcion || "",
    evidencia,
  };
}

function evaluarOperacionModo(mode, timeline, maxLookahead = MAX_LOOKAHEAD) {
  if (!mode.operacion) return [];
  const offset = Number.isFinite(mode.offset) ? mode.offset : null;
  const aggregated = new Map();

  for (let i = 0; i < timeline.length; i++) {
    const draw = timeline[i];
    const candidatos = applyOperation(draw.numero, mode);
    candidatos.forEach((resultado) => {
      const key = `${draw.numero}-${resultado}`;
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          intentos: 0,
          aciertos: 0,
          evidencia: [],
        });
      }
      const bucket = aggregated.get(key);
      bucket.intentos += 1;
      const match = findMatch(timeline, i, resultado, offset, maxLookahead);
      if (match) {
        bucket.aciertos += 1;
        const base = timeline[i];
        bucket.evidencia.push({
          baseFecha: base.fecha,
          baseHorario: base.horario,
          resultadoFecha: match.fecha,
          resultadoHorario: match.horario,
          hops: match.hops,
        });
      }
    });
  }

  const stats = [];
  aggregated.forEach((bucket, key) => {
    if (!bucket.intentos) return;
    const [baseStr, resultStr] = key.split("-");
    const baseNumero = Number(baseStr);
    const numero = Number(resultStr);
    const confianza = bucket.aciertos / bucket.intentos;
    const soporte = Math.min(1, bucket.intentos / 5);
    const puntaje = confianza * soporte;
    stats.push({
      fuente: "operacion",
      modeId: mode.id,
      modeNombre: mode.nombre,
      operacion: mode.operacion,
      baseNumero,
      numero,
      confianza,
      soporte,
      intentos: bucket.intentos,
      aciertos: bucket.aciertos,
      puntaje,
      offset,
      nota: mode.descripcion || "",
      evidencia: bucket.evidencia,
    });
  });
  return stats;
}

function agregarSugerenciasParaDraws({ timeline, statsList, maxOrigenes = 3 }) {
  if (!timeline.length || !statsList.length) return [];
  const recientes = timeline.slice(-maxOrigenes);
  const sugerencias = [];
  const seen = new Set();

  for (const draw of recientes) {
    statsList.forEach((stat) => {
      if (!stat.confianza || stat.confianza < 0.3) return;
      if (stat.baseNumero !== draw.numero) return;
      const key = `${stat.modeId}|${stat.baseNumero}|${stat.numero}`;
      if (seen.has(key)) return;
      seen.add(key);
      sugerencias.push({
        modeId: stat.modeId,
        modeNombre: stat.modeNombre,
        numero: stat.numero,
        baseNumero: stat.baseNumero,
        confianza: stat.confianza,
        soporte: stat.intentos,
        nota: stat.nota,
        operacion: stat.operacion || "",
      });
    });
  }

  return sugerencias;
}

function agregarDetallePorNumero(statsList) {
  const scorePorNumero = {};
  const detallePorNumero = {};

  statsList.forEach((stat) => {
    if (!stat || !Number.isFinite(stat.puntaje) || stat.puntaje <= 0) return;
    const key = padNumber(stat.numero);
    const existing = scorePorNumero[key] ?? 0;
    if (stat.puntaje > existing) scorePorNumero[key] = stat.puntaje;
    if (!detallePorNumero[key]) detallePorNumero[key] = [];
    detallePorNumero[key].push({
      modeId: stat.modeId,
      modeNombre: stat.modeNombre,
      confianza: stat.confianza,
      soporte: stat.intentos,
      nota: stat.nota || "",
      baseNumero: stat.baseNumero,
      operacion: stat.operacion || "",
      fuente: stat.fuente,
    });
  });

  return { scorePorNumero, detallePorNumero };
}

export async function evaluarModos({ maxLookahead = MAX_LOOKAHEAD } = {}) {
  const modes = await DB.listGameModes();
  if (!modes.length) return null;

  const timelines = sortTimeline(await DB.listDraws({ excludeTest: true }));
  if (!timelines.length) return null;

  const modesWithExamples = await Promise.all(
    modes.map(async (modeRaw) => {
      const mode = normalizeModeParams(modeRaw);
      const ejemplos = await DB.listGameModeExamples(mode.id);
      return { ...mode, ejemplos };
    })
  );

  const statsList = [];

  modesWithExamples.forEach((mode) => {
    if (mode.operacion) {
      const opStats = evaluarOperacionModo(mode, timelines, maxLookahead);
      statsList.push(...opStats);
    }
    mode.ejemplos.forEach((example) => {
      const stats = evaluarEjemplo(example, mode, timelines, maxLookahead);
      if (stats) statsList.push(stats);
    });
  });

  if (!statsList.length) return null;

  const { scorePorNumero, detallePorNumero } = agregarDetallePorNumero(statsList);
  const sugerencias = agregarSugerenciasParaDraws({ timeline: timelines, statsList });

  if (!Object.keys(scorePorNumero).length && !sugerencias.length) {
    return null;
  }

  return {
    scorePorNumero,
    detallePorNumero,
    sugerencias,
    stats: statsList,
  };
}
