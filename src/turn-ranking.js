import { parseDrawDate, formatDateISO } from './date-utils.js';
import { TURNOS_DIARIA } from './horario-engine.js';

// Counts describe the available history; equal counts share the same rank.
export function buildTurnRanking(draws = []) {
  const totals = Object.fromEntries(TURNOS_DIARIA.map(t => [t, 0]));
  const periods = Object.fromEntries(TURNOS_DIARIA.map(t => [t, { desde: null, hasta: null }]));
  const counts = Array.from({ length: 100 }, () => Object.fromEntries(TURNOS_DIARIA.map(t => [t, 0])));
  for (const draw of draws) {
    if (!draw || draw.isTest || draw.isPending || String(draw.pais || '').toUpperCase() !== 'HN' || !TURNOS_DIARIA.includes(draw.horario)) continue;
    if (!/^\d{1,2}$/.test(String(draw.numero).trim())) continue;
    const date = parseDrawDate(draw.fecha);
    if (!date) continue;
    const iso = formatDateISO(date), period = periods[draw.horario];
    period.desde = period.desde === null || iso < period.desde ? iso : period.desde;
    period.hasta = period.hasta === null || iso > period.hasta ? iso : period.hasta;
    totals[draw.horario]++;
    counts[Number(draw.numero)][draw.horario]++;
  }
  return Object.fromEntries(TURNOS_DIARIA.map(horario => {
    const numbers = counts.map((turns, numero) => {
      const max = Math.max(...Object.values(turns));
      return { numero, apariciones: turns[horario], porcentaje: totals[horario] ? turns[horario] / totals[horario] * 100 : 0, favoritos: max ? TURNOS_DIARIA.filter(t => turns[t] === max) : [] };
    }).sort((a, b) => b.apariciones - a.apariciones || a.numero - b.numero);
    let rank = 0;
    numbers.forEach((n, i) => { if (i === 0 || n.apariciones !== numbers[i - 1].apariciones) rank = i + 1; n.puesto = n.apariciones ? rank : null; });
    return [horario, { horario, sorteos: totals[horario], ...periods[horario], numbers }];
  }));
}
