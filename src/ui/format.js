/**
 * ui/format.js — Helpers compartidos de formato y claves de número
 *
 * Extraídos de app.js para que las vistas (views/*.js) y el propio
 * app.js compartan UNA sola definición.
 */
import { GUIA } from "../loader.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const formatNumber = (n) => String(n).padStart(2, "0");

export const normalizeNumeroKey = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isNaN(parsed)) {
    const bounded = ((parsed % 100) + 100) % 100; // asegura 0-99
    return formatNumber(bounded);
  }
  const raw = String(value ?? "")
    .trim()
    .replace(/[^0-9]/g, "");
  if (!raw) return "";
  return formatNumber(parseInt(raw.slice(-2), 10));
};

export const parseISODate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const MONTH_ABBR = MONTH_NAMES.map((name) => name.slice(0, 3));
export const DOW_FULL_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export const HORARIO_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };

export const formatFriendlyDate = (value) => {
  if (!value) return "";
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? parseISODate(value)
        : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  const day = date.getDate();
  const monthName = MONTH_NAMES[date.getMonth()] || "";
  const year = date.getFullYear();
  const dow = DOW_FULL_LABEL[date.getDay()] || "";
  return `${dow ? `${dow} ` : ""}${day} de ${monthName} ${year}`;
};

export const escapeHtml = (str) => {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

export const getSymbol = (numero) => {
  const key = normalizeNumeroKey(numero);
  const rawKey = (numero ?? "").toString().trim();
  const candidates = [key, rawKey, formatNumber(rawKey)];
  for (const cand of candidates) {
    if (!cand) continue;
    const entry = GUIA[cand];
    if (entry?.simbolo) return entry.simbolo;
  }
  return "";
};
