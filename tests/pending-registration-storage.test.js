import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({ updateRows:[], error:null }));
vi.mock('../src/supabaseClient.js',()=>({supabase:{from:()=>{
  let operation='read';
  const query={select(){return this},eq(){return this},maybeSingle(){return this},update(){operation='update';return this},then(resolve){return Promise.resolve(operation==='update'?{data:state.updateRows,error:state.error}:{data:{id:42,fecha:'2026-10-17',pais:'HN',horario:'9PM',numero:12,is_pending:true},error:null}).then(resolve)}};
  return query;
}}}));
import { DB } from '../src/storage.js';
const entry={fecha:'2026-10-17',pais:'HN',horario:'9PM',numero:13};

describe('confirmación del guardado de pendientes existentes',()=>{
 beforeEach(()=>{state.updateRows=[];state.error=null;vi.spyOn(console,'error').mockImplementation(()=>{});});
 afterEach(()=>vi.restoreAllMocks());
 it('solo confirma la edición si el servidor devuelve una fila actualizada',async()=>{
  state.updateRows=[{id:42}];
  await expect(DB.savePendingDraw(entry)).resolves.toBe(42);
 });
 it('rechaza errores de escritura para que el formulario conserve los números ingresados',async()=>{
  state.error={message:'No se pudo escribir'};
  await expect(DB.savePendingDraw(entry)).rejects.toThrow('No se pudo actualizar');
 });
 it('no presenta como guardado un pendiente sin filas actualizadas',async()=>{
  await expect(DB.savePendingDraw(entry)).rejects.toThrow('No se pudo actualizar');
 });
});
