import { GUIA } from "./loader.js";
import {
  CONVERSION_MAP_NOTE,
  getSimpleConversions,
  getCompositeConversions,
} from "./conversion-map.js";
import { getEquivalencias } from "./conversion-engine.js";

const padNumber = (n) => String(n).padStart(2, "0");

function invertirNumero(n) {
  const s = String(n).padStart(2, "0");
  return parseInt(s.split("").reverse().join(""), 10);
}
function ajusteNumero(n) {
  return (100 - n) % 100;
}

/**
 * Crea una rezago-card para un número, usando el mismo estilo del sitio:
 * imagen + número + símbolo (con fallback .png → .jpg → ocultar).
 *
 * @param {number} num
 * @param {object} [opts]
 * @param {string} [opts.variant] - sufijo para clase (ej: "variante-seed")
 * @param {string} [opts.tag]     - texto del badge inferior (ej: "BASE")
 */
function buildNumCard(num, { variant = null, tag = null } = {}) {
  const pad = padNumber(num);
  const sim = GUIA[pad]?.simbolo || "—";
  const card = document.createElement("div");
  card.className = "rezago-card";
  if (variant) card.classList.add(`rezago-card--${variant}`);

  const img = document.createElement("img");
  img.className = "rezago-card__img";
  img.alt = pad;
  img.src = `data/img/${pad}.png`;
  img.addEventListener("error", function onErr() {
    img.removeEventListener("error", onErr);
    img.src = `data/img/${pad}.jpg`;
    img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
  }, { once: true });
  card.appendChild(img);

  const numEl = document.createElement("span");
  numEl.className = "rezago-card__num";
  numEl.textContent = pad;
  card.appendChild(numEl);

  const symEl = document.createElement("span");
  symEl.className = "rezago-card__sim";
  symEl.textContent = sim;
  card.appendChild(symEl);

  if (tag) {
    const badge = document.createElement("span");
    badge.className = "rezago-card__badge";
    badge.textContent = tag;
    card.appendChild(badge);
  }
  return card;
}

function buildRow(label, valores, variant) {
  const row = document.createElement("div");
  row.className = "trans-row";
  const lbl = document.createElement("b");
  lbl.textContent = label;
  row.appendChild(lbl);

  const wrap = document.createElement("div");
  wrap.className = "trans-card-wrap";
  if (!valores || !valores.length) {
    const muted = document.createElement("span");
    muted.className = "muted";
    muted.textContent = "—";
    wrap.appendChild(muted);
  } else {
    valores.forEach((v) => wrap.appendChild(buildNumCard(v, { variant })));
  }
  row.appendChild(wrap);
  return row;
}

export function mostrarTransformaciones(numero) {
  const cont = document.getElementById("t-output");
  cont.innerHTML = "";

  if (isNaN(numero) || numero < 0 || numero > 99) {
    cont.innerHTML =
      "<p class='hint'>Ingrese un número válido entre 00 y 99.</p>";
    return;
  }

  const base = padNumber(numero);
  const infoBase = GUIA[base];
  if (!infoBase) {
    cont.innerHTML =
      "<p class='hint'>Número no encontrado en la guía de los sueños.</p>";
    return;
  }

  // Transformaciones
  const inv = invertirNumero(numero);
  const adj = ajusteNumero(numero);
  const simpleConversions = getSimpleConversions(numero);
  const compositeConversions = getCompositeConversions(numero);
  const equivalencias = getEquivalencias(numero);

  // Wrapper principal
  const desc = document.createElement("div");
  desc.className = "desc trans-desc trans-desc--cards";

  // Base — destacada
  const baseRow = document.createElement("div");
  baseRow.className = "trans-row trans-row--base";
  const baseLbl = document.createElement("b");
  baseLbl.textContent = "Base";
  baseRow.appendChild(baseLbl);
  const baseWrap = document.createElement("div");
  baseWrap.className = "trans-card-wrap";
  baseWrap.appendChild(buildNumCard(numero, { variant: "variante-seed" }));
  baseRow.appendChild(baseWrap);
  desc.appendChild(baseRow);

  // Filas de transformaciones
  desc.appendChild(buildRow("Invertido", [inv], "variante"));
  desc.appendChild(buildRow("Ajuste (100−n)", [adj], "variante"));
  desc.appendChild(buildRow("Conversión simple", simpleConversions, "variante"));
  desc.appendChild(buildRow("Conversión compuesta", compositeConversions, "variante"));
  desc.appendChild(buildRow("Equivalencias", equivalencias, "pop-cool"));

  // Nota explicativa
  const note = document.createElement("p");
  note.className = "trans-note";
  note.innerHTML = `${CONVERSION_MAP_NOTE}. La conversión simple aplica el mapa a un solo dígito y la compuesta a ambos, considerando también el espejo. Las equivalencias usan el mapa 0↔5, 1↔6, 2↔7, 3↔8, 4↔9 (directa y espejo).`;
  desc.appendChild(note);

  cont.classList.add("transform-output");
  cont.appendChild(desc);
}
