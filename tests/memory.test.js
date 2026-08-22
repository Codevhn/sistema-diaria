import { describe, it, expect } from "vitest";
import { construirPerfilNumero, resumirActividadNumeros } from "../src/memory.js";

const draw = (fecha, horario, numero) => ({ fecha, horario, numero, pais: "HN" });

describe("construirPerfilNumero — directos vs parientes", () => {
  const draws = [
    draw("2026-08-01", "3PM", 11), // caída directa antigua del 11
    draw("2026-08-19", "9PM", 12), // vecino reciente — el caso reportado
  ];
  const ref = new Date(2026, 7, 21); // viernes 21 de agosto de 2026
  const profile = construirPerfilNumero(draws, 11, { referenceDate: ref });

  it("lastDirect es la caída directa del número, no la del vecino", () => {
    expect(profile.lastDirect).not.toBeNull();
    expect(profile.lastDirect.fecha).toBe("2026-08-01");
    expect(profile.lastDirect.horario).toBe("3PM");
  });

  it("gaps.current cuenta desde la caída directa", () => {
    expect(profile.gaps.current).toBeCloseTo(19.375, 2);
  });

  it("turnStats solo cuenta caídas directas", () => {
    expect(profile.turnStats["3PM"].count).toBe(1);
    expect(profile.turnStats["9PM"]).toBeUndefined();
  });

  it("totals.direct coincide con el total de la órbita", () => {
    const summary = resumirActividadNumeros(draws, { referenceDate: ref });
    expect(profile.totals.direct).toBe(summary[11].total);
  });

  it("el timeline completo sigue incluyendo parientes para señales", () => {
    expect(profile.timeline.length).toBeGreaterThanOrEqual(2);
    expect(profile.directTimeline.length).toBe(1);
  });

  it("sin caídas directas: lastDirect null y hueco null", () => {
    const onlyNeighbor = construirPerfilNumero([draw("2026-08-19", "9PM", 12)], 11, {
      referenceDate: ref,
    });
    expect(onlyNeighbor.lastDirect).toBeNull();
    expect(onlyNeighbor.gaps.current).toBeNull();
    expect(onlyNeighbor.totals.direct).toBe(0);
  });
});
