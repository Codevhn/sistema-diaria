import { parseDrawDate, formatDateISO } from './date-utils.js';

export const REGISTRATION_TURNS = ['11AM', '3PM', '9PM'];
const country = value => String(value || 'HN').trim().toUpperCase();
export const validRegistrationDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && String(value) >= '1900-01-01' && !!parseDrawDate(value);
const validNumber = value => /^\d{1,2}$/.test(String(value ?? '').trim());
const stamp = record => Number(record.createdAt) || Date.parse(record.createdAt) || Number(record.id) || 0;

export function shiftRegistrationDate(fecha, days) {
  if (!validRegistrationDate(fecha)) return null;
  const date = new Date(`${fecha}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function registrationDay(draws, pending, { fecha, pais = 'HN', horarios = REGISTRATION_TURNS }) {
  const eligible = record => record && validNumber(record.numero) && formatDateISO(record.fecha) === fecha && country(record.pais) === country(pais);
  return horarios.map(horario => {
    const published = draws.filter(r => eligible(r) && !r.isPending && r.horario === horario).sort((a,b) => stamp(a)-stamp(b));
    const queued = pending.filter(r => eligible(r) && r.horario === horario).sort((a,b) => stamp(a)-stamp(b));
    const record = queued.at(-1) || published.filter(r => !r.isTest).at(-1) || published.at(-1) || null;
    return { horario, record, state: !record ? 'empty' : queued.length ? 'pending' : 'registered' };
  });
}

export function registrationResume(draws = [], pending = [], { pais = 'HN', today, remembered = null, horarios = REGISTRATION_TURNS } = {}) {
  const dates = [...draws, ...pending].filter(r => r && !r.isTest && validNumber(r.numero) && country(r.pais) === country(pais) && horarios.includes(r.horario))
    .map(r=>formatDateISO(r.fecha)).filter(fecha=>validRegistrationDate(fecha) && fecha<=today).sort();
  const latest = dates.at(-1) || null;
  const incomplete = latest && registrationDay(draws, pending, { fecha: latest, pais, horarios }).some(slot=>!slot.record || slot.record.isTest);
  const fecha = validRegistrationDate(remembered) && remembered<=today ? remembered : latest ? (incomplete ? latest : [shiftRegistrationDate(latest,1),today].sort()[0]) : today;
  return { fecha, latest };
}

export function unchangedRegistrationValue(raw, isTest, baseline) {
  return !!baseline && validNumber(raw) && Number(raw) === Number(baseline.numero) && !!isTest === !!baseline.isTest;
}
