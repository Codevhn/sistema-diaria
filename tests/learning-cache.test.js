import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/storage.js', () => ({ DB: { listDraws: vi.fn(), _getAll: vi.fn(), getHypothesisLogs: vi.fn(), saveKnowledge: vi.fn(), clearKnowledge: vi.fn() } }));
import { DB } from '../src/storage.js';
import { rebuildKnowledge } from '../src/learning.js';

describe('preparación de memoria con el historial ya cargado', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-15T18:00:00Z"));
    DB._getAll.mockResolvedValue([]);
    DB.getHypothesisLogs.mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  it('produce los mismos perfiles sin volver a descargar sorteos', async () => {
    const draws = [{ numero: 3, fecha: '2026-10-14', horario: '11AM', pais: 'HN' }, { numero: 12, fecha: '2026-10-14', horario: '3PM', pais: 'HN' }];
    DB.listDraws.mockResolvedValue(draws);
    const original = await rebuildKnowledge();
    expect(DB.listDraws).toHaveBeenCalledTimes(1);
    DB.listDraws.mockClear();
    const cached = await rebuildKnowledge({ draws });
    expect(DB.listDraws).not.toHaveBeenCalled();
    expect(cached).toEqual(original);
    expect(DB.saveKnowledge).toHaveBeenCalledTimes(2);
  });
  it('conserva el manejo de un historial vacío sin iniciar otra descarga', async () => {
    expect(await rebuildKnowledge({ draws: [] })).toEqual({ totalDraws: 0, perfiles: [], latestTimestamp: null });
    expect(DB.listDraws).not.toHaveBeenCalled();
    expect(DB.clearKnowledge).toHaveBeenCalledWith('number-profile');
  });
});
