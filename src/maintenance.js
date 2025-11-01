import { DB } from "./storage.js";
export async function revisarDuplicados(){
  const dupes = await DB.findDuplicates();
  return dupes.map(group => group.map(d => ({ id:d.id, fecha:d.fecha, horario:d.horario, pais:d.pais, numero:d.numero, isTest:d.isTest, createdAt:d.createdAt })));
}
export async function marcarGrupoComoTest(ids){ return await DB.bulkMarkTest(ids, true); }
export async function borrarIds(ids){ for(const id of ids) await DB.deleteDraw(id); return true; }
