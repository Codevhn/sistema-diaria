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
export async function registrarResultado(numReal, simbReal) {
  const all = await DB._getAll("hypotheses");
  for (const h of all) {
    if (h.estado !== "pendiente") continue;
    if (
      String(h.numero).padStart(2, "0") === String(numReal).padStart(2, "0")
    ) {
      await DB._update("hypotheses", h.id, { estado: "confirmada" });
    } else {
      await DB._update("hypotheses", h.id, { estado: "refutada" });
      await DB._add("rules", {
        tipo: "conversion",
        descripcion: `${h.numero} ↔ ${numReal}`,
        parametros: { de: h.numero, a: numReal },
      });
    }
  }
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
