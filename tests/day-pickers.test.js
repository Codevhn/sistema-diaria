import { describe, expect, it } from 'vitest';
import { calendarDays, shiftCalendarMonth } from '../src/ui/day-pickers.js';
import { formatDateISO } from '../src/date-utils.js';

describe('calendario de Jornada', () => {
  it('muestra seis semanas desde el lunes y conserva todos los días del mes bisiesto', () => {
    const days = calendarDays(new Date(2024, 1, 20));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(days.filter(day => day.getMonth() === 1)).toHaveLength(29);
    expect(days.map(formatDateISO)).toContain('2024-02-29');
    expect(new Set(days.map(formatDateISO)).size).toBe(42);
  });
  it('recorre diciembre y enero conservando el día seleccionado', () => {
    expect(formatDateISO(shiftCalendarMonth(new Date(2024, 11, 13), 1))).toBe('2025-01-13');
    expect(formatDateISO(shiftCalendarMonth(new Date(2025, 0, 13), -1))).toBe('2024-12-13');
  });
  it('ajusta el último día al cambiar a un mes más corto o a un año no bisiesto', () => {
    expect(formatDateISO(shiftCalendarMonth(new Date(2024, 0, 31), 1))).toBe('2024-02-29');
    expect(formatDateISO(shiftCalendarMonth(new Date(2024, 1, 29), 12))).toBe('2025-02-28');
  });
});
