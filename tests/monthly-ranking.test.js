import { describe, expect, it } from 'vitest';
import { rankingMensual, mesesDisponibles } from '../src/monthly-ranking-engine.js';
import { renderRankingMensual } from '../src/views/monthly-ranking-panel.js';
const draw = (numero, extra = {}) => ({ numero, fecha: '2025-01-01', pais: 'HN', horario: '11AM', ...extra });

describe('ranking mensual de apariciones', () => {
  it('cuenta el mes y año exactos y ordena por frecuencia con porcentaje sobre el total', () => {
    const result = rankingMensual('2025-01', [draw(67), draw('67', { horario: '3PM' }), draw(23, { horario: '9PM' }), draw(67, { fecha: '2024-01-01' }), draw(67, { fecha: '2025-02-01' })]);
    expect(result.total).toBe(3);
    expect(result.distintos).toBe(2);
    expect(result.ranking[0]).toMatchObject({ numero: 67, apariciones: 2, puesto: 1 });
    expect(result.ranking[0].porcentaje).toBeCloseTo(200 / 3);
    expect(result.ranking[1]).toMatchObject({ numero: 23, apariciones: 1, puesto: 2 });
    expect(result.ranking.reduce((sum, n) => sum + n.porcentaje, 0)).toBeCloseTo(100);
    expect(result.ranking).toHaveLength(100);
  });
  it('comparte puesto para empates, conserva el 00 y no inventa un líder sin datos', () => {
    const result = rankingMensual('2025-01', [draw(0), draw(67)]);
    expect(result.lideres.map(n => n.numero)).toEqual([0, 67]);
    expect(result.lideres.map(n => n.puesto)).toEqual([1, 1]);
    expect(result.ranking[2].apariciones).toBe(0);
    const empty = rankingMensual('2025-02', [draw(0)]);
    expect(empty.lideres).toEqual([]);
    expect(empty.total).toBe(0);
    expect(renderRankingMensual(empty)).toContain('No hay sorteos registrados');
  });
  it('excluye pruebas, pendientes, otros países, turnos y fechas inválidos', () => {
    const result = rankingMensual('2025-01', [draw(23), draw(23, { isTest: true }), draw(23, { isPending: true }), draw(23, { pais: 'NI' }), draw(23, { horario: '12PM' }), draw(23, { fecha: '2025-01-99' }), draw(null), draw('67x')]);
    expect(result.total).toBe(1);
    expect(result.diasRegistrados).toBe(1);
    expect(mesesDisponibles([draw(23), draw(67, { fecha: '2024-01-01' }), draw(23, { fecha: '2026-05-01', isTest: true })])).toEqual(['2025-01', '2024-01']);
  });
  it('muestra conteos, símbolos y ceros, escapa HTML y rechaza meses inválidos', () => {
    const result = rankingMensual('2025-01', [draw(23)]);
    const html = renderRankingMensual(result, { '23': { simbolo: '<img onerror=bad()>' } });
    expect(html).toContain('100.0%');
    expect(html).toContain('99 números que no salieron');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    for (const month of ['', '2025-13', '2025-00', '2025-1']) expect(() => rankingMensual(month, [])).toThrow();
  });
});
