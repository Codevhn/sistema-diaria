/**
 * digit-cluster-detector.js — Detector de clusters de dígitos activos
 *
 * Tesis: La Diaria a veces "mina" un conjunto pequeño de dígitos por varios
 * sorteos seguidos. Ej.: 09, 91, 16, 60, 61, 90, 06 comparten {0,1,6,9}.
 * Cuando un cluster está activo, los próximos sorteos tenderán a salir del
 * mismo universo combinatorio.
 *
 * Estrategia:
 *   1. Tomar los últimos N sorteos
 *   2. Para cada subconjunto candidato de dígitos (tamaño 2 a 5), calcular
 *      cobertura: % de sorteos cuyos DOS dígitos están en el subconjunto
 *   3. Reportar los clusters con cobertura ≥ umbral
 *   4. Generar todas las combinaciones del cluster (incluido espejos y dobles)
 *      para boostear como candidatos
 */

const PAD = (n) => String(n).padStart(2, "0");

function digitsOf(n) {
  const s = PAD(n);
  return [parseInt(s[0], 10), parseInt(s[1], 10)];
}

/** Genera todos los subconjuntos de tamaño k de [0..9] */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...tail] = arr;
  const withHead = combinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

/**
 * Cuenta cuántos números del array tienen ambos dígitos dentro del set.
 */
function cobertura(numeros, digitSet) {
  const set = new Set(digitSet);
  let hits = 0;
  numeros.forEach((n) => {
    const [d0, d1] = digitsOf(n);
    if (set.has(d0) && set.has(d1)) hits++;
  });
  return { hits, ratio: numeros.length ? hits / numeros.length : 0 };
}

/**
 * Genera todos los números 0-99 cuyos dos dígitos están en el set.
 */
export function numerosDelCluster(digitSet) {
  const set = new Set(digitSet);
  const out = [];
  for (let n = 0; n <= 99; n++) {
    const [d0, d1] = digitsOf(n);
    if (set.has(d0) && set.has(d1)) out.push(n);
  }
  return out;
}

/**
 * Detecta clusters de dígitos activos en los últimos sorteos.
 *
 * @param {Array} draws - Sorteos enriquecidos (orden cronológico)
 * @param {object} opts
 * @param {number} [opts.lookback=12] - Cuántos sorteos analizar
 * @param {number} [opts.umbralRatio=0.65] - Cobertura mínima para reportar
 * @param {number} [opts.minK=2] - Tamaño mínimo del cluster
 * @param {number} [opts.maxK=5] - Tamaño máximo del cluster
 * @returns {Array<{digitos:number[], cobertura:number, hits:number, total:number, sorteos:number[], score:number}>}
 */
export function detectarClusters(draws = [], opts = {}) {
  const { lookback = 12, umbralRatio = 0.65, minK = 2, maxK = 5 } = opts;
  const recientes = draws.slice(-lookback);
  const numeros = recientes.map((d) => d.numero).filter((n) => Number.isFinite(n));
  if (numeros.length < 4) return [];

  // Solo evaluamos clusters formados por dígitos que REALMENTE aparecen
  const digitosUsados = new Set();
  numeros.forEach((n) => {
    const [d0, d1] = digitsOf(n);
    digitosUsados.add(d0);
    digitosUsados.add(d1);
  });
  const universo = Array.from(digitosUsados).sort((a, b) => a - b);

  const candidatos = [];
  for (let k = minK; k <= Math.min(maxK, universo.length); k++) {
    const combos = combinations(universo, k);
    combos.forEach((set) => {
      const { hits, ratio } = cobertura(numeros, set);
      if (ratio < umbralRatio) return;
      // Score: combina cobertura con eficiencia (cluster pequeño = mejor)
      const eficiencia = 1 - (k / 10);
      const score = ratio * 0.7 + eficiencia * 0.3;
      candidatos.push({
        digitos: set,
        cobertura: ratio,
        hits,
        total: numeros.length,
        sorteos: numeros.filter((n) => {
          const [d0, d1] = digitsOf(n);
          return set.includes(d0) && set.includes(d1);
        }),
        score,
        k,
      });
    });
  }

  // Eliminar redundancias: si dos clusters tienen el mismo hits y uno es
  // subconjunto del otro, conservar el más pequeño.
  candidatos.sort((a, b) => b.score - a.score || a.k - b.k);
  const filtrados = [];
  candidatos.forEach((c) => {
    const dominado = filtrados.some((f) =>
      f.hits >= c.hits &&
      f.digitos.every((d) => c.digitos.includes(d)) &&
      f.k <= c.k
    );
    if (!dominado) filtrados.push(c);
  });

  return filtrados.slice(0, 5);
}

/**
 * Nul-model Monte Carlo para clusters.
 *
 * El detector selecciona post-hoc el subconjunto de dígitos que MAXIMIZA la
 * cobertura sobre los mismos sorteos que mide — con ~252 candidatos, alcanzar
 * 65% de cobertura por puro azar es normal. Aquí se simula el MISMO pipeline
 * de selección sobre sorteos uniformes (misma n) y se obtiene la distribución
 * nula del estadístico "mejor cobertura". Un cluster solo es señal real si
 * supera esa distribución.
 *
 * @returns {{clusters:Array, umbralNulo:number, alpha:number, suficiente:boolean}}
 *          cada cluster gana pValor (empírico) y significativo (boolean).
 */
export function validarClustersConNulo(draws = [], opts = {}) {
  const {
    lookback = 12,
    minK = 2,
    maxK = 5,
    umbralRatio = 0.65,
    iteraciones = 300,
    alpha = 0.05,
    seed,
  } = opts;
  const recientes = draws.slice(-lookback);
  const numeros = recientes.map((d) => d.numero).filter((n) => Number.isFinite(n));
  if (numeros.length < 4) return { clusters: [], umbralNulo: null, suficiente: false };

  let rng = Math.random;
  if (seed !== undefined) {
    let a = seed >>> 0;
    rng = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const mejorCobertura = (nums) => {
    const usados = new Set();
    nums.forEach((n) => {
      const [d0, d1] = digitsOf(n);
      usados.add(d0);
      usados.add(d1);
    });
    const universo = Array.from(usados);
    let mejor = 0;
    for (let k = minK; k <= Math.min(maxK, universo.length); k += 1) {
      combinations(universo, k).forEach((set) => {
        const r = cobertura(nums, set).ratio;
        if (r > mejor) mejor = r;
      });
    }
    return mejor;
  };

  const nulas = [];
  for (let i = 0; i < iteraciones; i += 1) {
    const sim = Array.from({ length: numeros.length }, () => Math.floor(rng() * 100));
    nulas.push(mejorCobertura(sim));
  }
  nulas.sort((a, b) => a - b);
  const pIdx = Math.max(0, Math.min(nulas.length - 1, Math.ceil((1 - alpha) * nulas.length) - 1));
  const umbralNulo = nulas[pIdx];

  const clusters = detectarClusters(draws, { lookback, umbralRatio, minK, maxK })
    .map((c) => ({
      ...c,
      pValor: nulas.filter((v) => v >= c.cobertura).length / nulas.length,
    }))
    .map((c) => ({ ...c, significativo: c.cobertura > umbralNulo }));

  return { clusters, umbralNulo, alpha, iteraciones, suficiente: true };
}

/**
 * Para cada número 0-99, devuelve el "score de cluster" (peso) basado en
 * los clusters activos. Si pertenece al cluster más fuerte, peso alto.
 *
 * @param {Array} clusters - resultado de detectarClusters
 * @returns {Map<number, {peso:number, clusterRank:number, digitos:number[]}>}
 */
export function pesoPorCluster(clusters = []) {
  const out = new Map();
  clusters.forEach((c, idx) => {
    const factor = 1 / (idx + 1); // primer cluster pesa 1.0, segundo 0.5, etc.
    const nums = numerosDelCluster(c.digitos);
    nums.forEach((n) => {
      const peso = c.score * factor;
      const cur = out.get(n);
      if (!cur || peso > cur.peso) {
        out.set(n, { peso, clusterRank: idx, digitos: c.digitos.slice() });
      }
    });
  });
  return out;
}
