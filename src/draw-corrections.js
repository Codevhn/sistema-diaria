import { validRegistrationDate, REGISTRATION_TURNS } from './registration.js';
import { getTodayISODate } from './date-utils.js';

export function sameDrawVersion(a, b) {
  return a && b && ['fecha','pais','horario','numero','isTest','isPending'].every(key =>
    ['isTest','isPending'].includes(key) ? !!a[key] === !!b[key] : String(a[key]) === String(b[key]));
}

export function prepareDrawCorrection(original, changes, { today = getTodayISODate(), others = [] } = {}) {
  if (original?.id == null) throw new Error('Este sorteo no tiene un registro identificable para corregir.');
  const fecha = String(changes.fecha ?? original.fecha).trim();
  const horario = changes.horario ?? original.horario;
  const raw = String(changes.numero ?? original.numero).trim();
  const pais = String(original.pais || 'HN').toUpperCase();
  if (!validRegistrationDate(fecha) || fecha > today) throw new Error('Elige una fecha válida, hasta hoy.');
  if (pais !== 'HN' || !REGISTRATION_TURNS.includes(horario)) throw new Error('Elige 11 AM, 3 PM o 9 PM para Honduras.');
  if (!/^\d{1,2}$/.test(raw)) throw new Error('Ingresa un número entre 00 y 99.');
  const samePosition = fecha === original.fecha && horario === original.horario;
  const conflict = others.find(row => String(row.id) !== String(original.id) && row.fecha === fecha && String(row.pais || 'HN').toUpperCase() === pais && row.horario === horario &&
    !(samePosition && original.isPending && !row.isPending));
  if (conflict) throw new Error(`Ya hay ${conflict.isPending ? 'un pendiente' : 'un sorteo registrado'} el ${fecha} a las ${horario}. Corrige ese registro o elige otra fecha u horario.`);
  return { fecha, horario, numero:Number(raw), isTest: typeof changes.isTest === 'boolean' ? changes.isTest : !!original.isTest };
}
