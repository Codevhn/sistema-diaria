/**
 * tests/nivel2-aprendizaje.test.js — Nivel 2: aprendizaje real
 *
 * Cubre:
 *   - Suavizado Jelinek-Mercer en Markov O1/O2 (prob acotada en (prior, pML])
 *   - Ranker logístico online: aprende sesgo plantado, no inventa ventaja
 *     en series aleatorias, y evalúa walk-forward sin look-ahead
 *   - Calibración: Brier, bins de confiabilidad, Platt
 */
import { describe, it, expect } from "vitest";
import { buildMarkov1, normalizeMarkov1 } from "../src/signal/markov.js";
import {
  crearRanker,
  crearContextoFeatures,
  evaluarWalkForward,
  puntuarProximoSorteo,
} from "../src/learning/ranker.js";
import {
  brierScore,
  brierMultinomial,
  binsConfiabilidad,
  plattScaling,
} from "../src/learning/calibration.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const rngConSemilla = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Serie sintética donde `favorecido` cae ~10% y el resto ~uniforme. */
function serieSesgada({ n = 500, favorecido = 42, semilla = 777 } = {}) {
  const rng = rngConSemilla(semilla);
  const t0 = Date.UTC(2025, 0, 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const numero = rng() < 0.10 ? favorecido : Math.floor(rng() * 100);
    out.push({ numero, fechaDate: new Date(t0 + i * 8 * 3600 * 1000), horario: "11AM", isTest: false });
  }
  return out;
}

function serieAleatoria({ n = 400, semilla = 2024 } = {}) {
  const rng = rngConSemilla(semilla);
  const t0 = Date.UTC(2024, 5, 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ numero: Math.floor(rng() * 100), fechaDate: new Date(t0 + i * 8 * 3600 * 1000), horario: "3PM", isTest: false });
  }
  return out;
}

// ── N2.1 Jelinek-Mercer en Markov ────────────────────────────────────────────

describe("markov con suavizado Jelinek-Mercer", () => {
  const mkMatrix = () => {
    // fila del 42: 7 aparece 30 veces (pML 0.30), 8 aparece 70 (pML 0.70)
    const row = new Map([
      [7, { count: 30, wsum: 30 }],
      [8, { count: 70, wsum: 70 }],
    ]);
    return new Map([[42, row]]);
  };

  it("acota la probabilidad entre el prior y la empírica", () => {
    const norm = normalizeMarkov1(mkMatrix());
    const fila = norm.get(42);
    expect(fila).toBeTruthy();
    fila.top.forEach(({ prob, probML }) => {
      expect(prob).toBeGreaterThan(0.01);
      expect(prob).toBeLessThan(probML);
    });
  });

  it("respeta más la evidencia con mucho soporte que con poco", () => {
    const row = new Map([
      [7, { count: 1, wsum: 1 }],
      [8, { count: 99, wsum: 99 }],
    ]);
    const norm = normalizeMarkov1(new Map([[13, row]]));
    const celdaPocaMuestra = norm.get(13).top.find((t) => t.numero === 7);
    // count=1, pML=0.01 → casi todo el peso viene del prior: ~1.03%
    expect(celdaPocaMuestra.probML).toBeCloseTo(0.01, 5);
    expect(celdaPocaMuestra.prob).toBeLessThan(0.02);
  });

  it("mantiene el orden relativo por evidencia", () => {
    const norm = normalizeMarkov1(mkMatrix());
    const top = norm.get(42).top;
    expect(top[0].numero).toBe(8);
    expect(top[1].numero).toBe(7);
  });

  it("buildMarkov1+normalize sobre serie sesgada mantiene coherencia", () => {
    const serie = serieSesgada({ n: 120 });
    const norm = normalizeMarkov1(buildMarkov1(serie));
    expect(norm.size).toBeGreaterThan(0);
    norm.forEach((fila) => {
      let sumaTop = 0;
      fila.top.forEach((t) => { sumaTop += t.prob; });
      // las probabilidades suavizadas ya no suman 1 por fila (masa en el prior)
      expect(sumaTop).toBeLessThanOrEqual(1.0001);
    });
  });
});

// ── N2.2 ranker logístico ────────────────────────────────────────────────────

describe("ranker con aprendizaje real", () => {
  it("detecta un sesgo plantado (walk-forward supera al azar)", () => {
    const serie = serieSesgada({ n: 500 });
    const res = evaluarWalkForward(serie, { topK: 10 });
    expect(res.nEvals).toBeGreaterThan(200);
    expect(res.hitRate).toBeGreaterThan(res.esperadoAzar);
    expect(res.logLossPromedio).toBeLessThan(res.logLossBaseline);
    // importancia: 7 features, dispersiones válidas y orden descendente
    expect(res.importancia.length).toBe(7);
    res.importancia.forEach((f) => expect(f.dispersion).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < res.importancia.length; i += 1) {
      expect(res.importancia[i - 1].dispersion).toBeGreaterThanOrEqual(res.importancia[i].dispersion);
    }
  });

  it("no inventa ventaja en una serie aleatoria", () => {
    const res = evaluarWalkForward(serieAleatoria({ n: 400 }), { topK: 10 });
    expect(res.nEvals).toBeGreaterThan(200);
    expect(res.hitRate).toBeLessThan(0.2);
  });

  it("puntuarProximoSorteo pone al sesgado primero", () => {
    const res = puntuarProximoSorteo(serieSesgada({ n: 600 }), { ventana: 600 });
    expect(res).toBeTruthy();
    expect(res.top.length).toBeGreaterThan(0);
    expect(res.top[0].numero).toBe(42);
    expect(res.top[0].prob).toBeGreaterThan(0.02);
  });

  it("devuelve null con datos insuficientes", () => {
    expect(puntuarProximoSorteo(serieSesgada({ n: 30 }))).toBeNull();
  });

  it("el gradiente reduce el log-loss en un paso controlado", () => {
    const ctx = crearContextoFeatures();
    const t0 = Date.now();
    for (let i = 0; i < 40; i += 1) ctx.registrar(i % 100, t0 - (40 - i) * 3600e3);
    const X = ctx.features(t0);
    const ranker = crearRanker({ lr: 0.3, l2: 0, seed: 99 });
    const antes = ranker.logLoss(X, 5);
    for (let i = 0; i < 50; i += 1) ranker.actualizar(X, 5);
    const despues = ranker.logLoss(X, 5);
    expect(despues).toBeLessThan(antes);
  });
});

// ── N2.3 calibración ─────────────────────────────────────────────────────────

describe("calibración de probabilidades", () => {
  it("brierScore: perfecto=0, tirar moneda constante=0.25", () => {
    expect(brierScore([[0.9, 1], [0.1, 0]])).toBeCloseTo(0.01, 6);
    expect(brierScore([[0.5, 1], [0.5, 0], [0.5, 1]])).toBeCloseTo(0.25, 6);
    expect(brierScore([])).toBeNull();
  });

  it("brierMultinomial coincide con el cálculo directo", () => {
    const p = new Array(100).fill(0.01);
    p[7] = 0.05;
    const esperado = 99 * 0.0001 + (0.05 - 1) ** 2;
    expect(brierMultinomial(p, 7)).toBeCloseTo(esperado, 10);
  });

  it("binsConfiabilidad agrupa y calcula gaps", () => {
    const pares = [
      [0.05, 0], [0.05, 0], [0.05, 1],
      [0.85, 1], [0.85, 1],
    ];
    const bins = binsConfiabilidad(pares, { nBins: 10 });
    expect(bins.length).toBe(2);
    const bajo = bins[0];
    expect(bajo.pPromedio).toBeCloseTo(0.05, 5);
    expect(bajo.tasaReal).toBeCloseTo(1 / 3, 5);
  });

  it("plattScaling aprende una transformación creciente", () => {
    const datos = [];
    for (let i = 0; i < 60; i += 1) {
      const s = i / 59;
      datos.push([s, s > 0.5 ? 1 : 0]);
    }
    const platt = plattScaling(datos);
    expect(platt).toBeTruthy();
    expect(platt.a).toBeGreaterThan(0);
    expect(platt.calibrar(0.9)).toBeGreaterThan(platt.calibrar(0.1));
  });
});
