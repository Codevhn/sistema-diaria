/**
 * honesty-panel.js — Panel de Honestidad del Sistema
 *
 * Responde sin maquillaje la pregunta clave: ¿el sistema le gana al azar?
 *   - Hit-rate real (acumulado y reciente) con intervalo de credibilidad
 *   - Lift vs baseline (topN/100) con su incertidumbre
 *   - Batería de tests de aleatoriedad del histórico (randomness-audit)
 *
 * Si el intervalo del lift contiene 1.0, el sistema NO ha demostrado
 * ventaja sobre el azar — y el panel lo dice con esas palabras.
 */

import { computeHitTrackerStats } from "./hit-tracker.js";
import { betaCredibleInterval } from "./stats-utils.js";
import { auditarAleatoriedad, VEREDICTO_LABEL } from "./randomness-audit.js";

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function liftConIC(hits, total, baseline) {
  const ic = betaCredibleInterval(hits, total);
  return {
    central: baseline > 0 && total > 0 ? hits / total / baseline : 0,
    low: baseline > 0 ? ic.low / baseline : 0,
    high: baseline > 0 ? ic.high / baseline : 0,
    icRate: ic,
  };
}

function clasificarEvidencia(lift, n) {
  if (n < 10) return { label: "Sin datos suficientes", color: "#888", desc: `Solo ${n} predicciones evaluadas; se necesitan ≥10 para empezar a medir.` };
  if (lift.low > 1) return { label: "Ventaja demostrada", color: "#5cba5c", desc: "Todo el intervalo del lift está por encima de 1: el sistema supera al azar con esta muestra." };
  if (lift.high < 1) return { label: "Peor que el azar", color: "#e05c5c", desc: "Todo el intervalo está por debajo de 1: con esta muestra el sistema rinde peor que elegir al azar." };
  return { label: "Sin ventaja demostrada", color: "#e0b84a", desc: "El intervalo del lift contiene 1.0: no se puede afirmar que el sistema le gane al azar (ni que pierda)." };
}

function renderMetricaHTML(titulo, hits, total, baseline) {
  if (!total) {
    return `<div class="honesty-metric"><div class="honesty-metric__title">${titulo}</div><div class="honesty-metric__empty">Sin predicciones evaluadas</div></div>`;
  }
  const lift = liftConIC(hits, total, baseline);
  const ev = clasificarEvidencia(lift, total);
  return `
    <div class="honesty-metric">
      <div class="honesty-metric__title">${titulo}</div>
      <div class="honesty-metric__main">
        <span class="honesty-metric__rate">${pct(hits / total)}</span>
        <span class="honesty-metric__ci">IC95: ${pct(lift.icRate.low)}–${pct(lift.icRate.high)}</span>
      </div>
      <div class="honesty-metric__sub">${hits}/${total} batches · baseline azar ${pct(baseline)}</div>
      <div class="honesty-metric__lift">
        Lift: <b>${lift.central.toFixed(2)}×</b>
        <span class="honesty-metric__ci">[${lift.low.toFixed(2)}–${lift.high.toFixed(2)}]</span>
      </div>
      <div class="honesty-verdict" style="border-color:${ev.color};color:${ev.color}">${ev.label}</div>
      <div class="honesty-metric__desc">${ev.desc}</div>
    </div>`;
}

function renderAleatoriedadHTML(audit) {
  const v = VEREDICTO_LABEL[audit.veredicto] ?? VEREDICTO_LABEL.insuficiente;
  if (!audit.suficiente) {
    return `<div class="honesty-rand">
      <div class="honesty-rand__head" style="color:${v.color}">${v.label}</div>
      <div class="honesty-metric__desc">${v.desc} (${audit.totalSorteos}/${audit.minimo} sorteos)</div>
    </div>`;
  }
  const filas = audit.tests.map((t) => {
    const p = Number.isFinite(t.pValue) ? t.pValue : null;
    const pTxt = p === null ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3);
    const sig = t.significativoFDR ? "✓" : "";
    return `<tr class="${t.significativoFDR ? "honesty-row--sig" : ""}">
      <td>${t.nombre}</td>
      <td class="honesty-td-num">${pTxt}</td>
      <td class="honesty-td-num">${sig}</td>
      <td class="honesty-td-detail">${t.detalle}${t.advertencia ? ` · ⚠ ${t.advertencia}` : ""}</td>
    </tr>`;
  }).join("");
  return `<div class="honesty-rand">
    <div class="honesty-rand__head" style="color:${v.color}">${v.label}</div>
    <div class="honesty-metric__desc">${v.desc}</div>
    <table class="honesty-table">
      <thead><tr><th>Test</th><th>p-valor</th><th>FDR</th><th>Detalle</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="honesty-metric__sub">
      ${audit.totalSorteos} sorteos · entropía normalizada ${audit.entropia !== null ? (audit.entropia * 100).toFixed(1) + "%" : "—"}
      · "FDR ✓" = significativo tras corrección por pruebas múltiples (q=0.05)
    </div>
  </div>`;
}

/**
 * Renderiza el panel completo dentro del contenedor dado.
 * @param {HTMLElement} container
 * @param {Array} draws  histórico de sorteos (para el test de aleatoriedad)
 * @param {object} [opts] { pais }
 */
export async function renderHonestyPanel(container, draws = [], opts = {}) {
  if (!container) return;
  container.innerHTML = '<div class="mesa-loading">Midiendo honestidad…</div>';

  let stats = null;
  let statsError = null;
  try {
    stats = await computeHitTrackerStats({ recent: 30 });
  } catch (e) {
    statsError = e?.message || String(e);
  }

  let audit;
  try {
    audit = auditarAleatoriedad(draws, opts);
  } catch (e) {
    audit = { suficiente: false, totalSorteos: 0, minimo: 100, tests: [], veredicto: "insuficiente" };
    console.warn("[honesty-panel] auditarAleatoriedad:", e?.message);
  }

  const notaExcluidos = stats?.excluidosNoSellados
    ? `<div class="honesty-metric__sub" style="margin-top:.4rem">
        🔒 ${stats.excluidosNoSellados} batch(es) excluido(s): no se pudo verificar que la predicción
        se registró <b>antes</b> del sorteo (post-hoc o sin timestamp). Solo las predicciones
        selladas cuentan como evidencia.
      </div>`
    : "";

  const metricas = statsError
    ? `<div class="honesty-metric__empty">⚠ No se pudieron cargar las métricas: ${statsError}</div>`
    : `<div class="honesty-metrics-row">
        ${renderMetricaHTML("Histórico completo", stats.hits, stats.resolved, stats.baseline)}
        ${renderMetricaHTML(`Últimos ${stats.recent.n || 0} batches`, stats.recent.hits, stats.recent.n, stats.baseline)}
      </div>${notaExcluidos}`;

  container.innerHTML = `
    ${metricas}
    <div class="honesty-section-title">¿El sorteo es realmente predecible? — Tests de aleatoriedad</div>
    ${renderAleatoriedadHTML(audit)}
  `;
}
