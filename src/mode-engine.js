import { DB } from "./storage.js";
import { parseDrawDate } from "./date-utils.js";

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

function evaluarEjemplo(example, timeline, maxLookahead = MAX_LOOKAHEAD) {
  const original = normalizeNumber(example.original);
  const resultado = normalizeNumber(example.resultado);
  if (original === null || resultado === null) return null;

  let intentos = 0;
  let aciertos = 0;
  const evidencia = [];

  for (let i = 0; i < timeline.length; i++) {
    const draw = timeline[i];
    if (draw.numero !== original) continue;
    intentos++;
    for (let hop = 1; hop <= maxLookahead; hop++) {
      const next = timeline[i + hop];
      if (!next) break;
      if (next.fechaDate.getTime() - draw.fechaDate.getTime() > 3 * 24 * 60 * 60 * 1000) break;
      if (next.numero === resultado) {
        aciertos++;
        evidencia.push({
          baseFecha: draw.fecha,
          baseHorario: draw.horario,
          resultadoFecha: next.fecha,
          resultadoHorario: next.horario,
          hops: hop,
        });
        break;
      }
    }
  }

  if (!intentos) return null;
  const confianza = aciertos / intentos;
  const soporte = Math.min(1, intentos / 5);
  const puntaje = confianza * soporte;
  return {
    original,
    resultado,
    intentos,
    aciertos,
    confianza,
    soporte,
    puntaje,
    evidencia,
  };
}

function agregarSugerenciasParaDraws({ timeline, statsPorEjemplo, modos, maxOrigenes = 3 }) {
  if (!timeline.length) return [];
  const recientes = timeline.slice(-maxOrigenes);
  const sugerencias = [];
  const seen = new Set();

  modos.forEach((mode) => {
    mode.ejemplos.forEach((example) => {
      const stats = statsPorEjemplo.get(example) || null;
      if (!stats || !stats.confianza) return;
      const original = stats.original;
      const resultado = stats.resultado;

      for (const draw of recientes) {
        if (draw.numero !== original) continue;
        const key = `${mode.id}|${original}|${resultado}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sugerencias.push({
          modeId: mode.id,
          modeNombre: mode.nombre,
          numero: resultado,
          baseNumero: original,
          confianza: stats.confianza,
          soporte: stats.intentos,
          nota: example.nota || mode.descripcion || "",
        });
      }
    });
  });

  return sugerencias;
}

export async function evaluarModos({ maxLookahead = MAX_LOOKAHEAD } = {}) {
  const modes = await DB.listGameModes();
  if (!modes.length) return null;

  const timelines = sortTimeline(await DB.listDraws({ excludeTest: true }));
  if (!timelines.length) return null;

  const modesWithExamples = await Promise.all(
    modes.map(async (mode) => {
      const ejemplos = await DB.listGameModeExamples(mode.id);
      return { ...mode, ejemplos };
    })
  );

  const statsPorEjemplo = new Map();
  const scorePorNumero = {};
  const detallePorNumero = {};

  modesWithExamples.forEach((mode) => {
    mode.ejemplos.forEach((example) => {
      const stats = evaluarEjemplo(example, timelines, maxLookahead);
      if (!stats) return;
      statsPorEjemplo.set(example, stats);

      const key = String(stats.resultado).padStart(2, "0");
      const existing = scorePorNumero[key] ?? 0;
      scorePorNumero[key] = Math.max(existing, stats.puntaje);

      if (!detallePorNumero[key]) detallePorNumero[key] = [];
      detallePorNumero[key].push({
        modeId: mode.id,
        modeNombre: mode.nombre,
        confianza: stats.confianza,
        soporte: stats.intentos,
        nota: example.nota || "",
        original: stats.original,
        resultado: stats.resultado,
      });
    });
  });

  const sugerencias = agregarSugerenciasParaDraws({
    timeline: timelines,
    statsPorEjemplo,
    modos: modesWithExamples,
  });

  if (!Object.keys(scorePorNumero).length && !sugerencias.length) {
    return null;
  }

  return {
    scorePorNumero,
    detallePorNumero,
    sugerencias,
  };
}
