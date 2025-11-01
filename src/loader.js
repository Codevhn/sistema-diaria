// loader.js — v3.3.1
export let GUIA = {};

export async function cargarGuia() {
  const res = await fetch("./data/guia_suenos.json", { cache: "no-store" });
  GUIA = await res.json();
  return GUIA;
}

export function getColorPolaridad(num) {
  // Simple: coloreo por familias “imaginarias” basadas en dígito para demo estable
  const n = parseInt(num, 10);
  if (isNaN(n)) return "#d4a72c";
  if ([1, 4, 7].includes(n % 10)) return "#48d06d"; // green
  if ([2, 5, 8].includes(n % 10)) return "#d4a72c"; // gold
  return "#e04c41"; // red
}
