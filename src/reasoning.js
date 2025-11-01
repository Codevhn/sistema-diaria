import { DB } from "./storage.js";
import { candidatosNoObvios } from "./memory.js";
export async function analizarYProponer(guia) {
  const draws = await DB.listDraws({ excludeTest: true });
  if (draws.length === 0)
    return {
      escenarios: [],
      recomendacion: [],
      nota: "No hay sorteos registrados.",
    };
  const escenarios = [];
  const rules = await DB._getAll("rules");
  const conv = rules.filter((r) => r.tipo === "conversion_mapa").slice(-3);
  if (conv.length) {
    const extra = await candidatosNoObvios(guia);
    escenarios.push({
      nombre: "Ruptura por conversión",
      confianza: 0.7,
      candidatos: extra,
      explicacion:
        "Reglas de conversión recientes detectadas (mapa de usuario).",
    });
  }
  const last = draws.slice(-3);
  escenarios.push({
    nombre: "Base últimos sorteos",
    confianza: 0.5,
    candidatos: last.map((d) => {
      const key = String(d.numero).padStart(2, "0");
      return {
        numero: d.numero,
        simbolo: guia[key]?.simbolo || "",
        etiqueta: "base",
        razones: [`Proviene de ${d.horario} del día ${d.fecha}`],
      };
    }),
    explicacion: "Los últimos resultados tienden a influir el siguiente turno.",
  });
  const rec = [];
  for (const e of escenarios) {
    for (const c of e.candidatos) {
      const key = String(c.numero).padStart(2, "0");
      if (!rec.find((x) => String(x.numero).padStart(2, "0") === key))
        rec.push(c);
    }
  }
  return {
    escenarios,
    recomendacion: rec,
    nota: "La confianza (conf) es una ponderación heurística interna (0–100%).",
  };
}
