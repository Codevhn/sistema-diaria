import { DB } from "./storage.js";
const MAP={0:1,1:7,2:5,3:8,4:7,5:2,6:9,7:4,8:3,9:6};
function mapConv(n){const s=String(n).padStart(2,"0");return parseInt(`${MAP[s[0]]}${MAP[s[1]]}`,10);}
export function last3PM(draws){return draws.filter(d=>d.horario==='3PM').slice(-1)[0];}
export async function candidatosNoObvios(guia){
  const ds=await DB.listDraws({excludeTest:true});
  const last=last3PM(ds); if(!last) return [];
  const conv=mapConv(last.numero);
  const simb=guia[String(conv).padStart(2,'0')]?.simbolo||'';
  const expl=`Conversión del 3PM (${String(last.numero).padStart(2,'0')}) usando el mapa de usuario`;
  return[{numero:conv,simbolo:simb,etiqueta:'no-obvio',razones:[expl]}];
}
