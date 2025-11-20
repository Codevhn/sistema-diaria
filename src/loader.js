// loader.js — guía de sueños
import { loadGuide } from "./guia.js";

export let GUIA = {};

export async function cargarGuia() {
  try {
    GUIA = await loadGuide();
    return GUIA;
  } catch (err) {
    console.error("[loader] No se pudo cargar guia_suenos.json", err);
    GUIA = {};
    throw err;
  }
}

export { loadGuide };

export function getColorPolaridad(num) {
  // Simple: coloreo por familias “imaginarias” basadas en dígito para demo estable
  const n = parseInt(num, 10);
  if (isNaN(n)) return "#d4a72c";
  if ([1, 4, 7].includes(n % 10)) return "#48d06d"; // green
  if ([2, 5, 8].includes(n % 10)) return "#d4a72c"; // gold
  return "#e04c41"; // red
}
