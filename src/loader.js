// loader.js — v3.3.1
export let GUIA = {};

const DATA_URL = "./data/guia_suenos.json";

async function fetchGuideData() {
  if (typeof fetch !== "function") {
    throw new Error("fetch API no disponible en este entorno");
  }
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Error ${response.status} al leer ${DATA_URL}`);
  }
  return response.json();
}

export async function cargarGuia() {
  try {
    GUIA = await fetchGuideData();
    return GUIA;
  } catch (err) {
    console.error("[loader] No se pudo cargar guia_suenos.json", err);
    GUIA = {};
    throw err;
  }
}

export function getColorPolaridad(num) {
  // Simple: coloreo por familias “imaginarias” basadas en dígito para demo estable
  const n = parseInt(num, 10);
  if (isNaN(n)) return "#d4a72c";
  if ([1, 4, 7].includes(n % 10)) return "#48d06d"; // green
  if ([2, 5, 8].includes(n % 10)) return "#d4a72c"; // gold
  return "#e04c41"; // red
}
