import { DB } from "./storage.js";
import { convertBothDigits } from "./conversion-map.js";

export function last3PM(draws){return draws.filter(d=>d.horario==='3PM').slice(-1)[0];}
export async function candidatosNoObvios(guia){
  const ds=await DB.listDraws({excludeTest:true});
  const last=last3PM(ds); if(!last) return [];
  const conv=convertBothDigits(last.numero);
  if(conv===null) return [];
  const simb=guia[String(conv).padStart(2,'0')]?.simbolo||'';
  const expl=`Conversión del 3PM (${String(last.numero).padStart(2,'0')}) usando el mapa de usuario`;
  return[{numero:conv,simbolo:simb,etiqueta:'no-obvio',razones:[expl]}];
}
