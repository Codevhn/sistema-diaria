/**
 * tests/prediction-match.test.js — Integridad del hit-tracker
 *
 * El sorteo de las 11AM NO debe marcar como acierto una predicción
 * sellada para las 9PM. markPredictionResult debe exigir igualdad de
 * turno además de fecha/país/número.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase falso: aplica los filtros eq/is sobre filas en memoria y
// registra cada llamada para poder auditar la consulta construida.
let filas = [];
const builders = [];

function crearBuilder() {
  const llamadas = [];
  let resultado = { data: null, error: null };
  const b = {};
  ["select", "eq", "is", "limit", "order", "update", "insert", "in"].forEach((m) => {
    b[m] = (...args) => {
      llamadas.push({ m, args });
      return b;
    };
  });
  b.maybeSingle = async () => {
    llamadas.push({ m: "maybeSingle" });
    let rows = [...filas];
    // como Supabase: filtros y orden primero, límite al final
    for (const { m, args } of llamadas) {
      if (m === "eq") rows = rows.filter((r) => String(r[args[0]]) === String(args[1]));
      if (m === "is") rows = rows.filter((r) => r[args[0]] === null);
      if (m === "order" && args[0] === "created_at" && args[1]?.ascending !== false) {
        rows.sort((x, y) => x.created_at - y.created_at);
      }
    }
    for (const { m, args } of llamadas) {
      if (m === "limit") rows = rows.slice(0, args[0]);
    }
    return { data: rows[0] ?? null, error: null };
  };
  b.then = (resolve, reject) => Promise.resolve(resultado).then(resolve, reject);
  b._llamadas = llamadas;
  b._setResultado = (r) => { resultado = r; };
  builders.push(b);
  return b;
}

vi.mock("../src/supabaseClient.js", () => ({
  supabase: {
    from: () => crearBuilder(),
  },
}));

import { DB } from "../src/storage/index.js";

const filaPrediccion = (over = {}) => ({
  id: over.id ?? 1,
  estado: "pendiente",
  numero: 42,
  target_fecha: "2026-08-21",
  target_pais: "HN",
  turno: "9PM",
  created_at: 1000,
  ...over,
});

beforeEach(() => {
  filas = [];
  builders.length = 0;
});

describe("markPredictionResult exige el turno correcto", () => {
  it("el sorteo de las 11AM no resuelve una predicción de las 9PM", async () => {
    filas = [filaPrediccion()];
    const ok = await DB.markPredictionResult({
      fecha: "2026-08-21",
      pais: "HN",
      numero: 42,
      horario: "11AM",
    });
    expect(ok).toBe(false);
    // la consulta incluyó el filtro de turno
    const query = builders[0]._llamadas.find((l) => l.m === "eq" && l.args[0] === "turno");
    expect(query).toBeTruthy();
    expect(query.args[1]).toBe("11AM");
    // la fila sigue pendiente (no hubo update)
    const updates = builders.filter((b) => b._llamadas.some((l) => l.m === "update"));
    expect(updates.length).toBe(0);
  });

  it("el sorteo del turno correcto sí marca el acierto", async () => {
    filas = [filaPrediccion()];
    const ok = await DB.markPredictionResult({
      fecha: "2026-08-21",
      pais: "HN",
      numero: 42,
      horario: "9PM",
    });
    expect(ok).toBe(true);
    const updateBuilder = builders.find((b) => b._llamadas.some((l) => l.m === "update"));
    const payload = updateBuilder._llamadas.find((l) => l.m === "update").args[0];
    expect(payload.estado).toBe("acierto");
    expect(payload.resultado_horario).toBe("9PM");
  });

  it("respeta FIFO: resuelve la predicción más vieja del mismo turno", async () => {
    filas = [
      filaPrediccion({ id: 2, created_at: 2000 }),
      filaPrediccion({ id: 1, created_at: 1000 }),
    ];
    const ok = await DB.markPredictionResult({
      fecha: "2026-08-21",
      pais: "HN",
      numero: 42,
      horario: "9PM",
    });
    expect(ok).toBe(true);
    const updateBuilder = builders.find((b) => b._llamadas.some((l) => l.m === "update"));
    const filtroId = updateBuilder._llamadas.find((l) => l.m === "eq");
    expect(filtroId.args[1]).toBe(1); // la más antigua
  });

  it("predicciones de turnos distintos conviven sin contaminarse", async () => {
    filas = [
      filaPrediccion({ id: 1, turno: "3PM", created_at: 1000 }),
      filaPrediccion({ id: 2, turno: "9PM", created_at: 2000 }),
    ];
    await DB.markPredictionResult({ fecha: "2026-08-21", pais: "HN", numero: 42, horario: "3PM" });
    const updateBuilder = builders.find((b) => b._llamadas.some((l) => l.m === "update"));
    expect(updateBuilder._llamadas.find((l) => l.m === "eq").args[1]).toBe(1);
  });
});
