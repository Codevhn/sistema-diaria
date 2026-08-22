/**
 * views/backtest-panel.js — Panel de backtest (validación honesta del motor)
 *
 * Extraído de app.js. Se auto-inicializa al importarse.
 */

import { DB } from "../storage.js";
import { escapeHtml } from "../ui/format.js";

    // ═══════════════════════════════════════════════════════════
    // BACKTEST — Validación honesta del motor
    // ═══════════════════════════════════════════════════════════
    const btnBacktestRun = document.getElementById("btn-backtest-run");
    const btnBacktestCancel = document.getElementById("btn-backtest-cancel");
    const btProgress = document.getElementById("bt-progress");
    const btOut = document.getElementById("bt-out");
    let btAbortCtl = null;

    function fmtPct(x) { return (x * 100).toFixed(2) + "%"; }
    function fmtLift(x) {
      const c = x >= 1.5 ? "#7adda1" : x >= 1.15 ? "#a8e0c0" : x >= 1.0 ? "#c8c8c8" : x >= 0.85 ? "#e0a888" : "#ff8080";
      return `<span style="color:${c};font-weight:700;">${x.toFixed(2)}×</span>`;
    }

    function renderBacktest(res) {
      if (res.error) {
        btOut.innerHTML = `<div class="hint" style="color:#ff8080;">${escapeHtml(res.error)}</div>`;
        return;
      }
      if (res.aborted) {
        btOut.innerHTML += `<div class="hint" style="color:#e0a888;">⚠ Cancelado tras ${res.evaluados} sorteos.</div>`;
        return;
      }
      const filas = res.resultados.map(r => `
        <tr>
          <td><strong>Top-${r.k}</strong></td>
          <td>${r.hits} / ${r.evaluados}</td>
          <td>${fmtPct(r.hitRate)}</td>
          <td>${fmtPct(r.baseline)}</td>
          <td>${fmtLift(r.lift)}</td>
          <td>${r.pctMejor >= 0 ? "+" : ""}${r.pctMejor.toFixed(1)}%</td>
        </tr>
      `).join("");

      const filasAño = (res.porAño || []).map(y => `
        <tr>
          <td>${y.año}</td>
          <td>${y.evaluados}</td>
          <td>${y.hitsK[10]} (${fmtLift(y.liftK10)})</td>
          <td>${y.hitsK[20]} (${fmtLift(y.liftK20)})</td>
        </tr>
      `).join("");

      const fuentesItems = (res.fuentesTop10 || []).slice(0, 8).map(f =>
        `<li><code>${f.source}</code> — contrib. ${f.totalContribucion}</li>`
      ).join("");

      const veredicto = (() => {
        const k10 = res.resultados.find(r => r.k === 10);
        if (!k10) return "";
        if (k10.lift >= 1.3) return `<div style="color:#7adda1;font-weight:700;margin-top:8px;">✅ El motor supera al azar de forma significativa en top-10 (${k10.lift.toFixed(2)}× la baseline). Hay señal real.</div>`;
        if (k10.lift >= 1.05) return `<div style="color:#c8c8c8;font-weight:700;margin-top:8px;">≈ Lift modesto en top-10 (${k10.lift.toFixed(2)}×). Hay señal pero pequeña — usar como filtro complementario, no como oráculo.</div>`;
        if (k10.lift >= 0.95) return `<div style="color:#e0a888;font-weight:700;margin-top:8px;">⚠ El motor está al nivel del azar en top-10 (${k10.lift.toFixed(2)}×). No hay ventaja demostrable todavía.</div>`;
        return `<div style="color:#ff8080;font-weight:700;margin-top:8px;">❌ El motor rinde POR DEBAJO del azar en top-10 (${k10.lift.toFixed(2)}×). Algo del modelo está mal calibrado.</div>`;
      })();

      btOut.innerHTML = `
        <div class="hint small">
          Evaluados: <strong>${res.evaluados}</strong> sorteos
          (${res.desde || "?"} → ${res.hasta || "?"})<br>
          Rank promedio del número que cayó: <strong>${res.meanRank}</strong> (mediana ${res.medianRank}) — ideal: lo más bajo posible<br>
          Sorteos donde el actual no recibió score alguno: <strong>${res.noScoredCount}</strong>
        </div>
        ${veredicto}
        <h4 style="margin-top:12px;">Hit-rate global por K</h4>
        <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
          <thead>
            <tr style="background:rgba(255,255,255,0.05);">
              <th style="text-align:left;padding:4px;">K</th>
              <th style="text-align:left;padding:4px;">Hits</th>
              <th style="text-align:left;padding:4px;">Hit-rate</th>
              <th style="text-align:left;padding:4px;">Baseline (azar)</th>
              <th style="text-align:left;padding:4px;">Lift</th>
              <th style="text-align:left;padding:4px;">Mejor que azar</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        ${filasAño ? `
          <h4 style="margin-top:14px;">Hit-rate por año (Top-10 / Top-20)</h4>
          <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
            <thead>
              <tr style="background:rgba(255,255,255,0.05);">
                <th style="text-align:left;padding:4px;">Año</th>
                <th style="text-align:left;padding:4px;">Evaluados</th>
                <th style="text-align:left;padding:4px;">Top-10 hits (lift)</th>
                <th style="text-align:left;padding:4px;">Top-20 hits (lift)</th>
              </tr>
            </thead>
            <tbody>${filasAño}</tbody>
          </table>` : ""}
        ${fuentesItems ? `
          <h4 style="margin-top:14px;">Fuentes de señal que más contribuyen a aciertos top-10</h4>
          <ul style="font-size:0.85em;">${fuentesItems}</ul>` : ""}
      `;
    }

    btnBacktestRun?.addEventListener("click", async () => {
      try {
        const warmup = parseInt(document.getElementById("bt-warmup").value, 10) || 300;
        const usePopularity = document.getElementById("bt-use-pop").checked;
        btnBacktestRun.disabled = true;
        btnBacktestCancel.disabled = false;
        btOut.innerHTML = "";
        btProgress.textContent = "Cargando sorteos…";

        const rawDraws = await DB.listDraws({ excludeTest: true });
        if (!rawDraws?.length) {
          btProgress.textContent = "Sin sorteos en la base.";
          return;
        }
        btProgress.textContent = `Cargados ${rawDraws.length} sorteos. Iniciando backtest…`;

        btAbortCtl = new AbortController();
        const { backtest } = await import("./backtest.js");
        const res = await backtest(rawDraws, {
          warmup,
          usePopularity,
          signal: btAbortCtl.signal,
          onProgress: ({ done, total, hits }) => {
            const pct = total ? Math.round((done / total) * 100) : 0;
            btProgress.textContent = `Procesando… ${done}/${total} (${pct}%) · top-10 hits: ${hits[10] || 0}`;
          },
        });
        btProgress.textContent = `Listo: ${res.evaluados || 0} sorteos evaluados.`;
        renderBacktest(res);
      } catch (err) {
        console.error("backtest error", err);
        btProgress.textContent = `Error: ${err.message}`;
      } finally {
        btnBacktestRun.disabled = false;
        btnBacktestCancel.disabled = true;
        btAbortCtl = null;
      }
    });

    btnBacktestCancel?.addEventListener("click", () => {
      btAbortCtl?.abort();
      btProgress.textContent = "Cancelando…";
    });


