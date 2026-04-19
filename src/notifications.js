/**
 * notifications.js — Sistema de notificaciones dinámicas del navegador.
 *
 * Usa la Web Notifications API. Cuando el Service Worker esté registrado,
 * las notificaciones llegan aunque la pestaña esté en segundo plano.
 *
 * Eventos que notifica:
 *   - "Hoy es día de Super Premio" (miércoles y sábados)
 *   - Extensible a otros eventos del sistema
 *
 * Control de spam: guarda en localStorage la última vez que se notificó
 * cada tipo de evento, para no repetir más de una vez al día.
 */

const APP_NAME = "Sistema Diaria";
const APP_ICON = "/data/img/00.png"; // fallback genérico

const STORAGE_KEY = "sdnotif_last";

// ─── Días de Super Premio ──────────────────────────────────────────────────
// getDay(): 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
const SP_DAYS = new Set([3, 6]); // miércoles y sábados

export function isSuperPremioDay(date = new Date()) {
  return SP_DAYS.has(date.getDay());
}

/**
 * Devuelve la fecha (YYYY-MM-DD) del próximo sorteo de Super Premio.
 */
export function nextSuperPremioDate(from = new Date()) {
  const d = new Date(from);
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (SP_DAYS.has(d.getDay())) {
      return d.toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" });
    }
  }
  return "próximamente";
}

// ─── Permisos ────────────────────────────────────────────────────────────────

export function getNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

/**
 * Solicita permiso al usuario. Devuelve el estado resultante.
 */
export async function requestNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

// ─── Envío de notificaciones ──────────────────────────────────────────────────

function loadLastSent() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function saveLastSent(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Envía una notificación si no fue enviada hoy para ese tipo.
 * @param {string} tipo   - clave única del evento ("superpremio", etc.)
 * @param {string} titulo
 * @param {string} cuerpo
 * @param {object} [opts] - opciones extra para Notification
 * @returns {boolean}     - true si se envió
 */
export function sendNotif(tipo, titulo, cuerpo, opts = {}) {
  if (Notification.permission !== "granted") return false;
  const last = loadLastSent();
  const hoy = todayKey();
  if (last[tipo] === hoy) return false; // ya notificamos hoy

  try {
    new Notification(titulo, {
      body: cuerpo,
      icon: APP_ICON,
      badge: APP_ICON,
      tag: `sdnotif-${tipo}`,   // reemplaza notificación anterior del mismo tipo
      renotify: false,
      ...opts,
    });
    last[tipo] = hoy;
    saveLastSent(last);
    return true;
  } catch (err) {
    console.warn("[notifications] Error al enviar notificación:", err);
    return false;
  }
}

// ─── Notificaciones específicas ───────────────────────────────────────────────

/**
 * Si hoy es miércoles o sábado, notifica al usuario sobre el Super Premio.
 * Solo lo hace una vez al día.
 */
export function notifySuperPremioIfNeeded() {
  if (!isSuperPremioDay()) return false;
  const hoy = new Date();
  const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const diaNombre = diasSemana[hoy.getDay()];
  return sendNotif(
    "superpremio",
    `🏆 ¡${diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1)} de Super Premio!`,
    "Abrí el sistema y generá tus 6 números antes del sorteo. El motor ya analizó el historial.",
    { requireInteraction: false }
  );
}

// ─── Inicialización ───────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de notificaciones.
 * - Si ya tiene permiso: envía notificaciones relevantes del día.
 * - Si no tiene permiso: no pide nada automáticamente (espera que el
 *   usuario lo active desde el botón en el panel Super Premio).
 */
export async function initNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    notifySuperPremioIfNeeded();
  }
}
