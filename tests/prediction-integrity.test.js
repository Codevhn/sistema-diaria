import { describe, it, expect } from "vitest";
import { drawDeadlineTs, esPrediccionSellada, separarPorSellado } from "../src/prediction-integrity.js";

describe("drawDeadlineTs", () => {
  it("calcula timestamp para 11AM Honduras", () => {
    const ts = drawDeadlineTs("2025-07-20", "11AM");
    expect(ts).toBeTypeOf("number");
    expect(ts).toBeGreaterThan(0);
  });

  it("calcula timestamp para 9PM", () => {
    const ts = drawDeadlineTs("2025-07-20", "9PM");
    expect(ts).toBeTypeOf("number");
    // 9PM > 11AM en el mismo día
    const ts11 = drawDeadlineTs("2025-07-20", "11AM");
    expect(ts).toBeGreaterThan(ts11);
  });

  it("turno desconocido usa 11AM", () => {
    const ts = drawDeadlineTs("2025-07-20", "desconocido");
    const ts11 = drawDeadlineTs("2025-07-20", "11AM");
    expect(ts).toBe(ts11);
  });

  it("retorna null para fecha inválida", () => {
    expect(drawDeadlineTs(null, "11AM")).toBeNull();
    expect(drawDeadlineTs("", "11AM")).toBeNull();
    expect(drawDeadlineTs("no-es-fecha", "11AM")).toBeNull();
  });

  it("retorna null para fecha no string", () => {
    expect(drawDeadlineTs(123, "11AM")).toBeNull();
    expect(drawDeadlineTs(undefined, "11AM")).toBeNull();
  });
});

describe("esPrediccionSellada", () => {
  it("true si predicción es anterior al sorteo", () => {
    const log = {
      createdAt: "2025-07-20T09:00:00-06:00",
      targetFecha: "2025-07-20",
      turno: "11AM",
    };
    expect(esPrediccionSellada(log)).toBe(true);
  });

  it("false si predicción es posterior al sorteo", () => {
    const log = {
      createdAt: "2025-07-20T12:00:00-06:00",
      targetFecha: "2025-07-20",
      turno: "11AM",
    };
    expect(esPrediccionSellada(log)).toBe(false);
  });

  it("false si falta createdAt", () => {
    const log = { targetFecha: "2025-07-20", turno: "11AM" };
    expect(esPrediccionSellada(log)).toBe(false);
  });

  it("false si falta targetFecha", () => {
    const log = { createdAt: "2025-07-20T09:00:00-06:00", turno: "11AM" };
    expect(esPrediccionSellada(log)).toBe(false);
  });

  it("false para null/undefined", () => {
    expect(esPrediccionSellada(null)).toBe(false);
    expect(esPrediccionSellada(undefined)).toBe(false);
  });

  it("acepta snake_case (created_at, target_fecha)", () => {
    const log = {
      created_at: "2025-07-20T09:00:00-06:00",
      target_fecha: "2025-07-20",
      turno: "11AM",
    };
    expect(esPrediccionSellada(log)).toBe(true);
  });
});

describe("separarPorSellado", () => {
  it("separa correctamente", () => {
    const logs = [
      { createdAt: "2025-07-20T09:00:00-06:00", targetFecha: "2025-07-20", turno: "11AM" },
      { createdAt: "2025-07-20T12:00:00-06:00", targetFecha: "2025-07-20", turno: "11AM" },
    ];
    const { sellados, postHoc } = separarPorSellado(logs);
    expect(sellados.length).toBe(1);
    expect(postHoc.length).toBe(1);
  });

  it("array vacío → ambos vacíos", () => {
    const { sellados, postHoc } = separarPorSellado([]);
    expect(sellados).toEqual([]);
    expect(postHoc).toEqual([]);
  });

  it("todos sellados", () => {
    const logs = [
      { createdAt: "2025-07-20T08:00:00-06:00", targetFecha: "2025-07-20", turno: "3PM" },
      { createdAt: "2025-07-20T10:00:00-06:00", targetFecha: "2025-07-20", turno: "3PM" },
    ];
    const { sellados, postHoc } = separarPorSellado(logs);
    expect(sellados.length).toBe(2);
    expect(postHoc.length).toBe(0);
  });
});
