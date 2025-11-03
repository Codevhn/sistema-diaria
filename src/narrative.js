import { DB } from "./storage.js";

export async function registrarHechos(hs) {
  for (const h of hs) {
    await DB.saveDraw(h);
  }
}
export async function crearHipotesis(
  numero,
  simbolo,
  texto,
  { fecha, turno } = {}
) {
  const id = await DB._add("hypotheses", {
    numero,
    simbolo,
    estado: "pendiente",
    score: 0,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    turno: turno || null,
    razones: [texto].filter(Boolean),
  });
  if (texto) {
    await DB._add("reasons", {
      ownerType: "hypothesis",
      ownerId: id,
      texto,
      tags: ["manual"],
    });
  }
  return id;
}

export async function actualizarHipotesis(
  id,
  numero,
  simbolo,
  texto,
  { fecha, turno } = {}
) {
  if (!id) throw new Error("actualizarHipotesis: id requerido");
  const cambios = {
    numero,
    simbolo,
    fecha: fecha || null,
    turno: turno || null,
    razones: [texto].filter(Boolean),
  };
  await DB._update("hypotheses", id, cambios);
  return id;
}

export async function registrarResultado(result) {
  if (!result || typeof result.numero === "undefined") {
    throw new Error("registrarResultado: resultado inválido");
  }
  const numReal = typeof result.numero === "number" ? result.numero : parseInt(result.numero, 10);
  const simbReal = result.simbolo;
  const all = await DB._getAll("hypotheses");
  for (const h of all) {
    if (h.estado !== "pendiente") continue;
    const match =
      String(h.numero).padStart(2, "0") === String(numReal).padStart(2, "0");
    const estado = match ? "confirmada" : "refutada";

    await DB._update("hypotheses", h.id, { estado });

    if (!match) {
      await DB._add("rules", {
        tipo: "conversion",
        descripcion: `${h.numero} ↔ ${numReal}`,
        parametros: { de: h.numero, a: numReal },
      });
    }

    await DB.logHypothesisOutcome({
      hypothesisId: h.id,
      numero: h.numero,
      estado,
      fechaResultado: result.fecha,
      paisResultado: result.pais,
      horarioResultado: result.horario,
      fechaHipotesis: h.fecha,
      turnoHipotesis: h.turno,
    });
  }

  await DB.markPredictionResult({
    fecha: result.fecha,
    pais: result.pais,
    numero: numReal,
    horario: result.horario,
  });
}
export async function registrarTema(desc, { fecha, refs = [] } = {}) {
  const rid = await DB._add("rules", {
    tipo: "tema",
    descripcion: desc,
    parametros: { fecha },
  });
  for (const fid of refs) {
    await DB._add("edges", {
      fromFactId: fid,
      toId: rid,
      ruleId: "asocia_tema",
      weight: 0.2,
    });
  }
  return rid;
}
export async function registrarConversionMapa(de, a, nota = "") {
  const desc = `${String(de).padStart(2, "0")} → ${String(a).padStart(
    2,
    "0"
  )} (mapa conversión)`;
  return await DB._add("rules", {
    tipo: "conversion_mapa",
    descripcion: desc,
    parametros: { de, a, nota },
  });
}
