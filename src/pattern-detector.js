// pattern-detector.js — núcleo de patrones heurísticos
import { DB } from "./storage.js";
import { GUIA } from "./loader.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };

function toNumber(value) {
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function hydrateDraw(draw) {
  const fecha = draw?.fecha;
  const fechaObj = fecha ? new Date(`${fecha}T00:00:00`) : null;
  return {
    ...draw,
    numero: toNumber(draw?.numero),
    fechaDate: fechaObj,
    dayOfWeek: fechaObj ? fechaObj.getDay() : null,
  };
}

function sortTimeline(draws = []) {
  return draws
    .map(hydrateDraw)
    .filter((d) => d.fechaDate && Number.isFinite(d.numero))
    .sort((a, b) => {
      const diff = a.fechaDate - b.fechaDate;
      if (diff !== 0) return diff;
      const orderA = HORARIO_ORDER[a.horario] ?? 0;
      const orderB = HORARIO_ORDER[b.horario] ?? 0;
      return orderA - orderB;
    });
}

async function loadHypotheses() {
  try {
    const hyps = await DB._getAll("hypotheses");
    const map = new Map();
    for (const h of hyps || []) {
      const numero = toNumber(h.numero);
      if (numero === null) continue;
      const key = `${h.fecha || ""}|${h.turno || ""}|${String(numero).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(h);
    }
    return map;
  } catch (err) {
    console.warn("No se pudieron cargar hipótesis", err);
    return new Map();
  }
}

function detectCycle88EveryTenDays({ timeline, hypothesisMap }) {
  const occurrences = timeline.filter((d) => d.horario === "9PM" && d.numero === 88);
  if (occurrences.length < 3) return null;

  const latestTimelineDate = timeline[timeline.length - 1]?.fechaDate || null;
  const today = new Date();
  const anchorDate = latestTimelineDate && latestTimelineDate > today ? latestTimelineDate : today;

  const intervals = [];
  for (let i = 1; i < occurrences.length; i++) {
    const prev = occurrences[i - 1];
    const curr = occurrences[i];
    const days = Math.round((curr.fechaDate - prev.fechaDate) / DAY_MS);
    intervals.push({ prev, curr, days });
  }

  const matches = intervals.filter(({ days }) => Math.abs(days - 10) <= 1);
  if (!matches.length) return null;

  const coincidencias = matches.map(({ prev, curr, days }) => {
    const hypoKey = `${curr.fecha}|${curr.horario}|${String(curr.numero).padStart(2, "0")}`;
    return {
      fecha: curr.fecha,
      horario: curr.horario,
      numero: curr.numero,
      resumen: `Se repitió ${days} días después del ${prev.fecha}`,
      hipotesis: hypothesisMap.get(hypoKey) || [],
    };
  });

  const confianza = matches.length / intervals.length;
  const ultimaCoincidencia = coincidencias[coincidencias.length - 1];
  const proximoEstimado = (() => {
    const last = occurrences[occurrences.length - 1];
    if (!last?.fechaDate) return null;
    let next = new Date(last.fechaDate.getTime() + 10 * DAY_MS);
    let guard = 0;
    while (anchorDate && next <= anchorDate && guard < 512) {
      next = new Date(next.getTime() + 10 * DAY_MS);
      guard++;
    }
    if (guard >= 512) return null;
    return next.toISOString().slice(0, 10);
  })();

  return {
    id: "cycle-88-10d",
    titulo: "Ciclo 88 cada 10 días (9PM)",
    confianza,
    resumen: `La secuencia 88 a las 9PM se repitió con ~10 días de separación en ${matches.length} de ${intervals.length} ciclos recientes.`,
    evidencia: coincidencias,
    siguienteFechaEsperada: proximoEstimado,
    ultimaCoincidencia,
  };
}

function detectSundayFromWednesday({ timeline, hypothesisMap }) {
  const sundayMatches = [];
  const sundayDraws = timeline.filter((d) => d.dayOfWeek === 0 && d.horario === "11AM");
  if (!sundayDraws.length) return null;

  for (const sunday of sundayDraws) {
    const idx = timeline.indexOf(sunday);
    if (idx <= 0) continue;
    const sundayNumber = sunday.numero;

    for (let i = idx - 1; i >= 0; i--) {
      const candidate = timeline[i];
      const diffDays = Math.round((sunday.fechaDate - candidate.fechaDate) / DAY_MS);
      if (diffDays > 5) break; // demasiado lejos
      if (candidate.dayOfWeek === 3 && candidate.horario === "9PM") {
        if (candidate.numero === sundayNumber && diffDays >= 3) {
          const hypoKeys = [
            `${sunday.fecha}|${sunday.horario}|${String(sunday.numero).padStart(2, "0")}`,
            `${candidate.fecha}|${candidate.horario}|${String(candidate.numero).padStart(2, "0")}`,
          ];
          sundayMatches.push({
            fecha: sunday.fecha,
            horario: sunday.horario,
            numero: sundayNumber,
            origen: { fecha: candidate.fecha, horario: candidate.horario },
            resumen: `Domingo reutilizó el ${String(sundayNumber).padStart(2, "0")}`,
            hipotesis: hypoKeys.flatMap((key) => hypothesisMap.get(key) || []),
          });
        }
        break;
      }
    }
  }

  if (!sundayMatches.length) return null;
  const confianza = sundayMatches.length / sundayDraws.length;
  return {
    id: "domingo-desde-miercoles",
    titulo: "Domingos 11AM reciclan miércoles 9PM",
    confianza,
    resumen: `${sundayMatches.length} de ${sundayDraws.length} domingos 11AM recientes repitieron el número del miércoles 9PM previo (≤5 días).`,
    evidencia: sundayMatches,
  };
}

const DETECTORES = [detectCycle88EveryTenDays, detectSundayFromWednesday];

export async function detectarPatrones({ cantidad = 9 } = {}) {
  const draws = await DB.listDraws({ excludeTest: true });
  if (!draws.length) {
    return {
      mensaje: "No hay sorteos suficientes.",
      recientes: [],
      stats: null,
      hallazgos: [],
    };
  }

  const timeline = sortTimeline(draws);
  const recientes = timeline.slice(-cantidad);
  const hypothesisMap = await loadHypotheses();

  const stats = { familias: {}, polaridades: { positiva: 0, neutra: 0, negativa: 0 }, total: recientes.length };
  for (const d of recientes) {
    const key = String(d.numero).padStart(2, "0");
    const info = GUIA[key];
    if (!info) continue;
    stats.familias[info.familia] = (stats.familias[info.familia] || 0) + 1;
    if (info.polaridad) stats.polaridades[info.polaridad]++;
  }

  const familiaDominante = Object.entries(stats.familias).sort((a, b) => b[1] - a[1])[0]?.[0] || "sin datos";
  const { positiva = 0, neutra = 0, negativa = 0 } = stats.polaridades;
  const totalPolar = positiva + neutra + negativa;
  const score = totalPolar > 0 ? (positiva - negativa) / totalPolar : 0;

  let energia = "neutral";
  if (score > 0.4) energia = "positiva";
  else if (score < -0.4) energia = "negativa";

  const mensaje = `En los últimos ${stats.total} sorteos predomina la familia "${familiaDominante}" con ` +
    (energia === "positiva"
      ? "energía ascendente y favorable."
      : energia === "negativa"
      ? "tendencia de contracción o bloqueo."
      : "neutralidad o transición.") +
    ` Polaridad: ${positiva} positivas, ${neutra} neutras y ${negativa} negativas.`;

  const hallazgos = DETECTORES.map((fn) => fn({ timeline, hypothesisMap })).filter(Boolean);

  return {
    recientes,
    stats,
    familiaDominante,
    energia,
    mensaje,
    score,
    hallazgos,
  };
}
