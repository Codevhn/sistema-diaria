import { describe, expect, it } from 'vitest';
import { consultarHorarioFavorito } from '../src/horario-engine.js';
import { renderHorarioFavorito } from '../src/views/horario-panel.js';
const d = (horario, numero = 67, extra = {}) => ({ fecha: '2020-01-01', pais: 'HN', numero, horario, ...extra });
describe('horario favorito exacto', () => {
  it('cuenta todo el historial y elige el turno con más apariciones directas', () => {
    const result = consultarHorarioFavorito('67', [d('11AM'), d('3PM'), d('3PM'), d('9PM', 12), d('3PM', '67', { fecha: '2026-10-12' })]);
    expect(result.favoritos).toEqual(['3PM']);
    expect(result.total).toBe(4);
    expect(result.totalSorteos).toBe(5);
    expect(result.turnos[1].porcentaje).toBe(75);
    expect(result.desde).toBe('2020-01-01');
    expect(result.hasta).toBe('2026-10-12');
    expect(renderHorarioFavorito(result)).toContain('3:00 p. m.');
  });
  it('declara empates y no inventa un ganador sin apariciones', () => {
    const tie = consultarHorarioFavorito(67, [d('11AM'), d('9PM')]);
    expect(tie.favoritos).toEqual(['11AM', '9PM']);
    expect(renderHorarioFavorito(tie)).toContain('Empate entre horarios');
    expect(consultarHorarioFavorito(67, [d('11AM', 12)]).favoritos).toEqual([]);
    expect(renderHorarioFavorito(consultarHorarioFavorito(67, []))).toContain('No hay sorteos válidos');
  });
  it('excluye pruebas, pendientes, otros países y registros inválidos', () => {
    const result = consultarHorarioFavorito(67, [d('11AM'), d('3PM', 67, { isTest: true }), d('3PM', 67, { isPending: true }), d('3PM', 67, { pais: 'NI' }), d('12PM'), d('9PM', null), d('9PM', 67, { fecha: 'invalid' })]);
    expect(result.total).toBe(1);
    expect(result.totalSorteos).toBe(1);
  });
  it('acepta 00 y rechaza números incompletos o fuera de rango', () => {
    expect(consultarHorarioFavorito('00', [d('9PM', 0)]).favoritos).toEqual(['9PM']);
    for (const n of ['', '67x', '100', '-1', '6.7']) expect(() => consultarHorarioFavorito(n, [])).toThrow();
  });
});
