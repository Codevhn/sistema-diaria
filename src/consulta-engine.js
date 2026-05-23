/**
 * consulta-engine.js — Modo Consulta histórica + Modo Recuperación.
 *
 * Por cada número consultado:
 *   1. Últimas N apariciones con contexto antes/después
 *   2. Estado de rezago actual (vencido / en_ventana / normal / reciente)
 *   3. Seguidores generales + diferenciados (recuperación vs normal)
 *   4. Auto-repetición: ¿se repite en los próximos 1/2/3 sorteos?
 *   5. Cadena de recuperación: números que también volvieron tras ausencia larga
 */

const CONTEXT_BEFORE  = 2;    // sorteos previos a mostrar por episodio
const CONTEXT_AFTER   = 3;    // sorteos siguientes a mostrar por episodio
const MAX_EPISODES    = 8;    // máximo de episodios listados
const MIN_HITS        = 2;    // mínimo global para considerar seguidor frecuente
const RECOVERY_RATIO  = 1.5;  // gap > 1.5× promedio → episodio de recuperación
const CHAIN_LOOKAHEAD = 5;    // sorteos hacia adelante para detectar cadena

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

// Precomputa: por cada posición i en sorted, el índice de la aparición previa del mismo número.
// También devuelve el gap promedio por número (en sorteos), necesario para clasificar recuperación.
function precomputarContexto(sorted) {
  const prevOcc      = new Int32Array(sorted.length).fill(-1);
  const lastByNum    = new Int32Array(100).fill(-1);
  const sumGap       = new Float64Array(100).fill(0);
  const cntGap       = new Int32Array(100).fill(0);

  sorted.forEach((d, i) => {
    const prev = lastByNum[d.num];
    prevOcc[i] = prev;
    if (prev >= 0) { sumGap[d.num] += (i - prev); cntGap[d.num]++; }
    lastByNum[d.num] = i;
  });

  const avgGap = new Float64Array(100).fill(0);
  for (let n = 0; n <= 99; n++) {
    if (cntGap[n] > 0) avgGap[n] = sumGap[n] / cntGap[n];
  }

  return { prevOcc, avgGap };
}

// Dado un hit (con idx) y el historial de hits del mismo número,
// calcula cuántos sorteos llevaba sin caer en ese momento.
function rezagoEnMomento(hitIdx, allHitsOfNum) {
  // allHitsOfNum está ordenado ascendente por idx
  const pos = allHitsOfNum.findIndex(h => h.idx === hitIdx);
  if (pos <= 0) return hitIdx + 1; // primera aparición: desde el inicio
  return hitIdx - allHitsOfNum[pos - 1].idx;
}

// Construye tabla de frecuencia de seguidores para un subconjunto de hits.
function buildFollowers(hitList, sorted, contextAfter, minHits, maxResults) {
  const freq = new Map();
  hitList.forEach(h => {
    sorted.slice(h.idx + 1, h.idx + 1 + contextAfter).forEach((d, pos) => {
      const e = freq.get(d.num) ?? { num: d.num, hits: 0, positions: [] };
      e.hits++;
      e.positions.push(pos);
      freq.set(d.num, e);
    });
  });
  return [...freq.values()]
    .filter(s => s.hits >= minHits)
    .sort((a, b) => b.hits - a.hits || a.num - b.num)
    .slice(0, maxResults);
}

// ─── Análisis principal ───────────────────────────────────────────────────────

/**
 * @param {number|string} numero
 * @param {Array}         draws
 * @param {object}        guia
 * @param {object}        opts
 * @param {string}        [opts.pais]
 * @param {string}        [opts.horario]   — filtrar por turno
 * @param {Map}           [opts.rezagoMap] — output de calcularRezago() de signal-engine
 * @returns {object|null}
 */
export function consultarNumero(numero, draws, guia = {}, { pais = null, horario = null, rezagoMap = null } = {}) {
  const target = parseInt(numero, 10);
  if (isNaN(target) || target < 0 || target > 99) return null;

  const sorted = parseAndSort(draws, pais);
  if (!sorted.length) return null;

  const { prevOcc, avgGap } = precomputarContexto(sorted);

  // Todos los hits del número (sin filtro de horario) — necesarios para rezago en el momento
  const allHits = sorted
    .map((d, i) => ({ ...d, idx: i }))
    .filter(d => d.num === target);

  // Hits respetando el filtro de horario
  const hits = horario ? allHits.filter(h => h.horario === horario) : allHits;

  if (!hits.length) return { target, pad: pad(target), hits: [], seguidores: [], seguidoresRecup: [], seguidoresNormal: [], antecesores: [], autoRep: { 1: 0, 2: 0, 3: 0 }, cadenaRecup: [], estadoActual: rezagoMap?.get(target) ?? null };

  // ── Clasificar cada hit: ¿fue un episodio de recuperación? ───────────────
  const avgGapTarget = avgGap[target] || 0;

  const hitsConContexto = hits.map(h => {
    const rezagoMomento  = rezagoEnMomento(h.idx, allHits);
    const esRecuperacion = avgGapTarget > 0 && rezagoMomento > RECOVERY_RATIO * avgGapTarget;
    return { ...h, rezagoMomento, esRecuperacion };
  });

  const hitsRecup  = hitsConContexto.filter(h => h.esRecuperacion);
  const hitsNormal = hitsConContexto.filter(h => !h.esRecuperacion);

  // ── Episodios (más recientes primero) ─────────────────────────────────────
  const episodes = hitsConContexto.slice().reverse().slice(0, MAX_EPISODES).map(h => ({
    draw:            h,
    before:          sorted.slice(Math.max(0, h.idx - CONTEXT_BEFORE), h.idx),
    after:           sorted.slice(h.idx + 1, h.idx + 1 + CONTEXT_AFTER),
    esRecuperacion:  h.esRecuperacion,
    rezagoMomento:   h.rezagoMomento,
  }));

  // ── Seguidores ────────────────────────────────────────────────────────────
  const seguidores      = buildFollowers(hitsConContexto, sorted, CONTEXT_AFTER, MIN_HITS, 10);
  const seguidoresRecup = hitsRecup.length >= 2
    ? buildFollowers(hitsRecup,  sorted, CONTEXT_AFTER, 1, 8) : [];
  const seguidoresNormal = hitsNormal.length >= 2
    ? buildFollowers(hitsNormal, sorted, CONTEXT_AFTER, 1, 8) : [];

  // ── Antecesores ───────────────────────────────────────────────────────────
  const antFreq = new Map();
  hitsConContexto.forEach(h => {
    sorted.slice(Math.max(0, h.idx - CONTEXT_BEFORE), h.idx).forEach(d => {
      const e = antFreq.get(d.num) ?? { num: d.num, hits: 0 };
      e.hits++;
      antFreq.set(d.num, e);
    });
  });
  const antecesores = [...antFreq.values()]
    .filter(a => a.hits >= MIN_HITS)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8);

  // ── Auto-repetición ───────────────────────────────────────────────────────
  // ¿Con qué frecuencia el número se repite a 1, 2 o 3 sorteos de distancia?
  const autoRep = { 1: 0, 2: 0, 3: 0 };
  hitsConContexto.forEach(h => {
    for (let d = 1; d <= 3; d++) {
      if (sorted.slice(h.idx + 1, h.idx + 1 + d).some(s => s.num === target)) autoRep[d]++;
    }
  });

  // ── Cadena de recuperación ────────────────────────────────────────────────
  // En episodios de recuperación, ¿qué otros números también volvieron tras
  // una ausencia larga en los siguientes CHAIN_LOOKAHEAD sorteos?
  const cadenaRecup = [];
  if (hitsRecup.length >= 2) {
    const chainFreq = new Map();
    hitsRecup.forEach(h => {
      sorted.slice(h.idx + 1, h.idx + 1 + CHAIN_LOOKAHEAD).forEach(d => {
        const pOcc = prevOcc[sorted.indexOf(d, h.idx + 1)];
        let dIdx = -1;
        for (let k = h.idx + 1; k < Math.min(sorted.length, h.idx + 1 + CHAIN_LOOKAHEAD); k++) {
          if (sorted[k].num === d.num) { dIdx = k; break; }
        }
        if (dIdx < 0) return;
        const prevDIdx = prevOcc[dIdx];
        const gapD     = prevDIdx >= 0 ? dIdx - prevDIdx : dIdx + 1;
        const avgD     = avgGap[d.num];
        if (avgD > 0 && gapD > RECOVERY_RATIO * avgD) {
          const e = chainFreq.get(d.num) ?? { num: d.num, hits: 0 };
          e.hits++;
          chainFreq.set(d.num, e);
        }
      });
    });
    cadenaRecup.push(...[...chainFreq.values()]
      .filter(c => c.hits >= 2)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6));
  }

  // ── Distribución por horario ──────────────────────────────────────────────
  const porHorario = { '11AM': 0, '3PM': 0, '9PM': 0 };
  hitsConContexto.forEach(h => { if (porHorario[h.horario] !== undefined) porHorario[h.horario]++; });

  const ultimaVez    = hitsConContexto[hitsConContexto.length - 1];
  const primeraVez   = hitsConContexto[0];
  const sorteosDesde = (sorted.length - 1) - ultimaVez.idx;

  return {
    target, pad: pad(target),
    info:          guia[pad(target)] || {},
    totalHits:     hitsConContexto.length,
    totalRecup:    hitsRecup.length,
    totalNormal:   hitsNormal.length,
    avgGapTarget:  Math.round(avgGapTarget * 10) / 10,
    sorteosDesde,
    ultimaVez,
    primeraVez,
    porHorario,
    episodes,
    seguidores,
    seguidoresRecup,
    seguidoresNormal,
    antecesores,
    autoRep,
    cadenaRecup,
    estadoActual:  rezagoMap?.get(target) ?? null,
  };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

function numChip(num, guia, cls = '') {
  const pd  = pad(num);
  const sym = guia[pd]?.simbolo || '';
  return `
    <span class="cq-chip ${cls}" title="${sym}">
      <img class="cq-chip__img" src="data/img/${pd}.png" alt="${pd}"
        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
      <span class="cq-chip__num">${pd}</span>
      ${sym ? `<span class="cq-chip__sym">${sym}</span>` : ''}
    </span>`;
}

function estadoBadge(estadoActual, sorteosDesde) {
  if (!estadoActual) return '';
  const { estado, diasDesdeUltima, zScore, cicloPromedio } = estadoActual;
  const configs = {
    vencido:     { cls: 'cq-estado--vencido',    icon: '🔴', label: 'MODO RECUPERACIÓN' },
    en_ventana:  { cls: 'cq-estado--ventana',    icon: '🟡', label: 'EN VENTANA'        },
    normal:      { cls: 'cq-estado--normal',     icon: '🟢', label: 'Normal'            },
    reciente:    { cls: 'cq-estado--reciente',   icon: '⚡', label: 'Reciente'          },
    insuficiente:{ cls: 'cq-estado--insuficiente',icon:'⬜', label: 'Pocos datos'      },
    ausente:     { cls: 'cq-estado--ausente',    icon: '⬛', label: 'Sin historial'    },
  };
  const cfg = configs[estado] ?? configs.normal;
  const zTxt  = zScore != null ? ` · z=${zScore > 0 ? '+' : ''}${zScore}σ` : '';
  const cicTxt = cicloPromedio != null ? ` · ciclo ~${cicloPromedio}d` : '';
  return `<span class="cq-estado ${cfg.cls}" title="Días sin caer: ${diasDesdeUltima ?? sorteosDesde}${zTxt}${cicTxt}">
    ${cfg.icon} ${cfg.label}${diasDesdeUltima != null ? ` · ${diasDesdeUltima}d` : ` · ${sorteosDesde} sort.`}
  </span>`;
}

export function renderConsultaHTML(resultado, guia = {}) {
  if (!resultado) return '';

  const {
    target, pad: pd, info, totalHits, totalRecup, totalNormal, avgGapTarget,
    sorteosDesde, ultimaVez, porHorario, episodes,
    seguidores, seguidoresRecup, seguidoresNormal,
    antecesores, autoRep, cadenaRecup, estadoActual,
  } = resultado;

  if (!totalHits) {
    return `<div class="cq-wrap"><p class="hint small">El número ${pd} no aparece en el historial.</p></div>`;
  }

  const pctRecup = Math.round((totalRecup / totalHits) * 100);

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const headerHTML = `
    <div class="cq-header">
      <div class="cq-header__img-wrap">
        <img class="cq-header__img" src="data/img/${pd}.png" alt="${pd}"
          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
      </div>
      <div class="cq-header__info">
        <div class="cq-header__top-row">
          <span class="cq-header__num">${pd}</span>
          ${info.simbolo ? `<span class="cq-header__sym">${info.simbolo}</span>` : ''}
          ${info.familia ? `<span class="cq-header__fam">${info.familia}</span>` : ''}
          ${estadoBadge(estadoActual, sorteosDesde)}
        </div>
        <span class="cq-header__stats">
          Cayó <strong>${totalHits}</strong> veces ·
          Última: <strong>${ultimaVez.fecha} ${ultimaVez.horario}</strong> ·
          <strong>${sorteosDesde}</strong> sorteos sin caer
        </span>
        <div class="cq-horario-row">
          ${['11AM','3PM','9PM'].map(h =>
            `<span class="cq-h-chip">${h}: <strong>${porHorario[h]}</strong></span>`
          ).join('')}
        </div>
        ${totalRecup > 0 ? `
        <div class="cq-recup-summary">
          <span class="cq-recup-badge">🔄 ${totalRecup} de ${totalHits} apariciones en modo recuperación (${pctRecup}%)</span>
          ${avgGapTarget > 0 ? `<span class="cq-recup-ciclo">ciclo promedio: ${avgGapTarget} sorteos</span>` : ''}
        </div>` : ''}
      </div>
    </div>`;

  // ── Auto-repetición ───────────────────────────────────────────────────────
  const ar1 = Math.round((autoRep[1] / totalHits) * 100);
  const ar2 = Math.round((autoRep[2] / totalHits) * 100);
  const ar3 = Math.round((autoRep[3] / totalHits) * 100);
  const autoRepHTML = (ar1 + ar2 + ar3 > 0) ? `
    <div class="cq-section cq-section--autorep">
      <div class="cq-section__title">Auto-repetición (¿vuelve a caer pronto?)</div>
      <div class="cq-autorep-row">
        <div class="cq-autorep-item ${ar1 >= 20 ? 'cq-autorep-item--hot' : ''}">
          <span class="cq-autorep-label">1er sorteo</span>
          <span class="cq-autorep-pct">${ar1}%</span>
          <div class="cq-autorep-bar"><div class="cq-autorep-fill" style="width:${ar1}%"></div></div>
        </div>
        <div class="cq-autorep-item ${ar2 >= 15 ? 'cq-autorep-item--hot' : ''}">
          <span class="cq-autorep-label">2do sorteo</span>
          <span class="cq-autorep-pct">${ar2}%</span>
          <div class="cq-autorep-bar"><div class="cq-autorep-fill" style="width:${ar2}%"></div></div>
        </div>
        <div class="cq-autorep-item ${ar3 >= 12 ? 'cq-autorep-item--hot' : ''}">
          <span class="cq-autorep-label">3er sorteo</span>
          <span class="cq-autorep-pct">${ar3}%</span>
          <div class="cq-autorep-bar"><div class="cq-autorep-fill" style="width:${ar3}%"></div></div>
        </div>
      </div>
    </div>` : '';

  // ── Seguidores — general ──────────────────────────────────────────────────
  const segGeneralHTML = seguidores.length ? `
    <div class="cq-section">
      <div class="cq-section__title">Seguidores más frecuentes — general</div>
      <div class="cq-chips-row">
        ${seguidores.map(s => {
          const pct = Math.round((s.hits / totalHits) * 100);
          return `<div class="cq-seg-chip" title="${s.hits} veces">
            ${numChip(s.num, guia)}
            <span class="cq-seg-chip__pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Seguidores diferenciados ──────────────────────────────────────────────
  const segDifHTML = (seguidoresRecup.length || seguidoresNormal.length) && totalRecup >= 2 ? `
    <div class="cq-section cq-section--dif">
      <div class="cq-section__title">Seguidores diferenciados por contexto</div>
      <div class="cq-dif-grid">
        ${seguidoresRecup.length ? `
        <div class="cq-dif-col cq-dif-col--recup">
          <div class="cq-dif-col__head">🔴 En recuperación <span>(${totalRecup} ep.)</span></div>
          <div class="cq-chips-row cq-chips-row--sm">
            ${seguidoresRecup.map(s => {
              const pct = Math.round((s.hits / totalRecup) * 100);
              return `<div class="cq-seg-chip cq-seg-chip--sm" title="${s.hits} veces en recup.">
                ${numChip(s.num, guia, 'cq-chip--sm')}
                <span class="cq-seg-chip__pct">${pct}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
        ${seguidoresNormal.length ? `
        <div class="cq-dif-col cq-dif-col--normal">
          <div class="cq-dif-col__head">🟢 Normal <span>(${totalNormal} ep.)</span></div>
          <div class="cq-chips-row cq-chips-row--sm">
            ${seguidoresNormal.map(s => {
              const pct = Math.round((s.hits / Math.max(totalNormal, 1)) * 100);
              return `<div class="cq-seg-chip cq-seg-chip--sm" title="${s.hits} veces en normal">
                ${numChip(s.num, guia, 'cq-chip--sm')}
                <span class="cq-seg-chip__pct">${pct}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>` : '';

  // ── Antecesores ───────────────────────────────────────────────────────────
  const antHTML = antecesores.length ? `
    <div class="cq-section">
      <div class="cq-section__title">Antecesores frecuentes (vienen antes)</div>
      <div class="cq-chips-row">
        ${antecesores.map(a => {
          const pct = Math.round((a.hits / totalHits) * 100);
          return `<div class="cq-seg-chip" title="${a.hits} veces">
            ${numChip(a.num, guia)}
            <span class="cq-seg-chip__pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Cadena de recuperación ────────────────────────────────────────────────
  const cadenaHTML = cadenaRecup.length ? `
    <div class="cq-section cq-section--cadena">
      <div class="cq-section__title">🔗 Cadena de recuperación — compañeros de ausencia</div>
      <p class="cq-cadena-hint">Números que también volvieron tras larga ausencia en los sorteos siguientes al ${pd} en recuperación.</p>
      <div class="cq-chips-row">
        ${cadenaRecup.map(c => {
          const pct = Math.round((c.hits / totalRecup) * 100);
          return `<div class="cq-seg-chip cq-seg-chip--cadena" title="${c.hits} veces en cadena">
            ${numChip(c.num, guia, 'cq-chip--cadena')}
            <span class="cq-seg-chip__pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Episodios históricos ──────────────────────────────────────────────────
  const epHTML = episodes.length ? `
    <details class="cq-episodes">
      <summary class="cq-episodes__toggle">Ver episodios históricos (${episodes.length})</summary>
      <div class="cq-episodes__list">
        ${episodes.map(ep => {
          const rezBadge = ep.esRecuperacion
            ? `<span class="cq-ep-recup-badge">🔴 recup. ${ep.rezagoMomento} sort.</span>`
            : `<span class="cq-ep-normal-badge">${ep.rezagoMomento} sort.</span>`;
          const beforeChips = ep.before.map(d =>
            `<span class="cq-ep-num cq-ep-num--before">${pad(d.num)}<small>${d.horario}</small></span>`
          ).join('');
          const targetChip = `<span class="cq-ep-num cq-ep-num--target ${ep.esRecuperacion ? 'cq-ep-num--recup' : ''}">${pd}</span>`;
          const afterChips = ep.after.map(d =>
            `<span class="cq-ep-num cq-ep-num--after">${pad(d.num)}<small>${d.horario}</small></span>`
          ).join('');
          return `
            <div class="cq-episode ${ep.esRecuperacion ? 'cq-episode--recup' : ''}">
              <div class="cq-ep-meta">
                <span class="cq-ep-date">${ep.draw.fecha} ${ep.draw.horario}</span>
                ${rezBadge}
              </div>
              <div class="cq-ep-seq">
                ${beforeChips}
                <span class="cq-ep-sep">·</span>
                ${targetChip}
                <span class="cq-ep-sep">→</span>
                ${afterChips}
              </div>
            </div>`;
        }).join('')}
      </div>
    </details>` : '';

  return `
    <div class="cq-wrap">
      ${headerHTML}
      ${autoRepHTML}
      ${segGeneralHTML}
      ${segDifHTML}
      ${antHTML}
      ${cadenaHTML}
      ${epHTML}
      <p class="cq-hint">Porcentaje = sobre el total de ${totalHits} apariciones. Modo recuperación = gap > ${RECOVERY_RATIO}× ciclo promedio (${avgGapTarget} sorteos).</p>
    </div>`;
}
