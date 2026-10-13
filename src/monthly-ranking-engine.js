import { parseDrawDate } from './date-utils.js';
import { TURNOS_DIARIA } from './horario-engine.js';

function registrosValidos(draws) {
  return (draws || []).flatMap(draw => {
    if (!draw || draw.isTest || draw.isPending || String(draw.pais || '').toUpperCase() !== 'HN' || !TURNOS_DIARIA.includes(draw.horario)) return [];
    if (!/^\d{1,2}$/.test(String(draw.numero).trim())) return [];
    const date = parseDrawDate(draw.fecha);
    if (!date) return [];
    const fecha = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return [{ numero: Number(draw.numero), fecha, mes: fecha.slice(0, 7) }];
  });
}

export function mesesDisponibles(draws) {
  return [...new Set(registrosValidos(draws).map(d => d.mes))].sort().reverse();
}

export function rankingMensual(mes, draws) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw new Error('Seleccioná un mes y año válidos.');
  const rows = registrosValidos(draws).filter(draw => draw.mes === mes);
  const numbers = Array.from({ length: 100 }, (_, numero) => ({ numero, apariciones: 0 }));
  for (const draw of rows) numbers[draw.numero].apariciones++;
  numbers.sort((a, b) => b.apariciones - a.apariciones || a.numero - b.numero);
  let puesto = 0;
  let previous = null;
  const ranking = numbers.map((entry, index) => {
    if (entry.apariciones !== previous) puesto = index + 1;
    previous = entry.apariciones;
    return { ...entry, puesto, porcentaje: rows.length ? entry.apariciones / rows.length * 100 : 0 };
  });
  const fechas = rows.map(d => d.fecha).sort();
  return {
    mes, total: rows.length, desde: fechas[0] || null, hasta: fechas.at(-1) || null,
    distintos: ranking.filter(n => n.apariciones > 0).length,
    diasRegistrados: new Set(fechas).size,
    lideres: rows.length ? ranking.filter(n => n.apariciones === ranking[0].apariciones) : [],
    ranking,
  };
}
