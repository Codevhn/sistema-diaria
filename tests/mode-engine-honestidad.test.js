/**
 * tests/mode-engine-honestidad.test.js — Nivel 1 en los modos
 *
 *   - offset 0 no se auto-confirma (tautología eliminada)
 *   - cada patrón lleva p-valor binomial contra el azar y corre FDR global
 *   - patrones no significativos valen 35% en el puntaje
 *   - las sugerencias exigen al menos 3 intentos
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/storage.js", () => ({
  DB: {
    listGameModes: vi.fn(),
    listGameModeExamples: vi.fn(),
    listDraws: vi.fn(),
  },
}));

import { DB } from "../src/storage.js";
import { binomialTailP } from "../src/stats-utils.js";
import { evaluarModos } from "../src/mode-engine.js";

const dia = (n) => `2026-01-${String(n + 1).padStart(2, "0")}`;
const draw = (fechaIdx, horario, numero) => ({ fecha: dia(fechaIdx), horario, numero });

beforeEach(() => {
  vi.clearAllMocks();
  DB.listGameModeExamples.mockResolvedValue([]);
  DB.listDraws.mockResolvedValue([]);
});

describe("mode-engine con evidencia honesta", () => {
  it("offset 0 no genera aciertos auto-cumplidos (tautología)", async () => {
    DB.listGameModes.mockResolvedValue([
      { id: 1, nombre: "Mirror mismo turno", operacion: "mirror", offset: 0 },
    ]);
    // palíndromos: mirror(11)=11 → antes se "confirmaban" solos
    DB.listDraws.mockResolvedValue([
      draw(0, "11AM", 11),
      draw(1, "11AM", 22),
      draw(2, "11AM", 33),
      draw(3, "11AM", 44),
    ]);
    const res = await evaluarModos();
    expect(res).toBeNull(); // sin evidencia real no hay nada que puntuar
  });

  it("patrón fuerte supera FDR y conserva puntaje completo", async () => {
    DB.listGameModes.mockResolvedValue([
      { id: 1, nombre: "Vecino+1", operacion: "neighbor", parametros: 1 },
    ]);
    // 10 seguido de 11 ocho veces (hop 1): 8 aciertos en 8 intentos
    const timeline = [];
    for (let i = 0; i < 8; i += 1) {
      timeline.push(draw(i, "11AM", 10), draw(i, "3PM", 11));
    }
    DB.listDraws.mockResolvedValue(timeline);

    const res = await evaluarModos();
    expect(res).toBeTruthy();
    const fuerte = res.stats.find((s) => s.baseNumero === 10 && s.numero === 11);
    expect(fuerte.intentos).toBe(8);
    expect(fuerte.aciertos).toBe(8);
    expect(fuerte.significativoFDR).toBe(true);
    expect(fuerte.puntaje).toBeCloseTo(1 * Math.min(1, 8 / 10), 6);
    // el vecino "perdedor" (10→9, cero aciertos) queda fuera del top
    const debil = res.stats.find((s) => s.baseNumero === 10 && s.numero === 9);
    expect(debil.significativoFDR).toBeFalsy();
  });

  it("patrón débil (1 acierto en 3) se amortigua a 35%", async () => {
    DB.listGameModes.mockResolvedValue([
      {
        id: 2,
        nombre: "Regla doña María",
        operacion: "",
        ejemplos: [{ original: 20, resultado: 25 }],
      },
    ]);
    DB.listGameModeExamples.mockImplementation(async (id) =>
      id === 2 ? [{ original: 20, resultado: 25 }] : []
    );
    // tres 20: uno seguido de 25 (hop 1), dos seguidos de otros números
    DB.listDraws.mockResolvedValue([
      draw(0, "11AM", 20),
      draw(0, "3PM", 25),
      draw(1, "11AM", 20),
      draw(1, "3PM", 77),
      draw(2, "11AM", 20),
      draw(2, "3PM", 88),
    ]);

    const res = await evaluarModos();
    const stat = res.stats.find((s) => s.baseNumero === 20 && s.numero === 25);
    const esperadoBruto = (1 / 3) * Math.min(1, 3 / 10);
    const p = binomialTailP(1, 3, 1 - Math.pow(0.99, 2));
    expect(p).toBeGreaterThan(0.05); // el azar explica 1 acierto en 3
    expect(stat.significativoFDR).toBe(false);
    expect(stat.puntaje).toBeCloseTo(esperadoBruto * 0.35, 6);
  });

  it("las sugerencias exigen al menos 3 intentos", async () => {
    DB.listGameModes.mockResolvedValue([
      {
        id: 3,
        nombre: "Un solo milagro",
        operacion: "",
        ejemplos: [{ original: 30, resultado: 35 }],
      },
    ]);
    DB.listGameModeExamples.mockImplementation(async (id) =>
      id === 3 ? [{ original: 30, resultado: 35 }] : []
    );
    DB.listDraws.mockResolvedValue([draw(0, "11AM", 30), draw(0, "3PM", 35)]);

    const res = await evaluarModos();
    // la hipótesis aparece puntuada (con amortiguación)…
    expect(res.stats.some((s) => s.baseNumero === 30)).toBe(true);
    // …pero NO genera sugerencia con un solo intento
    expect(res.sugerencias.length).toBe(0);
  });
});
