import { describe, expect, it } from 'vitest';
import { paginateHistory } from '../src/history-pagination.js';

describe('paginación del historial', () => {
  const rows = Array.from({ length: 32 }, (_, id) => ({ id }));
  it('recorre todos los resultados una sola vez y conserva el orden', () => {
    const pages = [0, 1, 2].map(page => paginateHistory(rows, page, 15));
    expect(pages.flatMap(page => page.rows)).toEqual(rows);
    expect(pages[1]).toMatchObject({ start: 16, end: 30, total: 32, pages: 3 });
    expect(pages[2]).toMatchObject({ start: 31, end: 32 });
  });
  it('ajusta la página al reducir los resultados con un filtro', () => {
    const page = paginateHistory(rows.slice(0, 3), 12, 15);
    expect(page.page).toBe(0);
    expect(page.rows).toHaveLength(3);
    expect(page.start).toBe(1);
  });
  it('maneja ausencia de datos y tamaños inválidos', () => {
    expect(paginateHistory([], 5)).toMatchObject({ rows: [], total: 0, page: 0, pages: 1, start: 0, end: 0 });
    expect(paginateHistory(rows, -1, 0).rows).toHaveLength(15);
  });
});
