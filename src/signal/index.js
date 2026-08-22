/**
 * signal/index.js — Orquestador del motor unificado de señales
 *
 * Re-exporta markov.js y rezago.js.
 * Contiene: enrich, ejecutarMotorSeñales, sucesoresMarkov, estadoRezago,
 *           agregarSeñales, aplicarEliminacion y utilidades internas.
 */

import { DB } from "../storage.js";
import { GUIA } from "../loader.js";
import { parseDrawDate } from "../date-utils.js";
import { detectarPatrones } from "../pattern-detector.js";
import { evaluarModos } from "../mode-engine.js";
import { getPesosActivos } from "../weight-optimizer.js";
import { detectarRegimen } from "../regime-detector.js";
import { proyectarSecuencias, seqSignals } from "../sequence-engine.js";
import { calcularPresion, presionAFactor } from "../pressure-engine.js";
import { analizarSecuenciasSemanales } from "../weekly-patterns.js";
import { getEfectosCalendarioPorNumero, getEventosProximos } from "../popularity-calendar.js";
import { calcularPopularidad, popularidadAFactor, getCadenasActivas, getMercado } from "../popularity-model.js";
import { generarVariantesMulti } from "../conversion-engine.js";
import { validarClustersConNulo, pesoPorCluster, numerosDelCluster } from "../digit-cluster-detector.js";

import {
  buildMarkov1,
  normalizeMarkov1,
  buildMarkov2,
  normalizeMarkov2,
  MARKOV_MIN_SOPORTE,
  MARKOV2_MIN_SOPORTE,
} from "./markov.js";

import { calcularRezago } from "./rezago.js";

// ─── Re-exports ──────────────────────────────────────────────────────────────
export { buildMarkov1, normalizeMarkov1, buildMarkov2, normalizeMarkov2 } from "./markov.js";
export { calcularRezago } from "./rezago.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };
const TURNOS_BASE = ["11AM", "3PM", "9PM"];

let SOURCE_WEIGHTS = {
  markov1: 0.28,
  markov2: 0.18,
  rezago: 0.14,
  modos: 0.18,
  patrones: 0.12,
  semanal: 0.06,
  mensual: 0.04,
};

const ELIM_RECIENTE_DIAS = 1;
const ELIM_FAMILIA_TURNOS = 2;
const TOP_CANDIDATES = 10;

// ─── Utilidades internas ──────────────────────────────────────────────────────

function padNum(n) {
  return String(n).padStart(2, "0");
}

function getSymboloFamilia(numero) {
  const key = padNum(numero);
  const info = GUIA?.[key];
  return {
    simbolo: info?.simbolo || key,
    familia: info?.familia || null,
    polaridad: info?.polaridad || null,
  };
}

export function enrich(draws) {
  return draws
    .map((d) => ({
      ...d,
      fechaDate: parseDrawDate(d.fecha),
      turnoOrder: HORARIO_ORDER[d.horario] ?? -1,
    }))
    .filter((d) => d.fechaDate && d.turnoOrder >= 0)
    .sort((a, b) => {
      const da = a.fechaDate - b.fechaDate;
      return da !== 0 ? da : a.turnoOrder - b.turnoOrder;
    });
}

function isDiciembre(fecha) {
  if (!fecha) return false;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return d.getMonth() === 11;
}

// ─── Filtros de eliminación ───────────────────────────────────────────────────

export function aplicarEliminacion(draws, rezago, diciembre) {
  const eliminados = new Map();
  const recientes = draws.slice(-6);

  if (!diciembre) {
    recientes.forEach((d) => {
      const info = rezago.get(d.numero);
      if (info && info.estado === "reciente") {
        if (!eliminados.has(d.numero)) {
          eliminados.set(d.numero, {
            razon: `Cayó hace ${info.diasDesdeUltima === 0 ? "hoy" : `${info.diasDesdeUltima} día${info.diasDesdeUltima > 1 ? "s" : ""}`}`,
            regla: "reciente",
          });
        }
      }
    });
  }

  rezago.forEach((info, numero) => {
    if (info.zScore >= 3.0 && info.estado !== "reciente") {
      eliminados.set(numero, {
        razon: `${info.diasDesdeUltima} días sin caer (${info.zScore}σ sobre su promedio de ${info.cicloPromedio} días — sobrecalentado)`,
        regla: "sobrecalentado",
      });
    }
  });

  const familiasPenalizadas = new Set();
  draws.slice(-ELIM_FAMILIA_TURNOS).forEach((d) => {
    const { familia } = getSymboloFamilia(d.numero);
    if (familia) familiasPenalizadas.add(familia);
  });

  return { eliminados, familiasPenalizadas };
}

// ─── Agregación de señales ────────────────────────────────────────────────────

export function agregarSeñales({ markov1, markov2, rezago, modos, hallazgos, semanales }, lastNums, familiasPenalizadas) {
  const scores = new Map();

  function addScore(numero, source, value, label) {
    if (!Number.isFinite(value) || value <= 0) return;
    if (!scores.has(numero)) scores.set(numero, { rawScores: {}, signals: [] });
    const entry = scores.get(numero);
    entry.rawScores[source] = Math.max(entry.rawScores[source] || 0, Math.min(1, value));
    entry.signals.push({ source, label, value: Math.min(1, value) });
  }

  if (lastNums.length >= 1) {
    const last = lastNums[lastNums.length - 1];
    const m1 = markov1.get(last);
    if (m1) {
      m1.top.forEach(({ numero, prob, count }) => {
        if (count < MARKOV_MIN_SOPORTE) return;
        addScore(numero, "markov1",
          prob,
          `Markov: sigue a ${padNum(last)} en ${Math.round(prob * 100)}% de casos (${count} veces)`
        );
      });
    }
  }

  if (lastNums.length >= 2) {
    const key = `${lastNums[lastNums.length - 2]}:${lastNums[lastNums.length - 1]}`;
    const m2 = markov2.get(key);
    if (m2) {
      m2.top.forEach(({ numero, prob, count }) => {
        if (count < MARKOV2_MIN_SOPORTE) return;
        addScore(numero, "markov2",
          prob,
          `Markov O2: secuencia …→${padNum(lastNums[lastNums.length - 2])}→${padNum(lastNums[lastNums.length - 1])}→este en ${Math.round(prob * 100)}%`
        );
      });
    }
  }

  rezago.forEach((info, numero) => {
    if (info.estado === "en_ventana") {
      const rezagoScore = Math.min(1, (info.zScore - 0.5) / 1.5);
      addScore(numero, "rezago",
        rezagoScore,
        `Rezago: ${info.diasDesdeUltima} días sin caer (ciclo promedio ${info.cicloPromedio} días — en ventana)`
      );
    }
  });

  if (modos?.scorePorNumero) {
    Object.entries(modos.scorePorNumero).forEach(([pad, score]) => {
      const n = parseInt(pad, 10);
      if (score > 0.15) {
        const detalle = modos.detallePorNumero?.[pad]?.[0];
        addScore(n, "modos",
          score,
          detalle ? `Modo ${detalle.modeNombre}: ${detalle.nota || "transformación"}` : `Modo activo (score ${Math.round(score * 100)}%)`
        );
      }
    });
  }

  if (hallazgos?.length) {
    hallazgos.forEach((h) => {
      // Un hallazgo que no sobrevive la corrección FDR vale 4× menos:
      // puede ser ruido, no evidencia.
      const fdrMult = h.significativoFDR === false ? 0.25 : 1;
      if (h.numero != null && h.confianza > 0.3) {
        addScore(h.numero, "patrones",
          h.confianza * fdrMult,
          `Patrón: ${h.titulo}`
        );
      }
      if (h.datos?.destino != null && h.datos?.ratio > 0.3) {
        addScore(h.datos.destino, "patrones",
          h.datos.ratio * 0.8 * fdrMult,
          h.titulo
        );
      }
    });
  }

  if (semanales?.stats?.destacados?.length) {
    semanales.stats.destacados.forEach((ciclo) => {
      if (ciclo.cycle?.nextNumero != null) {
        addScore(ciclo.cycle.nextNumero, "semanal",
          ciclo.cycle.score || 0.4,
          `Ciclo semanal (${ciclo.dow} ${ciclo.horario}): siguiente en patrón`
        );
      }
    });
  }

  const composed = new Map();
  const pesoTotal = Object.values(SOURCE_WEIGHTS).reduce((s, w) => s + w, 0) || 1;
  scores.forEach((entry, numero) => {
    let total = 0;
    Object.entries(entry.rawScores).forEach(([source, val]) => {
      const w = SOURCE_WEIGHTS[source] || 0;
      total += val * w;
    });
    const score = Math.min(1, total / pesoTotal);
    const { familia } = getSymboloFamilia(numero);
    const penalizado = familia && familiasPenalizadas.has(familia);

    composed.set(numero, {
      score: penalizado ? score * 0.6 : score,
      penalizado,
      signals: entry.signals.sort((a, b) => b.value - a.value),
    });
  });

  return composed;
}

// ─── Punto de entrada principal ───────────────────────────────────────────────

export async function ejecutarMotorSeñales({ pais, turno, fecha, topN = TOP_CANDIDATES, recuperacion = null } = {}) {
  const rawDraws = await DB.listDraws({ excludeTest: true });
  if (rawDraws.length < 20) {
    return { candidatos: [], eliminados: [], universo: 100, contexto: { error: "Insuficientes sorteos registrados (mínimo 20)." } };
  }

  const draws = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  if (!draws.length) {
    return { candidatos: [], eliminados: [], universo: 100, contexto: { error: `Sin sorteos para país: ${pais}` } };
  }

  const fechaRef = fecha ? new Date(fecha) : draws[draws.length - 1]?.fechaDate || new Date();
  const enDiciembre = isDiciembre(fechaRef);
  const lastDraw = draws[draws.length - 1];
  const lastNums = draws.slice(-3).map((d) => d.numero);

  const [modos, patronesResult, semanalesResult] = await Promise.allSettled([
    evaluarModos(),
    detectarPatrones({ cantidad: 12 }),
    Promise.resolve(analizarSecuenciasSemanales(draws, { pais, turno })),
  ]);

  const modos2 = modos.status === "fulfilled" ? modos.value : null;
  const patronesOk = patronesResult.status === "fulfilled" ? patronesResult.value : null;
  const semanales = semanalesResult.status === "fulfilled" ? semanalesResult.value : null;

  const matrix1 = buildMarkov1(draws);
  const markov1 = normalizeMarkov1(matrix1);
  const matrix2 = buildMarkov2(draws);
  const markov2 = normalizeMarkov2(matrix2);

  const rezago = calcularRezago(draws);

  const { eliminados, familiasPenalizadas } = aplicarEliminacion(draws, rezago, enDiciembre);

  const hallazgos = patronesOk?.hallazgos || [];
  const composed = agregarSeñales(
    { markov1, markov2, rezago, modos: modos2, hallazgos, semanales },
    lastNums,
    familiasPenalizadas
  );

  // 6a. Calendario adversarial
  try {
    const fechaCalendario = fecha || (lastDraw?.fecha) || new Date().toISOString().slice(0, 10);
    const efectosCal = getEfectosCalendarioPorNumero(fechaCalendario);
    efectosCal.forEach(({ factor, motivos, tipos }, numero) => {
      const data = composed.get(numero);
      if (!data) return;
      data.score = Math.max(0, Math.min(1, data.score * factor));
      const tipoLabel = tipos.has("penalizacion") && tipos.has("boost")
        ? "calendario-mixto"
        : tipos.has("penalizacion") ? "calendario-bloqueo" : "calendario-boost";
      const pctChange = Math.round((factor - 1) * 100);
      const sign = pctChange >= 0 ? "+" : "";
      data.signals.unshift({
        source: tipoLabel,
        label: `${motivos[0]}${motivos.length > 1 ? ` (+${motivos.length - 1} efecto${motivos.length > 2 ? "s" : ""} más)` : ""} (${sign}${pctChange}% peso)`,
        value: Math.min(0.95, 0.5 + Math.abs(factor - 1)),
      });
    });
  } catch (e) { /* calendario opcional */ }

  // 6b. Modelo de popularidad adversarial
  let popularidadInfo = null;
  try {
    const popMap = calcularPopularidad(draws, { lookback: 20 });
    popMap.forEach((data, numero) => {
      const target = composed.get(numero);
      if (!target) return;
      const factor = popularidadAFactor(data.score);
      target.score = Math.max(0, Math.min(1, target.score * factor));
      const pctChange = Math.round((factor - 1) * 100);
      const sign = pctChange >= 0 ? "+" : "";
      const tag = factor < 0.9 ? "popularidad-caliente" : factor > 1.1 ? "popularidad-libre" : "popularidad-neutra";
      const labelHead = data.motivos[0] || (factor < 1 ? "Número popular" : "Número libre");
      target.signals.unshift({
        source: tag,
        label: `${labelHead} (popularidad ${data.score}/100, ${sign}${pctChange}% peso)`,
        value: Math.min(0.95, 0.5 + Math.abs(factor - 1)),
      });
    });
    const mercado = getMercado(popMap, { topN: 8, rezagoMap: rezago });
    const cadenasActivas = getCadenasActivas(draws, { lookback: 15 });
    popularidadInfo = {
      calientes: mercado.calientes.map((e) => ({ numero: e.numero, pad: padNum(e.numero), score: e.score, motivo: e.motivos[0] || "Popular", ultimaMs: e.ultimaMs ?? null })),
      frios: mercado.frios.map((e) => ({ numero: e.numero, pad: padNum(e.numero), score: e.score, dias: e.diasDesdeUltima })),
      reprimidos: mercado.reprimidos.map((e) => ({
        numero: e.numero,
        pad: padNum(e.numero),
        score: e.score,
        dias: e.diasDesdeUltima,
        zScore: e.zScore != null ? Number(e.zScore.toFixed(2)) : null,
        motivo: e.motivos[0] || "Popular reprimido",
      })),
      libres: mercado.frios.map((e) => ({ numero: e.numero, pad: padNum(e.numero), score: e.score })),
      cadenasActivas: cadenasActivas.slice(0, 6).map((c) => ({
        cadena: c.cadena,
        triggers: c.triggers.map((n) => ({ numero: n, pad: padNum(n) })),
        targets: c.targets.map((n) => ({ numero: n, pad: padNum(n) })),
        intensidad: Math.round(c.intensidad * 100),
      })),
    };
  } catch (e) { /* opcional */ }

  // 6d. Variantes adversariales
  let variantesInfo = null;
  try {
    const seeds = [];
    if (lastDraw && Number.isFinite(lastDraw.numero)) {
      seeds.push({ numero: lastDraw.numero, peso: 1.0 });
    }
    draws.slice(-5, -1).forEach((d, i, arr) => {
      const w = 0.4 + (i / arr.length) * 0.4;
      seeds.push({ numero: d.numero, peso: w });
    });
    if (popularidadInfo?.calientes?.length) {
      popularidadInfo.calientes.slice(0, 4).forEach((c) => {
        seeds.push({ numero: c.numero, peso: 0.6 });
      });
    }

    const variantesMap = generarVariantesMulti(seeds, { encadenadas: true });
    const seedNums = new Set(seeds.map((s) => s.numero));

    variantesMap.forEach(({ peso, fuentes }, numero) => {
      if (seedNums.has(numero)) return;
      const target = composed.get(numero);
      if (!target) return;
      const factor = 1 + Math.min(0.45, peso * 0.5);
      target.score = Math.max(0, Math.min(1, target.score * factor));
      const principal = fuentes.sort((a, b) => b.peso - a.peso)[0];
      const pct = Math.round((factor - 1) * 100);
      target.signals.unshift({
        source: "variante-conversion",
        label: `Variante de ${padNum(principal.seed)} (${principal.tipo}) — La Diaria sustituye en vez de pagar el original (+${pct}% peso)`,
        value: Math.min(0.95, 0.55 + peso * 0.4),
      });
    });

    const topVariantes = Array.from(variantesMap.entries())
      .filter(([n]) => !seedNums.has(n))
      .map(([numero, { peso, fuentes }]) => ({
        numero,
        pad: padNum(numero),
        peso: Math.round(peso * 100) / 100,
        fuentes: fuentes.slice(0, 3).map((f) => ({ seed: f.seed, pad: padNum(f.seed), tipo: f.tipo })),
      }))
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 10);

    variantesInfo = {
      semillas: seeds.map((s) => ({ numero: s.numero, pad: padNum(s.numero), peso: Math.round(s.peso * 100) / 100 })),
      variantes: topVariantes,
    };
  } catch (e) { /* opcional */ }

  // 6e. Detector de clusters de dígitos — validado contra nul-model Monte
  // Carlo: solo los clusters que superan la distribución nula reciben boost.
  // Un cluster post-hoc sin validación es data-snooping puro.
  let clustersInfo = null;
  try {
    const { clusters: todos, umbralNulo } = validarClustersConNulo(draws, {
      lookback: 12, umbralRatio: 0.65, minK: 2, maxK: 5,
    });
    const clusters = todos.filter((c) => c.significativo);
    if (clusters.length) {
      const pesos = pesoPorCluster(clusters);
      pesos.forEach(({ peso, clusterRank, digitos }, numero) => {
        const target = composed.get(numero);
        if (!target) return;
        const factor = 1 + Math.min(0.40, peso * 0.45);
        target.score = Math.max(0, Math.min(1, target.score * factor));
        const pct = Math.round((factor - 1) * 100);
        target.signals.unshift({
          source: "cluster-digito",
          label: `Cluster activo {${digitos.join(",")}} #${clusterRank + 1} (p<0.05 vs azar) — La Diaria está minando estos dígitos (+${pct}% peso)`,
          value: Math.min(0.95, 0.55 + peso * 0.4),
        });
      });

      clustersInfo = {
        umbralNulo,
        descartadosPorNulo: todos.length - clusters.length,
        activos: clusters.map((c, idx) => ({
          rank: idx + 1,
          digitos: c.digitos,
        cobertura: Math.round(c.cobertura * 100),
        hits: c.hits,
        total: c.total,
        score: Math.round(c.score * 100) / 100,
        pValor: c.pValor,
        sorteos: c.sorteos.map((n) => ({ numero: n, pad: padNum(n) })),
        miembros: numerosDelCluster(c.digitos).map((n) => ({ numero: n, pad: padNum(n) })),
      })),
      };
    } else if (todos.length) {
      // Había clusters por cobertura, pero el nul-model los explica por azar.
      clustersInfo = {
        umbralNulo,
        descartadosPorNulo: todos.length,
        activos: [],
      };
    }
  } catch (e) { /* opcional */ }

  // 6c. Modo recuperación mejorado
  let recuperacionInfo = null;
  if (recuperacion?.activo) {
    const dias = Number.isFinite(recuperacion.diasTranscurridos)
      ? recuperacion.diasTranscurridos
      : 0;
    const decayFactor = Math.max(0, 1 - dias / 14);

    if (recuperacion.repetidosPostEvento?.length) {
      const repMap = new Map(recuperacion.repetidosPostEvento.map(({ numero, veces }) => [Number(numero), veces]));
      composed.forEach((data, numero) => {
        if (repMap.has(numero)) {
          const veces = repMap.get(numero);
          const baseBoost = Math.min(0.8, 0.3 + (veces - 2) * 0.15);
          const boostFactor = 1 + baseBoost * decayFactor;
          data.score = Math.min(1, data.score * boostFactor);
          data.signals.unshift({
            source: "recuperacion-repetido",
            label: `Recuperación: repitió ${veces}× post-SP, día ${dias}/14 (+${Math.round((boostFactor - 1) * 100)}% peso)`,
            value: Math.min(0.95, 0.6 + veces * 0.1),
          });
        }
      });
    }

    if (recuperacion.preEvento?.length) {
      const repMapNums = new Set((recuperacion.repetidosPostEvento || []).map((r) => Number(r.numero)));
      const postEventoNums = new Set();
      const spDate = recuperacion.ultimoEvento ? new Date(recuperacion.ultimoEvento + "T00:00:00") : null;
      if (spDate) {
        draws.forEach((d) => {
          if (d.fechaDate && d.fechaDate >= spDate) postEventoNums.add(d.numero);
        });
      }
      recuperacion.preEvento.forEach(({ numero, veces }) => {
        const n = Number(numero);
        if (postEventoNums.has(n)) return;
        if (repMapNums.has(n)) return;
        const data = composed.get(n);
        if (!data) return;
        const baseBoost = Math.min(0.5, 0.2 + (veces - 1) * 0.1);
        const boostFactor = 1 + baseBoost * decayFactor;
        data.score = Math.min(1, data.score * boostFactor);
        data.signals.unshift({
          source: "recuperacion-preevento",
          label: `Recuperación: cayó ${veces}× los días previos al SP y no ha vuelto — la operadora lo estaba escondiendo (+${Math.round((boostFactor - 1) * 100)}% peso)`,
          value: Math.min(0.9, 0.55 + veces * 0.08),
        });
      });
    }

    recuperacionInfo = {
      activo: true,
      diasTranscurridos: dias,
      diasRestantes: Math.max(0, 14 - dias),
      decayFactor: Math.round(decayFactor * 100) / 100,
      ultimoEvento: recuperacion.ultimoEvento || null,
      repetidos: (recuperacion.repetidosPostEvento || []).slice(0, 8).map((r) => ({
        numero: r.numero, pad: padNum(r.numero), veces: r.veces,
      })),
      preEvento: (recuperacion.preEvento || []).slice(0, 8).map((r) => ({
        numero: r.numero, pad: padNum(r.numero), veces: r.veces,
      })),
    };
  }

  // 6f. Factor adversarial dominical
  let dominicalInfo = null;
  try {
    const fechaRefDow = fecha
      ? new Date(fecha + "T12:00:00")
      : (lastDraw?.fechaDate ? new Date(lastDraw.fechaDate.getTime() + 86400000) : new Date());
    const dow = fechaRefDow.getDay();
    if (dow === 0) {
      let afectados = 0;
      composed.forEach((data) => {
        const penal = data.signals.find((s) => s.source === "popularidad-caliente");
        if (penal) {
          data.score = Math.min(1, data.score * 1.18);
          afectados++;
        }
      });
      dominicalInfo = {
        esDomingo: true,
        fecha: fechaRefDow.toISOString().slice(0, 10),
        afectados,
        nota: "Domingo: menor volumen → suavización de penalty a populares (+18%)",
      };
      if (afectados) {
        composed.forEach((data) => {
          if (data.signals.some((s) => s.source === "popularidad-caliente")) {
            data.signals.unshift({
              source: "factor-dominical",
              label: "Domingo: rebote dominical aplicado (+18% sobre penalty popular)",
              value: 0.5,
            });
          }
        });
      }
    } else {
      dominicalInfo = { esDomingo: false };
    }
  } catch (e) { /* opcional */ }

  // v4.0: pesos dinámicos, régimen, secuencias y presión
  let regimenInfo = { regimen: "normal", confianza: 0 };
  let contextoV4 = null;
  try {
    const drawsDesc = draws.slice().reverse();
    regimenInfo = detectarRegimen(drawsDesc);

    const pesosActivos = await getPesosActivos(regimenInfo.regimen);
    SOURCE_WEIGHTS = { ...SOURCE_WEIGHTS, ...pesosActivos };

    const presionMap = await calcularPresion(drawsDesc, { turno });
    const secuencias = await proyectarSecuencias(drawsDesc, presionMap);
    const seqSigsMap = seqSignals(secuencias);

    composed.forEach((data, numero) => {
      const ps = presionMap.get(numero);
      if (ps) {
        const factor = presionAFactor(ps.presion);
        if (Math.abs(factor - 1) > 0.05) {
          data.score = Math.max(0, Math.min(1, data.score * factor));
          const pct = Math.round((factor - 1) * 100);
          const sign = pct >= 0 ? "+" : "";
          data.signals.unshift({
            source: factor < 1 ? "presion-alta" : "presion-baja",
            label: `Presión pública ${(ps.presion * 100).toFixed(0)}% — ${sign}${pct}% peso`,
            value: Math.min(0.95, Math.abs(factor - 1) + 0.5),
          });
        }
      }

      const seqSig = seqSigsMap.get(numero);
      if (seqSig && seqSig.score > 0) {
        const boost = Math.min(0.12, seqSig.score / 100 * 0.12);
        data.score = Math.min(1, data.score + boost);
        data.signals.unshift({
          source: "secuencia-activa",
          label: seqSig.razones[0] ?? "Secuencia activa apunta a este número",
          value: Math.min(0.95, 0.55 + boost),
        });
      }
    });

    contextoV4 = {
      regimen: regimenInfo,
      secuencias: secuencias.slice(0, 6),
      presionAlta: Array.from(presionMap.values())
        .filter(p => p.presion > 0.65)
        .sort((a, b) => b.presion - a.presion)
        .slice(0, 6)
        .map(p => ({ numero: p.numero, presion: p.presion, liberacion: p.liberacion })),
      liberaciones: Array.from(presionMap.values())
        .filter(p => p.liberacion?.cerca)
        .sort((a, b) => b.liberacion.score - a.liberacion.score)
        .slice(0, 6)
        .map(p => ({ numero: p.numero, liberacion: p.liberacion })),
    };
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[signal-engine v4]", e?.message);
  }

  const candidatos = [];
  composed.forEach((data, numero) => {
    if (eliminados.has(numero)) return;
    if (data.score < 0.05) return;

    const { simbolo, familia, polaridad } = getSymboloFamilia(numero);
    const rez = rezago.get(numero) || {};

    candidatos.push({
      numero,
      pad: padNum(numero),
      simbolo,
      familia,
      polaridad,
      score: Math.round(data.score * 1000) / 1000,
      penalizado: data.penalizado,
      signals: data.signals,
      rezago: {
        estado: rez.estado,
        gapActual: rez.gapActual,
        gapMedio: rez.gapMedio,
        zScore: rez.zScore,
        apariciones: rez.apariciones,
      },
    });
  });

  candidatos.sort((a, b) => b.score - a.score);
  const topCandidatos = candidatos.slice(0, topN);

  const eliminadosArr = Array.from(eliminados.entries()).map(([numero, info]) => ({
    numero,
    pad: padNum(numero),
    simbolo: getSymboloFamilia(numero).simbolo,
    ...info,
  }));

  const markovCoverage = markov1.size / 100;
  let dataQuality = "bajo";
  if (draws.length > 5000) dataQuality = "alto";
  else if (draws.length > 2000) dataQuality = "medio";

  let calendarioInfo = null;
  try {
    const fechaCal = fecha || lastDraw?.fecha || new Date().toISOString().slice(0, 10);
    const efectosActivos = getEfectosCalendarioPorNumero(fechaCal);
    const proximos = getEventosProximos(fechaCal, 120);
    const bloqueados = [];
    const boosteados = [];
    efectosActivos.forEach(({ factor, motivos, tipos }, numero) => {
      const item = { numero, pad: padNum(numero), factor: Math.round(factor * 100) / 100, motivo: motivos[0] };
      if (factor < 1) bloqueados.push(item); else if (factor > 1) boosteados.push(item);
    });
    bloqueados.sort((a, b) => a.factor - b.factor);
    boosteados.sort((a, b) => b.factor - a.factor);
    calendarioInfo = { bloqueados, boosteados, proximos };
  } catch (e) { /* opcional */ }

  return {
    candidatos: topCandidatos,
    eliminados: eliminadosArr,
    universo: 100 - eliminados.size,
    diciembre: enDiciembre,
    recuperacion: recuperacionInfo || recuperacion || null,
    calendario: calendarioInfo,
    popularidad: popularidadInfo,
    variantes: variantesInfo,
    clusters: clustersInfo,
    dominical: dominicalInfo,
    contexto: {
      totalSorteos: draws.length,
      ultimoSorteo: { numero: lastDraw?.numero, horario: lastDraw?.horario, fecha: lastDraw?.fecha },
      markovCobertura: Math.round(markovCoverage * 100),
      dataQuality,
      turno: turno || null,
      fecha: fecha || null,
    },
    inteligencia: contextoV4,
  };
}

export async function sucesoresMarkov(numero, pais, topN = 4) {
  const rawDraws = await DB.listDraws({ excludeTest: true });
  const draws = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  if (draws.length < 10) return [];

  const matrix = buildMarkov1(draws);
  const markov = normalizeMarkov1(matrix);
  const row = markov.get(numero);
  if (!row) return [];

  return row.top.slice(0, topN).map(({ numero: n, prob, count }) => {
    const { simbolo } = getSymboloFamilia(n);
    return { numero: n, pad: padNum(n), simbolo, prob: Math.round(prob * 100), count };
  });
}

export async function estadoRezago(pais) {
  const rawDraws = await DB.listDraws({ excludeTest: true });
  const draws = enrich(rawDraws.filter((d) => !pais || d.pais === pais));
  const rezagoResult = calcularRezago(draws);

  const vencidos = [];
  const enVentana = [];
  const recientes = [];

  rezagoResult.forEach((info, numero) => {
    const { simbolo, familia } = getSymboloFamilia(numero);
    const entry = { numero, pad: padNum(numero), simbolo, familia, ...info };
    if (info.estado === "vencido") vencidos.push(entry);
    else if (info.estado === "en_ventana") enVentana.push(entry);
    else if (info.estado === "reciente") recientes.push(entry);
  });

  vencidos.sort((a, b) => (b.diasDesdeUltima ?? 0) - (a.diasDesdeUltima ?? 0));
  enVentana.sort((a, b) => (b.zScore ?? 0) - (a.zScore ?? 0));

  return { vencidos, enVentana, recientes };
}
