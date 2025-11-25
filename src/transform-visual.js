import { GUIA, getColorPolaridad } from "./loader.js";
import {
  CONVERSION_MAP_NOTE,
  getSimpleConversions,
  getCompositeConversions,
} from "./conversion-map.js";

const padNumber = (n) => String(n).padStart(2, "0");

function hexToRgb(hex) {
  if (!hex) return { r: 212, g: 167, b: 44 };
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  const num = parseInt(value, 16);
  if (Number.isNaN(num)) return { r: 212, g: 167, b: 44 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function colorWithAlpha(hex, alpha = 0.25) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function invertirNumero(n) {
  const s = String(n).padStart(2, "0");
  return parseInt(s.split("").reverse().join(""), 10);
}
function ajusteNumero(n) {
  return (100 - n) % 100;
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

  // Información simbólica
  const datos = [
    {
      tipo: "Base",
      valores: [numero],
    },
    {
      tipo: "Invertido",
      valores: [inv],
    },
    {
      tipo: "Ajuste (100−n)",
      valores: [adj],
    },
    {
      tipo: "Conversión simple",
      valores: simpleConversions,
    },
    {
      tipo: "Conversión compuesta",
      valores: compositeConversions,
    },
  ];

  // Crear SVG visual
  const svgNS = "http://www.w3.org/2000/svg";
  const width = 620;
  const height = 120;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("trans-svg");

  const defs = document.createElementNS(svgNS, "defs");
  const filter = document.createElementNS(svgNS, "filter");
  filter.setAttribute("id", "trans-glow");
  filter.setAttribute("x", "-30%");
  filter.setAttribute("y", "-30%");
  filter.setAttribute("width", "160%");
  filter.setAttribute("height", "160%");
  const blur = document.createElementNS(svgNS, "feGaussianBlur");
  blur.setAttribute("stdDeviation", "6");
  blur.setAttribute("result", "coloredBlur");
  filter.appendChild(blur);
  const merge = document.createElementNS(svgNS, "feMerge");
  const mergeNode1 = document.createElementNS(svgNS, "feMergeNode");
  mergeNode1.setAttribute("in", "coloredBlur");
  const mergeNode2 = document.createElementNS(svgNS, "feMergeNode");
  mergeNode2.setAttribute("in", "SourceGraphic");
  merge.appendChild(mergeNode1);
  merge.appendChild(mergeNode2);
  filter.appendChild(merge);
  defs.appendChild(filter);
  svg.appendChild(defs);

  const step = width / (datos.length + 1);
  const cy = height / 2;

  for (let i = 0; i < datos.length; i++) {
    const valores = datos[i].valores || [];
    const hasValores = valores.length > 0;
    const primary = hasValores ? valores[0] : null;
    const nStr = hasValores ? padNumber(primary) : "--";
    const simb =
      hasValores ? GUIA[padNumber(primary)]?.simbolo || "—" : "—";
    const color = hasValores ? getColorPolaridad(primary) : "#555";
    const cx = step * (i + 1);

    // Línea hacia el siguiente
    if (i < datos.length - 1) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", cx + 30);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", cx + step - 30);
      line.setAttribute("y2", cy);
      line.setAttribute("stroke", "#d4a72c");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);
    }

    // Círculo
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", "32");
    circle.setAttribute("fill", colorWithAlpha(color, 0.2));
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", "4");
    circle.setAttribute("filter", "url(#trans-glow)");
    svg.appendChild(circle);

    // Número
    const t1 = document.createElementNS(svgNS, "text");
    t1.setAttribute("x", cx);
    t1.setAttribute("y", cy + 4);
    t1.setAttribute("fill", color);
    t1.setAttribute("font-size", "20");
    t1.setAttribute("text-anchor", "middle");
    t1.textContent = nStr;
    svg.appendChild(t1);

    // Símbolo
    const t2 = document.createElementNS(svgNS, "text");
    t2.setAttribute("x", cx);
    t2.setAttribute("y", cy + 48);
    t2.setAttribute("fill", "#ccc");
    t2.setAttribute("font-size", "11");
    t2.setAttribute("text-anchor", "middle");
    t2.textContent = simb;
    svg.appendChild(t2);

    if (hasValores && valores.length > 1) {
      const badge = document.createElementNS(svgNS, "text");
      badge.setAttribute("x", cx);
      badge.setAttribute("y", cy - 32);
      badge.setAttribute("fill", "#d4a72c");
      badge.setAttribute("font-size", "10");
      badge.setAttribute("text-anchor", "middle");
      badge.textContent = `+${valores.length - 1}`;
      svg.appendChild(badge);
    }
  }

  // Texto descriptivo
  const desc = document.createElement("div");
  desc.className = "desc trans-desc";

  const formatChip = (value) => {
    if (value === null || typeof value === "undefined") return "";
    const color = getColorPolaridad(value);
    const bg = colorWithAlpha(color, 0.18);
    const border = colorWithAlpha(color, 0.8);
    const info = GUIA[padNumber(value)]?.simbolo || "—";
    return `
      <span class="trans-chip" style="--chip-bg:${bg};--chip-border:${border};--chip-color:${color}">
        <strong>${padNumber(value)}</strong>
        <small>${info}</small>
      </span>
    `;
  };

  const describe = (label, values) => {
    if (!values.length) {
      return `<div class="trans-row"><b>${label}</b><span class="muted">—</span></div>`;
    }
    const chips = values.map(formatChip).join("");
    return `<div class="trans-row"><b>${label}</b><span class="trans-chip-wrap">${chips}</span></div>`;
  };

  desc.innerHTML = [
    describe("Base", [numero]),
    describe("Invertido", [inv]),
    describe("Ajuste (100−n)", [adj]),
    describe("Conversión simple", simpleConversions),
    describe("Conversión compuesta", compositeConversions),
    `<p class="trans-note">${CONVERSION_MAP_NOTE}. La conversión simple aplica el mapa a un solo dígito y la compuesta a ambos, considerando también el espejo.</p>`,
  ].join("");

  cont.classList.add("transform-output");
  cont.appendChild(svg);
  cont.appendChild(desc);
}
