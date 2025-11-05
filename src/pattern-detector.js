// pattern-detector.js — núcleo de patrones heurísticos adaptativos
import { DB } from "./storage.js";
import { GUIA } from "./loader.js";
import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const ACTIVE_WINDOW_DAYS = 120;
const RECENT_REPEAT_WINDOW_DAYS = 14;
const MIN_RECENT_REPEAT_COUNT = 2;
const MIN_TOTAL_FOR_REPETITION = 3;
const BASE_REPEAT_RATIO_THRESHOLD = 0.6;
const RECENT_REPEAT_RATIO_THRESHOLD = 0.35;
const MIN_TRANSITION_SUPPORT = 3;
const RECENT_TRANSITION_WINDOW_DAYS = 21;
const TRANSITION_RATIO_THRESHOLD = 0.5;
const TRANSITION_MAX_LOOKAHEAD = 2;
const TRANSITION_TURN_MAPPING = new Map([
  ["11AM", "3PM"],
  ["3PM", "9PM"],
  ["9PM", "11AM"],
]);
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

const padNumber = (n) => String(n).padStart(2, "0");

function slugify(text = "") {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

  const lastEntry = timeline[timeline.length - 1];
  const windowEnd = lastEntry?.fechaDate ?? null;
  if (!windowEnd) {
    return {
      activeTimeline: [],
      windowStart: null,
      windowEnd: null,
    };
  }

  const windowStartCandidate = new Date(windowEnd.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
  const filtered = timeline.filter(
    (draw) => draw.fechaDate && draw.fechaDate >= windowStartCandidate,
  );

  return {
    activeTimeline: filtered,
    windowStart: filtered[0]?.fechaDate ?? windowStartCandidate,
    windowEnd: filtered[filtered.length - 1]?.fechaDate ?? windowEnd,
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
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
    let siguienteHorarioSugerido = null;
    let vencido = false;
    if (lastMatch?.curr?.fechaDate) {
      const tentative = new Date(lastMatch.curr.fechaDate.getTime() + bestGap * DAY_MS);
      if (tentative >= todayStart) {
        siguienteFechaEsperada = formatDate(tentative);
        siguienteHorarioSugerido = lastMatch.curr.horario || null;
      } else {
        vencido = true;
      }
    }

    if (vencido) return;

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
        siguienteHorario: siguienteHorarioSugerido,
      },
    });
  });

  return hallazgos;
}

function buildHistoricalRepeatSummary({ timeline }) {
  if (!timeline.length) return [];

  const lastOccurrence = new Map();
  const totalByNumero = new Map();
  const summary = new Map();

  timeline.forEach((draw) => {
    if (!draw || !Number.isFinite(draw.numero) || !draw.fechaDate) return;
    const numero = draw.numero;
    totalByNumero.set(numero, (totalByNumero.get(numero) || 0) + 1);
    const prev = lastOccurrence.get(numero);
    if (prev && prev.fechaDate) {
      const dayDiff = Math.round((draw.fechaDate - prev.fechaDate) / DAY_MS);
      const turnDiff = (HORARIO_ORDER[draw.horario] ?? 0) - (HORARIO_ORDER[prev.horario] ?? 0);
      let tipo = null;
      if (dayDiff === 0 && turnDiff > 0) {
        tipo = "mismo día";
      } else if (dayDiff === 1) {
        tipo = "día siguiente";
      }
      if (tipo) {
        if (!summary.has(numero)) {
          summary.set(numero, {
            numero,
            eventos: [],
            years: new Map(),
            ultimaFecha: null,
          });
        }
        const entry = summary.get(numero);
        const year = draw.fechaDate.getFullYear();
        entry.eventos.push({
          origenFecha: prev.fecha,
          origenHorario: prev.horario,
          destinoFecha: draw.fecha,
          destinoHorario: draw.horario,
          dayDiff,
          turnDiff,
          tipo,
          year,
        });
        entry.years.set(year, (entry.years.get(year) || 0) + 1);
        entry.ultimaFecha = draw.fecha;
      }
    }
    lastOccurrence.set(numero, draw);
  });

  const results = [];
  summary.forEach((entry, numero) => {
    if (entry.eventos.length < 2) return;
    entry.eventos.sort((a, b) => {
      if (a.destinoFecha === b.destinoFecha) {
        return (HORARIO_ORDER[a.destinoHorario] ?? 0) - (HORARIO_ORDER[b.destinoHorario] ?? 0);
      }
      return a.destinoFecha.localeCompare(b.destinoFecha);
    });
    const totalApariciones = totalByNumero.get(numero) || entry.eventos.length;
    const ratio = totalApariciones ? entry.eventos.length / totalApariciones : 0;
    const info = GUIA[String(numero).padStart(2, "0")] || {};
    results.push({
      numero,
      simbolo: info.simbolo || null,
      familia: info.familia || null,
      eventos: entry.eventos,
      totalEventos: entry.eventos.length,
      totalApariciones,
      ratio,
      years: Array.from(entry.years.entries())
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => b.year - a.year),
      ultimaFecha: entry.ultimaFecha,
    });
  });

  results.sort((a, b) => {
    if (b.totalEventos !== a.totalEventos) return b.totalEventos - a.totalEventos;
    if (a.ultimaFecha && b.ultimaFecha) return b.ultimaFecha.localeCompare(a.ultimaFecha);
    return String(a.numero).localeCompare(String(b.numero));
  });

  return results;
}

function detectFamilyClusters({ timeline, historial = [] }) {
  if (!timeline.length) return [];

  const familiaHistorico = new Map();
  (historial.length ? historial : timeline).forEach((draw) => {
    const info = GUIA[padNumber(draw.numero)];
    if (!info?.familia) return;
    familiaHistorico.set(info.familia, (familiaHistorico.get(info.familia) || 0) + 1);
  });

  const gruposPorFecha = new Map();
  timeline.forEach((draw) => {
    if (!draw.fecha) return;
    if (!gruposPorFecha.has(draw.fecha)) gruposPorFecha.set(draw.fecha, []);
    gruposPorFecha.get(draw.fecha).push(draw);
  });

  const hallazgos = [];

  gruposPorFecha.forEach((draws, fecha) => {
    if (draws.length < 2) return;
    const familias = new Map();
    draws.forEach((draw) => {
      const info = GUIA[padNumber(draw.numero)];
      if (!info?.familia) return;
      if (!familias.has(info.familia)) familias.set(info.familia, []);
      familias.get(info.familia).push({ draw, info });
    });

    familias.forEach((items, familia) => {
      if (items.length < 2) return;
      const totalDia = draws.length;
      const ratio = items.length / totalDia;
      const historialCount = familiaHistorico.get(familia) || 0;
      const historialRatio = historial.length ? historialCount / historial.length : 0;
      const confianza = Math.min(1, 0.35 + ratio * 0.45 + historialRatio * 0.2);

      const evidencia = items.map(({ draw, info }) => ({
        fecha: draw.fecha,
        horario: draw.horario,
        numero: draw.numero,
        simbolo: info.simbolo || "",
      }));

      hallazgos.push({
        id: `family-cluster-${fecha}-${slugify(familia)}`,
        titulo: `Familia ${familia} alineada en ${fecha}`,
        confianza,
        resumen: `${items.length} de ${totalDia} sorteos del ${fecha} pertenecieron a la familia ${familia}.`,
        evidencia,
        datos: {
          fecha,
          familia,
          totalDia,
          coincidencias: items.length,
          ratio,
          historial: historialCount,
          numeros: items.map(({ draw, info }) => ({
            numero: draw.numero,
            simbolo: info.simbolo || "",
            horario: draw.horario,
          })),
        },
      });
    });
  });

  return hallazgos.sort((a, b) => (b.datos?.fecha || "").localeCompare(a.datos?.fecha || ""));
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
      `${formatSample(sample)} · ${String(sample.numero).padStart(2, "0")}`
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
  const nowTs = Date.now();
  const recentWindowMs = RECENT_REPEAT_WINDOW_DAYS * DAY_MS;

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
      fechaDate: curr.fechaDate,
      timestamp: curr.fechaDate ? curr.fechaDate.getTime() : null,
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
    if (total < MIN_TOTAL_FOR_REPETITION) return;
    const sameStats = summarizeRepetitions(store.sameDay, total, "mismo día");
    const nextStats = summarizeRepetitions(store.nextDay, total, "día siguiente");

    const historialSame = countHistoricalRepetitions(historial, numero, "same");
    const historialNext = countHistoricalRepetitions(historial, numero, "next");

    const buildHallazgo = (tipo, stats, evidenciaList) => {
      const historialData = tipo === "same" ? historialSame : historialNext;
      const respaldado = historialData.count >= 2 && historialData.ratio >= 0.3;
      if (!stats.count) return;
      const recentMatches = evidenciaList.filter(
        (item) => item.timestamp !== null && nowTs - item.timestamp <= recentWindowMs,
      );
      const meetsRecentBurst = recentMatches.length >= MIN_RECENT_REPEAT_COUNT;
      if (!respaldado) {
        if (meetsRecentBurst) {
          if (stats.ratio < RECENT_REPEAT_RATIO_THRESHOLD) return;
        } else if (stats.ratio < BASE_REPEAT_RATIO_THRESHOLD) {
          return;
        }
      }

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
  const transitionPatterns = detectSuccessiveTransitions({ timeline, historial, hypothesisMap });
  const doublePatterns = detectDoublePatterns({ timeline, historial });
  const familyClusters = detectFamilyClusters({ timeline, historial });

  return [
    ...gapPatterns,
    ...dowPatterns,
    ...turnoPatterns,
    ...repeatPatterns,
    ...transitionPatterns,
    ...doublePatterns,
    ...familyClusters,
  ];
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
  const repeticionesHistoricas = buildHistoricalRepeatSummary({ timeline });
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
    repeticionesHistoricas,
  };
}
function detectSuccessiveTransitions({ timeline, historial = [], hypothesisMap }) {
  if (!timeline.length) return [];

  const transitions = new Map();
  const historialTransitions = new Map();
  const now = Date.now();

  const addTransition = (store, from, to, meta) => {
    if (!store.has(from)) {
      store.set(from, new Map());
    }
    const byKey = store.get(from);
    const key = `${to.numero}|${to.horario || ""}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        count: 0,
        samples: [],
        destino: to.numero,
        destinoHorario: to.horario,
      });
    }
    const bucket = byKey.get(key);
    bucket.count += 1;
    bucket.samples.push(meta);
    if (bucket.samples.length > 6) bucket.samples.shift();
  };

  const processTimeline = (draws, store, { strictTurns = false } = {}) => {
    for (let i = 0; i < draws.length; i++) {
      const current = draws[i];
      const nextTurn = TRANSITION_TURN_MAPPING.get(current.horario) || null;
      for (let step = 1; step <= TRANSITION_MAX_LOOKAHEAD; step++) {
        const candidate = draws[i + step];
        if (!candidate) break;
        const dayDiff = Math.round((candidate.fechaDate - current.fechaDate) / DAY_MS);
        if (!Number.isFinite(dayDiff) || dayDiff < 0 || dayDiff > 7) break;
        if (strictTurns && nextTurn && candidate.horario !== nextTurn) continue;
        if (current.pais && candidate.pais && current.pais !== candidate.pais) continue;
        const meta = {
          fecha: candidate.fecha,
          horario: candidate.horario,
          pais: candidate.pais,
          dayDiff,
          fromHorario: current.horario,
          timestamp: candidate.fechaDate ? candidate.fechaDate.getTime() : null,
        };
        addTransition(store, current.numero, { numero: candidate.numero, horario: candidate.horario }, meta);
        break;
      }
    }
  };

  processTimeline(timeline, transitions, { strictTurns: true });
  processTimeline(historial, historialTransitions, { strictTurns: true });

  const hallazgos = [];

  transitions.forEach((byNumber, numero) => {
    const totalTransitions = Array.from(byNumber.values()).reduce((acc, entry) => acc + entry.count, 0);
    if (totalTransitions < MIN_TRANSITION_SUPPORT) return;
    const sorted = Array.from(byNumber.values()).sort((a, b) => b.count - a.count);
    const top = sorted[0];
    const ratio = top.count / totalTransitions;
    if (ratio < TRANSITION_RATIO_THRESHOLD) return;

    const destinoKey = `${top.destino}|${top.destinoHorario || ""}`;
    const historialEntry = historialTransitions.get(numero)?.get(destinoKey) || null;
    const historialCount = historialEntry?.count || 0;
    const historialSamples = historialEntry?.samples || [];
    const respaldoHist = historialCount >= MIN_TRANSITION_SUPPORT;

    if (!respaldoHist) {
      const recentSamples = top.samples.filter(
        (sample) => sample.timestamp !== null && now - sample.timestamp <= RECENT_TRANSITION_WINDOW_DAYS * DAY_MS,
      );
      if (!recentSamples.length) return;
    }

    const evidencia = top.samples.slice(-4).map((sample) => ({
      fecha: sample.fecha,
      horario: sample.horario,
      numero: top.destino,
      resumen: `Siguió tras ${String(numero).padStart(2, "0")}${sample.dayDiff === 0 ? " el mismo día" : ` (${sample.dayDiff}d después)`}`,
      origen: { horario: sample.fromHorario },
    }));

    const hypoRefs = buildHypothesisRefs(hypothesisMap, evidencia);
    const confianzaBase = Math.min(1, ratio * 0.6 + (respaldoHist ? 0.4 : 0));
    const titulo = `Tras ${String(numero).padStart(2, "0")} suele venir ${String(top.destino).padStart(2, "0")}`;

    hallazgos.push({
      id: `transition-${numero}-${top.destino}-${top.destinoHorario || "any"}`,
      titulo,
      confianza: confianzaBase,
      resumen: respaldoHist
        ? `Se registró ${top.count} veces sobre ${totalTransitions} transiciones recientes (${Math.round(ratio * 100)}%) y ${historialCount} respaldos históricos.`
        : `Patrón emergente: ${top.count}/${totalTransitions} transiciones recientes (${Math.round(ratio * 100)}%).`,
      evidencia,
      hipotesis: hypoRefs,
      numero,
      datos: {
        origen: numero,
        destino: top.destino,
        destinoHorario: top.destinoHorario,
        totalTransiciones: totalTransitions,
        coincidencias: top.count,
        ratio,
        historial: historialCount,
        muestras: evidencia.map((e) => `${e.resumen} · ${e.fecha} ${e.horario || ""}`),
      },
    });
  });

  return hallazgos;
}
