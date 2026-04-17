/**
 * popularity-calendar.js
 *
 * Modela el comportamiento adversarial de La Diaria respecto a fechas culturales:
 *  - Bloquea (esconde) ciertos números en ventanas amplias antes/después de fechas patrias
 *  - Evade números cuyo valor coincide con el día del mes (16 Niña en día 16) y los tira
 *    en días adyacentes (15 o 17)
 *
 * Este módulo NO predice por sí solo: produce penalizaciones y boosts que el signal-engine
 * agrega a su score final. Cada efecto trae una etiqueta legible para mostrar en UI.
 *
 * Fuente de datos: cuestionario completado por el usuario (operador hondureño con
 * observación directa del mercado). Las ventanas reflejan que los números patrios
 * "se pierden por meses" antes del evento (Bloque 3.2 / 5.4 del cuestionario).
 */

import { parseDrawDate } from "./date-utils.js";

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de eventos hondureños
//   - resolveDate(year): YYYY-MM-DD para ese año
//   - numeros: lista [{ n, intensidad: 0..1 }] del nivel de evitación esperado
//   - preDias: cuántos días ANTES del evento empieza el bloqueo
//   - postDias: cuántos días DESPUÉS del evento se mantiene
//   - shape: "trapecio" (sube hasta el día, mantiene, baja) | "campana" (gauss-like)
// ─────────────────────────────────────────────────────────────────────────────

function nthWeekdayOfMonth(year, monthIdx, weekday, n) {
  // n=2, weekday=0 → segundo domingo del mes
  const first = new Date(year, monthIdx, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fixedDate(year, monthIdx, day) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const EVENTOS_HONDURAS = [
  {
    id: "mujer_hondurena",
    label: "Día de la Mujer Hondureña",
    resolveDate: (y) => fixedDate(y, 0, 25),
    numeros: [{ n: 2, intensidad: 0.7 }],
    preDias: 60,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "virgen",
    label: "Día de la Virgen (3 feb)",
    resolveDate: (y) => fixedDate(y, 1, 3),
    numeros: [{ n: 35, intensidad: 0.6 }],
    preDias: 45,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "padre",
    label: "Día del Padre (19 mar)",
    resolveDate: (y) => fixedDate(y, 2, 19),
    numeros: [{ n: 29, intensidad: 0.7 }],
    preDias: 45,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "madre",
    label: "Día de la Madre (2do dom de mayo)",
    resolveDate: (y) => nthWeekdayOfMonth(y, 4, 0, 2),
    numeros: [
      { n: 42, intensidad: 0.85 },
      { n: 2,  intensidad: 0.5 },
      { n: 5,  intensidad: 0.45 },
    ],
    preDias: 60,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "trabajador",
    label: "Día del Trabajador (1 may)",
    resolveDate: (y) => fixedDate(y, 4, 1),
    numeros: [], // sin número simbólico claro; se mantiene como ancla cultural
    preDias: 0,
    postDias: 0,
    shape: "trapecio",
  },
  {
    id: "arbol",
    label: "Día del Árbol (30 may)",
    resolveDate: (y) => fixedDate(y, 4, 30),
    numeros: [{ n: 56, intensidad: 0.6 }],
    preDias: 30,
    postDias: 10,
    shape: "trapecio",
  },
  {
    id: "estudiante",
    label: "Día del Estudiante (11 jun)",
    resolveDate: (y) => fixedDate(y, 5, 11),
    numeros: [{ n: 82, intensidad: 0.55 }],
    preDias: 30,
    postDias: 10,
    shape: "trapecio",
  },
  {
    id: "bandera_nacional",
    label: "Día de la Bandera Nacional (1 sep)",
    resolveDate: (y) => fixedDate(y, 8, 1),
    numeros: [{ n: 26, intensidad: 0.7 }],
    preDias: 60,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "nino",
    label: "Día del Niño (10 sep)",
    resolveDate: (y) => fixedDate(y, 8, 10),
    numeros: [{ n: 16, intensidad: 0.7 }],
    preDias: 45,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "independencia",
    label: "Día de la Independencia (15 sep)",
    resolveDate: (y) => fixedDate(y, 8, 15),
    numeros: [
      { n: 15, intensidad: 0.85 },
      { n: 26, intensidad: 0.7 },
    ],
    preDias: 90, // confirmado por usuario: "se pierde desde muchos meses atrás"
    postDias: 21,
    shape: "trapecio",
  },
  {
    id: "maestro",
    label: "Día del Maestro (17 sep)",
    resolveDate: (y) => fixedDate(y, 8, 17),
    numeros: [{ n: 82, intensidad: 0.55 }],
    preDias: 30,
    postDias: 10,
    shape: "trapecio",
  },
  {
    id: "soldado",
    label: "Día del Soldado (3 oct)",
    resolveDate: (y) => fixedDate(y, 9, 3),
    numeros: [{ n: 69, intensidad: 0.6 }],
    preDias: 45,
    postDias: 14,
    shape: "trapecio",
  },
  {
    id: "raza_bandera",
    label: "Día de la Raza / Bandera (12 oct)",
    resolveDate: (y) => fixedDate(y, 9, 12),
    numeros: [{ n: 26, intensidad: 0.55 }],
    preDias: 30,
    postDias: 10,
    shape: "trapecio",
  },
  {
    id: "ffaa",
    label: "Día de las FFAA (21 oct)",
    resolveDate: (y) => fixedDate(y, 9, 21),
    numeros: [{ n: 69, intensidad: 0.55 }],
    preDias: 30,
    postDias: 10,
    shape: "trapecio",
  },
  {
    id: "navidad",
    label: "Navidad / Año Nuevo",
    resolveDate: (y) => fixedDate(y, 11, 25),
    numeros: [
      { n: 24, intensidad: 0.85 }, // Sapo
      { n: 25, intensidad: 0.65 }, // Balanza
      { n: 31, intensidad: 0.85 }, // Alacrán
    ],
    preDias: 90, // confirmado por usuario: "se pierden desde varios meses antes"
    postDias: 30, // se mantiene escondido durante el período de fin de año
    shape: "trapecio",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Forma de la curva de penalización en función de los días al evento
// ─────────────────────────────────────────────────────────────────────────────

function intensidadEnVentana(diasAlEvento, preDias, postDias, shape = "trapecio") {
  // diasAlEvento: positivo = días que faltan; negativo = días después
  if (diasAlEvento > preDias || -diasAlEvento > postDias) return 0;

  if (shape === "campana") {
    const sigma = Math.max(7, (preDias + postDias) / 4);
    return Math.exp(-(diasAlEvento * diasAlEvento) / (2 * sigma * sigma));
  }

  // trapecio: sube linealmente desde el borde, plateau cerca del evento (±7d), baja luego
  const mesetaPre  = Math.min(7, preDias / 4);
  const mesetaPost = Math.min(7, postDias / 4);

  if (diasAlEvento <= mesetaPre && diasAlEvento >= -mesetaPost) {
    return 1.0; // plateau
  }
  if (diasAlEvento > mesetaPre) {
    // subida: de 0 (en preDias) a 1 (en mesetaPre)
    const span = preDias - mesetaPre;
    if (span <= 0) return 1.0;
    return Math.max(0, 1 - (diasAlEvento - mesetaPre) / span);
  }
  // bajada post-evento
  const span = postDias - mesetaPost;
  if (span <= 0) return 1.0;
  return Math.max(0, 1 - (-diasAlEvento - mesetaPost) / span);
}

// ─────────────────────────────────────────────────────────────────────────────
// API principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el listado de efectos de calendario activos para una fecha de sorteo dada.
 * Cada efecto: { numero, factor: 0..1 (multiplicar score), motivo: string, tipo: "penalizacion"|"boost" }
 *
 * factor < 1 → penalización (reduce score)
 * factor > 1 → boost (aumenta score)
 *
 * @param {string|Date} fechaSorteo - fecha del próximo sorteo
 * @returns {Array<{numero:number, factor:number, motivo:string, tipo:string}>}
 */
export function getEfectosCalendario(fechaSorteo) {
  const f = parseDrawDate(fechaSorteo);
  if (!f) return [];

  const efectos = [];
  const yearActual = f.getFullYear();
  const yearPrev = yearActual - 1;
  const yearNext = yearActual + 1;
  const todayMs = f.getTime();

  // ── 1. Bloqueo por fechas patrias ──
  for (const evento of EVENTOS_HONDURAS) {
    if (!evento.numeros.length) continue;

    // Considerar el evento de este año, anterior (para ventana post) y siguiente (para ventana pre)
    for (const y of [yearPrev, yearActual, yearNext]) {
      const fechaEventoStr = evento.resolveDate(y);
      const fechaEvento = parseDrawDate(fechaEventoStr);
      if (!fechaEvento) continue;
      const diasAlEvento = Math.round((fechaEvento.getTime() - todayMs) / DAY_MS);

      // Especial: Navidad/Año Nuevo abarca también la ventana hasta el 1 de enero siguiente.
      // El postDias=30 ya cubre hasta ~24 ene, no necesita lógica extra.

      const intensidadPos = intensidadEnVentana(diasAlEvento, evento.preDias, evento.postDias, evento.shape);
      if (intensidadPos <= 0) continue;

      for (const { n, intensidad } of evento.numeros) {
        const fuerza = intensidad * intensidadPos; // 0..1
        // Factor de score: 1 → sin efecto, 0.2 → reduce a 20% (fuerte bloqueo)
        const factor = 1 - fuerza * 0.65; // máximo descuento 65%
        const distLabel = diasAlEvento > 0
          ? `faltan ${diasAlEvento}d`
          : diasAlEvento === 0
            ? `hoy es el día`
            : `pasaron ${-diasAlEvento}d`;
        efectos.push({
          numero: n,
          factor,
          tipo: "penalizacion",
          motivo: `La Diaria esconde el ${String(n).padStart(2, "0")} cerca de ${evento.label} (${distLabel}, fuerza ${(fuerza * 100).toFixed(0)}%)`,
          eventoId: evento.id,
        });
      }
    }
  }

  // ── 2. Evasión por adyacencia de día del mes ──
  // Si hoy es día D, La Diaria evita tirar el número D y prefiere D±1
  const dayOfMonth = f.getDate();

  // Penalización al número que coincide con el día (solo aplica para 1..31)
  if (dayOfMonth >= 1 && dayOfMonth <= 31) {
    efectos.push({
      numero: dayOfMonth,
      factor: 0.55, // -45% peso
      tipo: "penalizacion",
      motivo: `La Diaria evita tirar el ${String(dayOfMonth).padStart(2, "0")} en el día ${dayOfMonth} del mes (jugada masiva por coincidencia)`,
      eventoId: "adyacencia_dia",
    });
  }

  // Boost a los números D-1 y D+1 (los adyacentes)
  for (const offset of [-1, 1]) {
    const target = dayOfMonth + offset;
    if (target < 0 || target > 99) continue;
    if (target === dayOfMonth) continue;
    efectos.push({
      numero: target,
      factor: 1.25, // +25% peso
      tipo: "boost",
      motivo: `Día adyacente: La Diaria suele tirar el ${String(target).padStart(2, "0")} cerca del día ${dayOfMonth} (estrategia de evasión ±1)`,
      eventoId: "adyacencia_dia",
    });
  }

  return efectos;
}

/**
 * Resumen para UI: agrupa efectos por número y devuelve algo plano para mostrar.
 * @param {string|Date} fechaSorteo
 * @returns {Map<number, {factor:number, motivos:string[], tipos:Set<string>}>}
 */
export function getEfectosCalendarioPorNumero(fechaSorteo) {
  const efectos = getEfectosCalendario(fechaSorteo);
  const mapa = new Map();
  for (const ef of efectos) {
    const prev = mapa.get(ef.numero) || { factor: 1, motivos: [], tipos: new Set() };
    prev.factor *= ef.factor;
    prev.motivos.push(ef.motivo);
    prev.tipos.add(ef.tipo);
    mapa.set(ef.numero, prev);
  }
  return mapa;
}

/**
 * Lista los eventos próximos en una ventana de N días (para mostrar al usuario).
 * @param {string|Date} fechaSorteo
 * @param {number} ventanaDias - cuántos días mirar hacia adelante
 * @returns {Array<{label:string, fecha:string, diasFaltan:number, numeros:number[]}>}
 */
export function getEventosProximos(fechaSorteo, ventanaDias = 120) {
  const f = parseDrawDate(fechaSorteo);
  if (!f) return [];
  const todayMs = f.getTime();
  const lista = [];
  const year = f.getFullYear();

  for (const evento of EVENTOS_HONDURAS) {
    if (!evento.numeros.length) continue;
    for (const y of [year, year + 1]) {
      const fechaEventoStr = evento.resolveDate(y);
      const fechaEvento = parseDrawDate(fechaEventoStr);
      if (!fechaEvento) continue;
      const diasFaltan = Math.round((fechaEvento.getTime() - todayMs) / DAY_MS);
      if (diasFaltan < 0 || diasFaltan > ventanaDias) continue;
      lista.push({
        id: evento.id,
        label: evento.label,
        fecha: fechaEventoStr,
        diasFaltan,
        numeros: evento.numeros.map(x => x.n),
      });
    }
  }
  return lista.sort((a, b) => a.diasFaltan - b.diasFaltan);
}
