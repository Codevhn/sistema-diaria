import { beforeEach,describe,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({row:null,others:[],error:null,writes:[],updateError:null,failRead:false,failDestination:false,race:false}));
vi.mock('../src/supabaseClient.js',()=>({supabase:{from:()=>{
 let mutation=null;let one=false;const filters=[];
 const q={select(){return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},maybeSingle(){one=true;return this},update(changes){mutation=changes;return this},then(resolve){
  if(mutation){state.writes.push({changes:mutation,filters});return Promise.resolve({data:state.race?null:{...state.row,...mutation},error:state.updateError}).then(resolve)}
  return Promise.resolve({data:one?(state.failRead?null:state.row):state.others,error:!one&&state.failDestination?{message:'no response'}:null}).then(resolve);
 }};return q;
}}}));
import { DB } from '../src/storage.js';
const row={id:5,fecha:'2026-10-17',pais:'HN',horario:'9PM',numero:12,is_pending:false,is_test:false,created_at:'2026-10-17T20:00:00Z'};
describe('guardado de correcciones por ID',()=>{
 beforeEach(()=>{state.row={...row};state.others=[];state.writes=[];state.updateError=null;state.failRead=false;state.failDestination=false;state.race=false;});
 it('actualiza exactamente el mismo ID y conserva fecha de creación y estado',async()=>{
  const result=await DB.correctDraw(5,{fecha:'2026-10-18',numero:'00',horario:'3PM'});
  expect(state.writes).toHaveLength(1);expect(state.writes[0].filters).toContainEqual(['id',5]);
  expect(state.writes[0].changes).toEqual({fecha:'2026-10-18',numero:0,horario:'3PM',is_test:false});
  expect(result).toMatchObject({id:5,fecha:'2026-10-18',isPending:false,createdAt:Date.parse(row.created_at)});
 });
 it('comprueba registros publicados y pendientes del destino antes de escribir',async()=>{
  state.others=[{...row,id:9,fecha:'2026-10-18',is_pending:true}];
  await expect(DB.correctDraw(5,{fecha:'2026-10-18'})).rejects.toThrow('Ya hay');expect(state.writes).toHaveLength(0);
 });
 it('no escribe si no puede leer el sorteo o comprobar el destino',async()=>{
  state.failRead=true;await expect(DB.correctDraw(5,{numero:3})).rejects.toThrow();
  state.failRead=false;state.failDestination=true;await expect(DB.correctDraw(5,{numero:3})).rejects.toThrow('comprobar');expect(state.writes).toHaveLength(0);
 });
 it('rechaza un formulario obsoleto sin sobrescribir una edición ajena',async()=>{
  await expect(DB.correctDraw(5,{numero:3},{fecha:row.fecha,pais:'HN',horario:'9PM',numero:99,isTest:false,isPending:false})).rejects.toThrow('cambió');expect(state.writes).toHaveLength(0);
 });
 it('no informa éxito si el servidor rechaza la edición o el registro cambió durante la escritura',async()=>{
  state.updateError={message:'denied'};await expect(DB.correctDraw(5,{numero:3})).rejects.toThrow('No se pudo guardar');
  state.updateError=null;state.race=true;await expect(DB.correctDraw(5,{numero:3})).rejects.toThrow('cambió');
 });
});
