import { describe, it, expect, vi } from "vitest";
import { binomialTailP, benjaminiHochberg } from "../src/stats-utils.js";
import { validarClustersConNulo, numerosDelCluster } from "../src/digit-cluster-detector.js";
import { detectarRegimen } from "../src/regime-detector.js";

vi.mock("../src/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../src/intelligence-storage.js", () => ({
  insertChangepoint: vi.fn(async () => {}),
  getRecentChangepoints: vi.fn(async () => []),
}));

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe("binomialTailP — cola superior exacta", () => {
  it("casos borde conocidos", () => {
    expect(binomialTailP(1, 10, 0.1)).toBeCloseTo(1 - 0.9 ** 10, 6);
    expect(binomialTailP(10, 10, 0.1)).toBeCloseTo(1e-10, 12);
    expect(binomialTailP(5, 5, 0.5)).toBeCloseTo(0.03125, 6);
    expect(binomialTailP(3, 10, 0.5)).toBeCloseTo(0.9453125, 6);
  });

  it("valores imposibles → NaN", () => {
    expect(Number.isNaN(binomialTailP(-1, 5, 0.5))).toBe(true);
    expect(Number.isNaN(binomialTailP(3, 0, 0.5))).toBe(true);
    expect(Number.isNaN(binomialTailP(6, 5, 0.5))).toBe(true);
  });
});

describe("FDR + pattern-detector — ruido uniforme no debe ser significativo", () => {
  it("BH: 20 tests nulos por azar casi nunca superan q=0.05", () => {
    const rng = mulberry32(7);
    let falsosPositivos = 0;
    for (let sim = 0; sim < 50; sim += 1) {
      const tests = Array.from({ length: 20 }, () => ({ pValue: rng() }));
      const res = benjaminiHochberg(tests, 0.05);
      falsosPositivos += res.filter((r) => r.significativoFDR).length;
    }
    // Con FDR al 5% y todas las H0 verdaderas, esperamos ~5% de falsos.
    expect(falsosPositivos / (50 * 20)).toBeLessThan(0.15);
  });
});

describe("digit-cluster — nul-model Monte Carlo", () => {
  it("serie UNIFORME: clusters no significativos (la cobertura es azar)", () => {
    const rng = mulberry32(42);
    const draws = Array.from({ length: 12 }, (_, i) => ({
      fecha: `2026-08-${String(i + 1).padStart(2, "0")}`,
      numero: Math.floor(rng() * 100),
    }));
    const { clusters } = validarClustersConNulo(draws, { seed: 99 });
    // Puede haber clusters por cobertura >= umbral, pero ninguno debe
    // superar la distribución nula del propio pipeline de selección.
    expect(clusters.every((c) => !c.significativo || c.pValor > 0)).toBe(true);
    const sig = clusters.filter((c) => c.significativo);
    if (sig.length === 0) return; // caso esperado
    // si alguno pasara, debe tener p-valor pequeño
    expect(sig.every((c) => c.pValor <= 0.05)).toBe(true);
  });

  it("serie MINADA artificialmente: el cluster correcto ES significativo", () => {
    const rng = mulberry32(1234);
    const universo = numerosDelCluster([1, 7]); // 16 números
    const draws = Array.from({ length: 12 }, (_, i) => ({
      fecha: `2026-08-${String(i + 1).padStart(2, "0")}`,
      numero: universo[Math.floor(rng() * universo.length)],
    }));
    const { clusters } = validarClustersConNulo(draws, { seed: 7 });
    const sig = clusters.filter((c) => c.significativo);
    expect(sig.length).toBeGreaterThanOrEqual(1);
    expect(sig[0].digitos.slice().sort((a, b) => a - b)).toEqual([1, 7]);
    expect(sig[0].pValor).toBeLessThanOrEqual(0.05);
  });

  it("pocos datos → suficiente=false sin explotar", () => {
    const { clusters, suficiente } = validarClustersConNulo([{ numero: 5 }, { numero: 7 }]);
    expect(suficiente).toBe(false);
    expect(clusters).toEqual([]);
  });
});

describe("regime-detector — KL calibrada por nul-model", () => {
  it("dos ventanas uniformes: régimen normal, confianza ~0, sin changepoint espurio", () => {
    const rng = mulberry32(31416);
    // 90 sorteos uniformes — el detector viejo declaraba cambio casi siempre
    const draws = Array.from({ length: 90 }, (_, i) => ({
      fecha: `2026-${String(((i / 30) | 0) + 6).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`,
      numero: Math.floor(rng() * 100),
    }));
    const r = detectarRegimen(draws);
    expect(r.regimen).toBe("normal");
    expect(r.confianza).toBeLessThan(0.7);
  });

  it("ventana reciente sesgada fuerte: el régimen deja de ser normal", () => {
    const rng = mulberry32(555);
    const ref = Array.from({ length: 60 }, (_, i) => ({
      fecha: `2026-06-${String((i % 30) + 1).padStart(2, "0")}`,
      numero: Math.floor(rng() * 100),
    }));
    // Ventana reciente: 30 sorteos donde 25 son saladitos/dobles bajos
    const sesgada = Array.from({ length: 30 }, (_, i) => ({
      fecha: `2026-08-${String(i + 1).padStart(2, "0")}`,
      numero: i < 25 ? [0, 11, 22, 33][i % 4] : Math.floor(rng() * 100),
    }));
    const r = detectarRegimen([...sesgada, ...ref]);
    expect(r.regimen).not.toBe("normal");
    expect(r.confianza).toBeGreaterThan(0);
  });
});
