// pattern-detector.js — núcleo de patrones heurísticos adaptativos
import { DB } from "./storage.js";
import { GUIA } from "./loader.js";
import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const ACTIVE_WINDOW_DAYS = 120;
const MIN_RECENT_RECORDS = 30;
const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function toNumber(value) {
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function hydrateDraw(draw) {
  const fecha = draw?.fecha;
  const fechaObj = parseDrawDate(fecha);
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

function formatDate(fechaDate) {
  if (!fechaDate) return "";
  return fechaDate.toISOString().slice(0, 10);
}

function computeWindowBounds(timeline) {
  if (!timeline.length) {
    return { activeTimeline: [], windowStart: null, windowEnd: null };
  }

  const windowEnd = timeline[timeline.length - 1].fechaDate;
  const startOfYear = new Date(windowEnd.getFullYear(), 0, 1);
  const fallbackCutoff = new Date(windowEnd.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
  let cutoff = startOfYear > fallbackCutoff ? startOfYear : fallbackCutoff;

  let filtered = timeline.filter((draw) => draw.fechaDate >= cutoff);

  if (filtered.length < MIN_RECENT_RECORDS && timeline.length >= MIN_RECENT_RECORDS) {
    cutoff = fallbackCutoff;
    filtered = timeline.filter((draw) => draw.fechaDate >= cutoff);
  }

  if (!filtered.length) {
    cutoff = timeline[0].fechaDate;
    filtered = timeline.slice();
  }

  return {
    activeTimeline: filtered,
    windowStart: filtered[0]?.fechaDate ?? cutoff,
    windowEnd,
  };
}

function buildHypothesisRefs(hypothesisMap, entries = []) {
  if (!hypothesisMap || !entries.length) return [];
  const refs = [];
  entries.forEach((entry) => {
    const key = `${entry.fecha || ""}|${entry.horario || ""}|${String(entry.numero).padStart(2, "0")}`;
    const matches = hypothesisMap.get(key) || [];
    if (matches.length) refs.push(...matches);
  });
  return refs;
}

function detectRecurringGaps({ timeline, hypothesisMap }) {
  const byNumber = new Map();
  timeline.forEach((draw) => {
    if (!byNumber.has(draw.numero)) byNumber.set(draw.numero, []);
    byNumber.get(draw.numero).push(draw);
  });

  const hallazgos = [];

  byNumber.forEach((occurrences, numero) => {
    if (occurrences.length < 3) return;
    const deltas = [];
    for (let i = 1; i < occurrences.length; i++) {
      const prev = occurrences[i - 1];
      const curr = occurrences[i];
      const gap = Math.round((curr.fechaDate - prev.fechaDate) / DAY_MS);
      if (gap > 0) deltas.push({ gap, prev, curr });
    }
    if (!deltas.length) return;

    const gapFreq = new Map();
    deltas.forEach(({ gap }) => {
      gapFreq.set(gap, (gapFreq.get(gap) || 0) + 1);
    });

    const sorted = Array.from(gapFreq.entries()).sort((a, b) => b[1] - a[1]);
    const [bestGap, count] = sorted[0];
    if (count < 2) return;

    const matchRatio = count / deltas.length;
    if (matchRatio < 0.55 && count < 3) return;

    const matches = deltas.filter(({ gap }) => gap === bestGap);
    const evidencia = matches.slice(-4).map(({ prev, curr, gap }) => ({
      fecha: curr.fecha,
      horario: curr.horario,
      numero,
      resumen: `Se repitió ${gap} días después del ${prev.fecha}`,
      origen: { fecha: prev.fecha, horario: prev.horario },
    }));

    const hypoRefs = buildHypothesisRefs(hypothesisMap, evidencia);

    const lastMatch = matches[matches.length - 1];
    let siguienteFechaEsperada = null;
    if (lastMatch?.curr?.fechaDate) {
      const tentative = new Date(lastMatch.curr.fechaDate.getTime() + bestGap * DAY_MS);
      if (tentative > new Date()) siguienteFechaEsperada = formatDate(tentative);
    }

    hallazgos.push({
      id: `gap-${numero}-${bestGap}`,
      titulo: `Nº ${String(numero).padStart(2, "0")} reaparece cada ~${bestGap} días`,
      confianza: Math.min(1, matchRatio),
      resumen: `En la ventana activa apareció ${occurrences.length} veces; el intervalo modal de ${bestGap} días se repitió ${count} de ${deltas.length} ciclos recientes.`,
      evidencia,
      siguienteFechaEsperada,
      hipotesis: hypoRefs,
    });
  });

  return hallazgos;
}

function detectTemporalBias({ timeline, key, labelMap, tituloPrefix }) {
  const byNumber = new Map();
  timeline.forEach((draw) => {
    const bucketKey = draw[key];
    if (bucketKey === undefined || bucketKey === null) return;
    if (!byNumber.has(draw.numero)) byNumber.set(draw.numero, new Map());
    const bucket = byNumber.get(draw.numero);
    bucket.set(bucketKey, (bucket.get(bucketKey) || 0) + 1);
  });

  const hallazgos = [];

  byNumber.forEach((bucketMap, numero) => {
    const total = Array.from(bucketMap.values()).reduce((acc, v) => acc + v, 0);
    if (total < 4) return;
    const sorted = Array.from(bucketMap.entries()).sort((a, b) => b[1] - a[1]);
    const [bucketKey, count] = sorted[0];
    const ratio = count / total;
    if (ratio < 0.55) return;

    const etiqueta = labelMap(bucketKey);
    if (!etiqueta) return;

    hallazgos.push({
      id: `${key}-${numero}-${bucketKey}`,
      titulo: `${tituloPrefix} ${String(numero).padStart(2, "0")} domina ${etiqueta}`,
      confianza: Math.min(1, ratio),
      resumen: `El ${String(numero).padStart(2, "0")} apareció ${total} veces en la ventana; ${count} (${Math.round(ratio * 100)}%) fueron en ${etiqueta}.`,
      evidencia: [],
      hipotesis: [],
    });
  });

  return hallazgos;
}

function detectWindowPatterns({ timeline, hypothesisMap }) {
  const gapPatterns = detectRecurringGaps({ timeline, hypothesisMap });
  const dowPatterns = detectTemporalBias({
    timeline,
    key: "dayOfWeek",
    labelMap: (idx) => DOW_LABEL[idx] || null,
    tituloPrefix: "Sesgo semanal",
  });
  const turnoPatterns = detectTemporalBias({
    timeline,
    key: "horario",
    labelMap: (turno) => turno,
    tituloPrefix: "Turno dominante",
  });

  return [...gapPatterns, ...dowPatterns, ...turnoPatterns];
}

export async function detectarPatrones({ cantidad = 9 } = {}) {
  const draws = await DB.listDraws({ excludeTest: true });
  if (!draws.length) {
    return {
      mensaje: "No hay sorteos suficientes.",
      recientes: [],
      stats: null,
      hallazgos: [],
      resumenVentana: "Sin datos registrados.",
    };
  }

  const timeline = sortTimeline(draws);
  const { activeTimeline, windowStart, windowEnd } = computeWindowBounds(timeline);
  const recientes = activeTimeline.slice(-cantidad);
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

  const hallazgos = detectWindowPatterns({ timeline: activeTimeline, hypothesisMap });
  const resumenVentana = windowStart && windowEnd
    ? `Ventana analizada: ${formatDate(windowStart)} → ${formatDate(windowEnd)} (${activeTimeline.length} sorteos reales).`
    : "Sin ventana activa suficiente.";

  return {
    recientes,
    stats,
    familiaDominante,
    energia,
    mensaje,
    score,
    hallazgos,
    resumenVentana,
  };
}
