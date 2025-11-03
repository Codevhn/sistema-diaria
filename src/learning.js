// learning.js — motor de memoria, hipótesis y scoring base
import { DB } from "./storage.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "3PM": 1, "9PM": 2 };
const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function normalizeDraw(draw) {
  const fechaDate = draw?.fecha ? new Date(`${draw.fecha}T00:00:00`) : null;
  const timestamp = fechaDate ? fechaDate.getTime() : null;
  return {
    ...draw,
    numero: typeof draw.numero === "number" ? draw.numero : parseInt(draw.numero, 10),
    fechaDate,
    timestamp,
    dayOfWeek: fechaDate ? fechaDate.getDay() : null,
  };
}

function sortTimeline(draws) {
  return draws
    .map(normalizeDraw)
    .filter((d) => Number.isFinite(d.numero) && d.fechaDate)
    .sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      if (diff !== 0) return diff;
      const orderA = HORARIO_ORDER[a.horario] ?? 0;
      const orderB = HORARIO_ORDER[b.horario] ?? 0;
      return orderA - orderB;
    });
}

function ensureProfile(container, numero) {
  if (!container.has(numero)) {
    container.set(numero, {
      numero,
      total: 0,
      porPais: {},
      porHorario: {},
      porDiaSemana: {},
      porPaisHorario: {},
      ultimas: [],
      gaps: {
        total: 0,
        count: 0,
        promedio: null,
        ultimo: null,
        min: null,
        max: null,
        daysSince: null,
      },
      scoreRecencia: 0,
      scoreFrecuencia: 0,
      scoreHipotesis: 0,
      lastSeenTimestamp: null,
      lastSeen: null,
      hipotesis: {
        confirmadas: 0,
        refutadas: 0,
        pendientes: 0,
        detalles: [],
      },
      aprendizaje: {
        total: 0,
        aciertos: 0,
        fallos: 0,
        porPais: {},
        porHorario: {},
        porDiaSemana: {},
        ultimoResultado: null,
      },
      scoreContexto: 0,
    });
  }
  return container.get(numero);
}

function registerOccurrence(profile, draw, daysSincePrev) {
  profile.total += 1;

  // País
  if (draw.pais) {
    profile.porPais[draw.pais] = (profile.porPais[draw.pais] || 0) + 1;
    if (!profile.porPaisHorario[draw.pais]) profile.porPaisHorario[draw.pais] = {};
    profile.porPaisHorario[draw.pais][draw.horario] =
      (profile.porPaisHorario[draw.pais][draw.horario] || 0) + 1;
  }

  // Horario
  if (draw.horario) {
    profile.porHorario[draw.horario] = (profile.porHorario[draw.horario] || 0) + 1;
  }

  // Día de la semana
  const dow = draw.dayOfWeek;
  if (dow !== null) profile.porDiaSemana[dow] = (profile.porDiaSemana[dow] || 0) + 1;

  // Últimas ocurrencias (hasta 6)
  profile.ultimas.push({
    fecha: draw.fecha,
    horario: draw.horario,
    pais: draw.pais,
    timestamp: draw.timestamp,
    dayOfWeek: dow,
  });
  if (profile.ultimas.length > 6) profile.ultimas.shift();

  // Gaps
  if (typeof daysSincePrev === "number" && Number.isFinite(daysSincePrev)) {
    const g = profile.gaps;
    g.total += daysSincePrev;
    g.count += 1;
    g.ultimo = daysSincePrev;
    g.min = g.min === null ? daysSincePrev : Math.min(g.min, daysSincePrev);
    g.max = g.max === null ? daysSincePrev : Math.max(g.max, daysSincePrev);
    g.promedio = g.total / g.count;
  }

  profile.lastSeenTimestamp = draw.timestamp;
  profile.lastSeen = {
    fecha: draw.fecha,
    horario: draw.horario,
    pais: draw.pais,
    dayOfWeek: dow,
  };
}

function computeScores(profiles, timeline, nowTs) {
  const totalDraws = timeline.length || 1;
  profiles.forEach((profile) => {
    profile.scoreFrecuencia = profile.total / totalDraws;
    if (profile.lastSeenTimestamp) {
      const daysSince = Math.max(0, (nowTs - profile.lastSeenTimestamp) / DAY_MS);
      profile.scoreRecencia = Math.exp(-daysSince / 10);
      profile.gaps.daysSince = daysSince;
    } else {
      profile.scoreRecencia = 0;
      profile.gaps.daysSince = null;
    }
  });
}

function summarizeHypotheses(rawHyps = []) {
  const resume = new Map();
  rawHyps.forEach((hyp) => {
    const numero = typeof hyp.numero === "number" ? hyp.numero : parseInt(hyp.numero, 10);
    if (!Number.isFinite(numero)) return;
    if (!resume.has(numero)) {
      resume.set(numero, {
        numero,
        confirmadas: 0,
        refutadas: 0,
        pendientes: 0,
        detalles: [],
      });
    }
    const bucket = resume.get(numero);
    const estado = hyp.estado || "pendiente";
    bucket[`${estado}s`] = (bucket[`${estado}s`] || 0) + 1;
    bucket.detalles.push(
      {
        id: hyp.id,
        estado,
        fecha: hyp.fecha,
        turno: hyp.turno,
        texto: hyp.razones?.join(" · ") || hyp.simbolo || "",
        createdAt: hyp.createdAt,
      }
    );
  });
  return resume;
}

function attachHypotheses(profiles, hypSummary) {
  profiles.forEach((profile) => {
    const bucket = hypSummary.get(profile.numero);
    if (!bucket) return;
    profile.hipotesis.confirmadas = bucket.confirmadas || 0;
    profile.hipotesis.refutadas = bucket.refutadas || 0;
    profile.hipotesis.pendientes = bucket.pendientes || 0;
    profile.hipotesis.detalles = bucket.detalles.slice(-5);
    const totalEval = bucket.confirmadas + bucket.refutadas;
    if (totalEval > 0) {
      profile.scoreHipotesis = bucket.confirmadas / totalEval;
    } else {
      profile.scoreHipotesis = profile.hipotesis.pendientes > 0 ? 0.5 : 0;
    }
  });
}

function summarizeHypothesisLogs(logs = []) {
  const resume = new Map();
  logs.forEach((log) => {
    const numero = typeof log.numero === "number" ? log.numero : parseInt(log.numero, 10);
    if (!Number.isFinite(numero)) return;
    if (!resume.has(numero)) {
      resume.set(numero, {
        numero,
        total: 0,
        aciertos: 0,
        fallos: 0,
        porPais: new Map(),
        porHorario: new Map(),
        porDiaSemana: new Map(),
        ultimoResultado: null,
      });
    }
    const bucket = resume.get(numero);
    bucket.total += 1;
    if (log.estado === "confirmada") bucket.aciertos += 1;
    else bucket.fallos += 1;

    const incMap = (map, key, estado) => {
      if (!key) return;
      if (!map.has(key)) map.set(key, { aciertos: 0, fallos: 0, total: 0 });
      const ref = map.get(key);
      ref.total += 1;
      if (estado === "confirmada") ref.aciertos += 1;
      else ref.fallos += 1;
    };

    incMap(bucket.porPais, log.paisResultado, log.estado);
    incMap(bucket.porHorario, log.horarioResultado, log.estado);
    if (log.fechaResultado) {
      const dow = new Date(`${log.fechaResultado}T00:00:00`).getDay();
      incMap(bucket.porDiaSemana, dow, log.estado);
    }

    bucket.ultimoResultado = {
      fecha: log.fechaResultado,
      pais: log.paisResultado,
      horario: log.horarioResultado,
      estado: log.estado,
    };
  });
  return resume;
}

function rateFromStats(statsMap) {
  const ratios = [];
  statsMap.forEach((value) => {
    if (!value.total) return;
    ratios.push(value.aciertos / value.total);
  });
  return ratios.length ? Math.max(...ratios) : 0;
}

function attachHypothesisLogs(profiles, logSummary) {
  profiles.forEach((profile) => {
    const bucket = logSummary.get(profile.numero);
    if (!bucket) return;
    const aprendizaje = profile.aprendizaje;
    aprendizaje.total = bucket.total;
    aprendizaje.aciertos = bucket.aciertos;
    aprendizaje.fallos = bucket.fallos;
    aprendizaje.ultimoResultado = bucket.ultimoResultado;

    const fillMap = (source, target) => {
      source.forEach((stats, key) => {
        target[key] = stats;
      });
    };
    fillMap(bucket.porPais, aprendizaje.porPais);
    fillMap(bucket.porHorario, aprendizaje.porHorario);
    fillMap(bucket.porDiaSemana, aprendizaje.porDiaSemana);

    const contexto = [
      rateFromStats(bucket.porPais),
      rateFromStats(bucket.porHorario),
      rateFromStats(bucket.porDiaSemana),
    ];

    const contextoValido = contexto.filter((val) => Number.isFinite(val) && val > 0);
    profile.scoreContexto = contextoValido.length
      ? contextoValido.reduce((acc, val) => acc + val, 0) / contextoValido.length
      : 0;

    const totalEval = bucket.aciertos + bucket.fallos;
    if (totalEval > 0) {
      profile.scoreHipotesis = bucket.aciertos / totalEval;
    }
  });
}

export function calcularMemoria(draws = [], hypotheses = [], logs = []) {
  const timeline = sortTimeline(draws);
  const nowTs = Date.now();
  const profiles = new Map();

  const lastOccurrence = new Map();

  timeline.forEach((draw) => {
    const numero = draw.numero;
    const profile = ensureProfile(profiles, numero);
    const prev = lastOccurrence.get(numero);
    const daysSincePrev = prev ? Math.round((draw.timestamp - prev) / DAY_MS) : null;
    registerOccurrence(profile, draw, daysSincePrev);
    lastOccurrence.set(numero, draw.timestamp);
  });

  computeScores(profiles, timeline, nowTs);

  const hypSummary = summarizeHypotheses(hypotheses);
  attachHypotheses(profiles, hypSummary);

  const logSummary = summarizeHypothesisLogs(logs);
  attachHypothesisLogs(profiles, logSummary);

  return {
    totalDraws: timeline.length,
    latestTimestamp: timeline.length ? timeline[timeline.length - 1].timestamp : null,
    perfiles: Array.from(profiles.values()),
  };
}

function buildMetaEntry(totalDraws) {
  return {
    key: "number-profile:__meta__",
    scope: "number-profile",
    data: { totalDraws, updatedAt: Date.now() },
    updatedAt: Date.now(),
  };
}

export async function rebuildKnowledge() {
  const draws = await DB.listDraws({ excludeTest: true });
  const hyps = await DB._getAll("hypotheses");
  const logs = await DB.getHypothesisLogs();

  if (!draws.length) {
    await DB.clearKnowledge("number-profile");
    return { totalDraws: 0, perfiles: [], latestTimestamp: null };
  }

  const { totalDraws, perfiles, latestTimestamp } = calcularMemoria(draws, hyps, logs);
  const entries = perfiles.map((perfil) => ({
    key: `number:${String(perfil.numero).padStart(2, "0")}`,
    scope: "number-profile",
    data: perfil,
    updatedAt: Date.now(),
  }));
  entries.push(
    buildMetaEntry(totalDraws),
    {
      key: "number-profile:__latest__",
      scope: "number-profile",
      data: { latestTimestamp, updatedAt: Date.now() },
      updatedAt: Date.now(),
    }
  );
  await DB.saveKnowledge(entries);
  return { totalDraws, perfiles, latestTimestamp };
}

export async function obtenerPerfilesNumeros() {
  const rows = await DB.getKnowledgeByScope("number-profile");
  if (!rows.length) return rebuildKnowledge();
  const perfiles = [];
  let totalDraws = null;
  let latestTimestamp = null;
  rows.forEach((row) => {
    if (!row?.data) return;
    if (row.key === "number-profile:__meta__") {
      totalDraws = row.data.totalDraws ?? totalDraws;
    } else if (row.key === "number-profile:__latest__") {
      latestTimestamp = row.data.latestTimestamp ?? latestTimestamp;
    } else {
      perfiles.push(row.data);
    }
  });
  if (!perfiles.length) return rebuildKnowledge();
  return { totalDraws: totalDraws ?? 0, perfiles, latestTimestamp };
}

export async function obtenerPerfilNumero(numero) {
  const key = `number:${String(numero).padStart(2, "0")}`;
  const row = await DB.getKnowledge(key);
  return row?.data ?? null;
}

export function generarPredicciones(perfiles, { top = 9 } = {}) {
  const enrich = perfiles
    .map((perfil) => {
      const score =
        perfil.scoreFrecuencia * 0.35 +
        perfil.scoreRecencia * 0.35 +
        (perfil.scoreHipotesis || 0) * 0.2 +
        (perfil.scoreContexto || 0) * 0.1;
      return {
        numero: perfil.numero,
        score,
        frecuencia: perfil.scoreFrecuencia,
        recencia: perfil.scoreRecencia,
        hipotesis: perfil.scoreHipotesis,
        contexto: perfil.scoreContexto || 0,
        ultimo: perfil.lastSeen,
        gaps: perfil.gaps,
      };
    })
    .filter((p) => Number.isFinite(p.score))
    .sort((a, b) => b.score - a.score);

  return enrich.slice(0, top);
}

export function generarInsights(perfiles = []) {
  if (!perfiles.length) return [];
  const horarios = ["11AM", "3PM", "9PM"];
  const insights = [];

  horarios.forEach((turno) => {
    let mejor = null;
    perfiles.forEach((perfil) => {
      const totalTurno = perfil.porHorario?.[turno] || 0;
      if (!totalTurno || !perfil.total) return;
      const ratio = totalTurno / perfil.total;
      if (!mejor || ratio > mejor.ratio) {
        mejor = {
          numero: perfil.numero,
          ratio,
          totalTurno,
          total: perfil.total,
        };
      }
    });
    if (mejor) {
      insights.push({
        tipo: "turno",
        titulo: `Turno ${turno}`,
        descripcion: `El ${String(mejor.numero).padStart(2, "0")} aparece en ${Math.round(
          mejor.ratio * 100
        )}% de sus registros durante ${turno}.`,
      });
    }
  });

  for (let i = 0; i < 7; i++) {
    let mejor = null;
    perfiles.forEach((perfil) => {
      const totalDia = perfil.porDiaSemana?.[i] || 0;
      if (!totalDia || !perfil.total) return;
      const ratio = totalDia / perfil.total;
      if (!mejor || ratio > mejor.ratio) {
        mejor = {
          numero: perfil.numero,
          ratio,
          totalDia,
        };
      }
    });
    if (mejor) {
      insights.push({
        tipo: "dia",
        titulo: `Día ${DOW_LABEL[i]}`,
        descripcion: `El ${String(mejor.numero).padStart(2, "0")} domina los ${DOW_LABEL[i]} (${Math.round(
          mejor.ratio * 100
        )}% de sus apariciones).`,
      });
    }
  }

  const paisInsights = new Map();
  perfiles.forEach((perfil) => {
    Object.entries(perfil.aprendizaje?.porPais || {}).forEach(([pais, stats]) => {
      if (!stats.total) return;
      const ratio = stats.aciertos / stats.total;
      const key = pais;
      if (!paisInsights.has(key) || ratio > paisInsights.get(key).ratio) {
        paisInsights.set(key, {
          pais,
          numero: perfil.numero,
          ratio,
          total: stats.total,
        });
      }
    });
  });

  paisInsights.forEach((info) => {
    insights.push({
      tipo: "pais",
      titulo: `País ${info.pais}`,
      descripcion: `El ${String(info.numero).padStart(2, "0")} acertó ${Math.round(
        info.ratio * 100
      )}% de las hipótesis en ${info.pais}.`,
    });
  });

  return insights;
}

export function describirPerfil(perfil) {
  if (!perfil) return null;
  const partes = [];
  if (perfil.lastSeen) {
    partes.push(
      `Última vez: ${perfil.lastSeen.fecha} ${perfil.lastSeen.horario || ""} (${perfil.lastSeen.pais || ""})`
    );
  }
  if (perfil.gaps.ultimo !== null) {
    partes.push(`Gap previo: ${perfil.gaps.ultimo} días (promedio ${perfil.gaps.promedio?.toFixed(1) || "?"})`);
  }
  const topPais = Object.entries(perfil.porPais || {})
    .sort((a, b) => b[1] - a[1])[0];
  if (topPais) partes.push(`País dominante: ${topPais[0]} (${topPais[1]} veces)`);
  const topTurno = Object.entries(perfil.porHorario || {})
    .sort((a, b) => b[1] - a[1])[0];
  if (topTurno) partes.push(`Turno frecuente: ${topTurno[0]} (${topTurno[1]}x)`);
  const topDow = Object.entries(perfil.porDiaSemana || {})
    .sort((a, b) => b[1] - a[1])[0];
  if (topDow) partes.push(`Día típico: ${DOW_LABEL[Number(topDow[0])]} (${topDow[1]}x)`);
  if (perfil.aprendizaje?.total) {
    partes.push(
      `Hipótesis: ${perfil.aprendizaje.aciertos}/${perfil.aprendizaje.total} acertadas (${Math.round(
        (perfil.scoreHipotesis || 0) * 100
      )}%)`
    );
    if (perfil.aprendizaje.ultimoResultado) {
      const ul = perfil.aprendizaje.ultimoResultado;
      partes.push(
        `Último aprendizaje: ${ul.fecha || "?"} ${ul.horarioResultado || ""} (${ul.estado})`
      );
    }
  }
  return partes.join(" · ");
}

export async function obtenerResumenPredicciones() {
  const logs = await DB.getPredictionLogs();
  if (!logs.length) {
    return { total: 0, aciertos: 0, fallos: 0, precision: null, turnos: [] };
  }

  const resumen = {
    total: 0,
    aciertos: 0,
    fallos: 0,
    precision: null,
    turnos: {},
  };

  logs.forEach((log) => {
    if (!log || log.estado === "descartado" || log.estado === "pendiente") return;
    resumen.total += 1;
    if (log.estado === "acierto") resumen.aciertos += 1;
    else resumen.fallos += 1;

    const turnoKey = log.resultadoHorario || log.turno || "N/D";
    if (!resumen.turnos[turnoKey]) {
      resumen.turnos[turnoKey] = { total: 0, aciertos: 0, fallos: 0 };
    }
    const ref = resumen.turnos[turnoKey];
    ref.total += 1;
    if (log.estado === "acierto") ref.aciertos += 1;
    else ref.fallos += 1;
  });

  if (resumen.total) {
    resumen.precision = resumen.aciertos / resumen.total;
  }

  resumen.turnos = Object.entries(resumen.turnos).map(([turno, data]) => ({
    turno,
    total: data.total,
    aciertos: data.aciertos,
    fallos: data.fallos,
    precision: data.total ? data.aciertos / data.total : null,
  }));

  return resumen;
}
