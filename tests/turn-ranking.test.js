import { describe, expect, it } from 'vitest';
import { buildTurnRanking } from '../src/turn-ranking.js';
import { consultarHorarioFavorito, TURNOS_DIARIA } from '../src/horario-engine.js';
const d = (numero, horario = '11AM', extra = {}) => ({ numero, horario, fecha: '2026-10-14', pais: 'HN', ...extra });

describe('ranking histórico de los 100 números por turno', () => {
  it('separa horarios y ordena por frecuencia con empates y ceros explícitos', () => {
    const r = buildTurnRanking([d(3),d(3),d(0),d(0),d(99),d(99,'9PM')]);
    expect(r['11AM'].sorteos).toBe(5);
    expect(r['11AM'].numbers).toHaveLength(100);
    expect(r['11AM'].numbers.slice(0,3).map(n=>[n.numero,n.apariciones,n.puesto])).toEqual([[0,2,1],[3,2,1],[99,1,3]]);
    expect(r['11AM'].numbers.find(n=>n.numero===1)).toMatchObject({apariciones:0,puesto:null,porcentaje:0});
    expect(r['9PM'].numbers[0]).toMatchObject({numero:99,apariciones:1,porcentaje:100});
  });
  it('calcula porcentajes sobre la cobertura del turno, no sobre las apariciones del número', () => {
    const r = buildTurnRanking([d(3),d(12),d(3,'3PM'),d(3,'3PM')]);
    expect(r['11AM'].numbers.find(n=>n.numero===3).porcentaje).toBe(50);
    expect(r['3PM'].numbers.find(n=>n.numero===3).porcentaje).toBe(100);
  });
  it('clasifica horarios favoritos e incluye empates, sin asignarlos a números ausentes', () => {
    const r = buildTurnRanking([d(3),d(3,'3PM'),d(12,'9PM')]);
    expect(r['11AM'].numbers.find(n=>n.numero===3).favoritos).toEqual(['11AM','3PM']);
    expect(r['9PM'].numbers.find(n=>n.numero===12).favoritos).toEqual(['9PM']);
    expect(r['11AM'].numbers.find(n=>n.numero===99).favoritos).toEqual([]);
  });
  it('excluye pruebas, pendientes, otros países y datos inválidos; calcula fechas por turno', () => {
    const r = buildTurnRanking([d('00'),d(99,'9PM',{fecha:'2020-01-01'}),d(1,'11AM',{isTest:true}),d(2,'11AM',{isPending:true}),d(3,'11AM',{pais:'NI'}),d(100),d(-1),d(null),d(''),d(3.5),d('3x'),d(4,'12PM'),d(4,'11AM',{fecha:'2026-02-30'})]);
    expect(r['11AM']).toMatchObject({sorteos:1,desde:'2026-10-14',hasta:'2026-10-14'});
    expect(r['9PM']).toMatchObject({sorteos:1,desde:'2020-01-01',hasta:'2020-01-01'});
    expect(r['3PM']).toMatchObject({sorteos:0,desde:null,hasta:null});
  });
  it('coincide con los conteos de la consulta individual para los 100 números', () => {
    const draws = Array.from({length:600},(_,i)=>d((i*17+i%9)%100,TURNOS_DIARIA[i%3]));
    const r = buildTurnRanking(draws);
    for(let n=0;n<100;n++) for(const t of consultarHorarioFavorito(n,draws).turnos) {
      const row = r[t.horario].numbers.find(row=>row.numero===n);
      expect(row.apariciones).toBe(t.apariciones);
      expect(r[t.horario].sorteos).toBe(t.sorteos);
    }
    for(const turno of Object.values(r)) expect(turno.numbers.reduce((sum,n)=>sum+n.apariciones,0)).toBe(turno.sorteos);
  });
  it('un historial vacío conserva los 100 números sin inventar líderes ni favoritos', () => {
    for(const turno of Object.values(buildTurnRanking())) {
      expect(turno.sorteos).toBe(0);
      expect(turno.numbers).toHaveLength(100);
      expect(turno.numbers.every(n=>n.puesto===null&&n.favoritos.length===0&&n.porcentaje===0)).toBe(true);
    }
  });
});
