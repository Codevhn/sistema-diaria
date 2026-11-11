import { describe,it,expect } from 'vitest';
import { prepareDrawCorrection, sameDrawVersion } from '../src/draw-corrections.js';
const base={id:5,fecha:'2026-10-17',horario:'9PM',pais:'HN',numero:12,isPending:false,isTest:false,createdAt:123};
const options={today:'2026-11-10'};
describe('corrección de sorteos existentes',()=>{
 it('permite cambiar fecha, horario y número sin incluir ID, fecha de creación ni publicación en la actualización',()=>{
  expect(prepareDrawCorrection(base,{fecha:'2026-10-18',horario:'3PM',numero:'00',id:99,createdAt:999,isPending:true},options)).toEqual({fecha:'2026-10-18',horario:'3PM',numero:0,isTest:false});
 });
 it('rechaza fechas inválidas/futuras, números fuera de rango y turnos desconocidos',()=>{
  for(const changes of [{fecha:'2026-02-30'},{fecha:'2027-01-01'},{horario:'12PM'},{numero:'100'},{numero:'3x'},{numero:''}])expect(()=>prepareDrawCorrection(base,changes,options)).toThrow();
  expect(()=>prepareDrawCorrection({...base,id:null},{},options)).toThrow();
 });
 it('impide mover un sorteo encima de otro publicado o pendiente',()=>{
  for(const isPending of [false,true])expect(()=>prepareDrawCorrection(base,{fecha:'2026-10-18'},{...options,others:[{...base,id:8,fecha:'2026-10-18',isPending}]})).toThrow('Ya hay');
 });
 it('excluye al propio ID y no mezcla horarios ni países',()=>{
  expect(prepareDrawCorrection(base,{numero:13},{...options,others:[base,{...base,id:7,horario:'11AM'},{...base,id:8,pais:'NI'}]}).numero).toBe(13);
 });
 it('permite corregir un pendiente que ya cubre un publicado del mismo horario sin publicarlo',()=>{
  expect(prepareDrawCorrection({...base,id:7,isPending:true},{numero:13},{...options,others:[base]}).numero).toBe(13);
  expect(()=>prepareDrawCorrection(base,{numero:13},{...options,others:[{...base,id:7,isPending:true}]})).toThrow('pendiente');
 });
 it('detecta ediciones simultáneas de número, fecha, turno o estado de publicación',()=>{
  expect(sameDrawVersion(base,{...base})).toBe(true);
  for(const change of [{numero:3},{fecha:'2026-10-18'},{horario:'3PM'},{isPending:true},{isTest:true}])expect(sameDrawVersion(base,{...base,...change})).toBe(false);
 });
});
