import { describe, it, expect, vi } from "vitest";

vi.mock("../src/storage.js", () => ({
  DB: {
    listDraws: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/loader.js", () => ({
  GUIA: {},
}));

vi.mock("../src/pattern-detector.js", () => ({
  detectarPatrones: vi.fn().mockResolvedValue({ repeticiones: [], transiciones: [] }),
}));

vi.mock("../src/mode-engine.js", () => ({
  evaluarModos: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/weight-optimizer.js", () => ({
  getPesosActivos: vi.fn().mockReturnValue({}),
}));

vi.mock("../src/regime-detector.js", () => ({
  detectarRegimen: vi.fn().mockReturnValue({ tipo: "normal" }),
}));

vi.mock("../src/sequence-engine.js", () => ({
  proyectarSecuencias: vi.fn().mockReturnValue([]),
  seqSignals: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/pressure-engine.js", () => ({
  calcularPresion: vi.fn().mockReturnValue(new Map()),
  presionAFactor: vi.fn().mockReturnValue(1.0),
}));

vi.mock("../src/internal-reasoner.js", () => ({
  razonar: vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/monthly-trends.js", () => ({
  analizarPatronesMensuales: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/weekly-patterns.js", () => ({
  analizarSecuenciasSemanales: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/popularity-calendar.js", () => ({
  getEfectosCalendarioPorNumero: vi.fn().mockReturnValue(() => ({})),
  getEventosProximos: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/popularity-model.js", () => ({
  calcularPopularidad: vi.fn().mockReturnValue(new Map()),
  popularidadAFactor: vi.fn().mockReturnValue(1.0),
  getCadenasActivas: vi.fn().mockReturnValue([]),
  getMercado: vi.fn().mockReturnValue({ calientes: [], frios: [], reprimidos: [] }),
}));

vi.mock("../src/conversion-engine.js", () => ({
  generarVariantesMulti: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/digit-cluster-detector.js", () => ({
  detectarClusters: vi.fn().mockReturnValue([]),
  pesoPorCluster: vi.fn().mockReturnValue(new Map()),
}));

import {
  enrich,
  buildMarkov1,
  normalizeMarkov1,
  buildMarkov2,
  normalizeMarkov2,
  calcularRezago,
} from "../src/signal-engine.js";

function makeDraw(numero, fecha, horario = "11AM", pais = "HN") {
  return { numero, fecha, horario, pais };
}

describe("enrich", () => {
  it("agrega fechaDate y turnoOrder", () => {
    const draws = [makeDraw(23, "2025-07-20", "11AM")];
    const result = enrich(draws);
    expect(result.length).toBe(1);
    expect(result[0].fechaDate).toBeInstanceOf(Date);
    expect(result[0].turnoOrder).toBe(0);
  });

  it("ordena cronológicamente", () => {
    const draws = [
      makeDraw(1, "2025-07-22", "3PM"),
      makeDraw(2, "2025-07-20", "11AM"),
      makeDraw(3, "2025-07-21", "9PM"),
    ];
    const result = enrich(draws);
    expect(result[0].numero).toBe(2);
    expect(result[1].numero).toBe(3);
    expect(result[2].numero).toBe(1);
  });

  it("filtra draws sin fecha válida", () => {
    const draws = [makeDraw(1, "invalid-date")];
    const result = enrich(draws);
    expect(result.length).toBe(0);
  });

  it("filtra draws sin horario conocido", () => {
    const draws = [makeDraw(1, "2025-07-20", "10AM")];
    const result = enrich(draws);
    expect(result.length).toBe(0);
  });

  it("array vacío → array vacío", () => {
    expect(enrich([])).toEqual([]);
  });
});

describe("buildMarkov1", () => {
  it("retorna Map", () => {
    const draws = [
      makeDraw(1, "2025-07-20", "11AM"),
      makeDraw(2, "2025-07-20", "3PM"),
    ];
    const enriched = enrich(draws);
    const matrix = buildMarkov1(enriched);
    expect(matrix).toBeInstanceOf(Map);
  });

  it("cuenta transiciones correctamente", () => {
    const draws = [
      makeDraw(1, "2025-07-20", "11AM"),
      makeDraw(2, "2025-07-20", "3PM"),
      makeDraw(1, "2025-07-20", "9PM"),
      makeDraw(2, "2025-07-21", "11AM"),
    ];
    const enriched = enrich(draws);
    const matrix = buildMarkov1(enriched);
    // 1→2 apareció 2 veces
    expect(matrix.has(1)).toBe(true);
    const row1 = matrix.get(1);
    expect(row1.get(2).count).toBe(2);
  });

  it("ignora transiciones de países distintos", () => {
    const draws = [
      { numero: 1, fecha: "2025-07-20", horario: "11AM", pais: "HN" },
      { numero: 2, fecha: "2025-07-20", horario: "3PM", pais: "CR" },
    ];
    const enriched = enrich(draws);
    const matrix = buildMarkov1(enriched);
    // No debería haber transiciones entre HN y CR
    if (matrix.has(1)) {
      expect(matrix.get(1).has(2)).toBe(false);
    }
  });
});

describe("normalizeMarkov1", () => {
  it("retorna Map con probabilidades", () => {
    const draws = Array.from({ length: 20 }, (_, i) =>
      makeDraw(i % 10, `2025-07-${String(1 + i % 28).padStart(2, "0")}`, "11AM")
    );
    const enriched = enrich(draws);
    const matrix = buildMarkov1(enriched);
    const normalized = normalizeMarkov1(matrix);
    expect(normalized).toBeInstanceOf(Map);
  });
});

describe("buildMarkov2", () => {
  it("retorna Map con keys 'A:B'", () => {
    const draws = [
      makeDraw(1, "2025-07-20", "11AM"),
      makeDraw(2, "2025-07-20", "3PM"),
      makeDraw(3, "2025-07-20", "9PM"),
    ];
    const enriched = enrich(draws);
    const matrix = buildMarkov2(enriched);
    expect(matrix).toBeInstanceOf(Map);
    if (matrix.size > 0) {
      const key = matrix.keys().next().value;
      expect(key).toMatch(/^\d+:\d+$/);
    }
  });
});

describe("calcularRezago", () => {
  it("retorna Map", () => {
    const draws = [
      makeDraw(23, "2025-07-20", "11AM"),
      makeDraw(23, "2025-07-15", "3PM"),
    ];
    const enriched = enrich(draws);
    const rezago = calcularRezago(enriched);
    expect(rezago).toBeInstanceOf(Map);
  });

  it("número con datos tiene entry", () => {
    const draws = [
      makeDraw(23, "2025-07-20", "11AM"),
      makeDraw(23, "2025-07-15", "3PM"),
    ];
    const enriched = enrich(draws);
    const rezago = calcularRezago(enriched);
    expect(rezago.has(23)).toBe(true);
    const entry = rezago.get(23);
    expect(entry).toHaveProperty("diasDesdeUltima");
    expect(entry).toHaveProperty("cicloPromedio");
  });
});
