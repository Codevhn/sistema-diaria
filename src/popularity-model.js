/**
 * popularity-model.js — Modelo de Popularidad del Público
 *
 * Codifica el comportamiento del jugador hondureño:
 *   - Cadenas semánticas: cuando cae X, el público sale a comprar Y
 *   - Sueños populares: símbolos que disparan números específicos
 *   - "Saladitos": dobles, redondos y múltiplos de 5 que el público adora
 *   - Supersticiones: números evitados por significado cultural
 *
 * Tesis adversarial: La Diaria EVITA pagar lo que el público compra masivamente.
 *   - Popularidad alta → factor < 1 (la operadora penaliza)
 *   - Popularidad baja → factor > 1 (números "libres", más probables)
 *
 * Salida principal: Map<numero, {score:0-100, motivos[], cadenas[]}>
 *                   y popularidadAFactor() para multiplicar en signal-engine.
 */

// ─── Cadenas semánticas (Bloque 1.2) ──────────────────────────────────────────
// Cada cadena agrupa números que el público asocia entre sí culturalmente.

export const CADENAS = {
  mujer_madre:    [2, 5, 19, 42],
  muerte:         [3, 22, 40, 45, 79, 84],
  boda_novia:     [10, 14, 29, 41, 45, 75],
  animales_casa:  [4, 11, 12, 13, 85],
  fiesta:         [1, 30, 34, 54, 98],
  aves:           [18, 21, 28, 76, 89, 92],
  vejez:          [36, 80, 90, 91, 97, 99],
  dinero:         [37, 47, 74, 96],
  armas_ley:      [7, 38, 51, 57, 68, 69],
  infierno:       [58, 60, 64, 66, 67, 73],
  cocina:         [33, 39, 44, 88],
  naturaleza:     [19, 56, 59, 87],
  joyeria:        [10, 25, 70, 75, 99],
  religion:       [29, 35, 45, 65],
  transporte:     [13, 53, 94],
};

// ─── Activaciones: cuando cae N, dispara cadena/números ──────────────────────
// Estructura: { trigger: number, targets: number[], peso: 0-1, motivo }
// Extraído del Bloque 1.2 (narrativas del usuario).

export const ACTIVACIONES = [
  // Mujer / madre / niña
  { trigger: 2,  targets: [5, 19, 42],         peso: 0.8, motivo: "Cadena mujer/madre" },
  { trigger: 5,  targets: [2, 19, 42],         peso: 0.8, motivo: "Cadena mujer/madre" },
  { trigger: 19, targets: [2, 5, 42, 87],      peso: 0.7, motivo: "Niña/naturaleza" },
  { trigger: 42, targets: [2, 5, 19],          peso: 0.7, motivo: "Cadena madre" },
  // Muerte
  { trigger: 3,  targets: [22, 40, 45, 79, 84], peso: 0.9, motivo: "Cadena muerte" },
  { trigger: 22, targets: [3, 40, 79, 84],      peso: 0.85, motivo: "Cadena muerte" },
  { trigger: 40, targets: [3, 22, 79, 84],      peso: 0.85, motivo: "Cadena muerte" },
  { trigger: 79, targets: [3, 22, 40, 84],      peso: 0.85, motivo: "Cadena muerte" },
  { trigger: 84, targets: [3, 22, 40, 79],      peso: 0.85, motivo: "Cadena muerte" },
  // Boda / novia
  { trigger: 10, targets: [14, 29, 41, 45, 75], peso: 0.75, motivo: "Cadena boda/novia" },
  { trigger: 14, targets: [10, 29, 41, 75],     peso: 0.7, motivo: "Cadena boda" },
  { trigger: 29, targets: [10, 14, 41, 45, 65], peso: 0.75, motivo: "Boda/iglesia" },
  { trigger: 41, targets: [10, 14, 29, 75],     peso: 0.7, motivo: "Cadena boda" },
  { trigger: 45, targets: [3, 10, 29, 65],      peso: 0.7, motivo: "Religión/muerte" },
  { trigger: 75, targets: [10, 14, 29, 41, 99], peso: 0.7, motivo: "Anillo/joyería" },
  // Animales de casa
  { trigger: 4,  targets: [11, 12, 13, 85],     peso: 0.8, motivo: "Cadena animales" },
  { trigger: 11, targets: [4, 12, 13, 85],      peso: 0.8, motivo: "Cadena perro/animales" },
  { trigger: 12, targets: [4, 11, 13, 85],      peso: 0.75, motivo: "Cadena animales casa" },
  { trigger: 13, targets: [4, 11, 12, 53, 94],  peso: 0.7, motivo: "Animales/transporte" },
  { trigger: 85, targets: [4, 11, 12, 13],      peso: 0.75, motivo: "Cadena animales" },
  // Fiesta
  { trigger: 1,  targets: [30, 34, 54, 98],     peso: 0.7, motivo: "Cadena fiesta" },
  { trigger: 30, targets: [1, 34, 54, 98],      peso: 0.7, motivo: "Cadena fiesta/baile" },
  { trigger: 34, targets: [1, 30, 54],          peso: 0.7, motivo: "Cadena fiesta" },
  { trigger: 54, targets: [1, 30, 34, 98],      peso: 0.7, motivo: "Cadena fiesta" },
  { trigger: 98, targets: [1, 30, 54],          peso: 0.7, motivo: "Cadena fiesta" },
  // Aves
  { trigger: 18, targets: [21, 28, 76, 89, 92], peso: 0.75, motivo: "Cadena aves" },
  { trigger: 21, targets: [18, 28, 76, 89, 92], peso: 0.75, motivo: "Cadena aves" },
  { trigger: 28, targets: [18, 21, 76, 89],     peso: 0.7, motivo: "Cadena aves" },
  { trigger: 76, targets: [18, 21, 28, 89, 92], peso: 0.7, motivo: "Cadena aves" },
  { trigger: 89, targets: [18, 21, 28, 76, 92], peso: 0.7, motivo: "Cadena aves" },
  { trigger: 92, targets: [18, 21, 76, 89],     peso: 0.7, motivo: "Cadena aves" },
  // Vejez
  { trigger: 36, targets: [80, 90, 91, 97, 99], peso: 0.75, motivo: "Cadena vejez" },
  { trigger: 80, targets: [36, 90, 91, 97, 99], peso: 0.75, motivo: "Cadena vejez" },
  { trigger: 90, targets: [36, 80, 91, 99],     peso: 0.75, motivo: "Cadena vejez/redondo" },
  { trigger: 91, targets: [36, 80, 90, 97, 99], peso: 0.7, motivo: "Cadena vejez" },
  { trigger: 97, targets: [36, 80, 91, 99],     peso: 0.7, motivo: "Cadena vejez" },
  { trigger: 99, targets: [36, 80, 90, 91, 97], peso: 0.75, motivo: "Cadena vejez/joyería" },
  // Dinero
  { trigger: 37, targets: [47, 74, 96],         peso: 0.85, motivo: "Cadena dinero" },
  { trigger: 47, targets: [37, 74, 96],         peso: 0.85, motivo: "Cadena dinero" },
  { trigger: 74, targets: [37, 47, 96],         peso: 0.85, motivo: "Cadena dinero" },
  { trigger: 96, targets: [37, 47, 74],         peso: 0.85, motivo: "Cadena dinero" },
  // Armas / ley
  { trigger: 7,  targets: [38, 51, 57, 68, 69], peso: 0.7, motivo: "Cadena armas/ley" },
  { trigger: 38, targets: [7, 51, 57, 68, 69],  peso: 0.7, motivo: "Cadena armas/ley" },
  { trigger: 51, targets: [7, 38, 57, 68, 69],  peso: 0.7, motivo: "Cadena policía/ley" },
  { trigger: 57, targets: [7, 38, 51, 68, 69],  peso: 0.7, motivo: "Cadena armas" },
  { trigger: 68, targets: [7, 38, 51, 57, 69],  peso: 0.7, motivo: "Cadena armas" },
  { trigger: 69, targets: [7, 38, 51, 57, 68],  peso: 0.7, motivo: "Cadena armas/ley" },
  // Infierno / sombra
  { trigger: 58, targets: [60, 64, 66, 67, 73], peso: 0.7, motivo: "Cadena infierno" },
  { trigger: 60, targets: [58, 64, 66, 67, 73], peso: 0.7, motivo: "Cadena infierno/redondo" },
  { trigger: 64, targets: [58, 60, 66, 67, 73], peso: 0.7, motivo: "Cadena infierno" },
  { trigger: 66, targets: [58, 60, 64, 67, 73], peso: 0.7, motivo: "Cadena infierno (saladito)" },
  { trigger: 67, targets: [58, 60, 64, 66, 73], peso: 0.7, motivo: "Cadena infierno" },
  { trigger: 73, targets: [58, 60, 64, 66, 67], peso: 0.7, motivo: "Cadena infierno" },
  // Cocina
  { trigger: 33, targets: [39, 44, 88],         peso: 0.7, motivo: "Cadena cocina (saladito)" },
  { trigger: 39, targets: [33, 44, 88],         peso: 0.7, motivo: "Cadena cocina" },
  { trigger: 44, targets: [33, 39, 88],         peso: 0.7, motivo: "Cadena cocina" },
  { trigger: 88, targets: [33, 39, 44],         peso: 0.7, motivo: "Cadena cocina (saladito)" },
  // Joyería
  { trigger: 25, targets: [10, 70, 75, 99],     peso: 0.7, motivo: "Cadena joyería" },
  { trigger: 70, targets: [10, 25, 75, 99],     peso: 0.7, motivo: "Cadena joyería/redondo" },
  // Religión
  { trigger: 35, targets: [29, 45, 65],         peso: 0.7, motivo: "Cadena religión" },
  { trigger: 65, targets: [29, 35, 45],         peso: 0.7, motivo: "Cadena religión/iglesia" },
  // Transporte
  { trigger: 53, targets: [13, 94],             peso: 0.65, motivo: "Cadena transporte" },
  { trigger: 94, targets: [13, 53],             peso: 0.65, motivo: "Cadena transporte" },
  // Naturaleza
  { trigger: 56, targets: [19, 59, 87],         peso: 0.65, motivo: "Cadena naturaleza" },
  { trigger: 59, targets: [19, 56, 87],         peso: 0.65, motivo: "Cadena naturaleza" },
  { trigger: 87, targets: [19, 56, 59],         peso: 0.65, motivo: "Cadena naturaleza" },
];

// ─── Sueños populares (Bloque 4.2) ────────────────────────────────────────────
// Símbolo onírico → números que dispara
export const SUENOS = {
  agua:     [9, 23, 56, 87],
  serpiente:[14, 29, 57],
  muerto:   [3, 22, 40, 84],
  dinero:   [37, 47, 74, 96],
  boda:     [10, 14, 29, 75],
  embarazo: [2, 5, 19, 42],
  caballo:  [13, 53, 94],
  perro:    [4, 11, 12, 85],
  ave:      [18, 21, 28, 76, 89, 92],
  iglesia:  [29, 35, 45, 65],
  fuego:    [58, 60, 64, 67, 73],
  oro:      [10, 25, 70, 75, 99],
  diente:   [3, 22, 40],
};

// ─── Saladitos: el público adora estos por estética (P5.4) ────────────────────
// Dobles que el público compra mucho (excluido 44 según el usuario)
export const DOBLES_SALADITOS = [0, 11, 22, 33, 55, 66, 77, 88, 99];
// Redondos (terminan en 0)
export const REDONDOS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
// Múltiplos de 5
export const MULT5_POPULARES = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
// Evitados por superstición popular
export const EVITADOS_SUPERSTICION = [22, 66];

// ─── Cálculo de popularidad ───────────────────────────────────────────────────

/**
 * Calcula el score de popularidad (0-100) de cada número en el momento actual.
 *
 * @param {Array} sorteos - Sorteos enriquecidos (orden cronológico, último al final)
 * @param {object} opts - Opciones
 * @param {number} [opts.lookback=20] - Cuántos sorteos recientes considerar para activaciones
 * @returns {Map<number, {score:number, motivos:string[], cadenas:string[]}>}
 */
export function calcularPopularidad(sorteos = [], opts = {}) {
  const { lookback = 20 } = opts;
  const out = new Map();

  function ensure(n) {
    if (!out.has(n)) out.set(n, { score: 0, motivos: [], cadenas: new Set() });
    return out.get(n);
  }

  // 1. Base estética (saladitos, redondos, mult5)
  DOBLES_SALADITOS.forEach((n) => {
    const e = ensure(n);
    e.score += 25;
    e.motivos.push("Doble saladito");
  });
  REDONDOS.forEach((n) => {
    const e = ensure(n);
    e.score += 15;
    e.motivos.push("Redondo");
  });
  MULT5_POPULARES.forEach((n) => {
    const e = ensure(n);
    e.score += 10;
    e.motivos.push("Múltiplo de 5");
  });

  // 2. Activaciones recientes — cuando cae X, el público sale a comprar Y
  const recientes = sorteos.slice(-lookback);
  recientes.forEach((d, idx) => {
    const recencyWeight = (idx + 1) / recientes.length; // sorteos más recientes pesan más
    ACTIVACIONES.filter((a) => a.trigger === d.numero).forEach((a) => {
      a.targets.forEach((t) => {
        const e = ensure(t);
        const inc = Math.round(a.peso * recencyWeight * 30);
        e.score += inc;
        e.motivos.push(`${a.motivo} (cayó ${String(a.trigger).padStart(2, "0")})`);
      });
    });
  });

  // 3. Marcar cadenas a las que pertenece cada número
  Object.entries(CADENAS).forEach(([nombre, nums]) => {
    nums.forEach((n) => {
      const e = ensure(n);
      e.cadenas.add(nombre);
    });
  });

  // 4. Penalizar evitados por superstición (el público los compra menos)
  EVITADOS_SUPERSTICION.forEach((n) => {
    const e = ensure(n);
    e.score = Math.max(0, e.score - 20);
    e.motivos.push("Evitado por superstición (-)");
  });

  // 5. Cap a 100 y convertir Set→Array
  const final = new Map();
  out.forEach((entry, n) => {
    final.set(n, {
      score: Math.min(100, Math.max(0, entry.score)),
      motivos: entry.motivos,
      cadenas: Array.from(entry.cadenas),
    });
  });

  return final;
}

/**
 * Convierte score de popularidad (0-100) a factor multiplicativo adversarial.
 *
 *   pop = 0   → 1.35 (número "libre", la operadora puede pagarlo)
 *   pop = 50  → 1.00 (neutral)
 *   pop = 100 → 0.65 (número "caliente", la operadora lo evita)
 *
 * Curva lineal por simplicidad (se puede tunear con datos).
 */
export function popularidadAFactor(popScore = 0) {
  const p = Math.max(0, Math.min(100, popScore));
  // f(0)=1.35, f(50)=1.00, f(100)=0.65
  return 1.35 - (p / 100) * 0.7;
}

/**
 * Devuelve las cadenas activas (con al menos un trigger reciente).
 * Útil para la UI del Pulso.
 *
 * @param {Array} sorteos
 * @param {object} [opts]
 * @returns {Array<{cadena:string, triggers:number[], targets:number[]}>}
 */
export function getCadenasActivas(sorteos = [], opts = {}) {
  const { lookback = 15 } = opts;
  const recientes = sorteos.slice(-lookback);
  const numsRecientes = new Set(recientes.map((d) => d.numero));

  const activas = [];
  Object.entries(CADENAS).forEach(([nombre, nums]) => {
    const triggers = nums.filter((n) => numsRecientes.has(n));
    if (triggers.length > 0) {
      // expandir targets: todos los nums de la cadena que NO son trigger
      const targets = nums.filter((n) => !numsRecientes.has(n));
      activas.push({
        cadena: nombre,
        triggers,
        targets,
        intensidad: triggers.length / nums.length, // 0-1
      });
    }
  });

  // Más intensas primero
  activas.sort((a, b) => b.intensidad - a.intensidad);
  return activas;
}

/**
 * Devuelve top N números más populares (calientes) y menos populares (libres).
 */
export function getMercado(popMap, topN = 8) {
  const entries = Array.from(popMap.entries())
    .map(([numero, data]) => ({ numero, ...data }))
    .filter((e) => e.score > 0);

  const calientes = [...entries].sort((a, b) => b.score - a.score).slice(0, topN);
  // Para "libres" considerar TODOS los números 0-99, asignando score 0 a los faltantes
  const libres = [];
  for (let n = 0; n <= 99; n++) {
    const e = popMap.get(n);
    libres.push({ numero: n, score: e?.score || 0, motivos: e?.motivos || [], cadenas: e?.cadenas || [] });
  }
  libres.sort((a, b) => a.score - b.score);
  return { calientes, libres: libres.slice(0, topN) };
}
