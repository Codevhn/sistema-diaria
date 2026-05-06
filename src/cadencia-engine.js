/**
 * cadencia-engine.js — Detector de ritmos y cadencias por categoría.
 *
 * Analiza cuántos sorteos suelen pasar entre apariciones de una
 * categoría (familia, decena, terminación, paridad, dobles…).
 * Detecta qué categorías están en ventana, se están aproximando
 * o llevan más tiempo del ciclo habitual sin aparecer.
 *
 * Diferencia clave frente al rezago individual:
 *   - Rezago → cada cuánto cae el número N (individual)
 *   - Cadencia → cada cuánto cae un número de la familia X / decena Y / etc.
 *
 * Statuses:
 *   vencida      → currentGap > media + 1σ   (pasó su ciclo, "atrasada")
 *   en-ventana   → media - 1σ ≤ gap ≤ media + 1σ
 *   aproximandose→ 0.7·media ≤ gap < media - 1σ
 *   reciente     → gap < 0.7·media (cayó hace poco)
 */

const MIN_CYCLES = 6;       // mínimo de intervalos para confiar en el ciclo

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const s = Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length);
  return { mean: m, std: s };
}

// ─── Análisis de una categoría ────────────────────────────────────────────────

function analyzeCat(label, tipo, matchFn, sorted) {
  // Índices de todos los sorteos que pertenecen a la categoría
  const idxs = [];
  for (let i = 0; i < sorted.length; i++) {
    if (matchFn(sorted[i].num)) idxs.push(i);
  }
  if (idxs.length < MIN_CYCLES + 1) return null;

  // Intervalos entre apariciones consecutivas (en sorteos)
  const gaps = [];
  for (let i = 1; i < idxs.length; i++) {
    gaps.push(idxs[i] - idxs[i - 1]);
  }
  if (gaps.length < MIN_CYCLES) return null;

  const { mean, std } = meanStd(gaps);
  if (mean < 1) return null;                       // categoría demasiado frecuente

  const currentGap  = (sorted.length - 1) - idxs[idxs.length - 1];
  const lastDraw    = sorted[idxs[idxs.length - 1]];

  // Último número concreto que cayó en esta categoría
  const lastNum = lastDraw.num;

  let status, urgency;
  if (currentGap > mean + std) {
    status = 'vencida';      urgency = 4;
  } else if (currentGap >= mean - std) {
    status = 'en-ventana';   urgency = 3;
  } else if (currentGap >= mean * 0.7) {
    status = 'aproximandose'; urgency = 2;
  } else {
    status = 'reciente';     urgency = 1;
  }

  return {
    label, tipo,
    cicloMedio:   Math.round(mean * 10) / 10,
    desviacion:   Math.round(std  * 10) / 10,
    currentGap,
    lastFecha:    lastDraw.fecha,
    lastHorario:  lastDraw.horario,
    lastNum,
    totalHits:    idxs.length,
    status,
    urgency,
  };
}

// ─── Análisis completo ────────────────────────────────────────────────────────

/**
 * @param {Array}  draws
 * @param {object} guia
 * @param {object} opts
 * @param {string} [opts.pais]
 * @returns {{ cadencias: Array, total: number } | null}
 */
export function analizarCadencias(draws, guia = {}, { pais = null } = {}) {
  const sorted = parseAndSort(draws, pais);
  if (sorted.length < 60) return null;

  const results = [];

  // ── Por familia (guía de los sueños) ────────────────────────────────────────
  const familias = new Set(Object.values(guia).map(g => g.familia).filter(Boolean));
  familias.forEach(fam => {
    const nums = new Set(
      Object.entries(guia)
        .filter(([, v]) => v.familia === fam)
        .map(([k]) => parseInt(k, 10))
    );
    if (nums.size < 2) return;
    const r = analyzeCat(`Familia ${fam}`, 'familia', n => nums.has(n), sorted);
    if (r) results.push(r);
  });

  // ── Por decena (00-09, 10-19, …, 90-99) ─────────────────────────────────────
  for (let dec = 0; dec <= 9; dec++) {
    const r = analyzeCat(
      `Decena ${dec}0–${dec < 9 ? dec + '' + 9 : '99'}`,
      'decena',
      n => Math.floor(n / 10) === dec,
      sorted
    );
    if (r) results.push(r);
  }

  // ── Por terminación (dígito de unidades) ─────────────────────────────────────
  for (let dig = 0; dig <= 9; dig++) {
    const r = analyzeCat(`Terminados en ${dig}`, 'terminacion', n => n % 10 === dig, sorted);
    if (r) results.push(r);
  }

  // ── Paridad ──────────────────────────────────────────────────────────────────
  const rPar   = analyzeCat('Números pares',   'paridad', n => n % 2 === 0, sorted);
  const rImpar = analyzeCat('Números impares', 'paridad', n => n % 2 !== 0, sorted);
  if (rPar)   results.push(rPar);
  if (rImpar) results.push(rImpar);

  // ── Dobles (00, 11, 22…99) ───────────────────────────────────────────────────
  const rDob = analyzeCat('Dobles (00, 11…99)', 'patron', n => n % 11 === 0, sorted);
  if (rDob) results.push(rDob);

  // ── Múltiplos de 5 ───────────────────────────────────────────────────────────
  const rM5 = analyzeCat('Múltiplos de 5', 'patron', n => n % 5 === 0, sorted);
  if (rM5) results.push(rM5);

  // ── Solo urgentes: vencidas, en-ventana, aproximándose ─────────────────────
  const activas = results
    .filter(c => c.status !== 'reciente')
    .sort((a, b) => b.urgency - a.urgency || b.currentGap - a.currentGap);

  return { cadencias: activas, total: results.length };
}

// ─── Render HTML ──────────────────────────────────────────────────────────────

export function renderCadenciasHTML(resultado) {
  if (!resultado || !resultado.cadencias.length) return '';

  const { cadencias } = resultado;

  const STATUS = {
    vencida:       { icon: '🔴', label: 'Vencida — pasó su ciclo',   cls: 'cad--vencida' },
    'en-ventana':  { icon: '🟢', label: 'En ventana de reaparición', cls: 'cad--ventana' },
    aproximandose: { icon: '🟡', label: 'Aproximándose',             cls: 'cad--aprox'   },
  };

  // Agrupar por tipo para mostrar en secciones
  const tiposOrden = ['familia', 'decena', 'terminacion', 'paridad', 'patron'];
  const tiposLabel = {
    familia:     'Por familia',
    decena:      'Por decena',
    terminacion: 'Por terminación',
    paridad:     'Paridad',
    patron:      'Patrones',
  };

  let html = '';
  tiposOrden.forEach(tipo => {
    const grupo = cadencias.filter(c => c.tipo === tipo);
    if (!grupo.length) return;

    const chips = grupo.slice(0, 8).map(c => {
      const st = STATUS[c.status];
      if (!st) return '';
      const ratio = c.cicloMedio > 0
        ? Math.round((c.currentGap / c.cicloMedio) * 100)
        : 0;
      return `
        <div class="cad-chip ${st.cls}"
          title="Ciclo medio: ${c.cicloMedio} sorteos · Desviación ±${c.desviacion} · Último: ${c.lastNum < 10 ? '0' : ''}${c.lastNum} el ${c.lastFecha}">
          <span class="cad-chip__icon">${st.icon}</span>
          <span class="cad-chip__name">${c.label}</span>
          <div class="cad-chip__meta">
            <span class="cad-chip__gap">${c.currentGap} / ~${Math.round(c.cicloMedio)} sorteos</span>
            <div class="cad-chip__bar">
              <div class="cad-chip__bar-fill" style="width:${Math.min(ratio, 100)}%"></div>
            </div>
          </div>
        </div>`;
    }).join('');

    html += `
      <div class="cad-grupo">
        <span class="cad-grupo__label">${tiposLabel[tipo]}</span>
        <div class="cad-chips">${chips}</div>
      </div>`;
  });

  return `
    <div class="cad-wrap">
      <div class="cad-head">
        <span class="cad-title">⏱ Cadencias — ritmos activos</span>
        <span class="cad-sub">Categorías de números según su ciclo histórico de reaparición</span>
      </div>
      ${html}
      <p class="cad-hint">🔴 Pasó su ciclo · 🟢 En ventana · 🟡 Aproximándose · barra = progreso del ciclo actual</p>
    </div>`;
}
