/**
 * temporal-engine.js — Verificador estadístico de patrones temporales
 *
 * PRINCIPIO: las afirmaciones (del usuario, jugadores, pronosticadores)
 * se tratan como HIPÓTESIS a falsificar, no como verdades. El motor calcula
 * evidencia estadística objetiva y devuelve un veredicto con p-valor.
 *
 * Métodos principales:
 *   verificarAfirmaciones(draws, spFechas)  → veredicto por cada hipótesis
 *   verificarEstacionalidad(draws)          → análisis mes a mes con chi²
 *   indexRobotelsa(draws)                  → entropía de Shannon por mes
 *   compararAnioAnio(draws, month)         → año vs año para un mes dado
 */

const MESES      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto",
                    "Septiembre","Octubre","Noviembre","Diciembre"];

// ─── Utilidades estadísticas ──────────────────────────────────────────────

function zScore(observed, expected) {
  if (expected <= 0) return 0;
  return (observed - expected) / Math.sqrt(expected);
}

// χ² de bondad de ajuste contra distribución uniforme sobre 100 números
function chiSqUniform(freqMap, total) {
  const expected = total / 100;
  if (expected < 0.5) return 0;
  let chi = 0;
  for (let n = 0; n <= 99; n++) {
    const obs = freqMap.get(n) || 0;
    chi += (obs - expected) ** 2 / expected;
  }
  return chi;
}

// Aproximación del p-valor usando valores críticos tabulados para df=99
function pLabel(chi) {
  if (chi > 149.5) return { label: "p < 0.001", level: 3 };
  if (chi > 135.8) return { label: "p < 0.01",  level: 2 };
  if (chi > 123.2) return { label: "p < 0.05",  level: 1 };
  if (chi > 111.7) return { label: "p < 0.10",  level: 0 };
  return { label: "p > 0.10",  level: -1 };
}

// Entropía de Shannon normalizada (0 = máx concentración, 1 = uniforme perfecta)
function shannonEntropy(freqMap, total) {
  if (total === 0) return 1;
  let H = 0;
  for (let n = 0; n <= 99; n++) {
    const p = (freqMap.get(n) || 0) / total;
    if (p > 0) H -= p * Math.log2(p);
  }
  return H / Math.log2(100); // normalizado
}

function buildFreq(draws) {
  const freq = new Map();
  draws.forEach(d => {
    const n = parseInt(d.numero, 10);
    freq.set(n, (freq.get(n) || 0) + 1);
  });
  return freq;
}

function topAnomalies(freqMap, total, topN = 8) {
  const expected = total / 100;
  if (expected < 0.5) return [];
  const items = [];
  for (let n = 0; n <= 99; n++) {
    const obs = freqMap.get(n) || 0;
    const z   = zScore(obs, expected);
    if (Math.abs(z) >= 1.3) items.push({ num: n, obs, expected, z: +z.toFixed(2) });
  }
  return items.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, topN);
}

// Correlación de Pearson entre distribuciones de dos períodos
function pearson(freqA, totalA, freqB, totalB) {
  let sXY = 0, sX2 = 0, sY2 = 0;
  const mean = 1 / 100;
  for (let n = 0; n <= 99; n++) {
    const x = (freqA.get(n) || 0) / totalA - mean;
    const y = (freqB.get(n) || 0) / totalB - mean;
    sXY += x * y; sX2 += x * x; sY2 += y * y;
  }
  return sX2 > 0 && sY2 > 0 ? sXY / Math.sqrt(sX2 * sY2) : 0;
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Verifica tres hipótesis concretas con evidencia estadística:
 *  1. "Diciembre es diferente" (ROBOTELSA)
 *  2. "Los períodos post-SP tienen números distintos"
 *  3. "La distribución cambia año a año"
 */
export function verificarAfirmaciones(draws, spFechas = []) {
  const SP_DAYS = 14;
  const results = [];

  // ── Hipótesis 1: Diciembre ──────────────────────────────────────────────
  const dec    = draws.filter(d => d.fecha.slice(5,7) === "12");
  const noDec  = draws.filter(d => d.fecha.slice(5,7) !== "12");

  if (dec.length >= 20) {
    const freq   = buildFreq(dec);
    const chi    = chiSqUniform(freq, dec.length);
    const p      = pLabel(chi);
    const anoms  = topAnomalies(freq, dec.length, 12);
    const sobre  = anoms.filter(a => a.z >= 2.0);
    const bajo   = anoms.filter(a => a.z <= -2.0);
    const verdict =
      p.level >= 1 ? "CONFIRMADO" :
      p.level >= 0 ? "TENDENCIA"  : "SIN_EFECTO";

    results.push({
      id: "diciembre",
      hipotesis: '"Diciembre tiene un comportamiento diferente — el mes del ROBOTELSA"',
      fuente: "Percepción popular de jugadores y pronosticadores",
      muestra: `${dec.length} sorteos en diciembre · ${noDec.length} en el resto del año`,
      chi: +chi.toFixed(1), pLabel: p.label, pLevel: p.level,
      verdict,
      evidencia: p.level >= 1
        ? `Con χ²=${chi.toFixed(0)} (${p.label}, df=99), la distribución de diciembre es estadísticamente atípica. `
          + `${sobre.length} números sobre-representados, ${bajo.length} bajo-representados (z≥2).`
        : `Con χ²=${chi.toFixed(0)} y sólo ${dec.length} sorteos, no hay evidencia estadística clara. `
          + `La percepción puede deberse a sesgo de confirmación o muestra insuficiente.`,
      numsSobre: sobre.slice(0, 6),
      numsBajo: bajo.slice(0, 6),
      conclusion: p.level >= 1
        ? "Los datos apoyan la percepción popular. Hay números sistemáticamente sobre- o sub-representados en diciembre."
        : "No hay prueba estadística suficiente. Se recomienda acumular más años de datos antes de confirmar."
    });
  }

  // ── Hipótesis 2: Períodos post-SP ──────────────────────────────────────
  if (spFechas.length >= 2) {
    const recupKeys = new Set();
    spFechas.forEach(sp => {
      const end = new Date(new Date(sp).getTime() + SP_DAYS * 86_400_000)
                    .toISOString().slice(0,10);
      draws.filter(d => d.fecha > sp && d.fecha <= end)
           .forEach(d => recupKeys.add(d.fecha + "|" + (d.horario || "")));
    });

    const recup  = draws.filter(d => recupKeys.has(d.fecha + "|" + (d.horario || "")));
    const normal = draws.filter(d => !recupKeys.has(d.fecha + "|" + (d.horario || "")));

    if (recup.length >= 20 && normal.length >= 100) {
      const freqR = buildFreq(recup);
      const freqN = buildFreq(normal);
      const chi   = chiSqUniform(freqR, recup.length);
      const p     = pLabel(chi);
      const r     = pearson(freqR, recup.length, freqN, normal.length);

      // Números que aparecen proporcionalmente más en recuperación
      const biases = [];
      for (let n = 0; n <= 99; n++) {
        const pR = (freqR.get(n) || 0) / recup.length;
        const pN = (freqN.get(n) || 0) / normal.length;
        biases.push({ num: n, pR, pN, delta: +(( pR - pN ) * 100).toFixed(2) });
      }
      biases.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));
      const verdict =
        p.level >= 1 ? "CONFIRMADO" :
        p.level >= 0 ? "TENDENCIA"  : "SIN_EFECTO";

      results.push({
        id: "recuperacion",
        hipotesis: '"Los períodos de recuperación post-SP usan una distribución de números distinta"',
        fuente: "Observación del sistema + percepción de jugadores",
        muestra: `${recup.length} sorteos en recuperación · ${normal.length} en período normal`,
        chi: +chi.toFixed(1), pLabel: p.label, pLevel: p.level,
        correlacion: +r.toFixed(3),
        verdict,
        evidencia: `χ²=${chi.toFixed(0)} (${p.label}). Correlación entre distribuciones recuperación vs normal: r=${r.toFixed(2)}. `
          + (r < 0.7 ? "Distribuciones moderadamente distintas." : "Distribuciones muy similares."),
        biasTop: biases.slice(0, 10),
        conclusion: p.level >= 1
          ? "Hay diferencias estadísticas entre recuperación y período normal."
          : "No se detecta diferencia estadísticamente significativa con los datos actuales."
      });
    }
  }

  // ── Hipótesis 3: Cambio año a año ──────────────────────────────────────
  const años = [...new Set(draws.map(d => d.fecha.slice(0,4)))].sort();
  if (años.length >= 3) {
    const byYear = años.map(y => {
      const yd = draws.filter(d => d.fecha.startsWith(y));
      return { year: y, total: yd.length, freq: buildFreq(yd) };
    }).filter(y => y.total >= 50);

    const corrs = [];
    for (let i = 1; i < byYear.length; i++) {
      const a = byYear[i-1], b = byYear[i];
      corrs.push({ pair: `${a.year}→${b.year}`, r: +pearson(a.freq, a.total, b.freq, b.total).toFixed(3) });
    }
    const avgR = corrs.reduce((s,c) => s + c.r, 0) / corrs.length;
    const verdict =
      avgR < 0.25 ? "CONFIRMADO" :
      avgR < 0.55 ? "TENDENCIA"  : "SIN_EFECTO";

    results.push({
      id: "anio_anio",
      hipotesis: '"LOTELHSA cambia su sistema de juego de un año a otro"',
      fuente: "Observación de jugadores con muchos años de experiencia",
      muestra: `${byYear.length} años con ≥50 sorteos: ${byYear.map(y=>y.year).join(", ")}`,
      correlaciones: corrs,
      avgR: +avgR.toFixed(3),
      verdict,
      evidencia: `Correlación promedio entre años consecutivos: r=${avgR.toFixed(2)}. `
        + (avgR < 0.25 ? "Baja correlación → la distribución cambia significativamente año a año." :
           avgR < 0.55 ? "Correlación moderada → hay cambios pero también continuidad." :
                         "Alta correlación → distribución relativamente estable entre años."),
      conclusion: avgR < 0.55
        ? "Los datos sugieren variación inter-anual. Puede haber ciclos de estrategia."
        : "No hay evidencia clara de cambios sistemáticos año a año."
    });
  }

  return results;
}

/**
 * Análisis estacional: para cada mes, chi-cuadrado, entropía y anomalías top.
 */
export function verificarEstacionalidad(draws) {
  const byMonth = Array.from({ length: 12 }, () => []);
  draws.forEach(d => {
    const m = parseInt(d.fecha.slice(5,7), 10) - 1;
    byMonth[m].push(d);
  });

  const months = byMonth.map((md, m) => {
    const total = md.length;
    const freq  = buildFreq(md);
    const chi   = chiSqUniform(freq, total);
    const p     = pLabel(chi);
    const H     = shannonEntropy(freq, total);
    const anoms = topAnomalies(freq, total, 10);

    const verdictLevel =
      total < 25         ? "insuficiente" :
      p.level >= 1       ? "atipico"      :
      p.level >= 0       ? "tendencia"    : "normal";

    return {
      m, name: MESES[m], nameFull: MESES_FULL[m],
      total,
      chi: +chi.toFixed(1),
      pLabel: p.label, pLevel: p.level,
      entropy: +H.toFixed(3),
      verdictLevel,
      topOver:  anoms.filter(a => a.z > 0).slice(0, 5),
      topUnder: anoms.filter(a => a.z < 0).slice(0, 5),
      anoms
    };
  });

  return { months };
}

/**
 * Índice ROBOTELSA: entropía de Shannon por mes (media de ventanas de 30 sorteos).
 * Valores bajos → meses predecibles; valores altos → meses caóticos/adversariales.
 */
export function indexRobotelsa(draws) {
  const WINDOW = 30;
  const sorted = [...draws].sort((a,b) => a.fecha.localeCompare(b.fecha));
  if (sorted.length < WINDOW) return { monthAvg: [], globalAvg: null };

  const byMonth = Array.from({ length: 12 }, () => []);

  for (let i = WINDOW; i <= sorted.length; i += Math.max(1, Math.floor(WINDOW/4))) {
    const win  = sorted.slice(i - WINDOW, i);
    const freq = buildFreq(win);
    const H    = shannonEntropy(freq, WINDOW);
    const m    = parseInt(win[win.length-1].fecha.slice(5,7), 10) - 1;
    byMonth[m].push(H);
  }

  const globalAll = byMonth.flat();
  const globalAvg = globalAll.length
    ? +(globalAll.reduce((s,v) => s+v,0) / globalAll.length).toFixed(4) : null;

  const monthAvg = byMonth.map((vals, m) => ({
    m, name: MESES[m],
    avg: vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(4) : null,
    samples: vals.length,
    relToGlobal: vals.length && globalAvg
      ? +(((vals.reduce((s,v)=>s+v,0)/vals.length) - globalAvg) / globalAvg * 100).toFixed(1)
      : null
  }));

  return { monthAvg, globalAvg };
}

/**
 * Compara el mismo mes en diferentes años.
 * Detecta números recurrentes (presentes en ≥2 años del mismo mes).
 */
export function compararAnioAnio(draws, targetMonth) {
  const byYear = new Map();
  draws.forEach(d => {
    const m = parseInt(d.fecha.slice(5,7), 10) - 1;
    if (m !== targetMonth) return;
    const y = d.fecha.slice(0,4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(d);
  });

  const years = [...byYear.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([year, yd]) => {
    const freq = buildFreq(yd);
    const top  = [...freq.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8)
                   .map(([num, count]) => ({ num, count }));
    return { year, total: yd.length, freq, top };
  });

  // Números en ≥2 años
  const occur = new Map();
  years.forEach(y => {
    y.freq.forEach((cnt, n) => {
      if (!occur.has(n)) occur.set(n, { years: [], total: 0 });
      occur.get(n).years.push(y.year);
      occur.get(n).total += cnt;
    });
  });
  const recurring = [...occur.entries()]
    .filter(([, v]) => v.years.length >= 2)
    .sort((a,b) => b[1].years.length - a[1].years.length || b[1].total - a[1].total)
    .slice(0, 15)
    .map(([num, v]) => ({ num, ...v }));

  return { month: targetMonth, monthName: MESES_FULL[targetMonth], years, recurring };
}
