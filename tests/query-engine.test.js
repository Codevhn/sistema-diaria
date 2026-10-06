import { describe, it, expect } from "vitest";
import { consultarNumero } from "../src/query-engine.js";

const TURNOS = ["11AM", "3PM", "9PM"];

function fabricarDraws({ dias = 200, secuencia = null } = {}) {
  const draws = [];
  let id = 1;
  let seq = secuencia ? [...secuencia] : null;
  for (let d = 0; d < dias; d++) {
    const fecha = new Date(2024, 0, 1 + d).toISOString().slice(0, 10);
    for (const horario of TURNOS) {
      const numero = seq && seq.length ? seq.shift() : Math.floor(Math.random() * 100);
      draws.push({ id: id++, fecha, pais: "HN", horario, numero, isTest: false, isPending: false });
    }
  }
  return draws;
}

describe("consultarNumero", () => {
  it("rechaza números fuera de rango", () => {
    expect(() => consultarNumero(-1, [])).toThrow();
    expect(() => consultarNumero(100, [])).toThrow();
    expect(() => consultarNumero("abc", [])).toThrow();
  });

  it("no rompe con historial vacío", () => {
    const r = consultarNumero(53, []);
    expect(r.totalSorteos).toBe(0);
    expect(r.frecuencia.total).toBe(0);
    expect(r.gap.gapPromedio).toBeNull();
  });

  it("cuenta frecuencia real de un número forzado en la secuencia", () => {
    // Fuerza al 53 a aparecer en cada bloque de 10 sorteos (1 de cada 10)
    const secuencia = [];
    for (let i = 0; i < 300; i++) secuencia.push(i % 10 === 0 ? 53 : (i % 97));
    const draws = fabricarDraws({ dias: 100, secuencia });
    const r = consultarNumero(53, draws, { pais: "HN" });
    expect(r.frecuencia.hits).toBeGreaterThan(0);
    expect(r.frecuencia.tasaObservada).toBeCloseTo(0.1, 1);
    expect(r.frecuencia.ic.low).toBeLessThanOrEqual(r.frecuencia.tasaObservada);
    expect(r.frecuencia.ic.high).toBeGreaterThanOrEqual(r.frecuencia.tasaObservada);
  });

  it("detecta la vuelta cuando el espejo SIEMPRE cae justo después", () => {
    // 97 -> 79 (espejo) inmediatamente después, repetido muchas veces
    const secuencia = [];
    for (let i = 0; i < 100; i++) { secuencia.push(97); secuencia.push(79); secuencia.push(10 + (i % 80)); }
    const draws = fabricarDraws({ dias: 100, secuencia });
    const r = consultarNumero(97, draws, { pais: "HN" });
    expect(r.vuelta.aplica).toBe(true);
    expect(r.vuelta.mirror).toBe(79);
    expect(r.vuelta.tasaObservada).toBeGreaterThan(r.vuelta.esperadoAzar);
    expect(r.vuelta.hits).toBeGreaterThan(0);
  });

  it("palíndromos (11, 22, ...) no tienen vuelta aplicable", () => {
    const draws = fabricarDraws({ dias: 50 });
    const r = consultarNumero(22, draws, { pais: "HN" });
    expect(r.vuelta.aplica).toBe(false);
    expect(r.vuelta.mirror).toBeNull();
  });

  it("transiciones: detecta un sucesor forzado sin declararlo como predicción", () => {
    const secuencia = [];
    for (let i = 0; i < 100; i++) { secuencia.push(53); secuencia.push(94); secuencia.push(10 + (i % 80)); }
    const draws = fabricarDraws({ dias: 100, secuencia });
    const r = consultarNumero(53, draws, { pais: "HN" });
    const top = r.transiciones.filas[0];
    expect(top.sucesor).toBe(94);
    expect(top.hits).toBeGreaterThan(0);
    expect(r.transiciones.advertencia).toMatch(/comparaciones múltiples/);
  });

  it("gap: calcula gap actual y promedio en unidades de sorteos", () => {
    const secuencia = [];
    // 53 cada 10 sorteos exactos
    for (let i = 0; i < 300; i++) secuencia.push(i % 10 === 0 ? 53 : 1);
    const draws = fabricarDraws({ dias: 100, secuencia });
    const r = consultarNumero(53, draws, { pais: "HN" });
    expect(r.gap.gapPromedio).toBeCloseTo(10, 0);
  });

  it("ultimaAparicion: null si el número nunca cayó", () => {
    const draws = fabricarDraws({ dias: 5, secuencia: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    const r = consultarNumero(53, draws, { pais: "HN" });
    expect(r.ultimaAparicion).toBeNull();
  });

  it("ultimaAparicion: devuelve fecha y horario exactos de la última caída", () => {
    // día0: 1,2,3 · día1: 4,30,6 (30 cae el día1, turno 3PM) · día2: 7,8,9
    const secuencia = [1, 2, 3, 4, 30, 6, 7, 8, 9];
    const draws = fabricarDraws({ dias: 3, secuencia });
    const r = consultarNumero(30, draws, { pais: "HN" });
    expect(r.ultimaAparicion).not.toBeNull();
    expect(r.ultimaAparicion.horario).toBe("3PM");
    expect(r.ultimaAparicion.fecha).toBe(new Date(2024, 0, 2).toISOString().slice(0, 10));
  });

  it("historialReciente: trae anterior/siguiente de cada aparición, más reciente primero", () => {
    // 30 cae dos veces: día1/11AM (anterior=null por ser el primer sorteo) y día2/9PM
    const secuencia = [30, 2, 3, 4, 5, 30, 7, 8, 9];
    const draws = fabricarDraws({ dias: 3, secuencia });
    const r = consultarNumero(30, draws, { pais: "HN" });
    expect(r.historialReciente).toHaveLength(2);
    // Más reciente primero: día2/9PM (índice 5), anterior=5, siguiente=7
    expect(r.historialReciente[0].horario).toBe("9PM");
    expect(r.historialReciente[0].anterior).toBe(5);
    expect(r.historialReciente[0].siguiente).toBe(7);
    // La más vieja: día1/11AM (índice 0), sin anterior, siguiente=2
    expect(r.historialReciente[1].anterior).toBeNull();
    expect(r.historialReciente[1].siguiente).toBe(2);
  });

  it("historialReciente: se limita a las últimas 8 apariciones por defecto", () => {
    const secuencia = [];
    for (let i = 0; i < 300; i++) secuencia.push(i % 3 === 0 ? 53 : 1);
    const draws = fabricarDraws({ dias: 100, secuencia });
    const r = consultarNumero(53, draws, { pais: "HN" });
    expect(r.historialReciente.length).toBeLessThanOrEqual(8);
  });
});
