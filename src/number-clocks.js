import { parseDrawDate, formatDateISO } from './date-utils.js';

const hours = { '11AM': '11', '3PM': '15', '9PM': '21' };

// Honduras stays at UTC−6. Use the scheduled draw time, never its database insertion time.
export function drawTimestamp(draw) {
  if (!draw || draw.isTest || draw.isPending || String(draw.pais || '').toUpperCase() !== 'HN' || !hours[draw.horario]) return null;
  const date = parseDrawDate(draw.fecha);
  if (!date) return null;
  const at = Date.parse(`${formatDateISO(date)}T${hours[draw.horario]}:00:00-06:00`);
  return Number.isFinite(at) ? at : null;
}

export function buildNumberClocks(draws = [], now = Date.now()) {
  const numbers = Array.from({ length: 100 }, (_, numero) => ({ numero, last: null }));
  let total = 0, future = 0, latest = null;
  for (const draw of draws) {
    const raw = String(draw?.numero ?? '').trim();
    if (!/^\d{1,2}$/.test(raw)) continue;
    const at = drawTimestamp(draw);
    if (at === null) continue;
    if (at > now) { future++; continue; }
    total++;
    const last = { at, fecha: formatDateISO(draw.fecha), horario: draw.horario };
    const number = numbers[Number(raw)];
    if (!number.last || at > number.last.at) number.last = last;
    if (!latest || at > latest.at) latest = last;
  }
  return { numbers, total, future, latest };
}

export function elapsedParts(at, now = Date.now()) {
  if (!Number.isFinite(at) || !Number.isFinite(now) || now < at) return null;
  const seconds = Math.floor((now - at) / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
}
