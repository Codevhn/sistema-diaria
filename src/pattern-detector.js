// pattern-detector.js — núcleo de patrones heurísticos adaptativos
import { DB } from "./storage.js";
import { GUIA } from "./loader.js";
import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const ACTIVE_WINDOW_DAYS = 120;
const MIN_RECENT_RECORDS = 30;
const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function formatSample({ fecha, horario }) {
  if (!fecha) return "";
  const dateObj = parseDrawDate(fecha);
  if (!dateObj) return `${fecha} ${horario || ""}`.trim();
  const dow = DOW_FULL[dateObj.getDay()] || "";
  return `${dow} ${fecha} ${horario || ""}`.trim();
}

function isDouble(numero) {
  const str = String(numero).padStart(2, "0");
  return str[0] === str[1];
}

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
  let cutoff = startOfYear;

  let filtered = timeline.filter((draw) => draw.fechaDate >= cutoff);

  if (!filtered.length) {
    cutoff = timeline[0].fechaDate;
    filtered = timeline.slice();
  } else if (filtered.length < MIN_RECENT_RECORDS && timeline.length >= MIN_RECENT_RECORDS) {
    const earliest = timeline[0].fechaDate;
    cutoff = earliest;
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
      numero,
      datos: {
        apariciones: occurrences.length,
        coincidencias: count,
        intervalos: deltas.length,
        gap: bestGap,
      },
    });
  });

  return hallazgos;
}

function detectTemporalBias({ timeline, historial = [], key, labelMap, tituloPrefix, sampleLimit = 4 }) {
  const byNumber = new Map();
  const historialCounts = new Map();
  const historialSamples = new Map();

  historial.forEach((draw) => {
    const bucketKey = draw[key];
    if (bucketKey === undefined || bucketKey === null) return;
    if (!historialCounts.has(draw.numero)) historialCounts.set(draw.numero, new Map());
    if (!historialSamples.has(draw.numero)) historialSamples.set(draw.numero, new Map());
    const countMap = historialCounts.get(draw.numero);
    countMap.set(bucketKey, (countMap.get(bucketKey) || 0) + 1);
    const sampleMap = historialSamples.get(draw.numero);
    if (!sampleMap.has(bucketKey)) sampleMap.set(bucketKey, []);
    const arr = sampleMap.get(bucketKey);
    arr.push({ fecha: draw.fecha, horario: draw.horario });
    if (arr.length > sampleLimit) arr.shift();
  });

  timeline.forEach((draw) => {
    const bucketKey = draw[key];
    if (bucketKey === undefined || bucketKey === null) return;
    if (!byNumber.has(draw.numero)) {
      byNumber.set(draw.numero, {
        counts: new Map(),
        samples: new Map(),
      });
    }
    const store = byNumber.get(draw.numero);
    store.counts.set(bucketKey, (store.counts.get(bucketKey) || 0) + 1);
    if (!store.samples.has(bucketKey)) store.samples.set(bucketKey, []);
    const arr = store.samples.get(bucketKey);
    arr.push({ fecha: draw.fecha, horario: draw.horario });
    if (arr.length > sampleLimit) arr.shift();
  });

  const hallazgos = [];

  byNumber.forEach((store, numero) => {
    const total = Array.from(store.counts.values()).reduce((acc, v) => acc + v, 0);
    if (total < 4) return;
    const sorted = Array.from(store.counts.entries()).sort((a, b) => b[1] - a[1]);
    const [bucketKey, count] = sorted[0];
    const ratio = count / total;

    const etiqueta = labelMap(bucketKey);
    if (!etiqueta) return;

    const samples = (store.samples.get(bucketKey) || []).slice(-sampleLimit);
    const etiquetaCompleta =
      key === "dayOfWeek" ? DOW_FULL[bucketKey] || etiqueta : etiqueta;

    const historicoBucket = historialCounts.get(numero)?.get(bucketKey) || 0;
    const historicoTotal = Array.from((historialCounts.get(numero) || new Map()).values()).reduce((acc, v) => acc + v, 0);
    const historialRatio = historicoTotal ? historicoBucket / historicoTotal : 0;
    const historialMuestras = (historialSamples.get(numero)?.get(bucketKey) || []).slice(-sampleLimit).map(formatSample);

    const tieneHistorial = historicoBucket >= 2 && historialRatio >= 0.35;
    const scoreFinal = Math.min(1, (ratio * 0.7) + (historialRatio * 0.3));
    if (!tieneHistorial && ratio < 0.7) return;

    hallazgos.push({
      id: `${key}-${numero}-${bucketKey}`,
      titulo: `${tituloPrefix} ${String(numero).padStart(2, "0")} domina ${etiqueta}`,
      confianza: scoreFinal,
      resumen: tieneHistorial
        ? `El ${String(numero).padStart(2, "0")} apareció ${total} veces en la ventana; ${count} (${Math.round(ratio * 100)}%) fueron en ${etiqueta}.`
        : `Patrón emergente: ${count}/${total} apariciones recientes en ${etiqueta}, se monitorea continuidad.`,
      evidencia: [],
      hipotesis: [],
      numero,
      etiqueta,
      datos: {
        total,
        count,
        ratio,
        bucketKey,
        etiquetaCompleta,
        samples,
        historial: {
          count: historicoBucket,
          total: historicoTotal,
          ratio: historialRatio,
          muestras: historialMuestras,
          respaldado: tieneHistorial,
        },
      },
    });
  });

  return hallazgos;
}

function describeRepetition(entry) {
  if (!entry) return "";
  const origen = entry.origen || {};
  const baseTxt = `${origen.fecha || "?"} ${origen.horario || ""}`.trim();
  const destTxt = `${entry.fecha || "?"} ${entry.horario || ""}`.trim();
  if (entry.dayDiff === 0) return `${baseTxt} → ${destTxt} (mismo día)`;
  if (entry.dayDiff === 1) return `${baseTxt} → ${destTxt} (día siguiente)`;
  return `${baseTxt} → ${destTxt}`;
}

function summarizeRepetitions(events, total, tipo) {
  const count = events.length;
  const ratio = total > 0 ? count / total : 0;
  const recientes = events.slice(-3).map(describeRepetition);
  return { count, ratio, recientes };
}

function detectDoublePatterns({ timeline, historial }) {
  if (!timeline.length) return [];

  const countByDay = new Map();
  const totalByDay = new Map();
  const samplesByDay = new Map();

  timeline.forEach((draw) => {
    const dow = draw.dayOfWeek;
    if (dow === undefined || dow === null) return;
    if (!totalByDay.has(dow)) {
      totalByDay.set(dow, 0);
      countByDay.set(dow, 0);
      samplesByDay.set(dow, []);
    }
    totalByDay.set(dow, totalByDay.get(dow) + 1);
    if (isDouble(draw.numero)) {
      countByDay.set(dow, countByDay.get(dow) + 1);
      const arr = samplesByDay.get(dow);
      arr.push({ fecha: draw.fecha, horario: draw.horario, numero: draw.numero });
      if (arr.length > 6) arr.shift();
    }
  });

  const historialCountByDay = new Map();
  const historialTotalByDay = new Map();
  historial.forEach((draw) => {
    const dow = draw.dayOfWeek;
    if (dow === undefined || dow === null) return;
    if (!historialTotalByDay.has(dow)) {
      historialTotalByDay.set(dow, 0);
      historialCountByDay.set(dow, 0);
    }
    historialTotalByDay.set(dow, historialTotalByDay.get(dow) + 1);
    if (isDouble(draw.numero)) {
      historialCountByDay.set(dow, historialCountByDay.get(dow) + 1);
    }
  });

  const hallazgos = [];

  countByDay.forEach((count, dow) => {
    const total = totalByDay.get(dow) || 0;
    if (total < 3) return;
    const ratio = total ? count / total : 0;
    if (ratio < 0.45) return;

    const historialCount = historialCountByDay.get(dow) || 0;
    const historialTotal = historialTotalByDay.get(dow) || 0;
    const historialRatio = historialTotal ? historialCount / historialTotal : 0;
    const respaldado = historialCount >= 3 && historialRatio >= 0.3;
    const scoreFinal = Math.min(1, ratio * 0.6 + historialRatio * 0.4);
    if (!respaldado && ratio < 0.6) return;

    const muestras = (samplesByDay.get(dow) || []).map((sample) =>
      `${formatSample(sample)} · ${formatNumber(sample.numero)}`
    );

    hallazgos.push({
      id: `double-dow-${dow}`,
      titulo: `Dobles destacan en ${DOW_FULL[dow] || DOW_LABEL[dow]}`,
      confianza: scoreFinal,
      resumen: respaldado
        ? `En la ventana apareció ${count} de ${total} (${Math.round(ratio * 100)}%) como pares dobles.`
        : `Patrón emergente: ${count}/${total} pares dobles recientes en ${DOW_FULL[dow] || ""}.`,
      evidencia: [],
      hipotesis: [],
      datos: {
        tipo: "dobles",
        diaSemana: DOW_FULL[dow] || DOW_LABEL[dow],
        total,
        count,
        ratio,
        muestras,
        historial: {
          count: historialCount,
          total: historialTotal,
          ratio: historialRatio,
          respaldado,
        },
      },
    });
  });

  return hallazgos;
}

function computeAndFilterRepetitions(timeline, tipo) {
  const results = [];
  const lastOccurrence = new Map();
  timeline.forEach((draw) => {
    const prev = lastOccurrence.get(draw.numero);
    if (prev) {
      const dayDiff = Math.round((draw.fechaDate - prev.fechaDate) / DAY_MS);
      const turnDiff = (HORARIO_ORDER[draw.horario] ?? 0) - (HORARIO_ORDER[prev.horario] ?? 0);
      if (tipo === "same" && dayDiff === 0 && turnDiff !== 0) {
        results.push({
          numero: draw.numero,
          fecha: draw.fecha,
          horario: draw.horario,
          origen: { fecha: prev.fecha, horario: prev.horario },
          dayDiff,
          turnDiff,
        });
      }
      if (tipo === "next" && dayDiff === 1) {
        results.push({
          numero: draw.numero,
          fecha: draw.fecha,
          horario: draw.horario,
          origen: { fecha: prev.fecha, horario: prev.horario },
          dayDiff,
          turnDiff,
        });
      }
    }
    lastOccurrence.set(draw.numero, draw);
  });
  return results;
}

function countHistoricalRepetitions(historial, numero, tipo) {
  if (!historial?.length) return { count: 0, ratio: 0 };
  const filtered = historial.filter((draw) => draw.numero === numero);
  if (!filtered.length) return { count: 0, ratio: 0 };
  const events = computeAndFilterRepetitions(filtered, tipo);
  const { count } = summarizeRepetitions(events, filtered.length, tipo);
  const ratio = filtered.length ? count / filtered.length : 0;
  return { count, ratio };
}

function detectConsecutiveRepetitions({ timeline, historial = [], hypothesisMap }) {
  if (!timeline.length) return [];

  const lastOccurrence = new Map();
  const totalByNumero = new Map();
  const storeByNumero = new Map();

  const pushEntry = (numero, tipo, prev, curr, dayDiff, turnDiff) => {
    if (!storeByNumero.has(numero)) {
      storeByNumero.set(numero, { sameDay: [], nextDay: [] });
    }
    const store = storeByNumero.get(numero);
    const target = tipo === "same" ? store.sameDay : store.nextDay;
    target.push({
      numero,
      fecha: curr.fecha,
      horario: curr.horario,
      origen: { fecha: prev.fecha, horario: prev.horario },
      dayDiff,
      turnDiff,
    });
  };

  timeline.forEach((draw) => {
    const numero = draw.numero;
    totalByNumero.set(numero, (totalByNumero.get(numero) || 0) + 1);
    const prev = lastOccurrence.get(numero);
    if (prev) {
      const dayDiff = Math.round((draw.fechaDate - prev.fechaDate) / DAY_MS);
      const turnDiff = (HORARIO_ORDER[draw.horario] ?? 0) - (HORARIO_ORDER[prev.horario] ?? 0);
      if (dayDiff === 0) {
        if (turnDiff !== 0) pushEntry(numero, "same", prev, draw, dayDiff, turnDiff);
      } else if (dayDiff === 1) {
        pushEntry(numero, "next", prev, draw, dayDiff, turnDiff);
      }
    }
    lastOccurrence.set(numero, draw);
  });

  const hallazgos = [];

  storeByNumero.forEach((store, numero) => {
    const total = totalByNumero.get(numero) || 0;
    const sameStats = summarizeRepetitions(store.sameDay, total, "mismo día");
    const nextStats = summarizeRepetitions(store.nextDay, total, "día siguiente");

    const historialSame = countHistoricalRepetitions(historial, numero, "same");
    const historialNext = countHistoricalRepetitions(historial, numero, "next");

    const buildHallazgo = (tipo, stats, evidenciaList) => {
      const historialData = tipo === "same" ? historialSame : historialNext;
      const respaldado = historialData.count >= 2 && historialData.ratio >= 0.3;
      if (!stats.count) return;
      if (!respaldado && stats.ratio < 0.6) return;
      const evid = evidenciaList.slice(-4).map((item) => ({
        numero,
        fecha: item.fecha,
        horario: item.horario,
        resumen: tipo === "same"
          ? "Se repitió en un turno posterior el mismo día"
          : "Se repitió al día siguiente",
        origen: { fecha: item.origen.fecha, horario: item.origen.horario },
      }));
      const hypoRefs = buildHypothesisRefs(hypothesisMap, evid);
      const tipoLabel = tipo === "same" ? "mismo día" : "día siguiente";
      const scoreFinal = Math.min(1, stats.ratio * 0.7 + (historialData.ratio || 0) * 0.3);
      hallazgos.push({
        id: `repeat-${tipo}-${numero}`,
        titulo: `Nº ${String(numero).padStart(2, "0")} repite el ${tipoLabel}`,
        confianza: scoreFinal,
        resumen: respaldado
          ? `Ocurrió ${stats.count} veces sobre ${total} apariciones recientes (${Math.round(stats.ratio * 100)}%).`
          : `Patrón emergente: ${stats.count}/${total} repeticiones recientes, se monitorea continuidad.`,
        evidencia: evid,
        hipotesis: hypoRefs,
        numero,
        datos: {
          total,
          repeticiones: stats.count,
          ratio: stats.ratio,
          muestras: stats.recientes,
          tipo: tipoLabel,
          historial: tipo === "same" ? historialSame : historialNext,
          respaldado,
        },
      });
    };

    buildHallazgo("same", sameStats, store.sameDay);
    buildHallazgo("next", nextStats, store.nextDay);
  });

  return hallazgos;
}

function detectWindowPatterns({ timeline, historial = [], hypothesisMap }) {
  const gapPatterns = detectRecurringGaps({ timeline, hypothesisMap });
  const dowPatterns = detectTemporalBias({
    timeline,
    historial,
    key: "dayOfWeek",
    labelMap: (idx) => DOW_LABEL[idx] || null,
    tituloPrefix: "Sesgo semanal",
  });
  const turnoPatterns = detectTemporalBias({
    timeline,
    historial,
    key: "horario",
    labelMap: (turno) => turno,
    tituloPrefix: "Turno dominante",
  });
  const repeatPatterns = detectConsecutiveRepetitions({ timeline, historial, hypothesisMap });
  const doublePatterns = detectDoublePatterns({ timeline, historial });

  return [...gapPatterns, ...dowPatterns, ...turnoPatterns, ...repeatPatterns, ...doublePatterns];
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
      timelineActiva: [],
      timelineCompleto: [],
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

  const hallazgos = detectWindowPatterns({
    timeline: activeTimeline,
    hypothesisMap,
    historial: timeline,
  });
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
    timelineActiva: activeTimeline,
    timelineCompleto: timeline,
  };
}
