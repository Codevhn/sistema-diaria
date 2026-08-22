/**
 * views/pega3-panel.js — Panel Pega 3 (registro, historial, análisis y generador)
 *
 * Extraído de app.js. withButtonBusy y los turnos vigentes se inyectan vía
 * initPega3Panel() para desacoplar del núcleo de app.js.
 */

import { DB } from "../storage.js";
import { evaluarMotorPega3 } from "../pega3-engine.js";
import { getSimpleConversions, getCompositeConversions } from "../conversion-engine.js";
import { getTodayISODate } from "../date-utils.js";
import { showToast } from "../ui/toast.js";
import { formatNumber, formatFriendlyDate, incrementISODate } from "../ui/format.js";

const hooks = {};
let TURNOS = [];
export function initPega3Panel(options = {}) {
  Object.assign(hooks, {
    botonOcupado: options.botonOcupado ?? ((btn, label) => () => {}),
  });
  TURNOS = options.horarioKeys ?? [];
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

    let pega3DrawCache = [];
    let pega3ActiveDrawId = null;
    let pega3AnalysisCache = null;
    let _pega3Page = 0;
    const PEGA3_PAGE_SIZE = 30;
    let _pega3Filter = "";

    const pega3FechaInput = document.getElementById("pega3-fecha");
    const pega3TurnoSelect = document.getElementById("pega3-turno");
    const pega3PaisSelect = document.getElementById("pega3-pais");
    const pega3ContextSyncBtn = document.getElementById("pega3-context-sync");
    const pega3FormStatus = document.getElementById("pega3-form-status");
    const pega3SaveBtn = document.getElementById("pega3-btn-registrar");
    const pega3ParInputs = [
      document.getElementById("pega3-par-1"),
      document.getElementById("pega3-par-2"),
      document.getElementById("pega3-par-3"),
    ];
    const pega3GeneratorBtn = document.getElementById("pega3-btn-generar-trio");
    const pega3GeneratorOutput = document.getElementById("pega3-generator-output");
    const pega3Historial = document.getElementById("pega3-historial");
    const pega3Resumen = document.getElementById("pega3-resumen");
    const pega3Sesgos = document.getElementById("pega3-sesgos");
    const pega3Seleccion = document.getElementById("pega3-seleccion");
    const pega3PendingDeletion = new Map();

    const PEGA3_TURN_LABELS = {
      "11AM": "11 AM",
      "3PM": "3 PM",
      "9PM": "9 PM",
    };
    const PEGA3_TURN_SEQUENCE = ["11AM", "3PM", "9PM"];
    let pega3TurnPointer = 0;
    const PEGA3_COUNTRY_LABELS = {
      HN: "Honduras",
    };
    const PEGA3_COLOR_BUCKETS = 6;
    const PEGA3_CONVERSION_LABELS = {
      simple: "Conversión simple",
      ajuste: "Ajuste (100−n)",
      composite: "Conversión compuesta",
    };

    function detectPega3Turno(now = new Date()) {
      const hour = now.getHours();
      if (hour >= 20) return "9PM";
      if (hour >= 14) return "3PM";
      return "11AM";
    }

    function updatePega3TurnPointer(value) {
      const idx = PEGA3_TURN_SEQUENCE.indexOf(value);
      pega3TurnPointer = idx >= 0 ? idx : 0;
    }

    function normalizeTwoDigit(numero) {
      if (!Number.isFinite(numero)) return null;
      const mod = numero % 100;
      return mod < 0 ? mod + 100 : mod;
    }

    function computePega3Ajuste(numero) {
      const normalized = normalizeTwoDigit(numero);
      if (normalized === null) return null;
      return (100 - normalized) % 100;
    }

    function buildPega3ConversionPool(numero) {
      const normalized = normalizeTwoDigit(numero);
      if (normalized === null) return [];
      const entries = new Map();
      const pushCandidate = (value, label) => {
        const candidate = normalizeTwoDigit(value);
        if (candidate === null) return;
        if (!entries.has(candidate)) {
          entries.set(candidate, { numero: candidate, label });
        }
      };
      const simpleList = getSimpleConversions(normalized) || [];
      simpleList.forEach((value) => pushCandidate(value, PEGA3_CONVERSION_LABELS.simple));
      const ajuste = computePega3Ajuste(normalized);
      if (ajuste !== null) pushCandidate(ajuste, PEGA3_CONVERSION_LABELS.ajuste);
      const compositeList = getCompositeConversions(normalized) || [];
      compositeList.forEach((value) => pushCandidate(value, PEGA3_CONVERSION_LABELS.composite));
      if (!entries.size) {
        pushCandidate(normalized, "Base");
      }
      return Array.from(entries.values());
    }

    function pickRandomEntry(list = []) {
      if (!Array.isArray(list) || !list.length) return null;
      const idx = Math.floor(Math.random() * list.length);
      return list[idx] || null;
    }

    function advancePega3TurnPointer({ rollDate = false } = {}) {
      const prevPointer = pega3TurnPointer;
      pega3TurnPointer = (pega3TurnPointer + 1) % PEGA3_TURN_SEQUENCE.length;
      const loopedToStart =
        prevPointer === PEGA3_TURN_SEQUENCE.length - 1 && pega3TurnPointer === 0;
      if (pega3TurnoSelect) {
        if (rollDate && loopedToStart && pega3FechaInput) {
          const nextDate = incrementISODate(pega3FechaInput.value, 1);
          if (nextDate) pega3FechaInput.value = nextDate;
        }
        pega3TurnoSelect.value = PEGA3_TURN_SEQUENCE[pega3TurnPointer];
        prefillPega3Inputs({ forceClear: true });
      }
    }

    function syncPega3Context({ force = false } = {}) {
      if (!pega3FechaInput || !pega3TurnoSelect || !pega3PaisSelect) return;
      const now = new Date();
      if (force || !pega3FechaInput.value) {
        pega3FechaInput.value = getTodayISODate();
      }
      if (force || !pega3TurnoSelect.value) {
        pega3TurnoSelect.value = detectPega3Turno(now);
      }
      if (force || !pega3PaisSelect.value) {
        pega3PaisSelect.value = "HN";
      }
      updatePega3TurnPointer(pega3TurnoSelect.value);
      prefillPega3Inputs({ forceClear: true });
    }

    syncPega3Context();
    pega3ContextSyncBtn?.addEventListener("click", () => syncPega3Context({ force: true }));
    pega3TurnoSelect?.addEventListener("change", () => {
      updatePega3TurnPointer(pega3TurnoSelect.value);
      prefillPega3Inputs({ forceClear: true });
    });
    pega3FechaInput?.addEventListener("change", () => prefillPega3Inputs({ forceClear: true }));
    pega3PaisSelect?.addEventListener("change", () => prefillPega3Inputs({ forceClear: true }));

    async function handlePega3Save(event) {
      event?.preventDefault();
      const fecha = pega3FechaInput?.value;
      const horario = pega3TurnoSelect?.value || "11AM";
      const pais = (pega3PaisSelect?.value || "HN").toUpperCase();
      const pares = pega3ParInputs
        .map((input) => parseInt(input?.value ?? "", 10))
        .filter((value) => Number.isFinite(value));
      if (!fecha || pares.length !== 3) {
        showToast("Completa la fecha y los tres pares antes de guardar.", { variant: "warning" });
        return;
      }
      const cachedMatch = findCachedPega3Draw({ fecha, horario, pais });
      if (cachedMatch && pega3ActiveDrawId !== cachedMatch.id) {
        showToast("Ya tienes un sorteo registrado para ese turno y fecha. Usa la vista de historial o edita el registro actual.", {
          variant: "warning",
          timeout: 4000,
        });
        fillPega3InputsFromDraw(cachedMatch);
        updatePega3FormStatus(cachedMatch);
        return;
      }
      const isUpdating = Boolean(pega3ActiveDrawId);
      const release = hooks.botonOcupado(pega3SaveBtn, "Guardando…");
      try {
        await DB.savePega3Draw({ fecha, horario, pais, pares });
        const toastMsg = isUpdating ? "Sorteo Pega3 actualizado." : "Sorteo Pega3 guardado.";
        showToast(toastMsg, { variant: "success", timeout: 2000 });
        pega3ParInputs.forEach((input) => {
          if (input) input.value = "";
        });
        advancePega3TurnPointer({ rollDate: horario === "9PM" });
        await refreshPega3Historial({ silent: true });
      } catch (err) {
        console.error("pega3 save error", err);
        showToast(`No se pudo guardar el sorteo: ${err.message}`, { variant: "danger" });
      } finally {
        release();
      }
    }

    async function refreshPega3Historial({ silent = false } = {}) {
      if (!pega3Historial) return;
      if (!silent) pega3Historial.innerHTML = "<p class='hint'>Cargando historial…</p>";
      try {
        const list = await DB.listPega3Draws();
        pega3DrawCache = list
          .slice()
          .sort((a, b) => {
            if (a.fecha === b.fecha) {
              return TURNOS.indexOf(b.horario) - TURNOS.indexOf(a.horario);
            }
            return a.fecha > b.fecha ? -1 : 1;
          });
        renderPega3HistorialList(pega3DrawCache);
        prefillPega3Inputs();
      } catch (err) {
        console.error("pega3 historial error", err);
        pega3Historial.innerHTML = `<p class='hint'>No se pudo leer el historial: ${err.message}</p>`;
      }
    }

    function clearPega3Inputs() {
      pega3ParInputs.forEach((input) => {
        if (input) input.value = "";
      });
    }

    function updatePega3FormStatus(draw = null) {
      pega3ActiveDrawId = draw?.id ?? null;
      const statusEl = pega3FormStatus;
      if (statusEl) {
        if (draw) {
          const friendlyDate = draw.fecha ? formatFriendlyDate(draw.fecha) : "";
          const turnoLabel = PEGA3_TURN_LABELS[draw.horario] || draw.horario || "";
          const paisCode = (draw.pais || "HN").toUpperCase();
          const paisLabel = PEGA3_COUNTRY_LABELS[paisCode] || paisCode;
          const descriptor = [friendlyDate || draw.fecha || "", turnoLabel, paisLabel]
            .filter(Boolean)
            .join(" · ");
          statusEl.textContent = descriptor ? `Sorteo registrado: ${descriptor}` : "Sorteo registrado.";
          statusEl.dataset.state = "filled";
        } else {
          statusEl.textContent = "";
          statusEl.dataset.state = "empty";
        }
      }
      if (pega3SaveBtn) {
        pega3SaveBtn.textContent = draw ? "Actualizar sorteo" : "Guardar sorteo";
      }
    }

    function normalizePega3Value(value) {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    }

    function fillPega3InputsFromDraw(draw) {
      if (!draw) return;
      pega3ParInputs.forEach((input, idx) => {
        if (!input) return;
        const rawValue = Array.isArray(draw.pares) ? draw.pares[idx] : null;
        const normalized = normalizePega3Value(rawValue);
        input.value = normalized === null ? "" : formatNumber(normalized);
      });
    }

    function computePega3DateColorIndex(key) {
      if (!key || !PEGA3_COLOR_BUCKETS) return 0;
      let hash = 0;
      for (let i = 0; i < key.length; i += 1) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      return Math.abs(hash) % PEGA3_COLOR_BUCKETS;
    }

    function findCachedPega3Draw({ fecha, horario, pais }) {
      if (!fecha || !horario) return null;
      const targetPais = (pais || "HN").toUpperCase();
      return (pega3DrawCache || []).find(
        (draw) =>
          draw.fecha === fecha &&
          draw.horario === horario &&
          ((draw.pais || "HN").toUpperCase() === targetPais),
      );
    }

    function prefillPega3Inputs({ forceClear = false } = {}) {
      if (!pega3FechaInput || !pega3TurnoSelect) return;
      const fecha = pega3FechaInput.value;
      const turno = pega3TurnoSelect.value;
      const paisValue = (pega3PaisSelect?.value || "HN").toUpperCase();
      if (!fecha || !turno) {
        if (forceClear) {
          clearPega3Inputs();
          updatePega3FormStatus(null);
        }
        return;
      }
      const match = findCachedPega3Draw({ fecha, horario: turno, pais: paisValue });
      if (match) {
        fillPega3InputsFromDraw(match);
        updatePega3FormStatus(match);
      } else {
        if (forceClear || pega3ParInputs.every((input) => !input || !input.value?.trim())) {
          clearPega3Inputs();
        }
        updatePega3FormStatus(null);
      }
    }

    function renderPega3HistorialList(draws = []) {
      if (!pega3Historial) return;
      const pager = document.getElementById("pega3-hist-pager");
      const pagerInfo = document.getElementById("pega3-pager-info");
      const prevBtn = document.getElementById("pega3-pager-prev");
      const nextBtn = document.getElementById("pega3-pager-next");

      const q = _pega3Filter.toLowerCase().trim();
      const filtered = q
        ? draws.filter((r) => {
            const nums = (r.pares || []).join(" ");
            return (
              (r.fecha || "").includes(q) ||
              nums.includes(q) ||
              (PEGA3_TURN_LABELS[r.horario] || r.horario || "").toLowerCase().includes(q) ||
              ((r.pais || "HN").toLowerCase()).includes(q)
            );
          })
        : draws;

      if (!filtered.length) {
        pega3Historial.innerHTML = q
          ? "<p class='hint'>Sin resultados para esa búsqueda.</p>"
          : "<p class='hint'>Aún no registras sorteos Pega3.</p>";
        if (pager) pager.style.display = "none";
        return;
      }

      const totalPages = Math.ceil(filtered.length / PEGA3_PAGE_SIZE);
      if (_pega3Page >= totalPages) _pega3Page = totalPages - 1;
      if (_pega3Page < 0) _pega3Page = 0;
      const start = _pega3Page * PEGA3_PAGE_SIZE;
      const page = filtered.slice(start, start + PEGA3_PAGE_SIZE);

      const TURN_STYLE = { "11AM": "p3hr-turn--am", "3PM": "p3hr-turn--pm", "9PM": "p3hr-turn--night" };
      const COUNTRY_STYLE = { HN: "p3hr-country--hn" };

      const list = document.createElement("div");
      list.className = "p3hr-list";
      page.forEach((row) => {
        const paisCode = (row.pais || "HN").toUpperCase();
        const pares = row.pares || [];
        const fmt = (n) => (n != null ? String(n).padStart(2, "0") : "—");

        const item = document.createElement("div");
        item.className = "p3hr-row";

        const meta = document.createElement("div");
        meta.className = "p3hr-meta";
        meta.innerHTML = `
          <span class="p3hr-fecha">${row.fecha || "—"}</span>
          <span class="p3hr-turn ${TURN_STYLE[row.horario] || ""}">${PEGA3_TURN_LABELS[row.horario] || row.horario || "—"}</span>
        `;

        const nums = document.createElement("div");
        nums.className = "p3hr-nums";
        pares.forEach((n) => {
          const chip = document.createElement("span");
          chip.className = "p3hr-chip";
          chip.textContent = fmt(n);
          nums.appendChild(chip);
        });

        const del = document.createElement("button");
        del.type = "button";
        del.className = "p3hr-del";
        del.title = "Eliminar";
        del.innerHTML = "✕";
        del.addEventListener("click", () => handlePega3Delete(row));

        item.appendChild(meta);
        item.appendChild(nums);
        item.appendChild(del);
        list.appendChild(item);
      });
      pega3Historial.innerHTML = "";
      pega3Historial.appendChild(list);

      if (pager) {
        pager.style.display = "flex";
        if (pagerInfo) pagerInfo.textContent = `Página ${_pega3Page + 1} de ${totalPages}  (${filtered.length} registros)`;
        if (prevBtn) prevBtn.disabled = _pega3Page === 0;
        if (nextBtn) nextBtn.disabled = _pega3Page >= totalPages - 1;
      }
    }

    async function handlePega3Delete(row) {
      if (!row?.id) return;
      const labelDate = row.fecha ? formatFriendlyDate(row.fecha) || row.fecha : "este registro";
      const labelTurn = PEGA3_TURN_LABELS[row.horario] || row.horario || "";
      if (!pega3PendingDeletion.has(row.id)) {
        const timer = setTimeout(() => pega3PendingDeletion.delete(row.id), 5000);
        pega3PendingDeletion.set(row.id, timer);
        showToast(`Presiona eliminar otra vez para borrar el sorteo de ${labelDate}${labelTurn ? ` (${labelTurn})` : ""}.`, {
          variant: "warning",
          timeout: 3500,
        });
        return;
      }
      clearTimeout(pega3PendingDeletion.get(row.id));
      pega3PendingDeletion.delete(row.id);
      if (typeof DB.deletePega3Draw !== "function") {
        showToast("Esta versión no soporta eliminar sorteos. Actualiza la aplicación.", { variant: "danger" });
        return;
      }
      try {
        await DB.deletePega3Draw(row.id);
        showToast("Sorteo Pega3 eliminado.", { variant: "success" });
        await refreshPega3Historial({ silent: true });
      } catch (err) {
        console.error("pega3 delete error", err);
        showToast(`No se pudo eliminar: ${err.message}`, { variant: "danger" });
      }
    }

    async function runPega3Analysis() {
      if (!pega3DrawCache.length) {
        showToast("Registra sorteos Pega3 para analizar.", { variant: "info" });
        return;
      }
      pega3Resumen.innerHTML = "<p class='hint'>Analizando patrones…</p>";
      pega3Sesgos.innerHTML = "<p class='hint'>Calculando sesgos…</p>";
      pega3Seleccion.innerHTML = "<p class='hint'>Calculando selección…</p>";
      try {
        const diariaDraws = await DB.listDraws({ excludeTest: true });
        const resultado = evaluarMotorPega3(pega3DrawCache, { externa: diariaDraws });
        pega3AnalysisCache = resultado;
        renderPega3Panels();
      } catch (err) {
        console.error("pega3 analysis error", err);
        pega3Resumen.innerHTML = `<p class='hint'>No se pudo completar el análisis: ${err.message}</p>`;
      }
    }

    function renderPega3Panels() {
      if (!pega3Resumen) return;
      if (!pega3AnalysisCache?.stats) {
        pega3Resumen.innerHTML = "<p class='hint'>Registra sorteos y ejecuta el análisis para ver los hallazgos.</p>";
        pega3Sesgos.innerHTML = "<p class='hint'>Sin datos. Ejecuta el análisis para calcular sesgos.</p>";
        pega3Seleccion.innerHTML = "<p class='hint'>Sin datos. Ejecuta el análisis para generar candidatos.</p>";
        return;
      }
      renderPega3Summary(pega3AnalysisCache.stats);
      renderPega3Sesgos(pega3AnalysisCache.sesgos);
      renderPega3Seleccion(pega3AnalysisCache.seleccion);
    }

    function renderPega3Summary(stats) {
      if (!pega3Resumen) return;
      const totalDraws = stats.totalDraws || 0;
      const topN  = stats.numeroList?.[0];
      const topP  = stats.pairList?.[0];
      const pat   = stats.patternSummary || {};
      const cross = stats.crossTurn || {};
      const ext   = stats.externalSummary || [];

      const metric = (label, value, sub = "") => `
        <div class="p3res-metric">
          <span class="p3res-metric__val">${value}</span>
          <span class="p3res-metric__lbl">${label}</span>
          ${sub ? `<span class="p3res-metric__sub">${sub}</span>` : ""}
        </div>`;

      const row = (label, value) => `
        <div class="p3res-row">
          <span class="p3res-row__lbl">${label}</span>
          <span class="p3res-row__val">${value}</span>
        </div>`;

      const topExtStr = ext.length
        ? ext.slice(0, 2).map(e => `${formatNumber(e.numero)} (${Math.round(e.coef * 100)}%)`).join(" · ")
        : null;

      pega3Resumen.innerHTML = `
        <div class="p3res-wrap">
          <div class="p3res-metrics">
            ${metric("sorteos", totalDraws)}
            ${topN  ? metric("núm. dominante", formatNumber(topN.numero), `${(topN.freq*100).toFixed(1)}% · ${topN.turnoFuerte}`) : ""}
            ${topP  ? metric("par destacado", topP.numeros.map(n=>formatNumber(n)).join("–"), `${topP.total} reps`) : ""}
          </div>
          <div class="p3res-rows">
            ${row("Patrones", `espejo ${pat.espejos||0} · vecino ${pat.vecinos||0} · progresión ${pat.escaleras||0} · repetido ${pat.repetidos||0}`)}
            ${row("Arrastres entre turnos", `directas ${cross.directas||0} · espejos ${cross.espejos||0} · reps ${cross.repeticiones||0}`)}
            ${topExtStr ? row("Correlación c/ La Diaria", topExtStr) : ""}
          </div>
        </div>`;
    }

    function renderPega3Sesgos({ fuertes = [], moderados = [], debiles = [] } = {}) {
      if (!pega3Sesgos) return;
      const allScores = [...fuertes, ...moderados, ...debiles].map(e => (e.score || 0) * 100);
      const maxScore  = Math.max(...allScores, 1);

      const build = (titulo, lista) => {
        if (!lista.length) return `<p class="hint small">${titulo}: sin datos.</p>`;
        const items = lista.slice(0, 8).map(entry => {
          const score = Math.round((entry.score || 0) * 100);
          const bar   = Math.round((score / maxScore) * 100);
          return `<li>
            <span>${formatNumber(entry.numero)}</span>
            <div class="p3seg-bar-wrap"><div class="p3seg-bar" style="width:${bar}%"></div></div>
            <span>${score}%</span>
          </li>`;
        }).join("");
        return `<div class="pega3-sesgo"><h5>${titulo}</h5><ul>${items}</ul></div>`;
      };

      pega3Sesgos.innerHTML = `
        <div class="pega3-sesgos-grid">
          ${build("Sesgos fuertes", fuertes)}
          ${build("Sesgos moderados", moderados)}
          ${build("Sesgos débiles", debiles)}
        </div>
      `;
    }

    function renderPega3Seleccion(seleccion) {
      if (!pega3Seleccion) return;
      if (!seleccion?.top?.length) {
        pega3Seleccion.innerHTML = "<p class='hint'>Calcula los sesgos para generar candidatos finales.</p>";
        return;
      }

      const buildRow = (item, rank) => {
        const num   = formatNumber(item.numero);
        const score = Math.round(item.score * 100);
        const bar   = Math.min(score, 100);
        return `
          <li class="p3sel-row">
            ${rank != null ? `<span class="p3sel-rank">${rank + 1}</span>` : `<span class="p3sel-rank p3sel-rank--sec">·</span>`}
            <span class="p3sel-num">${num}</span>
            <div class="p3sel-bar-wrap"><div class="p3sel-bar" style="width:${bar}%"></div></div>
            <span class="p3sel-score">${score}%</span>
          </li>`;
      };

      const topList = seleccion.top.map((item, i) => buildRow(item, i)).join("");
      const secList = (seleccion.secundarios || []).map(item => buildRow(item, null)).join("");
      const comodin = formatNumber(seleccion.comodin ?? seleccion.top[seleccion.top.length - 1].numero);

      pega3Seleccion.innerHTML = `
        <div class="p3sel-wrap">
          <div class="p3sel-header">
            <span class="p3sel-title">Selección final Pega3</span>
            <span class="p3sel-turno">Turno objetivo: ${seleccion.turnoObjetivo?.label || "pendiente"}</span>
          </div>

          <div class="p3sel-section">
            <div class="p3sel-section__label">🏆 Top Picks</div>
            <ul class="p3sel-list">${topList}</ul>
          </div>

          ${secList ? `
          <div class="p3sel-section">
            <div class="p3sel-section__label">📌 Secundarios</div>
            <ul class="p3sel-list p3sel-list--sec">${secList}</ul>
          </div>` : ""}

          <div class="p3sel-comodin">
            <span class="p3sel-comodin__lbl">🃏 Comodín disruptor</span>
            <span class="p3sel-comodin__num">${comodin}</span>
          </div>
        </div>
      `;
    }

    function resetPega3GeneratorOutput(message = "Ingresa los tres pares para desbloquear una propuesta.") {
      if (!pega3GeneratorOutput) return;
      pega3GeneratorOutput.innerHTML = `<p class='hint small'>${message}</p>`;
    }

    function renderPega3ConversionResult(result = []) {
      if (!pega3GeneratorOutput) return;
      if (!result.length) {
        resetPega3GeneratorOutput("No hay conversiones suficientes. Revisa los pares ingresados.");
        return;
      }
      const summary = document.createElement("div");
      summary.className = "pega3-generator__summary";
      summary.innerHTML = `
        <strong>${result.map((entry) => formatNumber(entry.numero)).join(" – ")}</strong>
        <span>Trío sugerido con conversiones aleatorias.</span>
      `;
      const grid = document.createElement("div");
      grid.className = "pega3-generator__trio";
      result.forEach((entry, idx) => {
        const block = document.createElement("div");
        block.className = "pega3-generator__item";
        const badge = document.createElement("span");
        badge.className = "pega3-generator__badge";
        badge.textContent = `Par ${idx + 1}`;
        const strong = document.createElement("strong");
        strong.textContent = formatNumber(entry.numero);
        const detail = document.createElement("small");
        detail.textContent = entry.label || "Conversión";
        const base = document.createElement("span");
        base.className = "pega3-generator__base";
        base.textContent = `Base ${formatNumber(entry.base)}`;
        block.append(badge, strong, detail, base);
        grid.appendChild(block);
      });
      pega3GeneratorOutput.innerHTML = "";
      pega3GeneratorOutput.append(summary, grid);
    }

    function generatePega3ConversionTrio() {
      if (!pega3GeneratorOutput) return;
      const bases = pega3ParInputs
        .map((input) => normalizePega3Value(input?.value))
        .map((value) => (Number.isFinite(value) ? value : null));
      if (bases.some((value) => value === null)) {
        showToast("Completa los tres pares para generar el trío de conversiones.", { variant: "warning" });
        resetPega3GeneratorOutput("Completa los tres pares para poder calcular el trío.");
        return;
      }
      const trio = bases.map((numero) => {
        const pool = buildPega3ConversionPool(numero);
        const pick = pickRandomEntry(pool) || { numero, label: "Base" };
        return { ...pick, base: numero };
      });
      renderPega3ConversionResult(trio);
    }

    resetPega3GeneratorOutput();
    pega3SaveBtn?.addEventListener("click", handlePega3Save);
    document.getElementById("pega3-btn-cargar")?.addEventListener("click", () => refreshPega3Historial());
    document.getElementById("pega3-btn-analizar")?.addEventListener("click", () => runPega3Analysis());
    document.getElementById("pega3-hist-search")?.addEventListener("input", debounce((e) => {
      _pega3Filter = e.target.value;
      _pega3Page = 0;
      renderPega3HistorialList(pega3DrawCache);
    }));
    document.getElementById("pega3-pager-prev")?.addEventListener("click", () => {
      if (_pega3Page > 0) { _pega3Page--; renderPega3HistorialList(pega3DrawCache); }
    });
    document.getElementById("pega3-pager-next")?.addEventListener("click", () => {
      _pega3Page++; renderPega3HistorialList(pega3DrawCache);
    });
    pega3GeneratorBtn?.addEventListener("click", () => generatePega3ConversionTrio());
    pega3ParInputs.forEach((input) => {
      input?.addEventListener("input", () => resetPega3GeneratorOutput("Vuelve a generar el trío para reflejar los cambios."));
    });

export { refreshPega3Historial, renderPega3Panels, syncPega3Context };
