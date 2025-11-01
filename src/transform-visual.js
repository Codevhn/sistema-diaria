import { GUIA, getColorPolaridad } from "./loader.js";

const MAP = { 0: 1, 1: 7, 2: 5, 3: 8, 4: 7, 5: 2, 6: 9, 7: 4, 8: 3, 9: 6 };

function convertirNumero(n) {
  const s = String(n).padStart(2, "0");
  return parseInt(`${MAP[s[0]]}${MAP[s[1]]}`, 10);
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

  const base = String(numero).padStart(2, "0");
  const infoBase = GUIA[base];
  if (!infoBase) {
    cont.innerHTML =
      "<p class='hint'>Número no encontrado en la guía de los sueños.</p>";
    return;
  }

  // Transformaciones
  const inv = invertirNumero(numero);
  const adj = ajusteNumero(numero);
  const conv = convertirNumero(numero);
  const comp = convertirNumero(adj); // conversión compuesta (ajuste convertido)

  // Información simbólica
  const datos = [
    {
      tipo: "Base",
      n: numero,
      simb: infoBase.simbolo,
      color: getColorPolaridad(numero),
    },
    {
      tipo: "Invertido",
      n: inv,
      simb: GUIA[String(inv).padStart(2, "0")]?.simbolo || "—",
      color: getColorPolaridad(inv),
    },
    {
      tipo: "Ajuste (100−n)",
      n: adj,
      simb: GUIA[String(adj).padStart(2, "0")]?.simbolo || "—",
      color: getColorPolaridad(adj),
    },
    {
      tipo: "Conversión simple",
      n: conv,
      simb: GUIA[String(conv).padStart(2, "0")]?.simbolo || "—",
      color: getColorPolaridad(conv),
    },
    {
      tipo: "Conversión compuesta",
      n: comp,
      simb: GUIA[String(comp).padStart(2, "0")]?.simbolo || "—",
      color: getColorPolaridad(comp),
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

  const step = width / (datos.length + 1);
  const cy = height / 2;

  for (let i = 0; i < datos.length; i++) {
    const { n, simb, color } = datos[i];
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
    circle.setAttribute("r", "25");
    circle.setAttribute("fill", "rgba(212,167,44,0.1)");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", "3");
    svg.appendChild(circle);

    // Número
    const t1 = document.createElementNS(svgNS, "text");
    t1.setAttribute("x", cx);
    t1.setAttribute("y", cy + 4);
    t1.setAttribute("fill", color);
    t1.setAttribute("font-size", "14");
    t1.setAttribute("text-anchor", "middle");
    t1.textContent = String(n).padStart(2, "0");
    svg.appendChild(t1);

    // Símbolo
    const t2 = document.createElementNS(svgNS, "text");
    t2.setAttribute("x", cx);
    t2.setAttribute("y", cy + 40);
    t2.setAttribute("fill", "#ccc");
    t2.setAttribute("font-size", "11");
    t2.setAttribute("text-anchor", "middle");
    t2.textContent = simb;
    svg.appendChild(t2);
  }

  // Texto descriptivo
  const desc = document.createElement("div");
  desc.className = "desc";
  desc.innerHTML = `
    <p><b>Base:</b> ${numero} ${infoBase.simbolo}</p>
    <p><b>Invertido:</b> ${String(inv).padStart(2, "0")} ${
    GUIA[String(inv).padStart(2, "0")]?.simbolo || "—"
  }</p>
    <p><b>Ajuste:</b> ${String(adj).padStart(2, "0")} ${
    GUIA[String(adj).padStart(2, "0")]?.simbolo || "—"
  }</p>
    <p><b>Conversión simple:</b> ${String(conv).padStart(2, "0")} ${
    GUIA[String(conv).padStart(2, "0")]?.simbolo || "—"
  }</p>
    <p><b>Conversión compuesta:</b> ${String(comp).padStart(2, "0")} ${
    GUIA[String(comp).padStart(2, "0")]?.simbolo || "—"
  }</p>
  `;

  cont.appendChild(svg);
  cont.appendChild(desc);
}
