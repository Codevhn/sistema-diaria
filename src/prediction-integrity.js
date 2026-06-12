/**
 * prediction-integrity.js — Sellado de predicciones
 *
 * Una predicción solo es evidencia válida si se registró ANTES de que se
 * conociera el resultado. Este módulo verifica eso comparando el timestamp
 * de creación del prediction_log (created_at de Supabase, hora de servidor)
 * contra la hora del sorteo objetivo.
 *
 * Las predicciones "post-hoc" (creadas después del sorteo, típicamente en
 * sesiones de ingreso de datos históricos) inflaban el hit-rate del sistema:
 * eran la causa más probable del lift de 6× incompatible con los tests de
 * aleatoriedad.
 */

// Hora local de cada turno de La Diaria (Honduras, UTC-6 sin horario de verano)
const TURNO_HORA = {
  "11AM": 11,
  "12PM": 12,
  "3PM": 15,
  "6PM": 18,
  "9PM": 21,
};

const TZ_HONDURAS = "-06:00";

/**
 * Timestamp (ms) del momento del sorteo para una fecha + turno dados.
 * Si el turno es desconocido, usa el primer turno del día (11AM) como
 * límite conservador: ante la duda, exige que la predicción sea más
 * temprana, nunca más tardía.
 */
export function drawDeadlineTs(fecha, turno) {
  if (!fecha || typeof fecha !== "string") return null;
  const hora = TURNO_HORA[String(turno || "").toUpperCase().trim()] ?? 11;
  const ts = Date.parse(`${fecha}T${String(hora).padStart(2, "0")}:00:00${TZ_HONDURAS}`);
  return Number.isFinite(ts) ? ts : null;
}

function toMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * ¿La predicción se registró antes del sorteo que intenta predecir?
 * Sin timestamp de creación verificable → NO sellada (ante la duda,
 * no cuenta como evidencia).
 */
export function esPrediccionSellada(log) {
  if (!log) return false;
  const created = toMs(log.createdAt ?? log.created_at);
  const deadline = drawDeadlineTs(log.targetFecha ?? log.target_fecha, log.turno);
  if (created === null || deadline === null) return false;
  return created <= deadline;
}

/**
 * Separa un lote de logs en sellados y post-hoc.
 */
export function separarPorSellado(logs = []) {
  const sellados = [];
  const postHoc = [];
  for (const log of logs) {
    (esPrediccionSellada(log) ? sellados : postHoc).push(log);
  }
  return { sellados, postHoc };
}
