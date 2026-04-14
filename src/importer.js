import { DB } from "./storage.js";
export async function importarManual(payload, opts = {}){
  if(!payload || !payload.fecha || !payload.horario || !payload.pais || payload.numero===undefined){
    throw new Error("importarManual: payload inválido");
  }
  const id = await DB.saveDraw(payload, opts);
  if (!id) {
    throw new Error("importarManual: Supabase no devolvió id del sorteo guardado.");
  }
  return id;
}
