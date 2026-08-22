/**
 * ui/toast.js — Notificaciones toast
 *
 * Extraído de app.js. index.html depende de window.__showToast para
 * reportar errores globales (unhandledrejection).
 */
import { logWarn } from "../logger.js";

const toastContainer = document.getElementById("toast-container");

function showToast(message, { variant = "info", timeout = 4200 } = {}) {
  if (!toastContainer) {
    logWarn("Toast:", message);
    return;
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.variant = variant;
  const text = document.createElement("span");
  text.textContent = message;

  let hideTimer = null;
  const dismiss = () => {
    if (!toast || toast.classList.contains("hide")) return;
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 220);
  };

  const close = document.createElement("button");
  close.type = "button";
  close.innerHTML = "&times;";
  close.addEventListener("click", () => dismiss());

  toast.appendChild(text);
  toast.appendChild(close);
  toastContainer.appendChild(toast);

  hideTimer = setTimeout(dismiss, timeout);
  toast.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  toast.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(dismiss, 1800);
  });
}

window.__showToast = showToast;

export { showToast };
