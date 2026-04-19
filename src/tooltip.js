/**
 * tooltip.js — Tooltips estilo Sims, persistentes mientras el foco/hover
 * permanezca sobre el elemento. Reemplaza el tooltip nativo del browser
 * (que aparece y desaparece solo en pocos segundos) leyendo cualquier
 * atributo `title` del DOM.
 *
 * Estrategia:
 *   - Delegación global (no recorre el DOM al cargar; engancha a mouseover/focusin).
 *   - Al primer hover/focus de un elemento con `title`: lo guarda en
 *     `data-tooltip-text` y ELIMINA el title (para suprimir el tooltip nativo).
 *   - Muestra una capa custom posicionada sobre el viewport, con borde y
 *     tipografía en color accent, fondo dark con bevel sutil estilo Sims.
 *   - Permanece visible hasta que el cursor sale (mouseleave) o el foco se
 *     pierde (focusout). Sin timer de auto-cierre.
 *   - Nunca atrapa eventos del puntero (pointer-events: none).
 */

const TOOLTIP_ID = "app-tooltip";
const STATE = {
  el: null,      // el <div> tooltip
  target: null,  // elemento al que está anclado
};

function ensureTooltipEl() {
  if (STATE.el) return STATE.el;
  const el = document.createElement("div");
  el.id = TOOLTIP_ID;
  el.className = "app-tooltip";
  el.setAttribute("role", "tooltip");
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  STATE.el = el;
  return el;
}

/**
 * Si el elemento tiene `title`, lo migra a `data-tooltip-text` para que
 * el browser no muestre el tooltip nativo. Devuelve el texto (o null).
 */
function extractTooltipText(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.dataset.tooltipText) return el.dataset.tooltipText;
  const t = el.getAttribute("title");
  if (t && t.trim()) {
    el.dataset.tooltipText = t;
    el.removeAttribute("title");
    return t;
  }
  return null;
}

/**
 * Encuentra el ancestro más cercano (incluido el propio target) que tenga
 * `title` o `data-tooltip-text`.
 */
function findTooltipHost(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (cur.dataset?.tooltipText || cur.hasAttribute?.("title")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function positionTooltip(host) {
  const el = STATE.el;
  if (!el || !host) return;
  const rect = host.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Por defecto: debajo, centrado
  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let placement = "bottom";

  // Si no cabe abajo, ponerlo arriba
  if (top + tipRect.height > vh - 4) {
    top = rect.top - tipRect.height - margin;
    placement = "top";
  }
  // Clamp horizontal al viewport
  if (left < 6) left = 6;
  if (left + tipRect.width > vw - 6) left = vw - tipRect.width - 6;

  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.dataset.placement = placement;
}

function showTooltip(host, text) {
  const el = ensureTooltipEl();
  el.textContent = text;
  el.classList.add("is-visible");
  el.setAttribute("aria-hidden", "false");
  STATE.target = host;
  // Posicionar después de pintar (para tener tipRect correcto)
  requestAnimationFrame(() => positionTooltip(host));
}

function hideTooltip() {
  if (!STATE.el) return;
  STATE.el.classList.remove("is-visible");
  STATE.el.setAttribute("aria-hidden", "true");
  STATE.target = null;
}

function handlePointerOver(event) {
  const host = findTooltipHost(event.target);
  if (!host) {
    if (STATE.target) hideTooltip();
    return;
  }
  if (host === STATE.target) return; // ya visible
  const text = extractTooltipText(host);
  if (!text) return;
  showTooltip(host, text);
}

function handlePointerOut(event) {
  if (!STATE.target) return;
  // Solo ocultar si salimos completamente del host (y no entramos a un hijo)
  const related = event.relatedTarget;
  if (related && STATE.target.contains(related)) return;
  hideTooltip();
}

function handleFocusIn(event) {
  const host = findTooltipHost(event.target);
  if (!host) return;
  const text = extractTooltipText(host);
  if (!text) return;
  showTooltip(host, text);
}

function handleFocusOut(event) {
  if (!STATE.target) return;
  if (event.target !== STATE.target && !STATE.target.contains(event.target)) return;
  const next = event.relatedTarget;
  if (next && STATE.target.contains(next)) return;
  hideTooltip();
}

function handleScrollOrResize() {
  if (STATE.target) positionTooltip(STATE.target);
}

function handleKey(event) {
  if (event.key === "Escape") hideTooltip();
}

export function initTooltips() {
  if (typeof document === "undefined") return;
  if (document.body.dataset.tooltipsReady === "1") return;
  document.body.dataset.tooltipsReady = "1";
  ensureTooltipEl();
  document.addEventListener("mouseover", handlePointerOver, true);
  document.addEventListener("mouseout", handlePointerOut, true);
  document.addEventListener("focusin", handleFocusIn, true);
  document.addEventListener("focusout", handleFocusOut, true);
  window.addEventListener("scroll", handleScrollOrResize, true);
  window.addEventListener("resize", handleScrollOrResize);
  window.addEventListener("keydown", handleKey);
}

// Auto-init si se importa directo
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTooltips, { once: true });
  } else {
    initTooltips();
  }
}
