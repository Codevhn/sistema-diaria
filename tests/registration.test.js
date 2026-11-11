import { describe, expect, it } from 'vitest';
import { registrationDay, registrationResume, shiftRegistrationDate, unchangedRegistrationValue, validRegistrationDate } from '../src/registration.js';
const today = '2026-11-10';
const draw = (horario, numero, extra={}) => ({fecha:'2026-10-17',pais:'HN',horario,numero,createdAt:100,...extra});

describe('registro de fechas atrasadas y turnos incompletos',()=>{
  it('recupera los dos primeros sorteos y deja vacío solamente 9PM',()=>{
    const data = [draw('11AM',3),draw('3PM',64)];
    const day = registrationDay(data,[],{fecha:'2026-10-17'});
    expect(day.map(s=>[s.horario,s.record?.numero??null,s.state])).toEqual([['11AM',3,'registered'],['3PM',64,'registered'],['9PM',null,'empty']]);
    expect(registrationResume(data,[],{today})).toEqual({fecha:'2026-10-17',latest:'2026-10-17'});
  });
  it('retoma también un día parcial que solo está en pendientes',()=>{
    const pending=[draw('11AM',0,{isPending:true}),draw('3PM',99,{isPending:true})];
    expect(registrationDay([],pending,{fecha:'2026-10-17'}).map(s=>s.state)).toEqual(['pending','pending','empty']);
    expect(registrationResume([],pending,{today}).fecha).toBe('2026-10-17');
  });
  it('combina publicados y pendientes sin ocultar un número cero y prioriza la última edición pendiente',()=>{
    const day=registrationDay([draw('11AM',0),draw('3PM',3)], [draw('3PM',4,{createdAt:200}),draw('3PM',5,{createdAt:300})], {fecha:'2026-10-17'});
    expect(day[0].record.numero).toBe(0);
    expect(day[1]).toMatchObject({state:'pending',record:{numero:5}});
    expect(day[2].record).toBeNull();
  });
  it('propone el día siguiente únicamente si los tres turnos ya están completos y no rebasa hoy',()=>{
    const data=[draw('11AM',3),draw('3PM',64)];
    const pending=[draw('9PM',12,{isPending:true})];
    expect(registrationResume(data,pending,{today}).fecha).toBe('2026-10-18');
    const todayDraws=['11AM','3PM','9PM'].map(t=>draw(t,1,{fecha:today}));
    expect(registrationResume(todayDraws,[],{today}).fecha).toBe(today);
    expect(registrationResume([],[],{today})).toEqual({fecha:today,latest:null});
  });
  it('conserva una fecha elegida válida sin aceptar cursores futuros o inválidos',()=>{
    const data=[draw('11AM',12)];
    expect(registrationResume(data,[],{today,remembered:'2026-10-01'}).fecha).toBe('2026-10-01');
    for(const remembered of ['2027-01-01','2026-02-30','invalid']) expect(registrationResume(data,[],{today,remembered}).fecha).toBe('2026-10-17');
  });
  it('no usa pruebas, otros países, horarios ajenos ni números inválidos como punto de continuación',()=>{
    const rows=[draw('11AM',12),draw('9PM',3,{fecha:'2026-11-01',isTest:true}),draw('9PM',3,{fecha:'2026-11-01',pais:'NI'}),draw('12PM',3,{fecha:'2026-11-01'}),draw('9PM',null,{fecha:'2026-11-01'}),draw('9PM',100,{fecha:'2026-11-01'}),draw('9PM',3,{fecha:'2027-01-01'})];
    expect(registrationResume(rows,[],{today}).fecha).toBe('2026-10-17');
    expect(registrationDay(rows,[],{fecha:'2026-10-17',pais:'NI'}).every(s=>!s.record)).toBe(true);
  });
  it('prefiere el resultado real al de prueba y señala que una prueba no completa un turno real',()=>{
    const rows=[draw('11AM',1),draw('11AM',2,{isTest:true,createdAt:200}),draw('3PM',3),draw('9PM',4,{isTest:true})];
    expect(registrationDay(rows,[],{fecha:'2026-10-17'})[0].record.numero).toBe(1);
    expect(registrationResume(rows,[],{today}).fecha).toBe('2026-10-17');
  });
  it('compara valores prefijados sin volver a enviar números ya guardados y detecta correcciones',()=>{
    expect(unchangedRegistrationValue('03',false,{numero:3,isTest:false})).toBe(true);
    expect(unchangedRegistrationValue('0',false,{numero:0})).toBe(true);
    expect(unchangedRegistrationValue('04',false,{numero:3})).toBe(false);
    expect(unchangedRegistrationValue('03',true,{numero:3})).toBe(false);
    expect(unchangedRegistrationValue('03',false,null)).toBe(false);
    expect(unchangedRegistrationValue('',false,{numero:0})).toBe(false);
  });
  it('navega meses, años y bisiestos con fechas de calendario',()=>{
    expect(shiftRegistrationDate('2026-10-31',1)).toBe('2026-11-01');
    expect(shiftRegistrationDate('2024-02-28',1)).toBe('2024-02-29');
    expect(shiftRegistrationDate('2026-01-01',-1)).toBe('2025-12-31');
    expect(shiftRegistrationDate('invalid',1)).toBeNull();
    expect(validRegistrationDate('2026-02-30')).toBe(false);
    expect(validRegistrationDate('1800-01-01')).toBe(false);
  });
});
