/**
 * randomness-audit.js — Test de aleatoriedad global del histórico
 *
 * Valida (o refuta) la premisa central del sistema: que La Diaria NO es
 * un sorteo uniforme e independiente. Si todos estos tests salen limpios,
 * los "patrones" que detectan los motores son, con alta probabilidad, ruido.
 *
 * Batería:
 *   1. Chi² de uniformidad sobre los números 00-99
 *   2. Chi² sobre decenas y unidades (más potencia con muestras medianas)
 *   3. Test de rachas (arriba/abajo de la mediana)
 *   4. Autocorrelación lag-1 y lag-5 de la serie de números
 *   5. Tasa de repetidos en ventana corta vs esperada
 *   6. Entropía normalizada
 *
 * Los p-valores se reportan con corrección FDR (Benjamini-Hochberg): con
 * varios tests simultáneos, alguno saldrá "significativo" por azar.
 */

import {
  chi2Uniform,
  runsTest,
  autocorrelation,
  entropyRatio,
  benjaminiHochberg,
  normalCdf,
} from "./stats-utils.js";
import { parseDrawDate } from "./date-utils.js";

const MIN_DRAWS = 100;

function ordenarCronologico(draws) {
  return draws
    .map((d) => ({ ...d, numero: typeof d?.numero === "number" ? d.numero : parseInt(d?.numero, 10) }))
    .filter((d) => Number.isFinite(d.numero) && d.numero >= 0 && d.numero <= 99 && !d.esTest && !d.isTest)
    .map((d) => ({ ...d, _ts: parseDrawDate(d.fecha)?.getTime() ?? 0 }))
    .sort((a, b) => a._ts - b._ts || String(a.horario).localeCompare(String(b.horario)));
}

function contar(nums, buckets, mapFn) {
  const counts = new Array(buckets).fill(0);
  for (const n of nums) counts[mapFn(n)]++;
  return counts;
}

/**
 * Tasa de repetidos: cuántas veces el número sorteado ya había salido en los
 * 5 sorteos anteriores, comparada con la esperada bajo independencia
 * (≈ 1 - (99/100)^5). Un déficit fuerte sugiere supresión deliberada de
 * repetidos; un exceso, lo contrario.
 */
function testRepetidos(nums, ventana = 5) {
  const n = nums.length - ventana;
  if (n < 50) return { pValue: null, insuficiente: true };
  let hits = 0;
  for (let i = ventana; i < nums.length; i++) {
    const prev = nums.slice(i - ventana, i);
    if (prev.includes(nums[i])) hits++;
  }
  const pEsperada = 1 - Math.pow(99 / 100, ventana);
  const observada = hits / n;
  const sd = Math.sqrt((pEsperada * (1 - pEsperada)) / n);
  const z = (observada - pEsperada) / sd;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { hits, n, observada, esperada: pEsperada, z, pValue, insuficiente: false };
}

/**
 * Ejecuta la batería completa. Devuelve los tests individuales con FDR
 * aplicado y un veredicto agregado honesto.
 *
 * @param {Array} draws  sorteos ({fecha, numero, horario, ...})
 * @param {object} [opts] { pais } para filtrar
 */
export function auditarAleatoriedad(draws = [], opts = {}) {
  const { pais = null } = opts;
  const filtrados = pais
    ? draws.filter((d) => (d.pais || "").toUpperCase() === pais.toUpperCase())
    : draws;
  const sorted = ordenarCronologico(filtrados);
  const nums = sorted.map((d) => d.numero);

  if (nums.length < MIN_DRAWS) {
    return {
      suficiente: false,
      totalSorteos: nums.length,
      minimo: MIN_DRAWS,
      tests: [],
      veredicto: "insuficiente",
    };
  }

  const tests = [];

  // 1. Uniformidad global 00-99 (chi² pierde potencia si el esperado por
  //    celda es < 5, se anota la advertencia)
  const counts100 = contar(nums, 100, (n) => n);
  const t100 = chi2Uniform(counts100);
  tests.push({
    id: "uniformidad_00_99",
    nombre: "Uniformidad de números 00-99 (χ²)",
    pValue: t100.pValue,
    detalle: `χ²=${t100.chi2.toFixed(1)}, df=99, n=${nums.length}`,
    advertencia: t100.expected < 5 ? "esperado por número < 5: test poco potente" : null,
  });

  // 2. Decenas y unidades (df=9: detecta sesgos con menos datos)
  const tDec = chi2Uniform(contar(nums, 10, (n) => Math.floor(n / 10)));
  tests.push({
    id: "uniformidad_decenas",
    nombre: "Uniformidad de decenas (χ²)",
    pValue: tDec.pValue,
    detalle: `χ²=${tDec.chi2.toFixed(1)}, df=9`,
  });
  const tUni = chi2Uniform(contar(nums, 10, (n) => n % 10));
  tests.push({
    id: "uniformidad_unidades",
    nombre: "Uniformidad de unidades (χ²)",
    pValue: tUni.pValue,
    detalle: `χ²=${tUni.chi2.toFixed(1)}, df=9`,
  });

  // 3. Test de rachas sobre arriba/abajo de 49.5
  const rt = runsTest(nums.map((n) => (n >= 50 ? 1 : 0)));
  tests.push({
    id: "rachas",
    nombre: "Test de rachas (alto/bajo)",
    pValue: rt.pValue,
    detalle: rt.insuficiente
      ? "muestra insuficiente"
      : `rachas=${rt.runs}, esperadas=${rt.expected.toFixed(1)}, z=${rt.z.toFixed(2)}`,
  });

  // 4. Autocorrelación
  for (const lag of [1, 5]) {
    const ac = autocorrelation(nums, lag);
    tests.push({
      id: `autocorrelacion_lag${lag}`,
      nombre: `Autocorrelación lag-${lag}`,
      pValue: ac.pValue,
      detalle: ac.insuficiente ? "muestra insuficiente" : `r=${ac.r.toFixed(3)}`,
    });
  }

  // 5. Repetidos en ventana corta
  const rep = testRepetidos(nums);
  tests.push({
    id: "tasa_repetidos",
    nombre: "Repetidos en últimos 5 sorteos",
    pValue: rep.pValue,
    detalle: rep.insuficiente
      ? "muestra insuficiente"
      : `observada=${(rep.observada * 100).toFixed(1)}% vs esperada=${(rep.esperada * 100).toFixed(1)}%`,
  });

  // FDR sobre toda la batería
  const conFDR = benjaminiHochberg(tests, 0.05);
  const significativos = conFDR.filter((t) => t.significativoFDR);

  // Entropía (descriptivo, no test)
  const entropia = entropyRatio(counts100);

  let veredicto;
  if (significativos.length === 0) {
    veredicto = "compatible_con_azar";
  } else if (significativos.length <= 2) {
    veredicto = "desviaciones_leves";
  } else {
    veredicto = "no_uniforme";
  }

  return {
    suficiente: true,
    totalSorteos: nums.length,
    entropia,
    tests: conFDR,
    significativos: significativos.map((t) => t.id),
    veredicto,
  };
}

export const VEREDICTO_LABEL = {
  compatible_con_azar: {
    label: "Compatible con azar puro",
    color: "#e0b84a",
    desc: "Ningún test rechaza uniformidad/independencia tras corrección FDR. Los patrones de los motores deben tratarse con máximo escepticismo.",
  },
  desviaciones_leves: {
    label: "Desviaciones leves detectadas",
    color: "#5ec47e",
    desc: "Uno o dos tests muestran desviación significativa. Hay indicios de estructura, pero podría ser inestable en el tiempo.",
  },
  no_uniforme: {
    label: "Estructura no aleatoria detectada",
    color: "#5cba5c",
    desc: "Varios tests rechazan el azar puro: la premisa adversarial del sistema tiene respaldo en los datos.",
  },
  insuficiente: {
    label: "Datos insuficientes",
    color: "#888",
    desc: "Se necesitan más sorteos registrados para auditar la aleatoriedad.",
  },
};
