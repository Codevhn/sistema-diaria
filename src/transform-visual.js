import { GUIA } from "./loader.js";
import {
  getSimpleConversions,
  getCompositeConversions,
  getEquivalencias,
} from "./conversion-engine.js";

const padNumber = (n) => String(n).padStart(2, "0");

function invertirNumero(n) {
  const s = String(n).padStart(2, "0");
  return parseInt(s.split("").reverse().join(""), 10);
}
function ajusteNumero(n) {
  return (100 - n) % 100;
}

function buildNumCard(num, { variant = null, tag = null } = {}) {
  const pad = padNumber(num);
  const sim = GUIA[pad]?.simbolo || "—";
  const card = document.createElement("div");
  card.className = "transform-number";
  if (variant) card.dataset.variant = variant;

  const img = document.createElement("img");
  img.className = "transform-number__img";
  img.alt = sim === "—" ? pad : `${pad} · ${sim}`;
  img.src = `data/img/${pad}.png`;
  img.addEventListener("error", function onErr() {
    img.removeEventListener("error", onErr);
    img.src = `data/img/${pad}.jpg`;
    img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
  }, { once: true });
  card.appendChild(img);

  const numEl = document.createElement("span");
  numEl.className = "transform-number__num";
  numEl.textContent = pad;
  card.appendChild(numEl);

  const symEl = document.createElement("span");
  symEl.className = "transform-number__sim";
  symEl.textContent = sim;
  card.appendChild(symEl);

  if (tag) {
    const badge = document.createElement("span");
    badge.className = "transform-number__badge";
    badge.textContent = tag;
    card.appendChild(badge);
  }
  return card;
}

function buildRow(label, valores, variant) {
  const row = document.createElement("div");
  row.className = "transform-group";
  const lbl = document.createElement("b");
  lbl.textContent = label;
  row.appendChild(lbl);

  const wrap = document.createElement("div");
  wrap.className = "transform-group__cards";
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

  // Contenedor de resultados
  const desc = document.createElement("div");
  desc.className = "transform-results";

  // Base — destacada
  const baseRow = document.createElement("div");
  baseRow.className = "transform-group transform-group--base";
  const baseLbl = document.createElement("b");
  baseLbl.textContent = "Base";
  baseRow.appendChild(baseLbl);
  const baseWrap = document.createElement("div");
  baseWrap.className = "transform-group__cards";
  baseWrap.appendChild(buildNumCard(numero, { variant: "base" }));
  baseRow.appendChild(baseWrap);
  desc.appendChild(baseRow);

  // Filas de transformaciones
  desc.appendChild(buildRow("Invertido", [inv], "inverted"));
  desc.appendChild(buildRow("Ajuste (100−n)", [adj], "adjusted"));
  desc.appendChild(buildRow("Conversión simple", simpleConversions, "simple"));
  desc.appendChild(buildRow("Conversión compuesta", compositeConversions, "composite"));
  desc.appendChild(buildRow("Equivalencias", equivalencias, "equivalent"));

  cont.appendChild(desc);
}
