import { DB } from "./storage.js";
export async function importarManual(payload, opts = {}){
  if(!payload || !payload.fecha || !payload.horario || !payload.pais || payload.numero===undefined){
    throw new Error("importarManual: payload inválido");
  }
  return await DB.saveDraw(payload, opts);
}
