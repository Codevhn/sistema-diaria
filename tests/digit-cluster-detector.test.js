import { describe, it, expect } from "vitest";
import { numerosDelCluster, detectarClusters, pesoPorCluster } from "../src/digit-cluster-detector.js";

describe("numerosDelCluster", () => {
  it("genera todos los números cuyos dígitos están en el set", () => {
    const result = numerosDelCluster([0, 1]);
    // 00, 01, 10, 11
    expect(result).toEqual([0, 1, 10, 11]);
  });

  it("para un solo dígito, solo el doble", () => {
    const result = numerosDelCluster([5]);
    expect(result).toEqual([55]);
  });

  it("set vacío → array vacío", () => {
    expect(numerosDelCluster([])).toEqual([]);
  });

  it("set grande genera muchos números", () => {
    const result = numerosDelCluster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.length).toBe(100);
  });
});

describe("detectarClusters", () => {
  it("retorna array", () => {
    expect(Array.isArray(detectarClusters([]))).toBe(true);
  });

  it("retorna vacío si hay menos de 4 sorteos", () => {
    const draws = [{ numero: 12 }, { numero: 21 }, { numero: 13 }];
    expect(detectarClusters(draws)).toEqual([]);
  });

  it("detecta cluster cuando los dígitos se repiten", () => {
    // Sorteos que solo usan dígitos {0, 1}
    const draws = [
      { numero: 1 }, { numero: 10 }, { numero: 11 },
      { numero: 1 }, { numero: 10 }, { numero: 11 },
      { numero: 1 }, { numero: 10 }, { numero: 11 },
      { numero: 1 }, { numero: 10 }, { numero: 11 },
    ];
    const clusters = detectarClusters(draws, { umbralRatio: 0.5 });
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].digitos).toEqual(expect.arrayContaining([0, 1]));
  });

  it("respeta lookback", () => {
    const draws = [
      { numero: 99 }, { numero: 99 }, { numero: 99 }, { numero: 99 },
      { numero: 1 }, { numero: 10 }, { numero: 11 }, { numero: 1 },
      { numero: 10 }, { numero: 11 }, { numero: 1 }, { numero: 10 },
    ];
    // Con lookback=6 solo ve los últimos 6 → cluster {0,1} detectado
    const clusters = detectarClusters(draws, { lookback: 6, umbralRatio: 0.5 });
    expect(clusters.length).toBeGreaterThan(0);
  });

  it("máximo 5 clusters retornados", () => {
    const draws = Array.from({ length: 30 }, (_, i) => ({ numero: i % 10 }));
    const clusters = detectarClusters(draws);
    expect(clusters.length).toBeLessThanOrEqual(5);
  });
});

describe("pesoPorCluster", () => {
  it("retorna Map", () => {
    const result = pesoPorCluster([]);
    expect(result).toBeInstanceOf(Map);
  });

  it("clusters vacío → mapa vacío", () => {
    expect(pesoPorCluster([]).size).toBe(0);
  });

  it("asigna peso a números del cluster", () => {
    const clusters = [{
      digitos: [0, 1],
      score: 0.8,
      hits: 10,
      total: 12,
      sorteos: [],
      k: 2,
    }];
    const pesos = pesoPorCluster(clusters);
    expect(pesos.get(1)).toBeDefined();
    expect(pesos.get(1).peso).toBeCloseTo(0.8, 2);
    expect(pesos.get(11)).toBeDefined();
  });

  it("primer cluster pesa más que segundo", () => {
    const clusters = [
      { digitos: [0, 1], score: 0.8, hits: 10, total: 12, sorteos: [], k: 2 },
      { digitos: [5, 6], score: 0.8, hits: 10, total: 12, sorteos: [], k: 2 },
    ];
    const pesos = pesoPorCluster(clusters);
    // 11 solo aparece en cluster 0 → peso = 0.8 * 1 = 0.8
    // 55 solo aparece en cluster 1 → peso = 0.8 * 0.5 = 0.4
    expect(pesos.get(11).peso).toBeGreaterThan(pesos.get(55).peso);
  });
});
