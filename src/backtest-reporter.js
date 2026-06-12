/**
 * backtest-reporter.js
 *
 * Genera reportes HTML y estructurados a partir de los resultados de
 * backtestV4 / compararV3vsV4.
 *
 * Exports:
 *   buildReporteHTML(comparacion)     → string HTML
 *   buildResumenTexto(comparacion)    → string texto plano (para logs)
 *   buildReporteEstructurado(comp)    → object limpio para persistir
 */

// ---------------------------------------------------------------------------
// HTML principal
// ---------------------------------------------------------------------------

/**
 * Genera el HTML completo del panel de resultados de backtest.
 *
 * @param {object} comparacion - resultado de compararV3vsV4()
 * @returns {string}
 */
export function buildReporteHTML(comparacion) {
  if (!comparacion || comparacion.error) {
    return `<div class="bt-error">⚠ Error en backtest: ${comparacion?.error ?? 'desconocido'}</div>`;
  }
  if (comparacion.aborted) {
    return `<div class="bt-info">Backtest cancelado.</div>`;
  }

  const { v3, v4, mejoras, veredicto } = comparacion;

  return `
    <div class="bt-report">
      ${_buildVeredictoHTML(veredicto)}
      ${_buildComparacionTabla(mejoras, v3, v4)}
      ${_buildMetricasV4(v4)}
      ${_buildPorRegimen(v4)}
      ${_buildFuentes(v3, v4)}
      <div class="bt-footer muted">
        Período: ${v4.desde ?? '?'} → ${v4.hasta ?? '?'} ·
        ${v4.evaluados} sorteos evaluados (v4) ·
        warmup: ${300}
      </div>
    </div>`;
}

function _buildVeredictoHTML(v) {
  if (!v) return '';
  const cls = v.positivo ? 'bt-veredicto--ok' : 'bt-veredicto--warn';
  return `
    <div class="bt-veredicto ${cls}">
      <span class="bt-veredicto__icono">${v.icono ?? ''}</span>
      <span class="bt-veredicto__texto">${v.texto}</span>
    </div>`;
}

function _buildComparacionTabla(mejoras, v3, v4) {
  const v3Evals = v3?.evaluados ?? 0;
  const v4Evals = v4?.evaluados ?? 0;

  const rows = mejoras.map(m => {
    const mejor   = m.deltaLift > 0.03;
    const peor    = m.deltaLift < -0.03;
    const dirIcon = mejor ? '↑' : peor ? '↓' : '→';
    const dirCls  = mejor ? 'bt-delta--pos' : peor ? 'bt-delta--neg' : '';

    return `
      <tr>
        <td class="bt-k">Top-${m.k}</td>
        <td>${_pct(m.v3HitRate)} <small>(${m.v3Lift.toFixed(2)}×)</small></td>
        <td>${_pct(m.v4HitRate)} <small>(${m.v4Lift.toFixed(2)}×)</small></td>
        <td class="${dirCls}">${dirIcon} ${m.deltaLift >= 0 ? '+' : ''}${m.deltaLift.toFixed(2)}×</td>
        <td class="${dirCls}">${m.mejora >= 0 ? '+' : ''}${m.mejora.toFixed(0)}%</td>
      </tr>`;
  }).join('');

  return `
    <div class="bt-section">
      <div class="bt-section-title">Comparación V3 vs V4</div>
      <div class="bt-evals-note muted">V3: ${v3Evals} evaluados · V4: ${v4Evals} evaluados</div>
      <table class="bt-table">
        <thead>
          <tr>
            <th>Posición</th>
            <th>V3 hit rate</th>
            <th>V4 hit rate</th>
            <th>Δ Lift</th>
            <th>Mejora %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _buildMetricasV4(v4) {
  if (!v4) return '';
  const mr = v4.meanRank != null ? v4.meanRank.toFixed(1) : '?';
  const med = v4.medianRank != null ? v4.medianRank : '?';

  const cfg = v4.config ?? {};
  const flags = [
    cfg.usePresion       ? '✓ Presión adversarial' : '✗ Sin presión',
    cfg.useRegimen       ? '✓ Régimen dinámico'    : '✗ Sin régimen',
    cfg.useDynamicWeights? '✓ Pesos dinámicos'     : '✗ Pesos fijos',
  ].join(' · ');

  const pesosRows = v4.pesosFinales
    ? Object.entries(v4.pesosFinales)
        .sort((a, b) => b[1] - a[1])
        .map(([m, p]) => `<span class="bt-peso-chip">${m} <b>${(p*100).toFixed(0)}%</b></span>`)
        .join('')
    : '';

  return `
    <div class="bt-section">
      <div class="bt-section-title">Métricas V4</div>
      <div class="bt-metrics-row">
        <div class="bt-metric"><span class="bt-metric-label">Rank medio</span><span class="bt-metric-val">${mr}</span></div>
        <div class="bt-metric"><span class="bt-metric-label">Rank mediano</span><span class="bt-metric-val">${med}</span></div>
      </div>
      <div class="bt-flags muted">${flags}</div>
      ${pesosRows ? `<div class="bt-pesos">${pesosRows}</div>` : ''}
    </div>`;
}

function _buildPorRegimen(v4) {
  if (!v4?.porRegimen?.length) return '';

  const rows = v4.porRegimen
    .filter(r => r.evaluados >= 10)
    .sort((a, b) => b.evaluados - a.evaluados)
    .map(r => `
      <tr>
        <td class="bt-reg-name">${r.regimen.replace(/_/g, ' ')}</td>
        <td>${r.evaluados}</td>
        <td>${_pct(r.hitRateK5)} <small>(${r.liftK5.toFixed(1)}×)</small></td>
        <td>${_pct(r.hitRateK10)} <small>(${r.liftK10.toFixed(1)}×)</small></td>
      </tr>`).join('');

  if (!rows) return '';

  return `
    <div class="bt-section">
      <div class="bt-section-title">Rendimiento por Régimen (V4)</div>
      <table class="bt-table">
        <thead><tr><th>Régimen</th><th>Sorteos</th><th>Top-5</th><th>Top-10</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _buildFuentes(v3, v4) {
  if (!v4?.fuentesContrib?.length) return '';

  const v3Fuentes = v3?.fuentesTop10 ?? [];
  const rows = v4.fuentesContrib.slice(0, 7).map(f => {
    const v3f = v3Fuentes.find(x => x.source === f.source);
    const delta = v3f ? (f.hitRate - (v3f.totalContribucion / Math.max(1, v3?.evaluados ?? 1) * 10)) : null;
    return `
      <tr>
        <td>${f.source}</td>
        <td>${f.hits}/${f.total}</td>
        <td>${_pct(f.hitRate)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="bt-section">
      <div class="bt-section-title">Contribución de motores (V4, top-10)</div>
      <table class="bt-table">
        <thead><tr><th>Motor</th><th>Aciertos</th><th>Hit rate</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Texto plano
// ---------------------------------------------------------------------------

export function buildResumenTexto(comparacion) {
  if (!comparacion || comparacion.error) return `Backtest error: ${comparacion?.error}`;

  const { v3, v4, mejoras, veredicto } = comparacion;
  const lines = [
    `=== BACKTEST V3 vs V4 ===`,
    `Período: ${v4?.desde} → ${v4?.hasta}`,
    `Evaluados: V3=${v3?.evaluados} | V4=${v4?.evaluados}`,
    '',
    'COMPARACIÓN:',
    ...(mejoras ?? []).map(m =>
      `  Top-${m.k}: V3=${_pct(m.v3HitRate)} (${m.v3Lift.toFixed(2)}×) | V4=${_pct(m.v4HitRate)} (${m.v4Lift.toFixed(2)}×) | Δ=${m.deltaLift >= 0 ? '+' : ''}${m.deltaLift.toFixed(2)}×`
    ),
    '',
    `VEREDICTO: ${veredicto?.icono ?? ''} ${veredicto?.texto ?? ''}`,
    '',
    `Pesos finales V4: ${JSON.stringify(v4?.pesosFinales ?? {})}`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Objeto estructurado (para persistir en knowledge table)
// ---------------------------------------------------------------------------

export function buildReporteEstructurado(comparacion) {
  if (!comparacion || comparacion.error) return null;
  const { v3, v4, mejoras, veredicto } = comparacion;
  return {
    version:   '4.0',
    fecha:     comparacion.timestamp ?? new Date().toISOString(),
    evaluados: { v3: v3?.evaluados, v4: v4?.evaluados },
    mejoras,
    veredicto,
    pesosFinales:  v4?.pesosFinales,
    porRegimen:    v4?.porRegimen,
    fuentesContrib: v4?.fuentesContrib,
    v3Ranks: { mean: v3?.meanRank, median: v3?.medianRank },
    v4Ranks: { mean: v4?.meanRank, median: v4?.medianRank },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _pct(v) {
  return `${((v ?? 0) * 100).toFixed(1)}%`;
}
