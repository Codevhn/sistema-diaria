/**
 * lineas-engine.js — Análisis y visualización por línea (decena).
 *
 * La Diaria piensa en "líneas" (grupos de 10 números por decena):
 *   Línea 00 → 00-09 | Línea 10 → 10-19 | … | Línea 90 → 90-99
 *
 * Para cada línea calcula:
 *   - Gap actual (sorteos desde que cayó cualquier número de la línea)
 *   - Ciclo medio histórico de la línea
 *   - Status: vencida / en-ventana / aproximandose / reciente
 *   - Por cada número individual: gap y calor (cold/warm/hot)
 */

const MIN_DRAWS   = 50;   // mínimo de sorteos para confiar en el análisis
const MIN_HITS    = 5;    // mínimo de apariciones de la línea para calcular ciclo

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function parseAndSort(draws, pais) {
  const ORD = { '11AM': 0, '3PM': 1, '9PM': 2 };
  return draws
    .filter(d => {
      if (d.esTest) return false;
      if (pais && (d.pais || '').toUpperCase() !== pais.toUpperCase()) return false;
      return d.fecha && !isNaN(parseInt(d.numero, 10));
    })
    .map(d => ({ num: parseInt(d.numero, 10), fecha: d.fecha, horario: d.horario || '' }))
    .sort((a, b) => {
      const dd = a.fecha.localeCompare(b.fecha);
      return dd !== 0 ? dd : (ORD[a.horario] ?? 9) - (ORD[b.horario] ?? 9);
    });
}

function meanStd(arr) {
  if (!arr.length) return { mean: 0, std: 0 };
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const s = Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length);
  return { mean: m, std: s };
}

// ─── Calor individual de un número ───────────────────────────────────────────
// Devuelve 'hot' | 'warm' | 'cold' | 'frozen' según su gap vs su ciclo medio

function numHeat(gapActual, cicloMedio) {
  if (cicloMedio === null || cicloMedio === 0) return 'unknown';
  const r = gapActual / cicloMedio;
  if (r <= 0.5)  return 'hot';      // cayó hace muy poco
  if (r <= 1.0)  return 'warm';     // dentro del ciclo
  if (r <= 1.8)  return 'cold';     // algo atrasado
  return 'frozen';                   // muy atrasado
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {Array}  draws
 * @param {object} guia
 * @param {object} opts
 * @param {string} [opts.pais]
 * @returns {{ lineas: Array } | null}
 */
export function analizarLineas(draws, guia = {}, { pais = null } = {}) {
  const sorted = parseAndSort(draws, pais);
  if (sorted.length < MIN_DRAWS) return null;

  const lineas = [];

  for (let l = 0; l <= 9; l++) {
    const nums = Array.from({ length: 10 }, (_, i) => l * 10 + i);

    // ── Índices de aparición de CUALQUIER número de la línea ────────────────
    const lineIdxs = [];
    for (let i = 0; i < sorted.length; i++) {
      if (Math.floor(sorted[i].num / 10) === l) lineIdxs.push(i);
    }
    if (lineIdxs.length < MIN_HITS) continue;

    // ── Gaps entre apariciones consecutivas de la línea ─────────────────────
    const gaps = [];
    for (let i = 1; i < lineIdxs.length; i++) {
      gaps.push(lineIdxs[i] - lineIdxs[i - 1]);
    }
    const { mean, std } = meanStd(gaps);
    if (mean < 1) continue;

    const gapActual = (sorted.length - 1) - lineIdxs[lineIdxs.length - 1];
    const lastDraw  = sorted[lineIdxs[lineIdxs.length - 1]];

    let status, urgency;
    if      (gapActual > mean + std)     { status = 'vencida';       urgency = 4; }
    else if (gapActual >= mean - std)    { status = 'en-ventana';    urgency = 3; }
    else if (gapActual >= mean * 0.7)    { status = 'aproximandose'; urgency = 2; }
    else                                 { status = 'reciente';      urgency = 1; }

    // ── Datos individuales por número ────────────────────────────────────────
    const numData = nums.map(n => {
      const nIdxs = [];
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].num === n) nIdxs.push(i);
      }
      const nGaps = [];
      for (let i = 1; i < nIdxs.length; i++) nGaps.push(nIdxs[i] - nIdxs[i - 1]);
      const cicloMedio = nGaps.length >= 2
        ? nGaps.reduce((s, x) => s + x, 0) / nGaps.length
        : null;
      const nGap = nIdxs.length
        ? (sorted.length - 1) - nIdxs[nIdxs.length - 1]
        : sorted.length;   // nunca ha caído
      const lastFecha   = nIdxs.length ? sorted[nIdxs[nIdxs.length - 1]].fecha   : null;
      const lastHorario = nIdxs.length ? sorted[nIdxs[nIdxs.length - 1]].horario : null;

      return {
        num:        n,
        hits:       nIdxs.length,
        gapActual:  nGap,
        cicloMedio,
        lastFecha,
        lastHorario,
        heat:       numHeat(nGap, cicloMedio),
      };
    });

    lineas.push({
      linea:      l,
      label:      `Línea ${pad(l * 10)}`,
      range:      `${pad(l * 10)} – ${pad(l * 10 + 9)}`,
      gapActual,
      cicloMedio: Math.round(mean * 10) / 10,
      desviacion: Math.round(std  * 10) / 10,
      lastNum:    lastDraw.num,
      lastFecha:  lastDraw.fecha,
      lastHorario: lastDraw.horario,
      status,
      urgency,
      numData,
      totalHits:  lineIdxs.length,
    });
  }

  // Ordenar: más urgentes primero, luego por gap
  lineas.sort((a, b) => b.urgency - a.urgency || b.gapActual - a.gapActual);

  return { lineas };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderLineasHTML(resultado, guia = {}) {
  if (!resultado || !resultado.lineas.length) {
    return `<div class="lin-wrap"><p class="lin-empty">Historial insuficiente para analizar líneas.</p></div>`;
  }

  const { lineas } = resultado;

  const STATUS = {
    vencida:       { icon: '🔴', label: 'Vencida',        cls: 'lin-card--vencida'  },
    'en-ventana':  { icon: '🟢', label: 'En ventana',     cls: 'lin-card--ventana'  },
    aproximandose: { icon: '🟡', label: 'Aproximándose',  cls: 'lin-card--aprox'    },
    reciente:      { icon: '⚪', label: 'Reciente',       cls: 'lin-card--reciente' },
  };

  const HEAT_CLS = {
    hot:     'lin-num--hot',
    warm:    'lin-num--warm',
    cold:    'lin-num--cold',
    frozen:  'lin-num--frozen',
    unknown: '',
  };

  const cards = lineas.map(l => {
    const st  = STATUS[l.status] || STATUS.reciente;
    const lp  = pad(l.lastNum);
    const sym = guia[lp]?.simbolo || '';
    const ratio = l.cicloMedio > 0
      ? Math.min(Math.round((l.gapActual / l.cicloMedio) * 100), 100)
      : 0;

    // Mini chips de los 10 números de la línea
    const numChips = l.numData.map(nd => {
      const np  = pad(nd.num);
      const ns  = guia[np]?.simbolo || '';
      const hcl = HEAT_CLS[nd.heat] || '';
      const tip = nd.lastFecha
        ? `${np} · gap ${nd.gapActual}${nd.cicloMedio ? ' / ~' + Math.round(nd.cicloMedio) : ''} · últ ${nd.lastFecha}`
        : `${np} · sin apariciones recientes`;
      return `
        <div class="lin-num ${hcl}" title="${tip}">
          <img class="lin-num__img" src="data/img/${np}.png" alt="${np}"
            onerror="this.src='data/img/${np}.jpg';this.onerror=()=>this.style.display='none'">
          <span class="lin-num__n">${np}</span>
          ${ns ? `<span class="lin-num__s">${ns}</span>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="lin-card ${st.cls}">
        <div class="lin-card__head">
          <div class="lin-card__title-row">
            <span class="lin-card__icon">${st.icon}</span>
            <span class="lin-card__label">${l.label}</span>
            <span class="lin-card__range">${l.range}</span>
            <span class="lin-card__status-txt">${st.label}</span>
          </div>
          <div class="lin-card__meta">
            <span class="lin-card__gap-txt">
              Sorteos sin caer: <strong>${l.gapActual}</strong> / ~${Math.round(l.cicloMedio)}
            </span>
            <div class="lin-card__bar">
              <div class="lin-card__bar-fill" style="width:${ratio}%"></div>
            </div>
          </div>
          <div class="lin-card__last">
            Último: <strong>${lp}</strong>${sym ? ` ${sym}` : ''} · ${l.lastHorario} · ${l.lastFecha}
          </div>
        </div>
        <div class="lin-nums">${numChips}</div>
      </div>`;
  }).join('');

  return `
    <div class="lin-wrap">
      <div class="lin-head">
        <span class="lin-title">📐 Líneas</span>
        <span class="lin-sub">Grupos de 10 números por decena · calor individual: 🔴 frío → 🟢 caliente</span>
      </div>
      <div class="lin-legend">
        <span class="lin-leg lin-leg--hot">■ Caliente (cayó hace poco)</span>
        <span class="lin-leg lin-leg--warm">■ En ciclo</span>
        <span class="lin-leg lin-leg--cold">■ Atrasado</span>
        <span class="lin-leg lin-leg--frozen">■ Muy frío</span>
      </div>
      <div class="lin-grid">${cards}</div>
      <p class="lin-hint">Barra = progreso del gap actual vs ciclo medio de la línea · ordenadas por urgencia</p>
    </div>`;
}
