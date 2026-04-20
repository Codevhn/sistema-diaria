/**
 * relativos-engine.js — Cadencia histórica y detección de "relativos vencidos".
 *
 * Fuentes de relaciones:
 *   1. data/relativos_diaria.json — mapa oficial La Diaria (A → [B, C], direccional)
 *   2. data/companion_map.json    — mapa conceptual del jugador (bidireccional, opcional)
 *
 * Por cada par (A → B):
 *   - Escanea el historial real: cada vez que cayó A, ¿cuántos días después cayó B?
 *   - Calcula: media, sigma, hitRate dentro de ventana maxDays
 *   - "Vencido": A cayó hace X días y B todavía no apareció, con X > media + sigma
 *
 * Exports:
 *   computeCadencia(draws, opts)  → Map<"A→B", { gaps, mean, sigma, hitRate }>
 *   getVencidos(draws, opts)      → [{ origen, relativo, diasDesde, mean, sigma, urgencia, fuente }]
 *   renderRelativosHTML(vencidos) → string HTML
 */

const PAD = (n) => String(n).padStart(2, "0");

// ─── Carga de mapas ──────────────────────────────────────────────────────────

/**
 * Carga relativos_diaria.json y devuelve Map<number, number[]>
 * (A → [B, C] oficiales de La Diaria)
 */
let _relativosCache = null;
async function loadRelativosMap() {
  if (_relativosCache) return _relativosCache;
  try {
    const res = await fetch("data/relativos_diaria.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const map = new Map();
    for (const [pad, entry] of Object.entries(json.pares || {})) {
      const num = parseInt(pad, 10);
      const targets = (entry.relativos || []).map((r) => r.numero);
      if (targets.length) map.set(num, targets);
    }
    _relativosCache = map;
    return map;
  } catch (err) {
    console.warn("[relativos-engine] No se pudo cargar relativos_diaria.json:", err?.message);
    return new Map();
  }
}

/**
 * Carga companion_map.json (si existe) y devuelve Map<number, number[]>
 * Es bidireccional: A→B implica también B→A.
 */
let _companionsCache = null;
async function loadCompanionsMap() {
  if (_companionsCache !== null) return _companionsCache;
  try {
    const res = await fetch("data/companion_map.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    const map = new Map();
    if (!Array.isArray(arr)) throw new Error("formato inesperado");
    for (const entry of arr) {
      const a = parseInt(entry.numero ?? entry.numero, 10);
      if (isNaN(a)) continue;
      const targets = (entry.companeros || []).map((c) =>
        Array.isArray(c) ? parseInt(c[0], 10) : parseInt(c, 10)
      ).filter((n) => !isNaN(n));
      if (!targets.length) continue;
      // A → targets
      if (!map.has(a)) map.set(a, []);
      map.get(a).push(...targets);
      // bidireccional: targets → A
      for (const b of targets) {
        if (!map.has(b)) map.set(b, []);
        if (!map.get(b).includes(a)) map.get(b).push(a);
      }
    }
    _companionsCache = map;
    return map;
  } catch {
    _companionsCache = new Map(); // opcional — no rompe si no existe
    return _companionsCache;
  }
}

// ─── Estadísticas de cadencia ────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function sigma(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Convierte fecha string "YYYY-MM-DD" → días desde epoch (entero).
 * Evita timezone issues usando split manual.
 */
function fechaToDays(fecha) {
  if (!fecha) return NaN;
  const [y, m, d] = fecha.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Calcula cadencia por par (A→B) dado el historial de sorteos.
 *
 * @param {Array} draws       - array de draws { fecha, numero, pais }
 * @param {Map}   relMap      - Map<number, number[]>
 * @param {object} opts
 * @param {number} opts.maxDays  - ventana máxima hacia adelante (default: 45)
 * @param {string} [opts.pais]   - filtrar por país (null = todos)
 * @param {string} [opts.fuente] - etiqueta para el resultado
 * @returns {Map<string, object>} clave "A→B" → { gaps, mean, sigma, hitRate, misses, fuente }
 */
function computePairCadencia(draws, relMap, opts = {}) {
  const maxDays = opts.maxDays ?? 45;
  const paisFiltro = opts.pais ?? null;
  const fuente = opts.fuente ?? "?";

  // Filtrar y ordenar
  const sorted = draws
    .filter((d) => d.fecha && !isNaN(parseInt(d.numero, 10)))
    .filter((d) => !paisFiltro || (d.pais || "").toUpperCase() === paisFiltro.toUpperCase())
    .map((d) => ({ day: fechaToDays(d.fecha), num: parseInt(d.numero, 10), fecha: d.fecha }))
    .filter((d) => !isNaN(d.day))
    .sort((a, b) => a.day - b.day);

  const result = new Map();

  for (const [a, targets] of relMap.entries()) {
    for (const b of targets) {
      if (a === b) continue; // autorelativo — skip estadísticas
      const key = `${PAD(a)}→${PAD(b)}`;
      const gaps = [];
      let misses = 0;

      // Por cada aparición de A, buscar la primera de B hacia adelante
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].num !== a) continue;
        const dayA = sorted[i].day;
        let found = false;
        for (let j = i + 1; j < sorted.length; j++) {
          const diff = sorted[j].day - dayA;
          if (diff > maxDays) break;
          if (sorted[j].num === b) {
            gaps.push(diff === 0 ? 1 : diff); // mismo día = 1
            found = true;
            break;
          }
        }
        if (!found) misses++;
      }

      if (!gaps.length && !misses) continue; // par sin historia

      const m = mean(gaps);
      const s = sigma(gaps);
      result.set(key, {
        a, b,
        gaps,
        mean: m,
        sigma: s,
        hitRate: gaps.length / (gaps.length + misses),
        hits: gaps.length,
        misses,
        fuente,
      });
    }
  }
  return result;
}

/**
 * Computa la cadencia combinada de relativos oficiales + compañeros del jugador.
 *
 * @param {Array}  draws
 * @param {object} opts
 * @param {number} [opts.maxDays=45]
 * @param {string} [opts.pais]
 * @returns {Promise<Map<string, object>>}
 */
export async function computeCadencia(draws, opts = {}) {
  const [relMap, compMap] = await Promise.all([loadRelativosMap(), loadCompanionsMap()]);

  const relStats = computePairCadencia(draws, relMap, { ...opts, fuente: "oficial" });
  const compStats = computePairCadencia(draws, compMap, { ...opts, fuente: "companion" });

  // Merge: si un par existe en ambos, preferimos el que tiene más datos
  const merged = new Map(relStats);
  for (const [key, stat] of compStats.entries()) {
    if (!merged.has(key)) {
      merged.set(key, stat);
    } else {
      const existing = merged.get(key);
      if (stat.hits > existing.hits) {
        merged.set(key, { ...stat, fuente: "ambos" });
      }
    }
  }
  return merged;
}

// ─── Detección de vencidos ───────────────────────────────────────────────────

/**
 * Encuentra "relativos vencidos": pares (A→B) donde A cayó recientemente,
 * B todavía no apareció después de esa caída, y el tiempo de espera ya
 * superó la cadencia histórica normal (mean + sigma * threshold).
 *
 * @param {Array}  draws
 * @param {object} opts
 * @param {number} [opts.maxDays=45]       - ventana para cadencia
 * @param {number} [opts.recentDays=60]    - cuántos días atrás buscar A's activos
 * @param {number} [opts.minHits=2]        - mínimo de hits históricos para confiar en la estadística
 * @param {number} [opts.threshold=0.5]    - cuántos sigma por encima de mean para alertar
 * @param {string} [opts.pais]             - filtrar por país
 * @returns {Promise<Array>}
 */
export async function getVencidos(draws, opts = {}) {
  const maxDays   = opts.maxDays    ?? 45;
  const recentDays = opts.recentDays ?? 60;
  const minHits   = opts.minHits    ?? 2;
  const threshold = opts.threshold  ?? 0.5;
  const paisFiltro = opts.pais      ?? null;

  // Fecha de hoy en días desde epoch
  const today = Math.floor(Date.now() / 86400000);

  const [relMap, compMap, cadencia] = await Promise.all([
    loadRelativosMap(),
    loadCompanionsMap(),
    computeCadencia(draws, opts),
  ]);

  // Sorteos ordenados
  const sorted = draws
    .filter((d) => d.fecha && !isNaN(parseInt(d.numero, 10)))
    .filter((d) => !paisFiltro || (d.pais || "").toUpperCase() === paisFiltro.toUpperCase())
    .map((d) => ({ day: fechaToDays(d.fecha), num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario }))
    .filter((d) => !isNaN(d.day))
    .sort((a, b) => a.day - b.day);

  const cutoff = today - recentDays;

  // Construir mapa unificado de relaciones (A → targets)
  const allRels = new Map();
  for (const [a, bs] of relMap.entries()) {
    if (!allRels.has(a)) allRels.set(a, new Set());
    bs.forEach((b) => allRels.get(a).add(b));
  }
  for (const [a, bs] of compMap.entries()) {
    if (!allRels.has(a)) allRels.set(a, new Set());
    bs.forEach((b) => allRels.get(a).add(b));
  }

  const vencidos = [];

  for (const [a, targets] of allRels.entries()) {
    // Última aparición de A en el período reciente
    const lastA = sorted.filter((d) => d.num === a && d.day >= cutoff).at(-1);
    if (!lastA) continue;

    const diasDesde = today - lastA.day;
    if (diasDesde > maxDays) continue; // pasó demasiado tiempo — ya no cuenta

    for (const b of targets) {
      if (a === b) continue;
      const key = `${PAD(a)}→${PAD(b)}`;
      const stat = cadencia.get(key);
      if (!stat || stat.hits < minHits) continue;

      // ¿Ya cayó B después de la última A?
      const bAfterA = sorted.some((d) => d.num === b && d.day > lastA.day && d.day <= today);
      if (bAfterA) continue; // ya vino — no está vencido

      const urgencia = stat.sigma > 0
        ? (diasDesde - stat.mean) / stat.sigma
        : (diasDesde - stat.mean);

      // Solo alertar si ya pasó el umbral
      if (diasDesde < stat.mean - stat.sigma) continue; // todavía muy temprano

      vencidos.push({
        a,
        b,
        padA: PAD(a),
        padB: PAD(b),
        diasDesde,
        mean: stat.mean,
        sigma: stat.sigma,
        hitRate: stat.hitRate,
        hits: stat.hits,
        urgencia,
        fuente: stat.fuente,
        fechaA: lastA.fecha,
        horarioA: lastA.horario,
      });
    }
  }

  // Ordenar por urgencia descendente (más vencidos primero)
  vencidos.sort((a, b) => b.urgencia - a.urgencia);
  return vencidos;
}

// ─── Renderizado HTML ────────────────────────────────────────────────────────

/**
 * Renderiza el panel "🧲 Relativos vencidos" como string HTML.
 * El HTML usa clases .rel-vencidos-* para el CSS externo.
 *
 * @param {Array}  vencidos  - resultado de getVencidos()
 * @param {object} [guia={}] - GUIA de sueños para símbolos
 * @param {number} [maxShow=10]
 * @returns {string}
 */
export function renderRelativosHTML(vencidos, guia = {}, maxShow = 10) {
  if (!Array.isArray(vencidos)) {
    return `<div class="rel-vencidos rel-vencidos--error">⚠ Error al calcular relativos</div>`;
  }
  if (!vencidos.length) {
    return `
      <div class="rel-vencidos rel-vencidos--empty">
        <div class="rel-vencidos__title">🧲 Relativos vencidos</div>
        <div class="rel-vencidos__hint">No hay relativos con señal activa en este momento. Seguirán siendo monitoreados conforme caigan nuevos sorteos.</div>
      </div>`;
  }

  const sym = (num) => guia[PAD(num)]?.simbolo || PAD(num);
  const fmtDias = (d) => `${d}d`;
  const urgClass = (u) => {
    if (u >= 2) return "rel-item--critical";
    if (u >= 1) return "rel-item--high";
    if (u >= 0) return "rel-item--medium";
    return "rel-item--low";
  };
  const urgIcon = (u) => {
    if (u >= 2) return "🔥";
    if (u >= 1) return "⚡";
    if (u >= 0) return "🟡";
    return "🔵";
  };

  const items = vencidos.slice(0, maxShow).map((v) => {
    const bar = Math.min(100, Math.max(0, Math.round(
      (v.diasDesde / Math.max(1, v.mean + v.sigma * 2)) * 100
    )));
    const fuente = v.fuente === "companion" ? " <small class='rel-item__fuente'>(tuyo)</small>"
      : v.fuente === "ambos" ? " <small class='rel-item__fuente'>(ambos)</small>"
      : "";
    return `
      <div class="rel-item ${urgClass(v.urgencia)}">
        <div class="rel-item__head">
          <span class="rel-item__icon">${urgIcon(v.urgencia)}</span>
          <span class="rel-item__nums">
            <b>${v.padA}</b> <span class="rel-item__sym">${sym(v.a)}</span>
            <span class="rel-item__arrow">→</span>
            <b>${v.padB}</b> <span class="rel-item__sym">${sym(v.b)}</span>
          </span>
          ${fuente}
        </div>
        <div class="rel-item__body">
          <div class="rel-item__bar-wrap">
            <div class="rel-item__bar" style="width:${bar}%"></div>
            <div class="rel-item__bar-mean" style="left:${Math.min(100, Math.round(v.mean / Math.max(1, v.mean + v.sigma * 2) * 100))}%"></div>
          </div>
          <div class="rel-item__stats">
            <span>${fmtDias(v.diasDesde)} esperando</span>
            <span class="muted">prom. ${v.mean.toFixed(1)}d ± ${v.sigma.toFixed(1)}</span>
            <span class="muted">acierta ${Math.round(v.hitRate * 100)}% (${v.hits}×)</span>
          </div>
          <div class="rel-item__since">desde ${v.fechaA} ${v.horarioA || ""}</div>
        </div>
      </div>`;
  }).join("");

  const pendientesMas = vencidos.length > maxShow
    ? `<div class="rel-vencidos__more">+${vencidos.length - maxShow} más con señal activa</div>`
    : "";

  return `
    <div class="rel-vencidos">
      <div class="rel-vencidos__title">🧲 Relativos vencidos <span class="rel-vencidos__count">${vencidos.length}</span></div>
      <div class="rel-vencidos__hint">Números que deben venir según relaciones históricas — ordenados por urgencia.</div>
      <div class="rel-vencidos__list">
        ${items}
      </div>
      ${pendientesMas}
    </div>`;
}

// ─── Backtest de relativos ────────────────────────────────────────────────────

/**
 * Mide si La Diaria tiende a tirar un relativo después de un número.
 * Compara tasa real vs tasa esperada por azar puro.
 *
 * Para cada sorteo histórico (el "disparador"), revisa si alguno de sus 2 relativos
 * cayó dentro de 1, 2 o 3 días siguientes. Compara con baseline aleatorio.
 *
 * @param {Array}  draws
 * @param {object} [opts]
 * @param {number} [opts.maxWindow=3]   - días máximos a revisar tras el disparador
 * @param {number} [opts.minDraws=200]  - mínimo de sorteos para considerar válido
 * @returns {Promise<object|null>}
 */
export async function backtestRelativos(draws, opts = {}) {
  const maxWindow = opts.maxWindow ?? 3;
  const minDraws  = opts.minDraws  ?? 200;

  const relMap = await loadRelativosMap();
  if (!relMap.size) return null;

  // Solo sorteos reales, ordenados
  const sorted = draws
    .filter((d) => d.fecha && !d.esTest && !isNaN(parseInt(d.numero, 10)))
    .map((d) => ({ day: fechaToDays(d.fecha), num: parseInt(d.numero, 10) }))
    .filter((d) => !isNaN(d.day))
    .sort((a, b) => a.day - b.day || 0);

  if (sorted.length < minDraws) return null;

  // Índice día → conjunto de números caídos ese día
  const byDay = new Map();
  for (const d of sorted) {
    if (!byDay.has(d.day)) byDay.set(d.day, new Set());
    byDay.get(d.day).add(d.num);
  }

  // Calcular promedio de sorteos por día (para baseline)
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const avgDrawsPerDay = sorted.length / (days.length || 1);

  // Baseline: P(al menos un relativo en N sorteos aleatorios) = 1-(1-2/100)^(N*dias)
  const pPerDraw = 2 / 100; // siempre 2 relativos de 100
  const baseline = {};
  for (let w = 1; w <= maxWindow; w++) {
    baseline[w] = 1 - Math.pow(1 - pPerDraw, avgDrawsPerDay * w);
  }

  // Contar hits por ventana
  const hits = {};
  for (let w = 1; w <= maxWindow; w++) hits[w] = 0;
  let totalTriggers = 0;
  let noRelMap = 0;

  for (const trigger of sorted) {
    const rels = relMap.get(trigger.num);
    if (!rels || !rels.length) { noRelMap++; continue; }
    totalTriggers++;
    for (let w = 1; w <= maxWindow; w++) {
      let hitFound = false;
      for (let delta = 1; delta <= w; delta++) {
        const dayNums = byDay.get(trigger.day + delta);
        if (dayNums && rels.some((r) => dayNums.has(r))) { hitFound = true; break; }
      }
      if (hitFound) hits[w]++;
    }
  }

  if (!totalTriggers) return null;

  const result = { totalTriggers, avgDrawsPerDay: Math.round(avgDrawsPerDay * 10) / 10, windows: {} };
  for (let w = 1; w <= maxWindow; w++) {
    const rate = hits[w] / totalTriggers;
    const base = baseline[w];
    const lift = base > 0 ? rate / base : 0;
    result.windows[w] = {
      hits: hits[w],
      rate: Math.round(rate * 1000) / 1000,
      baseline: Math.round(base * 1000) / 1000,
      lift: Math.round(lift * 100) / 100,
      pctVsAzar: Math.round((lift - 1) * 100),
    };
  }
  return result;
}

// ─── Alertas de relativos recientes ──────────────────────────────────────────

/**
 * Devuelve los disparadores activos: números que cayeron en los últimos N días
 * y cuyos relativos aún no han aparecido desde esa caída.
 *
 * @param {Array}  draws
 * @param {object} [opts]
 * @param {number} [opts.lookbackDays=3]  - cuántos días atrás buscar disparadores
 * @param {string} [opts.pais]
 * @returns {Promise<Array>} [{padA, simA, padB, simB, diasDesde, fechaA, horarioA, fuente}]
 */
export async function getRelativosEnAlerta(draws, opts = {}) {
  const lookback = opts.lookbackDays ?? 3;
  const paisFiltro = opts.pais ?? null;

  const relMap = await loadRelativosMap();
  if (!relMap.size) return [];

  const today = Math.floor(Date.now() / 86400000);
  const cutoff = today - lookback;

  const sorted = draws
    .filter((d) => d.fecha && !d.esTest && !isNaN(parseInt(d.numero, 10)))
    .filter((d) => !paisFiltro || (d.pais || "").toUpperCase() === paisFiltro.toUpperCase())
    .map((d) => ({ day: fechaToDays(d.fecha), num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || "" }))
    .filter((d) => !isNaN(d.day))
    .sort((a, b) => a.day - b.day);

  // Índice día → números caídos
  const byDay = new Map();
  for (const d of sorted) {
    if (!byDay.has(d.day)) byDay.set(d.day, new Set());
    byDay.get(d.day).add(d.num);
  }

  const alertas = [];

  // Buscar disparadores en la ventana reciente
  const recientes = sorted.filter((d) => d.day >= cutoff);

  for (const trigger of recientes) {
    const rels = relMap.get(trigger.num);
    if (!rels || !rels.length) continue;

    const diasDesde = today - trigger.day;

    for (const rel of rels) {
      // Verificar si el relativo ya cayó después del disparador
      let yaAparecio = false;
      for (let delta = 1; delta <= diasDesde; delta++) {
        const dayNums = byDay.get(trigger.day + delta);
        if (dayNums?.has(rel)) { yaAparecio = true; break; }
      }
      if (yaAparecio) continue;

      // También verificar si ya cayó hoy
      const hoyNums = byDay.get(today);
      if (hoyNums?.has(rel)) continue;

      alertas.push({
        a: trigger.num,
        b: rel,
        padA: PAD(trigger.num),
        padB: PAD(rel),
        diasDesde,
        fechaA: trigger.fecha,
        horarioA: trigger.horario,
        fuente: "diaria",
      });
    }
  }

  // Ordenar: más recientes primero, luego por número
  alertas.sort((a, b) => a.diasDesde - b.diasDesde || a.a - b.a);
  return alertas;
}

// ─── Render de alerta + backtest ─────────────────────────────────────────────

/**
 * Renderiza el panel combinado "Relativos en alerta" + resumen de backtest.
 */
export function renderRelativosAlertaHTML(alertas, backtest, guia = {}) {
  const sym = (pad) => guia[pad]?.simbolo || pad;

  // ── Backtest summary ──
  let btHtml = "";
  if (backtest) {
    const w1 = backtest.windows[1];
    const w2 = backtest.windows[2];
    const w3 = backtest.windows[3];
    const verdict = w1.lift >= 1.5 ? { icon: "🔥", label: "Señal fuerte", cls: "rel-bt--hot" }
      : w1.lift >= 1.15            ? { icon: "✅", label: "Ventaja real", cls: "rel-bt--ok" }
      : w1.lift >= 0.85            ? { icon: "≈",  label: "Cerca del azar", cls: "rel-bt--neutral" }
      :                              { icon: "⚠",  label: "Sin ventaja", cls: "rel-bt--bad" };
    const sign = (v) => v >= 0 ? `+${v}` : `${v}`;
    btHtml = `
      <div class="rel-bt ${verdict.cls}">
        <div class="rel-bt__head">
          <span class="rel-bt__title">📊 ¿Juega La Diaria con relativos?</span>
          <span class="rel-bt__verdict">${verdict.icon} ${verdict.label}</span>
        </div>
        <div class="rel-bt__grid">
          <div class="rel-bt__cell">
            <span class="rel-bt__lbl">Al día siguiente</span>
            <span class="rel-bt__val">${(w1.rate * 100).toFixed(1)}%</span>
            <span class="rel-bt__sub">azar ${(w1.baseline * 100).toFixed(1)}% · ${sign(w1.pctVsAzar)}% lift</span>
          </div>
          <div class="rel-bt__cell">
            <span class="rel-bt__lbl">En 2 días</span>
            <span class="rel-bt__val">${(w2.rate * 100).toFixed(1)}%</span>
            <span class="rel-bt__sub">azar ${(w2.baseline * 100).toFixed(1)}% · ${sign(w2.pctVsAzar)}%</span>
          </div>
          <div class="rel-bt__cell">
            <span class="rel-bt__lbl">En 3 días</span>
            <span class="rel-bt__val">${(w3.rate * 100).toFixed(1)}%</span>
            <span class="rel-bt__sub">azar ${(w3.baseline * 100).toFixed(1)}% · ${sign(w3.pctVsAzar)}%</span>
          </div>
          <div class="rel-bt__cell">
            <span class="rel-bt__lbl">Lift ×</span>
            <span class="rel-bt__val">${w1.lift.toFixed(2)}×</span>
            <span class="rel-bt__sub">${backtest.totalTriggers} disparadores analizados</span>
          </div>
        </div>
        <div class="rel-bt__hint">Mide cuántas veces un relativo cayó el día siguiente vs lo esperado por azar (2 de 100 por sorteo). Lift &gt;1.5× indica patrón real.</div>
      </div>`;
  }

  // ── Alertas ──
  let alertHtml = "";
  if (!alertas.length) {
    alertHtml = `<div class="rel-alerta rel-alerta--empty"><div class="rel-alerta__hint">No hay disparadores activos en los últimos 3 días.</div></div>`;
  } else {
    const rows = alertas.map((al) => {
      const diasLabel = al.diasDesde === 0 ? "hoy" : al.diasDesde === 1 ? "ayer" : `hace ${al.diasDesde}d`;
      return `
        <div class="rel-alerta__row">
          <div class="rel-alerta__trigger">
            <span class="rel-alerta__pad">${al.padA}</span>
            <span class="rel-alerta__sym">${sym(al.padA)}</span>
            <span class="rel-alerta__when">cayó ${diasLabel}</span>
          </div>
          <span class="rel-alerta__arrow">→</span>
          <div class="rel-alerta__candidate">
            <span class="rel-alerta__pad rel-alerta__pad--b">${al.padB}</span>
            <span class="rel-alerta__sym">${sym(al.padB)}</span>
            <span class="rel-alerta__status">pendiente</span>
          </div>
        </div>`;
    }).join("");
    alertHtml = `
      <div class="rel-alerta">
        <div class="rel-alerta__head">🔗 Relativos en alerta — candidatos de relevo</div>
        <div class="rel-alerta__hint">Números que cayeron recientemente cuyo relativo oficial aún no ha aparecido.</div>
        <div class="rel-alerta__list">${rows}</div>
      </div>`;
  }

  return `<div class="rel-alerta-wrap">${btHtml}${alertHtml}</div>`;
}
