import { describe, it, expect, vi } from "vitest";
import { detectarContexto } from "../src/context-engine.js";

vi.mock("../src/storage.js", () => ({ DB: {} }));

// ── Escenario A: 1 sorteo por día (150 días) ────────────────────────────────
//   - relleno: 60+(i%40) ∈ [60..99], sin colisiones en ventanas de 5
//   - "54" cada 17 días (recurrencia lejana, caso "54 Licor")
//   - repetido corto (gap=1) cuando i%10===0 e i<140 → último en i=130
function construirDiarias(n = 150) {
  const draws = [];
  for (let i = 0; i < n; i++) {
    const mes = String(Math.floor(i / 28) + 3).padStart(2, "0");
    const dia = String((i % 28) + 1).padStart(2, "0");
    const num = i % 17 === 0 ? 54 : i % 10 === 0 && i < 140 ? 60 + ((i - 1) % 40) : 60 + (i % 40);
    draws.push({
      id: `d${i}`,
      numero: String(num).padStart(2, "0"),
      fecha: `2026-${mes}-${dia}`,
      horario: "11AM",
      pais: "HN",
      isTest: false,
    });
  }
  return draws;
}

// ── Escenario B: 30 días × 5 turnos (estructura real de La Diaria) ──────────
//   - valores únicos módulo 100 salvo repetidos diseñados
//   - repetidos tempranos (días 3,5,7,9,11: 9PM repite el 11AM del mismo día)
//   - repetido de frontera: 9PM del día 25 = 42, y el 11AM del día 26 también 42
const TURNOS = ["11AM", "12PM", "3PM", "6PM", "9PM"];
function construirDiariaCompleta() {
  const draws = [];
  for (let d = 1; d <= 30; d++) {
    for (let t = 0; t < 5; t++) {
      let num = ((d * 5 + t) * 13) % 100;
      if (t === 4 && [3, 5, 7, 9, 11].includes(d)) num = ((d * 5 + 0) * 13) % 100;
      if (d === 25 && t === 4) num = 99;
      if (d === 26 && t === 0) num = 99;
      draws.push({
        id: `b${d}-${t}`,
        numero: String(num).padStart(2, "0"),
        fecha: `2026-04-${String(d).padStart(2, "0")}`,
        horario: TURNOS[t],
        pais: "HN",
        isTest: false,
      });
    }
  }
  return draws;
}

describe("context-engine — racha seca de repetidos", () => {
  it("la recurrencia LEJANA de un número (54 cada 17 sorteos) NO corta la racha: se corta en el último repetido corto", () => {
    const contextos = detectarContexto(construirDiarias(), { pais: "HN", baselineN: 80 });
    const racha = contextos.find((c) => c.id === "racha_seca_repetidos");
    // Último repetido corto en i=130 → exactamente 19 sorteos sin repetido al final
    expect(racha).toBeDefined();
    expect(racha.rachaCount).toBe(19);
  });

  it("un repetido INMEDIATO al final trunca la racha a cero (no emite contexto)", () => {
    const draws = construirDiarias();
    draws[draws.length - 1].numero = draws[draws.length - 3].numero; // gap=2
    const contextos = detectarContexto(draws, { pais: "HN", baselineN: 80 });
    expect(contextos.find((c) => c.id === "racha_seca_repetidos")).toBeUndefined();
  });

  it("ORDENA POR TURNO dentro del día: mezclar el orden de entrega NO altera la racha (=24)", () => {
    const ordenado = detectarContexto(construirDiariaCompleta(), { pais: "HN", baselineN: 80 });
    const revuelto = detectarContexto(construirDiariaCompleta().reverse(), { pais: "HN", baselineN: 80 });
    const a = ordenado.find((c) => c.id === "racha_seca_repetidos");
    const b = revuelto.find((c) => c.id === "racha_seca_repetidos");
    expect(a?.rachaCount).toBe(24);
    expect(b?.rachaCount).toBe(24);
  });
});
