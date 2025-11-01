import { DB } from "./storage.js";
import { GUIA } from "./loader.js";

export async function detectarPatrones({ cantidad = 9 } = {}) {
  const draws = await DB.listDraws({ excludeTest: true });
  if (!draws.length) return { mensaje: "No hay sorteos suficientes." };

  const recientes = draws.slice(-cantidad);
  const stats = { familias: {}, polaridades: { positiva: 0, neutra: 0, negativa: 0 }, total: recientes.length };

  for (const d of recientes) {
    const key = String(d.numero).padStart(2, "0");
    const info = GUIA[key];
    if (!info) continue;
    stats.familias[info.familia] = (stats.familias[info.familia] || 0) + 1;
    if (info.polaridad) stats.polaridades[info.polaridad]++;
  }

  const familiaDominante = Object.entries(stats.familias).sort((a,b)=>b[1]-a[1])[0]?.[0] || "sin datos";
  const { positiva, neutra, negativa } = stats.polaridades;
  const totalPolar = positiva + neutra + negativa;
  const score = totalPolar>0 ? (positiva - negativa) / totalPolar : 0;

  let energia = "neutral";
  if (score > 0.4) energia = "positiva";
  else if (score < -0.4) energia = "negativa";

  const mensaje = `En los últimos ${stats.total} sorteos predomina la familia "${familiaDominante}" con ` +
    (energia==="positiva" ? "energía ascendente y favorable." : energia==="negativa" ? "tendencia de contracción o bloqueo." : "neutralidad o transición.") +
    ` Polaridad: ${positiva} positivas, ${neutra} neutras y ${negativa} negativas.`;

  return { recientes, stats, familiaDominante, energia, mensaje, score };
}
