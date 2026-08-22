/**
 * tests/narrative-hypotheses.test.js — Evaluación honesta de hipótesis
 *
 * Una hipótesis con fecha/turno declarados solo puede ser confirmada o
 * refutada por el sorteo de SU ventana. Un sorteo de otro horario no la
 * toca (queda pendiente), y mucho menos la confirma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/storage.js", () => ({
  DB: {
    _getAll: vi.fn(),
    _update: vi.fn().mockResolvedValue(1),
    _add: vi.fn().mockResolvedValue(9),
    logHypothesisOutcome: vi.fn().mockResolvedValue(true),
    markPredictionResult: vi.fn().mockResolvedValue(true),
    saveDraw: vi.fn().mockResolvedValue(true),
  },
}));

import { DB } from "../src/storage.js";
import { registrarResultado } from "../src/narrative.js";

const hip = (over = {}) => ({
  id: over.id ?? 1,
  estado: "pendiente",
  numero: "42",
  fecha: null,
  turno: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  DB._getAll.mockResolvedValue([]);
});

describe("registrarResultado evalúa solo dentro de la ventana", () => {
  it("confirma la hipótesis del mismo número, fecha y turno", async () => {
    DB._getAll.mockResolvedValue([
      hip({ id: 1, numero: "42", fecha: "2026-08-21", turno: "9PM" }),
    ]);
    await registrarResultado({ numero: 42, fecha: "2026-08-21", pais: "HN", horario: "9PM" });
    expect(DB._update).toHaveBeenCalledWith("hypotheses", 1, { estado: "confirmada" });
  });

  it("un sorteo de otro turno NO confirma ni refuta: queda pendiente", async () => {
    DB._getAll.mockResolvedValue([
      hip({ id: 1, numero: "42", fecha: "2026-08-21", turno: "9PM" }),
    ]);
    await registrarResultado({ numero: 42, fecha: "2026-08-21", pais: "HN", horario: "11AM" });
    expect(DB._update).not.toHaveBeenCalled();
    expect(DB.logHypothesisOutcome).not.toHaveBeenCalled();
  });

  it("un sorteo de otra fecha tampoco la evalúa", async () => {
    DB._getAll.mockResolvedValue([
      hip({ id: 7, numero: "13", fecha: "2026-08-25", turno: "3PM" }),
    ]);
    await registrarResultado({ numero: 99, fecha: "2026-08-21", pais: "HN", horario: "3PM" });
    expect(DB._update).not.toHaveBeenCalled();
  });

  it("hipótesis sin fecha/turno (vaga) se evalúa con cualquier sorteo", async () => {
    DB._getAll.mockResolvedValue([hip({ id: 3, numero: "42" })]);
    await registrarResultado({ numero: 42, fecha: "2026-08-21", pais: "HN", horario: "3PM" });
    expect(DB._update).toHaveBeenCalledWith("hypotheses", 3, { estado: "confirmada" });
  });

  it("dentro de la ventana, número distinto refuta", async () => {
    DB._getAll.mockResolvedValue([
      hip({ id: 5, numero: "77", fecha: "2026-08-21", turno: "11AM" }),
    ]);
    await registrarResultado({ numero: 42, fecha: "2026-08-21", pais: "HN", horario: "11AM" });
    expect(DB._update).toHaveBeenCalledWith("hypotheses", 5, { estado: "refutada" });
  });
});
