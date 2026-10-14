import { describe, expect, it } from 'vitest';
import { drawTimestamp, buildNumberClocks, elapsedParts } from '../src/number-clocks.js';

const now = Date.parse('2026-10-14T17:00:00Z');
const draw = (numero, horario = '11AM', extra = {}) => ({ numero, horario, fecha: '2026-10-13', pais: 'HN', ...extra });

describe('relojes de los 100 números', () => {
  it('convierte los turnos de Honduras a instantes exactos, incluido el cambio de día UTC', () => {
    expect(drawTimestamp(draw(67))).toBe(Date.parse('2026-10-13T17:00:00Z'));
    expect(drawTimestamp(draw(67, '3PM'))).toBe(Date.parse('2026-10-13T21:00:00Z'));
    expect(drawTimestamp(draw(67, '9PM'))).toBe(Date.parse('2026-10-14T03:00:00Z'));
  });
  it('genera 00–99 y encuentra la última aparición aunque los registros estén desordenados', () => {
    const result = buildNumberClocks([draw(67, '9PM'), draw(0), draw(99), draw(67)], now);
    expect(result.numbers.map(n => n.numero)).toEqual(Array.from({ length: 100 }, (_, n) => n));
    expect(result.numbers[67].last.horario).toBe('9PM');
    expect(result.numbers[0].last).not.toBeNull();
    expect(result.numbers[99].last).not.toBeNull();
    expect(result.numbers[7].last).toBeNull();
  });
  it('excluye pruebas, pendientes, otros países, datos inválidos y fechas futuras', () => {
    const result = buildNumberClocks([
      draw(67), draw(67, '3PM', { isTest: true }), draw(67, '9PM', { isPending: true }),
      draw(67, '9PM', { pais: 'NI' }), draw(67, '12PM'), draw(null), draw('100'),
      draw(67, '9PM', { fecha: '2026-02-30' }), draw(67, '3PM', { fecha: '2026-10-14' }),
    ], now);
    expect(result.total).toBe(1);
    expect(result.future).toBe(1);
    expect(result.numbers[67].last.horario).toBe('11AM');
  });
  it('descompone el tiempo real y maneja el cambio de segundo, minuto, hora y día', () => {
    const start = now - ((3 * 86400 + 23 * 3600 + 59 * 60 + 59) * 1000);
    expect(elapsedParts(start, now)).toEqual({ days: 3, hours: 23, minutes: 59, seconds: 59 });
    expect(elapsedParts(start, now + 1000)).toEqual({ days: 4, hours: 0, minutes: 0, seconds: 0 });
    expect(elapsedParts(now, now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(elapsedParts(now + 1, now)).toBeNull();
    expect(elapsedParts(null, now)).toBeNull();
  });
  it('reinicia solamente el número que salió y usa la hora del sorteo, no createdAt', () => {
    const old = [draw(67), draw(23)];
    const updated = buildNumberClocks([...old, draw(67, '11AM', { fecha: '2026-10-14', createdAt: '2026-10-14T18:55:00Z' })], now);
    expect(elapsedParts(updated.numbers[67].last.at, now).days).toBe(0);
    expect(elapsedParts(updated.numbers[23].last.at, now).days).toBe(1);
    expect(updated.numbers[67].last.at).toBe(now);
  });
});
