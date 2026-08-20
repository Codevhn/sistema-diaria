/**
 * signal/rezago.js — Análisis de rezago / ciclo en días reales
 *
 * Función pura: calcularRezago(draws) → Map<number, RezagoInfo>
 * Sin dependencias de DB ni de otros motores.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REZAGO_VENTANA_DIAS = 180;
const REZAGO_MIN_APARICIONES = 4;

const HORARIO_REAL_MS = {
  "11AM": 11 * 3600000,
  "12PM": 12 * 3600000,
  "3PM": 15 * 3600000,
  "6PM": 18 * 3600000,
  "9PM": 21 * 3600000,
};

/**
 * Calcula el rezago de cada número usando días reales y una ventana de 180 días.
 *
 * Estados:
 *   "reciente"     — cayó hace ≤3 días
 *   "normal"       — dentro del rango esperado (zScore < 0.5)
 *   "en_ventana"   — comenzando a entrar en su zona de aparición (0.5 ≤ z < 2.0)
 *   "vencido"      — lleva mucho más de lo normal sin caer (z ≥ 2.0)
 *   "ausente"      — no apareció en la ventana de análisis
 *   "insuficiente" — apareció pero muy pocas veces para calcular ciclo confiable
 */
export function calcularRezago(draws) {
  const ahora = Date.now();
  const ventanaMs = REZAGO_VENTANA_DIAS * DAY_MS;
  const corte = ahora - ventanaMs;

  const porNumero = new Map();
  draws.forEach((d) => {
    const baseTs = d.fechaDate ? d.fechaDate.getTime() : 0;
    const ts = baseTs ? baseTs + (HORARIO_REAL_MS[d.horario] ?? 12 * 3600000) : 0;
    if (!ts) return;
    if (!porNumero.has(d.numero)) porNumero.set(d.numero, { enVentana: [], ultima: 0 });
    const entry = porNumero.get(d.numero);
    if (ts > entry.ultima) entry.ultima = ts;
    if (ts >= corte) entry.enVentana.push(ts);
  });

  const resultado = new Map();

  for (let n = 0; n <= 99; n++) {
    const entry = porNumero.get(n);

    if (!entry) {
      resultado.set(n, { estado: "ausente", diasDesdeUltima: null, ultimaMs: null, cicloPromedio: null, zScore: null });
      continue;
    }

    const diasDesdeUltima = entry.ultima
      ? Math.floor((ahora - entry.ultima) / DAY_MS)
      : null;

    if (diasDesdeUltima !== null && diasDesdeUltima <= 3) {
      resultado.set(n, { estado: "reciente", diasDesdeUltima, ultimaMs: entry.ultima, cicloPromedio: null, zScore: null, ultimaFecha: entry.ultima });
      continue;
    }

    const apariciones = entry.enVentana.sort((a, b) => a - b);

    if (apariciones.length < REZAGO_MIN_APARICIONES) {
      resultado.set(n, {
        estado: diasDesdeUltima !== null && diasDesdeUltima <= REZAGO_VENTANA_DIAS ? "insuficiente" : "ausente",
        diasDesdeUltima,
        ultimaMs: entry.ultima,
        cicloPromedio: null,
        zScore: null,
        ultimaFecha: entry.ultima,
      });
      continue;
    }

    const gaps = [];
    for (let i = 1; i < apariciones.length; i++) {
      gaps.push((apariciones[i] - apariciones[i - 1]) / DAY_MS);
    }

    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + Math.pow(g - mean, 2), 0) / gaps.length;
    const std = Math.sqrt(variance) || 1;
    const zScore = diasDesdeUltima !== null ? (diasDesdeUltima - mean) / std : 0;

    let estado;
    if (zScore >= 2.0) estado = "vencido";
    else if (zScore >= 0.5) estado = "en_ventana";
    else estado = "normal";

    resultado.set(n, {
      estado,
      diasDesdeUltima,
      ultimaMs: entry.ultima,
      cicloPromedio: Math.round(mean * 10) / 10,
      cicloStd: Math.round(std * 10) / 10,
      zScore: Math.round(zScore * 100) / 100,
      aparicionesEnVentana: apariciones.length,
      ultimaFecha: entry.ultima,
    });
  }

  return resultado;
}
