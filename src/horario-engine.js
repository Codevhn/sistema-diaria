// Consulta descriptiva sobre todo el historial disponible de La Diaria Honduras.
import { parseDrawDate } from './date-utils.js';

export const TURNOS_DIARIA = ['11AM', '3PM', '9PM'];
export const HORAS_DIARIA = { '11AM': '11:00 a. m.', '3PM': '3:00 p. m.', '9PM': '9:00 p. m.' };

export function consultarHorarioFavorito(numero, draws = []) {
  const raw = String(numero).trim();
  if (!/^\d{1,2}$/.test(raw)) throw new Error('Ingresá un número entre 00 y 99.');
  const target = Number(raw);
  const turnos = TURNOS_DIARIA.map(horario => ({ horario, apariciones: 0, sorteos: 0 }));
  let desde = null;
  let hasta = null;
  for (const draw of draws) {
    if (!draw || draw.isTest || draw.isPending || String(draw.pais || '').toUpperCase() !== 'HN') continue;
    const row = turnos.find(turno => turno.horario === draw.horario);
    const fecha = parseDrawDate(draw.fecha);
    if (!row || !fecha || !/^\d{1,2}$/.test(String(draw.numero).trim())) continue;
    row.sorteos++;
    if (Number(draw.numero) === target) row.apariciones++;
    const iso = String(draw.fecha).slice(0, 10);
    if (!desde || iso < desde) desde = iso;
    if (!hasta || iso > hasta) hasta = iso;
  }
  const total = turnos.reduce((sum, t) => sum + t.apariciones, 0);
  const max = Math.max(...turnos.map(t => t.apariciones));
  return {
    numero: target, total, desde, hasta,
    totalSorteos: turnos.reduce((sum, t) => sum + t.sorteos, 0),
    favoritos: max > 0 ? turnos.filter(t => t.apariciones === max).map(t => t.horario) : [],
    turnos: turnos.map(t => ({ ...t, porcentaje: total ? t.apariciones / total * 100 : 0 })),
  };
}
