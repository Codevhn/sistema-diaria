import { paginateHistory } from './history-pagination.js';
import { initProductShell, renderRecentRecords } from './ui/product-shell.js';
import { initToolSelect } from './ui/tool-select.js';
import { initDayPickers } from './ui/day-pickers.js';
    import { mostrarGuia } from "./guide-grid.js";
    import { DB } from "./storage.js";
    import { importarManual } from "./importer.js";
    import { crearHipotesis, actualizarHipotesis, eliminarHipotesis, registrarResultado } from "./narrative.js";
    import { analizarYProponer } from "./reasoning.js";
    import {
      generarCruceta,
      generarTrianguloInvertido,
      dibujarTrianguloInvertido,
      generarCrucetaTurnos,
    } from "./geometry.js";
    import { cargarGuia, GUIA, getColorPolaridad } from "./loader.js";
    import { detectarPatrones } from "./pattern-detector.js";
    import {
      revisarDuplicados,
      marcarGrupoComoTest,
      borrarIds,
      corregirFechasDesfasadas,
    } from "./maintenance.js";
    import { mostrarTransformaciones } from "./transform-visual.js";
    import { initTooltips } from "./tooltip.js";
    import { getVencidos, renderRelativosHTML, backtestRelativos, getRelativosEnAlerta, renderRelativosAlertaHTML, backtestConvergencia, getConvergenciaActiva, renderConvergenciaHTML } from "./relativos-engine.js";
    import { initSuperPremioPicker } from "./superpremio-picker.js";
    import { initNotifications } from "./notifications.js";
    import { detectarContexto, renderContextoHTML } from "./context-engine.js";
    import { computeFeedback, renderFeedbackHTML } from "./feedback-engine.js";
    import { analizarPostRepeticion, renderPostRepeticionHTML } from "./post-repeticion-engine.js";
    import { analizarDejaVu, renderDejaVuHTML } from "./dejavu-engine.js";
    import { consultarNumero, renderConsultaHTML } from "./consulta-engine.js";
    import { analizarAusencias, renderAusenciasHTML } from "./ausencia-engine.js";
    import { analizarVuelta, renderVueltaHTML } from "./vuelta-engine.js";
    import { analizarLineas, renderLineasHTML } from "./lineas-engine.js";
    import { buildRelationStats, getCandidates, getContextSignal } from "./relation-analyzer.js";
    import { construirPerfilNumero, resumirActividadNumeros, construirGapSummary } from "./memory.js";
    import {
      rebuildKnowledge,
      obtenerPerfilesNumeros,
      generarPredicciones,
      describirPerfil,
      generarInsights,
      obtenerResumenPredicciones,
    } from "./learning.js";

import {
  initPega3Panel,
  refreshPega3Historial,
  renderPega3Panels,
  syncPega3Context,
} from "./views/pega3-panel.js";
import { initConsultaPanel } from "./views/consulta-panel.js";
import { initHorarioPanel } from "./views/horario-panel.js";
import { initMonthlyRankingPanel } from "./views/monthly-ranking-panel.js";
import { initNumberClocksPanel } from "./views/number-clocks-panel.js";
    import { loadUserPreferences, saveUserPreferences } from "./user-preferences.js";
    import { getMyRole, getAllProfiles, updateUserRole, updateUserName, setBanStatus, roleLabel, roleColor, VALID_ROLES } from "./roles.js";
import { initDecemberPanel } from "./views/december-panel.js";
import { initTriggersPanel } from "./views/triggers-panel.js";
import { renderCompanerosPanel } from "./views/companeros-panel.js";
    import {
      createMode,
      updateMode,
      deleteMode,
      listModesWithExamples,
      deleteModeExample,
      logModeUsage,
      listModeUsage,
    } from "./modes.js";
import {
  closeExpiredEvents as closeTriggerEvents,
} from "./triggers/triggerEngine.js";
    import { evaluarModos } from "./mode-engine.js";
    import { formatDateISO, getTodayISODate, parseDrawDate } from "./date-utils.js";
    import { logInfo, logWarn } from "./logger.js";
import { showToast } from "./ui/toast.js";
import { initWiki } from "./views/wiki.js";
import {
  DAY_MS,
  formatNumber,
  normalizeNumeroKey,
  parseISODate,
  MONTH_NAMES,
  MONTH_ABBR,
  DOW_FULL_LABEL,
  HORARIO_ORDER,
  formatFriendlyDate,
  getSymbol,
  escapeHtml,
  incrementISODate,
} from "./ui/format.js";
import {
  invalidateMemoryCache,
  renderMemoryBoard,
  renderGapPanel,
  openMemoryDetail,
  reopenMemoryDetail,
  formatTimeAgo,
  configurarMemoriaNav,
} from "./views/memoria.js";
import {
  renderSuperPremioPanel,
  configurarSuperPremio,
  listSpFromDb,
  detectarModoRecuperacion,
  detectarNumerosPreEvento,
  detectarNumerosRepetidosPostEvento,
  SP_RECOVERY_DAYS,
} from "./views/superpremio.js";
    import {
      loadLocalDrawSnapshot,
      saveLocalDrawSnapshot,
      isLocalDrawSnapshotModeEnabled,
      setLocalDrawSnapshotMode,
    } from "./local-draw-cache.js";
    import { supabase } from "./supabaseClient.js";
    let _signalEngine = null;
    async function loadSignalEngine() {
      if (!_signalEngine) _signalEngine = await import("./signal-engine.js");
      return _signalEngine;
    }
    import { logout as supabaseLogout, requireAuthOrRedirect } from "./auth.js";
    import { showBootLoader, hideBootLoader, setBootStatus } from "./boot-loader.js";

    const bootOverlay = document.getElementById("boot-loader");
    const processingModal = document.getElementById("processing-modal");
    const waitForFirstPaint = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const isBooting = () => !!bootOverlay && !bootOverlay.classList.contains("hidden");
    const showSavingModal = () => {
      if (isBooting()) return;
      processingModal?.classList.remove("hidden");
    };
    const hideSavingModal = () => processingModal?.classList.add("hidden");
    const runWithSavingModal = async (task) => {
      showSavingModal();
      try {
        return await task();
      } finally {
        hideSavingModal();
      }
    };
    hideSavingModal();
    window.addEventListener("pageshow", hideSavingModal);

    let guideLoadError = null;
    let userPreferences = {};
    let userPrefsSaveTimer = null;

    async function initUserPreferences(user) {
      if (!user?.id) return;
      try {
        const prefs = await loadUserPreferences(user.id);
        if (prefs && typeof prefs === "object") {
          userPreferences = prefs;
        }
      } catch (err) {
        logWarn("No se pudieron inicializar preferencias de usuario", err);
      }
    }

    function queueUserPreferencesSave(patch = {}) {
      if (!currentUser?.id) return;
      userPreferences = { ...(userPreferences || {}), ...patch };
      if (userPrefsSaveTimer) clearTimeout(userPrefsSaveTimer);
      userPrefsSaveTimer = setTimeout(async () => {
        userPrefsSaveTimer = null;
        try {
          await saveUserPreferences(currentUser.id, userPreferences);
        } catch (err) {
          logWarn("No se pudieron guardar preferencias de usuario", err);
        }
      }, 350);
    }

    const currentUser = await requireAuthOrRedirect("./login.html");
    if (!currentUser) throw new Error("Auth requerida");
    // ── Diagnóstico de auth: guardamos los últimos 20 eventos en window.__authLog
    //    y los imprimimos en consola para poder auditar expulsiones espurias.
    window.__authLog = [];
    const _logAuth = (tag, payload) => {
      const entry = { ts: new Date().toISOString(), tag, ...payload };
      window.__authLog.push(entry);
      if (window.__authLog.length > 20) window.__authLog.shift();
      console.log("[auth]", tag, entry);
    };
    _logAuth("boot", { hasUser: !!currentUser, uid: currentUser?.id });

    // Anti-bounce: ignorar SIGNED_OUT que llegue en los primeros 3s tras el
    // boot. Evita que un fallo transitorio del autoRefreshToken justo después
    // de cargar tumbe una sesión que el servidor todavía considera válida.
    const BOOT_GRACE_MS = 3000;
    const bootAt = Date.now();
    supabase.auth.onAuthStateChange((event, session) => {
      _logAuth("event", { event, hasSession: !!session, uid: session?.user?.id });
      if (event === "SIGNED_OUT") {
        const sinceBoot = Date.now() - bootAt;
        if (sinceBoot < BOOT_GRACE_MS) {
          console.warn(`[auth] SIGNED_OUT ignorado en ventana de gracia (${sinceBoot}ms < ${BOOT_GRACE_MS}ms)`);
          return;
        }
        // Antes de redirigir, verificamos con el servidor si realmente no hay
        // sesión. Un SIGNED_OUT puede venir de un refresh fallido transitorio
        // mientras la sesión todavía está válida en localStorage.
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session?.user) {
            console.warn("[auth] SIGNED_OUT espurio: getSession aún devuelve user. Ignoro.");
            return;
          }
          _logAuth("redirect-login", { reason: "SIGNED_OUT confirmado" });
          window.location.href = "./login.html";
        }).catch((err) => {
          console.warn("[auth] getSession tras SIGNED_OUT falló, no redirijo:", err?.message);
        });
      }
    });
    await initUserPreferences(currentUser);
    showBootLoader();
    try {
      setBootStatus("Cargando la guía de símbolos…");
      await cargarGuia();
      setBootStatus("Preparando tu jornada y el historial…");
    } catch (err) {
      guideLoadError = err instanceof Error ? err : new Error(String(err));
    }

    try {
      const autoFix = await DB.fixFutureDatedDraws({ maxAheadDays: 1 });
      if (autoFix?.length) {
        logInfo("Sorteos corregidos automáticamente:", autoFix);
        showToast(`Se corrigieron ${autoFix.length} sorteos con fecha adelantada.`, { variant: "info" });
      }
    } catch (err) {
      logWarn("No se pudieron corregir fechas adelantadas automáticamente", err);
    }

    try {
      const closed = await closeTriggerEvents();
      if (closed) {
        logInfo(`Trigger engine cerró ${closed} evento(s) vencidos al iniciar.`);
      }
    } catch (err) {
      logWarn("No se pudieron cerrar eventos vencidos automáticamente", err);
    }

    function withButtonBusy(button, label = null) {
      if (!button) return () => {};
      const prevText = button.textContent;
      const prevDisabled = button.disabled;
      button.disabled = true;
      if (label) button.textContent = label;
      return () => {
        if (label) button.textContent = prevText;
        button.disabled = prevDisabled;
      };
    }

    if (guideLoadError) {
      reportGuideLoadIssue(guideLoadError);
    }

    function reportGuideLoadIssue(error) {
      const runningFromFile = window.location.protocol === "file:";
      const resolutionHint = runningFromFile
        ? "Ejecuta npm run dev o sirve la carpeta con cualquier servidor HTTP para permitir la lectura de archivos locales."
        : "Verifica que el archivo data/guia_suenos.json exista y sea accesible desde el servidor.";
      const toastMessage = `No se pudo cargar la Guía de los Sueños: ${error.message || error}. ${resolutionHint}`;
      const guideGrid = document.getElementById("guide-grid");
      if (guideGrid) {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = toastMessage;
        guideGrid.innerHTML = "";
        guideGrid.appendChild(hint);
      }
      showToast(toastMessage, { variant: "danger", timeout: 9000 });
    }

    const modeNameInput = document.getElementById("mode-name");
    const modeTypeSelect = document.getElementById("mode-type");
    const modeDescInput = document.getElementById("mode-desc");
    const modeOperationSelect = document.getElementById("mode-operation");
    const modeParamInput = document.getElementById("mode-parameter");
    const modeOffsetSelect = document.getElementById("mode-offset");
    const modeSaveBtn = document.getElementById("mode-save");
    let editingModeId = null;

    const dayFecha = document.getElementById("day-fecha");
    const dayFechaDow = document.getElementById("day-fecha-dow");
    const dayPais = document.getElementById("day-pais");
    const syncDayPickers = initDayPickers();
    const geometryDateInput = document.getElementById("g-fecha");
    const geometryPaisSelect = document.getElementById("g-pais");
    const memoryBoardGrid = document.getElementById("memory-board-grid");
    const memoryDetail = document.getElementById("memory-detail");
    const memoryRefreshBtn = document.getElementById("memory-refresh");
    const memoryGapGrid = document.getElementById("memory-gap-grid");
    const memoryGapRefreshBtn = document.getElementById("memory-gap-refresh");

    function updateDayFechaDow(value = dayFecha?.value) {
      if (!dayFechaDow) return;
      if (!value) {
        dayFechaDow.textContent = "—";
        return;
      }
      const parsed = parseISODate(value);
      if (!parsed) {
        dayFechaDow.textContent = "—";
        return;
      }
      const dow = DOW_FULL_LABEL[parsed.getDay()] || "";
      const monthName = MONTH_NAMES[parsed.getMonth()] || "";
      dayFechaDow.textContent = dow ? `${dow} · ${monthName}` : monthName || "—";
    }

    function autoAdvanceDayFecha() {
      if (!dayFecha || !dayFecha.value) return;
      const nextValue = incrementISODate(dayFecha.value, 1);
      if (!nextValue || nextValue === dayFecha.value) return;
      dayFecha.value = nextValue;
      dayFecha.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function procesarAprendizajeDia({
      fecha,
      pais,
      silent = false,
      skipKnowledgeSync = false,
      showProgressModal = true,
    } = {}) {
      const normalizedPais = (pais || "").trim().toUpperCase();
      if (!fecha || !normalizedPais) {
        if (!silent) {
          showToast("Selecciona fecha y país para procesar el aprendizaje.", { variant: "warning" });
        }
        return { status: "invalid" };
      }
      const draws = (await DB.listDraws({ excludeTest: true })).filter(
        (d) => d.fecha === fecha && (d.pais || "").trim().toUpperCase() === normalizedPais
      );
      if (!draws.length) {
        if (!silent) {
          showToast("No hay sorteos reales registrados para esa fecha y país.", { variant: "warning" });
        }
        return { status: "no-data" };
      }
      const alreadyLogged = (await DB.getHypothesisLogs()).some(
        (log) =>
          log.fechaResultado === fecha &&
          ((log.paisResultado || "").trim().toUpperCase() === normalizedPais)
      );
      if (alreadyLogged) {
        if (!silent) {
          showToast("Los resultados de ese día ya fueron procesados anteriormente.", {
            variant: "info",
            timeout: 3200,
          });
        }
        return { status: "already" };
      }
      const processResultados = async () => {
        for (const draw of draws) {
          const simbolo = getSymbol(draw.numero);
          await registrarResultado({
            numero: draw.numero,
            simbolo,
            fecha: draw.fecha,
            pais: draw.pais,
            horario: draw.horario,
          });
        }
        await DB.closePredictionBatch({ fecha, pais: normalizedPais });
      };
      if (showProgressModal) {
        await runWithSavingModal(processResultados);
      } else {
        await processResultados();
      }
      if (!skipKnowledgeSync) {
        await rebuildKnowledge();
        await refreshHypotesis();
      }
      if (!silent) {
        showToast("Hipótesis actualizadas con los resultados del día.", { variant: "success" });
      }
      return { status: "success" };
    }
    function resetModeForm() {
      editingModeId = null;
      if (modeNameInput) modeNameInput.value = "";
      if (modeTypeSelect) modeTypeSelect.value = "manual";
      if (modeDescInput) modeDescInput.value = "";
      if (modeOperationSelect) modeOperationSelect.value = "";
      if (modeParamInput) modeParamInput.value = "";
      if (modeOffsetSelect) modeOffsetSelect.value = "1";
      if (modeSaveBtn) modeSaveBtn.textContent = "Guardar modo";
    }

    function describeModoOperacion(mode = {}) {
      const op = mode.operacion || "";
      if (!op) return "";
      const params = mode.parametros ?? mode.parametro ?? {};
      const valor = typeof params === "object" && params !== null ? (params.valor ?? params.constante ?? params.raw) : params;
      const offset = Number.isFinite(mode.offset) ? mode.offset : null;

      const nombreOperacion = {
        mirror: "Invertir dígitos",
        "sum-digits": "Suma de dígitos",
        "sum-digits-keep-first": "Suma de dígitos (mantener primer dígito)",
        "add-constant": "Sumar constante",
        "sub-constant": "Restar constante",
        neighbor: "Número vecino",
      }[op] || op;

      let detalle = nombreOperacion;
      if (valor !== undefined && valor !== null && valor !== "") {
        detalle += ` · param ${valor}`;
      }
      if (offset !== null) {
        const offsetTxt = offset === 0 ? "mismo turno" : offset === 1 ? "siguiente turno" : `${offset} turnos`;
        detalle += ` · ${offsetTxt}`;
      }
      return detalle;
    }

    function buildModeParameters(operacion, rawValue) {
      if (!operacion) return null;
      if (operacion === "digit-map") {
        const valor = rawValue?.trim() || "0:1,2:5,3:8,4:7,6:9";
        return { mapa: valor };
      }
      if (!rawValue) return {};
      const numeric = Number(rawValue);
      if (!Number.isNaN(numeric) && rawValue.trim() !== "") {
        return { valor: numeric };
      }
      return { valor: rawValue };
    }

    async function refreshModesPanel() {
      const container = document.getElementById("mode-list");
      if (!container) return;
      const modes = await listModesWithExamples();
      container.innerHTML = "";
      if (!modes.length) {
        container.innerHTML = "<p class='hint'>Aún no hay modos registrados.</p>";
        if (!editingModeId) resetModeForm();
        return;
      }

      const dayFechaInput = document.getElementById("day-fecha");
      const dayPaisSelect = document.getElementById("day-pais");
      const paisOptions = Array.from(dayPaisSelect?.options || []).map((opt) => opt.value || opt.textContent || "");

      for (const mode of modes) {
        const item = document.createElement("div");
        item.className = "mode-item";

        const head = document.createElement("div");
        head.className = "mode-item-head";
        const titleWrap = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = mode.nombre;
        const chip = document.createElement("span");
        chip.className = "analysis-chip";
        chip.textContent = mode.tipo || "manual";
        titleWrap.appendChild(title);
        titleWrap.appendChild(chip);
        head.appendChild(titleWrap);

        const actions = document.createElement("div");
        actions.className = "mode-item-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn-secondary";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => {
          editingModeId = mode.id;
          if (modeNameInput) modeNameInput.value = mode.nombre || "";
          if (modeTypeSelect) modeTypeSelect.value = mode.tipo || "manual";
          if (modeDescInput) modeDescInput.value = mode.descripcion || "";
          if (modeOperationSelect) modeOperationSelect.value = mode.operacion || "";
          if (modeParamInput) {
            const params = mode.parametros ?? mode.parametro ?? {};
            let valor = "";
            if (mode.operacion === "digit-map") {
              if (typeof params === "object" && params !== null) valor = params.mapa ?? "";
              else valor = params ?? "";
            } else {
              valor = typeof params === "object" && params !== null ? (params.valor ?? params.constante ?? params.raw) : params;
            }
            modeParamInput.value = valor ?? "";
          }
          if (modeOffsetSelect) {
            const offsetVal = Number.isFinite(mode.offset) ? String(mode.offset) : "1";
            modeOffsetSelect.value = offsetVal;
          }
          if (modeSaveBtn) modeSaveBtn.textContent = "Actualizar modo";
          showToast(`Editando modo ${mode.nombre}`, { variant: "info", timeout: 2500 });
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn-danger";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.addEventListener("click", async () => {
          const confirmar = await mostrarModal(
            "Eliminar modo",
            `¿Eliminar el modo "${mode.nombre}" y sus ejemplos?`,
            { okText: "Eliminar", cancelText: "Cancelar", okVariant: "danger" }
          );
          if (!confirmar) return;
          try {
            await deleteMode(mode.id);
            if (editingModeId === mode.id) resetModeForm();
            await refreshModesPanel();
            showToast("Modo eliminado.", { variant: "success" });
          } catch (err) {
            showToast(`No se pudo eliminar: ${err.message}`, { variant: "danger" });
          }
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        head.appendChild(actions);
        item.appendChild(head);

        const metaOperacion = describeModoOperacion(mode);
        if (metaOperacion) {
          const opMeta = document.createElement("div");
          opMeta.className = "mode-meta";
          opMeta.textContent = metaOperacion;
          item.appendChild(opMeta);
        }

        const desc = document.createElement("div");
        desc.className = "analysis-note";
        desc.textContent = mode.descripcion || "Sin descripción.";
        item.appendChild(desc);

        const exampleList = document.createElement("div");
        exampleList.className = "mode-example-list";
        if (mode.ejemplos?.length) {
          mode.ejemplos.forEach((ex) => {
            const row = document.createElement("div");
            row.className = "mode-example";
            const text = document.createElement("span");
            const nota = ex.nota ? ` · ${ex.nota}` : "";
            text.textContent = `${ex.original} → ${ex.resultado}${nota}`;
            text.style.flex = "1";
            const del = document.createElement("button");
            del.type = "button";
            del.className = "btn-ghost";
            del.textContent = "Eliminar";
            del.addEventListener("click", async () => {
              const ok = await mostrarModal(
                "Eliminar ejemplo",
                `¿Eliminar el ejemplo ${ex.original} → ${ex.resultado}?`,
                { okText: "Eliminar", cancelText: "Cancelar", okVariant: "danger" }
              );
              if (!ok) return;
              await deleteModeExample(ex.id);
              showToast("Ejemplo eliminado.", { variant: "success" });
              await refreshModesPanel();
            });
            row.appendChild(text);
            row.appendChild(del);
            exampleList.appendChild(row);
          });
        } else {
          const empty = document.createElement("span");
          empty.className = "analysis-note";
          empty.textContent = "Sin ejemplos registrados.";
          exampleList.appendChild(empty);
        }
        item.appendChild(exampleList);

        const exampleForm = document.createElement("div");
        exampleForm.className = "mode-example";
        const exOriginal = document.createElement("input");
        exOriginal.placeholder = "Original";
        exOriginal.maxLength = 4;
        const exResultado = document.createElement("input");
        exResultado.placeholder = "Resultado";
        exResultado.maxLength = 4;
        const exNota = document.createElement("input");
        exNota.placeholder = "Nota";
        exNota.style.flex = "1";
        const exBtn = document.createElement("button");
        exBtn.type = "button";
        exBtn.className = "btn-secondary";
        exBtn.textContent = "Agregar";
        exBtn.addEventListener("click", async () => {
          const original = exOriginal.value.trim();
          const resultado = exResultado.value.trim();
          if (!original || !resultado) {
            showToast("Completa original y resultado.", { variant: "warning" });
            return;
          }
          try {
            await DB.addGameModeExample({
              modeId: mode.id,
              original,
              resultado,
              nota: exNota.value.trim() || "",
            });
            showToast("Ejemplo agregado.", { variant: "success" });
            await refreshModesPanel();
          } catch (err) {
            showToast(`No se pudo agregar el ejemplo: ${err.message}`,
              { variant: "danger" }
            );
          }
        });
        exampleForm.appendChild(exOriginal);
        exampleForm.appendChild(exResultado);
        exampleForm.appendChild(exNota);
        exampleForm.appendChild(exBtn);
        item.appendChild(exampleForm);

        const logForm = document.createElement("div");
        logForm.className = "mode-log-form";
        const logDate = document.createElement("input");
        logDate.type = "date";
        logDate.value = dayFechaInput?.value || "";
        const logPais = document.createElement("select");
        const defaultPaisOpt = document.createElement("option");
        defaultPaisOpt.value = "";
        defaultPaisOpt.textContent = "País";
        logPais.appendChild(defaultPaisOpt);
        const options = paisOptions.length ? paisOptions : ["HN"];
        options.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p;
          opt.textContent = p;
          if (dayPaisSelect?.value === p) opt.selected = true;
          logPais.appendChild(opt);
        });
        const logTurno = document.createElement("select");
        ["", "11AM", "3PM", "9PM"].forEach((turno) => {
          const opt = document.createElement("option");
          opt.value = turno;
          opt.textContent = turno || "Turno";
          logTurno.appendChild(opt);
        });
        const logNotas = document.createElement("input");
        logNotas.type = "text";
        logNotas.placeholder = "Notas";
        const logBtn = document.createElement("button");
        logBtn.type = "button";
        logBtn.className = "btn-secondary";
        logBtn.textContent = "Registrar uso";
        logBtn.addEventListener("click", async () => {
          if (!logDate.value) {
            showToast("Ingresa una fecha para registrar el modo.", { variant: "warning" });
            return;
          }
          try {
            await logModeUsage({
              modeId: mode.id,
              fecha: logDate.value,
              pais: logPais.value || null,
              turno: logTurno.value || null,
              notas: logNotas.value.trim() || null,
            });
            logNotas.value = "";
            showToast("Uso registrado.", { variant: "success" });
            await refreshModesPanel();
          } catch (err) {
            showToast(`No se pudo registrar el uso: ${err.message}`,
              { variant: "danger" }
            );
          }
        });
        logForm.appendChild(logDate);
        logForm.appendChild(logPais);
        logForm.appendChild(logTurno);
        logForm.appendChild(logNotas);
        logForm.appendChild(logBtn);
        item.appendChild(logForm);

        const logs = await listModeUsage({ modeId: mode.id });
        const recentLogs = logs
          .slice()
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .slice(0, 5);
        const logList = document.createElement("div");
        logList.className = "mode-log-list";
        if (!recentLogs.length) {
          const empty = document.createElement("span");
          empty.className = "analysis-note";
          empty.textContent = "Sin usos registrados.";
          logList.appendChild(empty);
        } else {
          recentLogs.forEach((log) => {
            const row = document.createElement("div");
            row.className = "mode-log-item";
            const fechaTxt = log.fecha || "(sin fecha)";
            const paisTxt = log.pais || "-";
            const turnoTxt = log.turno || "-";
            row.innerHTML = `<strong>${fechaTxt}</strong><span>${paisTxt}</span><span>${turnoTxt}</span>${log.notas ? `<span>${log.notas}</span>` : ""}`;
            logList.appendChild(row);
          });
        }
        item.appendChild(logList);

        container.appendChild(item);
      }

      if (modeSaveBtn) {
        modeSaveBtn.textContent = editingModeId ? "Actualizar modo" : "Guardar modo";
      }
    }

    resetModeForm();

    modeSaveBtn?.addEventListener("click", async () => {
      const nombre = modeNameInput?.value.trim();
      if (!nombre) {
        showToast("Ingresa un nombre para el modo.", { variant: "warning" });
        return;
      }
      const operacion = modeOperationSelect?.value || "";
      const parametroRaw = modeParamInput?.value.trim() || "";
      const offsetVal = modeOffsetSelect?.value ?? "";
      const offsetNumber = offsetVal === "" ? null : Number(offsetVal);
      const parametros = buildModeParameters(operacion, parametroRaw);

      const payload = {
        nombre,
        tipo: modeTypeSelect?.value || "manual",
        descripcion: modeDescInput?.value.trim() || "",
        operacion,
        parametros: operacion ? parametros ?? {} : null,
        offset: Number.isFinite(offsetNumber) ? offsetNumber : null,
      };
      try {
        if (editingModeId) {
          await updateMode(editingModeId, payload);
          showToast("Modo actualizado.", { variant: "success" });
        } else {
          await createMode(payload);
          showToast("Modo creado.", { variant: "success" });
        }
        resetModeForm();
        await refreshModesPanel();
      } catch (err) {
        showToast(`No se pudo guardar el modo: ${err.message}`, { variant: "danger" });
      }
    });

    const todayISO = getTodayISODate();
    ["day-fecha", "h-fecha", "g-fecha"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = todayISO;
    });
    if (geometryPaisSelect && dayPais?.value) geometryPaisSelect.value = dayPais.value;
    if (geometryPaisSelect && !geometryPaisSelect.value) geometryPaisSelect.value = "HN";

    const SLOT_CONFIG = [
      {
        key: "11AM",
        inputId: "n-11",
        checkboxId: "test-11",
        ballId: "b-11",
        symId: "s-11",
        containerId: "slot-11",
      },
      {
        key: "12PM",
        inputId: "n-12",
        checkboxId: "test-12",
        ballId: "b-12",
        symId: "s-12",
        containerId: "slot-12",
      },
      {
        key: "3PM",
        inputId: "n-3",
        checkboxId: "test-3",
        ballId: "b-3",
        symId: "s-3",
        containerId: "slot-3",
      },
      {
        key: "6PM",
        inputId: "n-6",
        checkboxId: "test-6",
        ballId: "b-6",
        symId: "s-6",
        containerId: "slot-6",
      },
      {
        key: "9PM",
        inputId: "n-9",
        checkboxId: "test-9",
        ballId: "b-9",
        symId: "s-9",
        containerId: "slot-9",
      },
    ];
    const COUNTRY_TURNOS = {
      HN: ["11AM", "3PM", "9PM"],
    };
    const DEFAULT_COUNTRY = "HN";
    const HORARIO_KEYS = SLOT_CONFIG.map((config) => config.key);

    // Limpiar aria-invalid cuando el usuario corrige el input
    document.addEventListener("input", (e) => {
      if (e.target?.getAttribute?.("aria-invalid") === "true") {
        e.target.removeAttribute("aria-invalid");
      }
    });

    const hypothesisCache = {
      map: new Map(),
      dirty: true,
    };
    function seedHypothesisCache(list = []) {
      const map = new Map();
      list.forEach((hyp) => {
        if (typeof hyp?.numero === "undefined") return;
        const key = formatNumber(hyp.numero);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(hyp);
      });
      hypothesisCache.map = map;
      hypothesisCache.dirty = false;
    }

    function invalidateHypothesisCache() {
      hypothesisCache.map = new Map();
      hypothesisCache.dirty = true;
    }

    async function ensureHypothesisCache({ force = false } = {}) {
      if (!force && !hypothesisCache.dirty && hypothesisCache.map.size) {
        return hypothesisCache.map;
      }
      try {
        const hyps = await DB._getAll("hypotheses");
        seedHypothesisCache(hyps);
      } catch (err) {
        console.error("hypothesis cache error", err);
        invalidateHypothesisCache();
      }
      return hypothesisCache.map;
    }

    function getHypothesesForNumber(numero) {
      if (numero === null || typeof numero === "undefined") return [];
      const key = formatNumber(numero);
      return hypothesisCache.map.get(key) || [];
    }

    function summarizeHypothesisStates(list = []) {
      if (!list.length) return "";
      const counts = list.reduce((acc, hyp) => {
        const key = (hyp.estado || "pendiente").toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([estado, count]) => `${count} ${estado}`)
        .join(", ");
    }

    const HORARIO_LABELS = {
      "11AM": "11 AM",
      "12PM": "12 PM",
      "3PM": "3 PM",
      "6PM": "6 PM",
      "9PM": "9 PM",
    };
    const DRAW_CACHE_TTL = 15 * 1000;
    const BIAS_TURN_SCHEDULE = {
      "11AM": { hour: 11, minute: 0 },
      "12PM": { hour: 12, minute: 0 },
      "3PM": { hour: 15, minute: 0 },
      "6PM": { hour: 18, minute: 0 },
      "9PM": { hour: 21, minute: 0 },
    };

    let drawsCache = null;
    let drawsCacheTs = 0;
    let localSnapshotState = null;
    let preferLocalSnapshot = isLocalDrawSnapshotModeEnabled();

    const getInverseNumero = (numero) => {
      const normalized = normalizeNumeroKey(numero);
      if (!normalized) return null;
      const reversed = normalized.split("").reverse().join("");
      const value = parseInt(reversed, 10);
      if (Number.isNaN(value)) return null;
      return { numero: value, symbol: getSymbol(value) || "" };
    };

    function getRecencyWarnTs() {
      if (userPreferences && Object.prototype.hasOwnProperty.call(userPreferences, "recencyWarnTs")) {
        return userPreferences.recencyWarnTs || 0;
      }
      if (typeof window === "undefined" || typeof window.localStorage === "undefined") return 0;
      return parseInt(localStorage.getItem("recencyWarnTs"), 10) || 0;
    }

    function setRecencyWarnTs(value) {
      queueUserPreferencesSave({ recencyWarnTs: value || null });
      if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
      try {
        if (!value) {
          localStorage.removeItem("recencyWarnTs");
        } else {
          localStorage.setItem("recencyWarnTs", String(value));
        }
      } catch (err) {
        logWarn("No se pudo persistir recencyWarnTs", err);
      }
    }

    function ensureLocalSnapshotState({ reload = false } = {}) {
      if (!localSnapshotState || reload) {
        localSnapshotState = loadLocalDrawSnapshot();
      }
      return localSnapshotState;
    }

    function formatSnapshotTimestamp(value) {
      if (!value) return "";
      try {
        return new Intl.DateTimeFormat("es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value));
      } catch {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
      }
    }

    function updateLocalModeUI() {
      if (!drawsLocalToggle || !drawsLocalStatus) return;
      const snapshot = ensureLocalSnapshotState();
      drawsLocalToggle.textContent = preferLocalSnapshot ? "Modo sin conexión activo" : "Modo sin conexión";
      drawsLocalToggle.classList.toggle("btn-primary", preferLocalSnapshot);
      drawsLocalToggle.classList.toggle("btn-ghost", !preferLocalSnapshot);
      const hasSnapshot = snapshot.draws.length > 0;
      if (!hasSnapshot && !preferLocalSnapshot) {
        drawsLocalStatus.textContent = "";
        drawsLocalStatus.classList.add("hidden");
        drawsLocalStatus.classList.remove("local-mode-banner--active");
        return;
      }
      const friendly = snapshot.updatedAt ? formatSnapshotTimestamp(snapshot.updatedAt) : "sin actualizar";
      if (preferLocalSnapshot) {
        drawsLocalStatus.textContent = hasSnapshot
          ? `Modo local activado (${snapshot.draws.length} sorteos guardados · ${friendly}).`
          : "Modo local activado, pero aún no has guardado sorteos.";
      } else {
        drawsLocalStatus.textContent = hasSnapshot
          ? `Respaldo local disponible: ${snapshot.draws.length} sorteos guardados (última sync ${friendly}).`
          : "Aún no hay datos guardados para el modo local.";
      }
      drawsLocalStatus.classList.toggle("local-mode-banner--active", preferLocalSnapshot);
      drawsLocalStatus.classList.remove("hidden");
    }

    async function getCachedDraws({ force = false, excludeTest = true } = {}) {
      const now = Date.now();
      let source = null;
      if (!force && preferLocalSnapshot) {
        const snapshot = ensureLocalSnapshotState();
        if (snapshot.draws.length) source = snapshot.draws;
      }
      if (!source) {
        if (!drawsCache || force || now - drawsCacheTs > DRAW_CACHE_TTL) {
          const remoteDraws = await DB.listDraws({ excludeTest: false });
          drawsCache = Array.isArray(remoteDraws) ? remoteDraws : [];
          drawsCacheTs = now;
          if (drawsCache.length) {
            const saved = saveLocalDrawSnapshot(drawsCache);
            if (saved) {
              localSnapshotState = saved;
            }
          }
          updateLocalModeUI();
        }
        source = drawsCache;
      }
      if (!source || !source.length) {
        const snapshot = ensureLocalSnapshotState({ reload: true });
        if (snapshot.draws.length) {
          source = snapshot.draws;
        }
      }
      if (!source || !source.length) return [];
      const list = source.slice();
      return excludeTest ? list.filter((d) => !d.isTest) : list;
    }

    function invalidateDrawCache() {
      drawsCache = null;
      drawsCacheTs = 0;
    }

    const OPERACION_LABELS = {
      "": "",
      mirror: "Invertir",
      "sum-digits": "Suma dígitos",
      "sum-digits-keep-first": "Suma dígitos (mantiene)",
      "add-constant": "+Constante",
      "sub-constant": "-Constante",
      neighbor: "Ajuste ±1",
      "digit-map": "Mapa dígitos",
    };

    function formatSampleDisplay(sample = {}) {
      const { fecha, horario } = sample;
      if (!fecha) return "";
      const formatted = formatFriendlyDate(fecha);
      return `${formatted}${horario ? ` ${horario}` : ""}`.trim();
    }

    const getFilters = () => ({
      fecha: document.getElementById("day-fecha")?.value,
      pais: document.getElementById("day-pais")?.value,
    });

    function normalizeCountry(value) {
      const raw = typeof value === "string" ? value : value ? String(value) : DEFAULT_COUNTRY;
      const normalized = raw.trim().toUpperCase();
      return normalized || DEFAULT_COUNTRY;
    }

    function getCountryTurnos(pais) {
      const normalized = normalizeCountry(pais);
      return COUNTRY_TURNOS[normalized] || COUNTRY_TURNOS[DEFAULT_COUNTRY];
    }

    function getActiveSlotConfigs(pais) {
      const allowed = new Set(getCountryTurnos(pais));
      return SLOT_CONFIG.filter((config) => allowed.has(config.key));
    }

    function updateSlotVisibility(pais) {
      const allowed = new Set(getCountryTurnos(pais));
      SLOT_CONFIG.forEach((config) => {
        const el = config.containerId ? document.getElementById(config.containerId) : null;
        if (!el) return;
        el.classList.toggle("hidden", !allowed.has(config.key));
      });
    }


    function pickDraw(draws, fecha, pais, horario) {
      if (!fecha || !pais) return null;
      const matching = draws
        .filter((d) => d.fecha === fecha && d.pais === pais && d.horario === horario)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (!matching.length) return null;
      return matching
        .slice()
        .reverse()
        .find((d) => !d.isTest) ?? matching[matching.length - 1];
    }

    function formatBallContent(numero, symbol) {
      const numHtml = `<span class="ball-number">${numero}</span>`;
      const symHtml = symbol ? `<span class="ball-symbol">${symbol}</span>` : "";
      return `${numHtml}${symHtml}`;
    }

    function applyDrawToSlot(config, draw) {
      const ball = document.getElementById(config.ballId);
      const sym = document.getElementById(config.symId);
      if (!ball || !sym) return;
      ball.removeAttribute("data-pending");
      const image = ball.closest('.ball-row')?.querySelector('[data-slot-image]');
      if (image) {
        if (!draw) {
          image.onload = image.onerror = null;
          image.hidden = true;
          image.removeAttribute('src');
          image.alt = '';
        } else {
          const src = `data/img/${formatNumber(draw.numero)}.png`;
          image.alt = getSymbol(draw.numero) || `Símbolo del número ${formatNumber(draw.numero)}`;
          if (image.getAttribute('src') !== src) {
            image.hidden = true;
            image.onload = () => { image.hidden = false; };
            image.onerror = () => { image.hidden = true; };
            image.src = src;
          }
        }
      }
      const state = ball.closest(".slot")?.querySelector("[data-slot-state]");
      if (state) { state.textContent = draw ? (draw.isTest ? "Prueba" : "Registrado") : "Sin registrar"; state.dataset.state = draw ? "registered" : "empty"; }
      if (!draw) {
        ball.innerHTML = formatBallContent("--", "");
        ball.classList.remove("small");
        ball.removeAttribute("data-numero");
        ball.style.borderColor = "";
        ball.style.color = "";
        sym.textContent = "";
        sym.removeAttribute("title");
        return;
      }
      const numero = formatNumber(draw.numero);
      const symbol = getSymbol(draw.numero);
      ball.innerHTML = formatBallContent(numero, symbol);
      ball.dataset.numero = numero;
      ball.classList.toggle("small", !!draw.isTest);
      ball.style.borderColor = "";
      ball.style.color = "";
      sym.textContent = "";
      sym.title = draw.isTest ? "Modo prueba" : symbol || "";
    }

    async function refreshSlots({ forceReload = false } = {}) {
      syncDayPickers();
      const { fecha, pais } = getFilters();
      const normalizedPais = normalizeCountry(pais);
      const draws = await getCachedDraws({ force: forceReload, excludeTest: false });
      getActiveSlotConfigs(normalizedPais).forEach((config) => {
        const draw = pickDraw(draws, fecha, normalizedPais, config.key);
        applyDrawToSlot(config, draw);
      });
      applyPendingSlots(fecha, normalizedPais);
    }

    const saveDayBtn = document.getElementById("save-day");
    const syncDayBtn = document.getElementById("sync-day");
    const dayPendingIndicator = document.getElementById("day-pending-indicator");
    const managePendingBtn = document.getElementById("manage-pending");
    const pendingModal = document.getElementById("pending-modal");
    const pendingModalCloseBtn = document.getElementById("pending-modal-close");
    const pendingTableBody = document.getElementById("pending-table-body");
    const pendingTableWrap = document.getElementById("pending-table-wrap");
    const pendingEmptyState = document.getElementById("pending-empty-state");
    const pendingEditorForm = document.getElementById("pending-editor-form");
    const pendingEditorMeta = document.getElementById("pending-editor-meta");
    const pendingEditorNumeroInput = document.getElementById("pending-editor-numero");
    const pendingEditorTestInput = document.getElementById("pending-editor-test");
    const pendingEditorCancelBtn = document.getElementById("pending-editor-cancel");
    let pendingDayQueue = [];
    let pendingEditorIndex = null;
    const buildPendingKey = (entry) =>
      entry && entry.fecha && entry.pais && entry.horario
        ? `${entry.fecha}|${entry.pais}|${entry.horario}`
        : null;

    async function loadPendingDayQueue() {
      try {
        return await DB.listPendingDraws();
      } catch (err) {
        logWarn("No se pudieron leer sorteos pendientes de Supabase", err);
        return [];
      }
    }

    function updatePendingIndicator() {
      if (!dayPendingIndicator) return;
      const count = pendingDayQueue.length;
      if (!count) {
        dayPendingIndicator.textContent = "Sin pendientes";
        dayPendingIndicator.dataset.state = "empty";
        return;
      }
      dayPendingIndicator.textContent = `${count} pendiente${count === 1 ? "" : "s"}`;
      dayPendingIndicator.dataset.state = "pending";
    }

    function applyPendingSlots(targetFecha, targetPais) {
      if (!pendingDayQueue.length) return;
      const normalizedPais = normalizeCountry(targetPais);
      pendingDayQueue.forEach((entry) => {
        if (!entry) return;
        if (entry.fecha !== targetFecha) return;
        if ((entry.pais || "HN").toUpperCase() !== normalizedPais) return;
        const config = SLOT_CONFIG.find((slot) => slot.key === entry.horario);
        if (!config) return;
        applyDrawToSlot(config, { numero: entry.numero, isTest: entry.isTest });
        const ball = document.getElementById(config.ballId);
        if (ball) {
          ball.dataset.pending = "true";
          const state = ball.closest(".slot")?.querySelector("[data-slot-state]");
          if (state) { state.textContent = "Por publicar"; state.dataset.state = "pending"; }
        }
      });
    }

    const PENDING_EDITOR_DEFAULT_META = "Selecciona un sorteo para editarlo";

    function resetPendingEditor() {
      pendingEditorIndex = null;
      if (pendingEditorNumeroInput) pendingEditorNumeroInput.value = "";
      if (pendingEditorTestInput) pendingEditorTestInput.checked = false;
      if (pendingEditorMeta) pendingEditorMeta.textContent = PENDING_EDITOR_DEFAULT_META;
      pendingEditorForm?.classList.add("hidden");
    }

    function refreshPendingSlotsView() {
      if (typeof refreshSlots !== "function") return;
      try {
        const maybePromise = refreshSlots();
        if (maybePromise?.catch) {
          maybePromise.catch((err) => console.error("refreshSlots error", err));
        }
      } catch (err) {
        console.error("refreshSlots error", err);
      }
    }

    function renderPendingTable() {
      if (!pendingTableBody || !pendingTableWrap || !pendingEmptyState) return;
      pendingTableBody.innerHTML = "";
      if (!pendingDayQueue.length) {
        pendingEmptyState.classList.remove("hidden");
        pendingTableWrap.classList.add("hidden");
        resetPendingEditor();
        return;
      }
      pendingEmptyState.classList.add("hidden");
      pendingTableWrap.classList.remove("hidden");
      pendingDayQueue.forEach((entry, index) => {
        const tr = document.createElement("tr");
        const numero = formatNumber(entry.numero);
        const symbol = getSymbol(entry.numero) || "—";
        tr.innerHTML = `
          <td>${entry.fecha}</td>
          <td>${entry.pais}</td>
          <td>${entry.horario}</td>
          <td class="pending-table__number">${numero}</td>
          <td class="pending-table__symbol">${symbol}</td>
          <td class="pending-table__type ${entry.isTest ? "is-test" : "is-real"}">${entry.isTest ? "Prueba" : "Oficial"}</td>
          <td>
            <div class="pending-table-actions">
              <button type="button" class="btn-ghost btn-compact" data-edit-pending="${index}">Editar</button>
              <button type="button" class="btn-danger btn-compact" data-delete-pending="${index}">Eliminar</button>
            </div>
          </td>
        `;
        pendingTableBody.appendChild(tr);
      });
    }

    function openPendingModalUI() {
      if (!pendingModal) return;
      renderPendingTable();
      pendingModal.classList.remove("hidden");
    }

    function closePendingModalUI() {
      if (!pendingModal) return;
      pendingModal.classList.add("hidden");
      resetPendingEditor();
    }

    function startPendingEdit(index) {
      if (!Number.isInteger(index) || index < 0) return;
      const entry = pendingDayQueue[index];
      if (!entry || !pendingEditorForm || !pendingEditorNumeroInput || !pendingEditorMeta) return;
      pendingEditorIndex = index;
      pendingEditorNumeroInput.value = formatNumber(entry.numero);
      if (pendingEditorTestInput) pendingEditorTestInput.checked = !!entry.isTest;
      pendingEditorMeta.textContent = `${entry.fecha} · ${entry.pais} · ${entry.horario}`;
      pendingEditorForm.classList.remove("hidden");
      pendingEditorNumeroInput.focus();
    }

    pendingDayQueue = await loadPendingDayQueue();
    updatePendingIndicator();
    managePendingBtn?.addEventListener("click", openPendingModalUI);
    pendingModalCloseBtn?.addEventListener("click", closePendingModalUI);
    pendingModal?.addEventListener("click", (event) => {
      if (event.target === pendingModal) {
        closePendingModalUI();
      }
    });
    pendingTableBody?.addEventListener("click", async (event) => {
      const editBtn = event.target.closest?.("[data-edit-pending]");
      if (editBtn) {
        const index = Number(editBtn.dataset.editPending);
        if (Number.isFinite(index)) {
          startPendingEdit(index);
        }
        return;
      }
      const deleteBtn = event.target.closest?.("[data-delete-pending]");
      if (deleteBtn) {
        const index = Number(deleteBtn.dataset.deletePending);
        if (!Number.isFinite(index) || index < 0) return;
        const entry = pendingDayQueue[index];
        if (!entry) return;
        const confirm = await mostrarModal(
          "Eliminar pendiente",
          `¿Eliminar ${entry.horario} ${formatNumber(entry.numero)} del ${entry.fecha} (${entry.pais}) de los pendientes?`,
          { okText: "Eliminar", cancelText: "Cancelar", okVariant: "danger" },
        );
        if (!confirm) return;
        await DB.deleteDraw(entry.id);
        pendingDayQueue = await loadPendingDayQueue();
        updatePendingIndicator();
        resetPendingEditor();
        renderPendingTable();
        refreshPendingSlotsView();
        showToast("Sorteo eliminado de pendientes.", { variant: "success" });
      }
    });
    pendingEditorCancelBtn?.addEventListener("click", resetPendingEditor);
    pendingEditorForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!Number.isInteger(pendingEditorIndex) || pendingEditorIndex < 0) {
        showToast("Selecciona un sorteo antes de editar.", { variant: "warning" });
        return;
      }
      const entry = pendingDayQueue[pendingEditorIndex];
      if (!entry) {
        showToast("El elemento seleccionado ya no existe.", { variant: "warning" });
        resetPendingEditor();
        renderPendingTable();
        return;
      }
      const rawValue = pendingEditorNumeroInput?.value.trim() ?? "";
      if (!/^\d{1,2}$/.test(rawValue)) {
        showToast("Ingresa un número válido (00–99).", { variant: "warning" });
        pendingEditorNumeroInput?.focus();
        return;
      }
      const numero = parseInt(rawValue, 10);
      if (numero < 0 || numero > 99) {
        showToast("El número debe estar entre 00 y 99.", { variant: "warning" });
        pendingEditorNumeroInput?.focus();
        return;
      }
      const symbol = getSymbol(numero);
      if (!symbol) {
        showToast(`El número ${formatNumber(numero)} no tiene símbolo registrado.`, { variant: "danger" });
        return;
      }
      await DB.updatePendingDrawEntry(entry.id, { numero, isTest: !!pendingEditorTestInput?.checked });
      pendingDayQueue = await loadPendingDayQueue();
      updatePendingIndicator();
      renderPendingTable();
      refreshPendingSlotsView();
      showToast(
        `Actualizaste ${entry.horario} a ${formatNumber(numero)}${pendingEditorTestInput?.checked ? " (modo prueba)" : ""}.`,
        { variant: "success" },
      );
      resetPendingEditor();
    });

    // === PANEL: Rachas por línea ===
    saveDayBtn?.addEventListener("click", async () => {
      const { fecha, pais } = getFilters();
      if (!fecha || !pais) {
        showToast("Selecciona fecha y país antes de guardar.", { variant: "warning" });
        return;
      }

      const paisValue = normalizeCountry(pais);
      const payloads = [];
      for (const config of getActiveSlotConfigs(paisValue)) {
        const input = document.getElementById(config.inputId);
        const raw = input?.value.trim() ?? "";
        if (!raw) continue;
        if (!/^\d{1,2}$/.test(raw)) {
          showToast(`Número inválido en ${config.key}. Usa formato 00-99.`, { variant: "warning" });
          input?.setAttribute("aria-invalid", "true");
          input?.focus();
          return;
        }
        const numero = parseInt(raw, 10);
        if (numero < 0 || numero > 99) {
          showToast(`El número en ${config.key} debe estar entre 00 y 99.`, { variant: "warning" });
          input?.setAttribute("aria-invalid", "true");
          input?.focus();
          return;
        }
        const symbol = getSymbol(numero);
        if (!symbol) {
          showToast(`El número ${formatNumber(numero)} no tiene símbolo registrado. Revisa la guía antes de guardarlo.`, {
            variant: "danger",
          });
          input?.setAttribute("aria-invalid", "true");
          input?.focus();
          return;
        }

        const testCheck = document.getElementById(config.checkboxId);
        payloads.push({ config, numero, input, testCheck, isTest: !!testCheck?.checked });
      }

      if (!payloads.length) {
        showToast("Ingresa al menos un número antes de guardar.", { variant: "warning" });
        return;
      }

      const release = withButtonBusy(saveDayBtn, "Guardando…");
      try {
        const queueEntries = payloads.map(({ config, numero, isTest }) => ({
          fecha,
          pais: paisValue,
          horario: config.key,
          numero,
          isTest,
        }));
        await notifyHypothesisMatches(queueEntries);

        for (const entry of queueEntries) {
          await DB.savePendingDraw(entry);
        }

        pendingDayQueue = await loadPendingDayQueue();
        updatePendingIndicator();

        payloads.forEach(({ input, testCheck }) => {
          if (input) input.value = "";
          if (testCheck) testCheck.checked = false;
        });

        const detail = queueEntries
          .map((entry) => `${entry.horario} ${formatNumber(entry.numero)}${entry.isTest ? " (test)" : ""}`)
          .join(" · ");
        showToast(
          `Sorteos agregados a pendientes: ${detail}. Pendientes totales: ${pendingDayQueue.length}.`,
          { variant: "success" },
        );
        applyPendingSlots(fecha, paisValue);
        document.getElementById("register-result-dialog")?.close();
        autoAdvanceDayFecha();
      } catch (err) {
        console.error("saveDay queue error", err);
        showToast(`No se pudieron preparar los sorteos: ${err.message}`, { variant: "danger" });
        throw err;
      } finally {
        release();
      }
    });

    saveDayBtn?.addEventListener("click", () => {
      updateCountdownDisplay();
    });

    async function notifyHypothesisMatches(entries = []) {
      if (!entries.length) return;
      await ensureHypothesisCache();
      const matches = [];
      entries.forEach((entry) => {
        const hyps = getHypothesesForNumber(entry.numero);
        if (!hyps.length) return;
        matches.push({
          numero: entry.numero,
          simbolo: getSymbol(entry.numero) || "",
          resumen: summarizeHypothesisStates(hyps),
        });
      });
      if (!matches.length) return;
      const detail = matches
        .map((item) => {
          const base = `${formatNumber(item.numero)}${item.simbolo ? ` ${item.simbolo}` : ""}`;
          return item.resumen ? `${base} (${item.resumen})` : base;
        })
        .join(" · ");
      showToast(`Hay hipótesis registradas para ${detail}. Revisa el panel de Hipótesis.`, {
        variant: "info",
        timeout: 6500,
      });
    }

    syncDayBtn?.addEventListener("click", async () => {
      if (!pendingDayQueue.length) {
        showToast("No hay sorteos pendientes por confirmar.", { variant: "info" });
        return;
      }
      const queueSnapshot = pendingDayQueue.slice();
      const endBusy = withButtonBusy(syncDayBtn, "Confirmando…");
      try {
        await runWithSavingModal(async () => {
          await DB.confirmAllPendingDraws();
        });
        pendingDayQueue = [];
        updatePendingIndicator();
        await refreshSlots();
        await handleDrawsMutated();
        const comboMap = new Map();
        queueSnapshot.forEach((entry) => {
          const key = `${entry.fecha}|${entry.pais}`;
          if (!comboMap.has(key)) {
            comboMap.set(key, { fecha: entry.fecha, pais: entry.pais });
          }
        });
        for (const combo of comboMap.values()) {
          await procesarAprendizajeDia({
            fecha: combo.fecha,
            pais: combo.pais,
            silent: true,
            skipKnowledgeSync: true,
            showProgressModal: false,
          });
        }
        await rebuildKnowledge();
        await refreshHypotesis();
        const detail = queueSnapshot
          .map((entry) => `${entry.horario} ${formatNumber(entry.numero)} (${entry.fecha}${entry.pais ? ` · ${entry.pais}` : ""})`)
          .join(" · ");
        showToast(
          `Confirmaste ${queueSnapshot.length} sorteo${queueSnapshot.length === 1 ? "" : "s"}. ${detail}`,
          { variant: "success" },
        );
      } catch (err) {
        console.error("confirm pending draws error", err);
        showToast(`No se pudieron confirmar los sorteos: ${err.message}`, { variant: "danger" });
        throw err;
      } finally {
        endBusy();
      }
    });

    // === FUNCIONALIDAD: "Vincular par" desde slot del día ===
    document.querySelectorAll(".ghost[data-hypo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const turno = btn.dataset.hypo;
        const { fecha, pais } = getFilters();
        if (!fecha || !pais) {
          mostrarAviso("Selecciona fecha y país antes de vincular un par.", { variant: "warning" });
          return;
        }

        const slot = btn.closest(".slot");
        const config = SLOT_CONFIG.find(entry => entry.key === turno);
        const slotNumberInput = config ? document.getElementById(config.inputId) : null;
        const numeroRaw = (slotNumberInput?.value || slot?.querySelector(".ball")?.dataset.numero || "").trim();
        if (!/^\d{1,2}$/.test(numeroRaw)) {
          mostrarAviso("Primero ingresa el número del sorteo en el slot.", { variant: "warning" });
          slotNumberInput?.focus();
          return;
        }

        const numA = parseInt(numeroRaw, 10);
        const padA = String(numA).padStart(2, "0");
        const simA = getSymbol(numA) || padA;

        const modal = document.getElementById("sys-modal");
        const tEl = document.getElementById("modal-title");
        const mEl = document.getElementById("modal-msg");
        const okBtn = document.getElementById("modal-ok");
        const cancelBtn = document.getElementById("modal-cancel");

        tEl.textContent = `Vincular par desde ${turno}`;
        mEl.innerHTML = `
          <div class="modal-form-panel">
            <form class="modal-form" id="modal-pair-form">
              <div class="modal-field modal-field--accent">
                <span class="modal-label">Número A (cayó ${turno})</span>
                <div class="modal-number-chip">
                  <strong>${padA}</strong>
                  <small>${simA}</small>
                </div>
              </div>
              <div class="modal-field">
                <label class="modal-label" for="mp-numB">Número B (compañero esperado)</label>
                <input id="mp-numB" type="text" maxlength="2" inputmode="numeric" placeholder="00–99" class="pair-num-input" autocomplete="off" />
                <div id="mp-infoB" class="pair-num-info" style="margin-top:4px;font-size:.82rem;color:var(--clr-gold)"></div>
              </div>
              <div class="modal-field">
                <label class="modal-label" for="mp-nota">Nota <small>(opcional)</small></label>
                <input id="mp-nota" type="text" placeholder="Ej: Suerte → Dinero, relación simbólica" class="pair-nota-input" />
              </div>
            </form>
          </div>
        `;
        okBtn.textContent = "Guardar par";
        cancelBtn.textContent = "Cancelar";
        modal.classList.remove("hidden");

        // Mostrar símbolo de B en tiempo real
        document.getElementById("mp-numB")?.addEventListener("input", (e) => {
          const v = e.target.value.trim();
          const el = document.getElementById("mp-infoB");
          if (!el) return;
          const n = parseInt(v, 10);
          if (!Number.isFinite(n) || n < 0 || n > 99 || v.length < 1) {
            el.textContent = "";
            return;
          }
          const pad = String(n).padStart(2, "0");
          const info = GUIA?.[pad];
          el.textContent = info ? `${info.simbolo || ""}${info.familia ? ` · ${info.familia}` : ""}` : pad;
        });

        // Cargar par existente si ya hay uno guardado con este A
        try {
          const existing = await listPairsFromDb();
          const found = existing.find(p => p.numA === numA || p.numB === numA);
          if (found) {
            const otherNum = found.numA === numA ? found.numB : found.numA;
            const padOther = String(otherNum).padStart(2, "0");
            const bInput = document.getElementById("mp-numB");
            if (bInput) bInput.value = padOther;
            document.getElementById("mp-infoB").textContent = (() => {
              const info = GUIA?.[padOther];
              return info ? `${info.simbolo || ""}${info.familia ? ` · ${info.familia}` : ""}` : padOther;
            })();
            document.getElementById("mp-nota").value = found.nota ?? "";
            okBtn.textContent = "Actualizar par";
            showToast(`Par existente cargado: ${padA} ↔ ${padOther}`, { variant: "info", timeout: 2000 });
          }
        } catch (_) { /* sin par previo */ }

        okBtn.onclick = async () => {
          const rawB = (document.getElementById("mp-numB")?.value || "").trim();
          if (!/^\d{1,2}$/.test(rawB)) {
            mostrarAviso("Ingresa el Número B (00–99).", { variant: "warning" });
            return;
          }
          const numB = parseInt(rawB, 10);
          if (numB === numA) {
            mostrarAviso("El Número B no puede ser igual al Número A.", { variant: "warning" });
            return;
          }
          const nota = document.getElementById("mp-nota")?.value.trim() ?? "";
          const padB = String(numB).padStart(2, "0");
          try {
            await savePairToDb({ numA, numB, nota });
            mostrarAviso(`Par ${padA} ↔ ${padB} guardado.`, { variant: "success" });
            invalidatePulso();
            renderPairList();
            renderPulso();
          } catch (err) {
            mostrarAviso(`Error al guardar el par: ${err.message}`, { variant: "danger" });
          } finally {
            modal.classList.add("hidden");
          }
        };

        cancelBtn.onclick = () => modal.classList.add("hidden");
      });
    });
    dayFecha?.addEventListener("change", () => {
      updateDayFechaDow();
      refreshSlots();
      updateCountdownDisplay();
    });
    dayPais?.addEventListener("change", () => {
      updateSlotVisibility(dayPais?.value);
      refreshSlots();
      updateCountdownDisplay();
    });
    window.addEventListener("load", () => {
      try {
        updateSlotVisibility(dayPais?.value || DEFAULT_COUNTRY);
      } catch (err) {
        console.error("init slot visibility failed", err);
      }
    });
    updateDayFechaDow();

    const countdownTargetEl = document.querySelector("[data-countdown-target]");
    const countdownTimerEl = document.querySelector("[data-countdown-timer]");
    const countdownLabelEl = document.querySelector("[data-countdown-label]");
    let countdownInterval = null;

    function getTurnoScheduleEntries(pais) {
      const keys = getCountryTurnos(pais);
      const entries = keys
        .map((key) => {
          const schedule = BIAS_TURN_SCHEDULE[key];
          if (!schedule) return null;
          const hour = Number(schedule.hour);
          const minute = Number(schedule.minute) || 0;
          if (!Number.isFinite(hour)) return null;
          return {
            name: key,
            label: HORARIO_LABELS[key] || key,
            hour,
            minute,
          };
        })
        .filter(Boolean);
      if (!entries.length && pais !== DEFAULT_COUNTRY) {
          return getTurnoScheduleEntries(DEFAULT_COUNTRY);
      }
      return entries.sort((a, b) => {
        const aMinutes = a.hour * 60 + (a.minute || 0);
        const bMinutes = b.hour * 60 + (b.minute || 0);
        return aMinutes - bMinutes;
      });
    }

    function getNextDraw(pais) {
      const schedule = getTurnoScheduleEntries(pais);
      if (!schedule.length) return null;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (const draw of schedule) {
        const drawTime = new Date(today);
        drawTime.setHours(draw.hour, draw.minute || 0, 0, 0);
        if (now < drawTime) {
          return { ...draw, time: drawTime };
        }
      }

      // If all draws for today are over, get the first draw of tomorrow
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextDraw = schedule[0];
      const nextDrawTime = new Date(tomorrow);
      nextDrawTime.setHours(nextDraw.hour, nextDraw.minute || 0, 0, 0);
      return { ...nextDraw, time: nextDrawTime };
    }

    function updateCountdown(pais) {
      const normalizedPais = normalizeCountry(pais);
      const nextDraw = getNextDraw(normalizedPais);

      if (!nextDraw) {
        if (countdownLabelEl) countdownLabelEl.textContent = "Próximo sorteo no disponible";
        if (countdownTargetEl) countdownTargetEl.textContent = "—";
        if (countdownTimerEl) countdownTimerEl.textContent = "--:--:--";
        if (countdownInterval) clearInterval(countdownInterval);
        return;
      }

      if (countdownLabelEl) {
        countdownLabelEl.textContent = `Próximo Sorteo: ${nextDraw.label}`;
      }

      if (countdownTargetEl) {
        const options = { hour: "2-digit", minute: "2-digit" };
        countdownTargetEl.textContent = nextDraw.time.toLocaleTimeString("es-ES", options);
      }

      if (countdownInterval) {
        clearInterval(countdownInterval);
      }

      countdownInterval = setInterval(() => {
        const now = new Date();
        const diff = nextDraw.time - now;

        if (diff <= 0) {
          clearInterval(countdownInterval);
          // Update to the next draw when the countdown finishes
          setTimeout(() => updateCountdown(normalizedPais), 1000);
          return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (countdownTimerEl) {
          countdownTimerEl.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
      }, 1000);
    }

    updateCountdownDisplay();

    function updateCountdownDisplay() {
      try {
        const pais = dayPais?.value || DEFAULT_COUNTRY;
        updateCountdown(pais);
      } catch (err) {
        console.error("countdown update error", err);
      }
    }

    // === Paneles extendidos: historial, seguimiento, patrones y ranking ===
    const historyNumberFilter = document.getElementById("history-number-filter");
    let historyPageIndex = 0;
    let historyRenderRequest = 0;
    const historyDateInput = document.getElementById("history-date");
    const historyHourSelect = document.getElementById("history-hour");
    const historyCountrySelect = document.getElementById("history-country");
    const historyLimitSelect = document.getElementById("history-limit");
    const historyTableWrap = document.getElementById("history-table");
    const historySummary = document.getElementById("history-summary");
    const historyCoveragePanel = document.getElementById("history-coverage");
    const historySearchBtn = document.getElementById("history-search");
    const historyClearBtn = document.getElementById("history-clear");
    const historyRefreshBtn = document.getElementById("history-refresh");
    const drawsLocalToggle = document.getElementById("draws-local-toggle");
    const drawsLocalStatus = document.getElementById("draws-local-status");


    const strategyRefreshBtn = document.getElementById("strategy-refresh");
    const strategiesList = document.getElementById("strategies-list");
    const strategiesSection = document.getElementById("view-strategies");
    const strategyTurnChips = document.querySelectorAll("[data-strategy-turn]");
    const strategyOperatorChips = document.querySelectorAll("[data-strategy-operator]");
    const strategyResetBtn = document.getElementById("strategy-reset");
    let allowStrategyAutoRender = true;
    const strategyFilters = {
      turns: new Set(HORARIO_KEYS),
      operators: new Set(["+", "−"]),
    };

    strategyRefreshBtn?.addEventListener("click", () => {
      renderStrategiesPanel({ force: true });
    });

    function setStrategyChipState(chip, active) {
      chip.classList.toggle("active", active);
    }

    function renderStrategyFilters() {
      strategyTurnChips.forEach((chip) => {
        const turno = chip.dataset.strategyTurn;
        if (!turno) return;
        setStrategyChipState(chip, strategyFilters.turns.has(turno));
      });
      strategyOperatorChips.forEach((chip) => {
        const op = chip.dataset.strategyOperator;
        if (!op) return;
        setStrategyChipState(chip, strategyFilters.operators.has(op));
      });
    }

    strategyTurnChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const turno = chip.dataset.strategyTurn;
        if (!turno) return;
        if (strategyFilters.turns.has(turno)) {
          if (strategyFilters.turns.size === 1) return;
          strategyFilters.turns.delete(turno);
        } else {
          strategyFilters.turns.add(turno);
        }
        renderStrategyFilters();
        renderStrategiesPanel();
      });
    });

    strategyOperatorChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const op = chip.dataset.strategyOperator;
        if (!op) return;
        if (strategyFilters.operators.has(op)) {
          if (strategyFilters.operators.size === 1) return;
          strategyFilters.operators.delete(op);
        } else {
          strategyFilters.operators.add(op);
        }
        renderStrategyFilters();
        renderStrategiesPanel();
      });
    });

    strategyResetBtn?.addEventListener("click", () => {
      strategyFilters.turns = new Set(HORARIO_KEYS);
      strategyFilters.operators = new Set(["+", "−"]);
      renderStrategyFilters();
      renderStrategiesPanel();
    });
    renderStrategyFilters();

    strategiesList?.addEventListener("click", async (event) => {
      const viewBtn = event.target.closest("[data-strategy-view]");
      if (viewBtn) {
        await focusDayPanel(viewBtn.dataset.fecha || null, viewBtn.dataset.pais || null);
        return;
      }
      const hypoBtn = event.target.closest("[data-strategy-hypo]");
      if (hypoBtn) {
        navigateToView("hypo");
        if (hypoFechaInput && hypoBtn.dataset.fecha) hypoFechaInput.value = hypoBtn.dataset.fecha;
        if (hypoTurnoSelect && hypoBtn.dataset.turno) hypoTurnoSelect.value = hypoBtn.dataset.turno;
        if (hypoNumeroInput && hypoBtn.dataset.numero) hypoNumeroInput.value = hypoBtn.dataset.numero;
        if (hypoTextoInput) {
          const notaBase = hypoBtn.dataset.descripcion || "Estrategia aritmética detectada.";
          hypoTextoInput.value = notaBase;
        }
        autoFillHypothesisForm({ preserveText: true });
        showToast("Hipótesis preparada desde la estrategia seleccionada.", { variant: "info" });
      }
    });

    let patternsCache = null;
    let patternsLoading = false;

    async function ensurePatternsCache({ force = false } = {}) {
      if (patternsLoading) return patternsCache;
      if (force) patternsCache = null;
      if (patternsCache) return patternsCache;
      patternsLoading = true;
      try {
        patternsCache = await detectarPatrones({ cantidad: 12 });
      } catch (err) {
        console.error("patterns fetch error", err);
        showToast(`No se pudieron calcular los patrones recientes: ${err.message}`, { variant: "danger" });
        patternsCache = null;
      } finally {
        patternsLoading = false;
      }
      return patternsCache;
    }

    function getPatternStrategiesFromCache() {
      return patternsCache?.estrategiasAritmeticas ?? [];
    }

    async function renderStrategiesPanel({ force = false, skipEnsure = false } = {}) {
      if (!strategiesList) return;
      if (force) patternsCache = null;
      if (!skipEnsure) {
        const prevFlag = allowStrategyAutoRender;
        allowStrategyAutoRender = false;
        await ensurePatternsCache({ force });
        allowStrategyAutoRender = prevFlag;
      } else if (!patternsCache) {
        await ensurePatternsCache({ force: false });
      }
      const data = getPatternStrategiesFromCache();
      if (!data.length) {
        strategiesList.innerHTML =
          "<p class='hint'>Sin estrategias disponibles en la ventana reciente. Calcula patrones para actualizar.</p>";
        return;
      }
      const filtered = data.filter((entry) => {
        const turnoMatch =
          !entry.target?.horario || strategyFilters.turns.has(entry.target.horario);
        const operatorMatch = strategyFilters.operators.has(entry.operador);
        return turnoMatch && operatorMatch;
      });
      if (!filtered.length) {
        strategiesList.innerHTML =
          "<p class='hint'>Sin estrategias que coincidan con los filtros seleccionados.</p>";
        return;
      }
      strategiesList.innerHTML = "";
      const draws = await getCachedDraws({ force });
      const dayCache = new Map();
      const getDayDraws = (fecha, pais) => {
        const key = `${fecha}|${pais || ""}`;
        if (dayCache.has(key)) return dayCache.get(key);
        const map = {};
        HORARIO_KEYS.forEach((turno) => {
          map[turno] = pickDraw(draws, fecha, pais || null, turno);
        });
        dayCache.set(key, map);
        return map;
      };

      filtered
        .slice()
        .sort(
          (a, b) =>
            (new Date(b.target?.fecha || "1970-01-01") - new Date(a.target?.fecha || "1970-01-01")) ||
            (HORARIO_ORDER[b.target?.horario] ?? 0) - (HORARIO_ORDER[a.target?.horario] ?? 0),
        )
        .forEach((entry) => {
          const card = document.createElement("article");
          card.className = "strategy-card";
          const symbol = getSymbol(entry.target.numero);
          const leftSymbol = getSymbol(entry.left.numero);
          const rightSymbol = getSymbol(entry.right.numero);
          const historyLine =
            entry.historyCount > 0
              ? `<div class="strategy-meta">Aplicada anteriormente: ${entry.historyCount} vez(es)</div>`
              : "";
          const dayDraws =
            entry.target?.fecha ? getDayDraws(entry.target.fecha, entry.target.pais || null) : {};
          card.innerHTML = `
            <div class="strategy-head">
              <span class="strategy-target">${formatNumber(entry.target.numero)} ${symbol || ""}</span>
              <span class="strategy-badge">${entry.operador === "+" ? "Suma" : "Resta"}</span>
            </div>
            <div class="strategy-meta">${formatFriendlyDate(entry.target.fecha)} · ${entry.target.horario || "—"}${entry.target.pais ? ` · ${entry.target.pais}` : ""}</div>
            <div class="strategy-operation">
              <span>${formatNumber(entry.left.numero)} ${leftSymbol || ""}</span>
              <span class="strategy-operator">${entry.operador}</span>
              <span>${formatNumber(entry.right.numero)} ${rightSymbol || ""}</span>
              <span class="strategy-operator">=</span>
              <span>${formatNumber(entry.target.numero)}</span>
            </div>
            ${historyLine}
          `;
          const timeline = buildStrategyTimeline(entry, dayDraws);
          card.appendChild(timeline);
          const detail = document.createElement("ul");
          detail.className = "strategy-detail";
          detail.innerHTML = `
            <li>${formatFriendlyDate(entry.left.fecha)} · ${entry.left.horario || "—"}${entry.left.pais ? ` · ${entry.left.pais}` : ""}</li>
            <li>${formatFriendlyDate(entry.right.fecha)} · ${entry.right.horario || "—"}${entry.right.pais ? ` · ${entry.right.pais}` : ""}</li>
          `;
          card.appendChild(detail);
          const actions = document.createElement("div");
          actions.className = "strategy-actions";
          if (entry.target?.fecha) {
            const viewBtn = document.createElement("button");
            viewBtn.type = "button";
            viewBtn.className = "btn-outline";
            viewBtn.textContent = "Ver día completo";
            viewBtn.dataset.strategyView = "true";
            viewBtn.dataset.fecha = entry.target.fecha;
            viewBtn.dataset.pais = entry.target.pais || "";
            actions.appendChild(viewBtn);
          }
          if (entry.target?.numero !== null) {
            const hypoBtn = document.createElement("button");
            hypoBtn.type = "button";
            hypoBtn.className = "btn-secondary";
            hypoBtn.textContent = "Guardar hipótesis";
            hypoBtn.dataset.strategyHypo = "true";
            hypoBtn.dataset.numero = formatNumber(entry.target.numero);
            hypoBtn.dataset.fecha = entry.target.fecha || "";
            hypoBtn.dataset.turno = entry.target.horario || "";
            hypoBtn.dataset.descripcion = `${formatNumber(entry.left.numero)} ${entry.operador} ${formatNumber(
              entry.right.numero,
            )} = ${formatNumber(entry.target.numero)}`;
            actions.appendChild(hypoBtn);
          }
          if (actions.childElementCount) card.appendChild(actions);
          strategiesList.appendChild(card);
        });

      const stats = buildStrategyStats(filtered);
      const years = Object.keys(stats.years).sort();
      const rangeLabel =
        years.length > 1 ? `${years[0]} – ${years[years.length - 1]}` : years[0] || "N/D";
      const statsCard = document.createElement("article");
      statsCard.className = "strategy-card strategy-card--stats";
      statsCard.innerHTML = `
        <div class="strategy-head">
          <span class="strategy-target">Resumen histórico</span>
          <span class="strategy-badge">${rangeLabel}</span>
        </div>
        <div class="strategy-stats">
          <p><strong>Total estrategias detectadas:</strong> ${stats.total}</p>
          <p><strong>Por operador:</strong> ${stats.operators["+"] || 0} sumas · ${stats.operators["−"] || 0} restas</p>
        </div>
      `;
      if (years.length) {
        const yearList = document.createElement("ul");
        yearList.className = "strategy-year-stats";
        years.forEach((year) => {
          const info = stats.years[year];
          const sumUse = info.suma || 0;
          const restUse = info.resta || 0;
          const li = document.createElement("li");
          li.textContent = `${year}: ${info.total} estrategias (${sumUse} sumas / ${restUse} restas)`;
          yearList.appendChild(li);
        });
        statsCard.appendChild(yearList);
      }
      strategiesList.appendChild(statsCard);
    }

    function buildStrategyStats(entries = []) {
      const stats = {
        total: entries.length,
        operators: { "+": 0, "−": 0 },
        years: {},
      };
      entries.forEach((entry) => {
        if (stats.operators[entry.operador] !== undefined) {
          stats.operators[entry.operador] += 1;
        }
        const year = entry.target?.fecha ? entry.target.fecha.slice(0, 4) : "N/D";
        if (!stats.years[year]) {
          stats.years[year] = { total: 0, suma: 0, resta: 0 };
        }
        stats.years[year].total += 1;
        if (entry.operador === "+") stats.years[year].suma += 1;
        else stats.years[year].resta += 1;
      });
      return stats;
    }

    function buildStrategyTimeline(entry, dayDraws = {}) {
      const timeline = document.createElement("div");
      timeline.className = "strategy-timeline";
      HORARIO_KEYS.forEach((turno) => {
        const slot = document.createElement("div");
        slot.className = "strategy-slot";
        const targetMatch = entry.target?.horario === turno;
        if (targetMatch) slot.classList.add("strategy-slot--result");
        const isLeftSource =
          entry.left?.horario === turno &&
          entry.left?.fecha === entry.target?.fecha &&
          (entry.left?.pais || "") === (entry.target?.pais || "");
        const isRightSource =
          entry.right?.horario === turno &&
          entry.right?.fecha === entry.target?.fecha &&
          (entry.right?.pais || "") === (entry.target?.pais || "");
        if (isLeftSource || isRightSource) slot.classList.add("strategy-slot--source");
        let draw = dayDraws[turno] || null;
        let value = draw ? formatNumber(draw.numero) : "--";
        let symbol = draw ? getSymbol(draw.numero) : "";
        let external = false;
        if (!draw) {
          const fallback =
            entry.left?.horario === turno ? entry.left : entry.right?.horario === turno ? entry.right : null;
          if (fallback && fallback.numero !== null) {
            value = formatNumber(fallback.numero);
            symbol = getSymbol(fallback.numero);
            external =
              fallback.fecha !== entry.target?.fecha ||
              (fallback.pais || "") !== (entry.target?.pais || "");
            if (fallback === entry.left || fallback === entry.right) {
              slot.classList.add("strategy-slot--source");
            }
          }
        }
        if (external) slot.dataset.external = "true";
        const label = document.createElement("span");
        label.className = "strategy-slot__label";
        label.textContent = turno;
        const valueEl = document.createElement("span");
        valueEl.className = "strategy-slot__value";
        valueEl.textContent = value;
        const symbolEl = document.createElement("span");
        symbolEl.className = "strategy-slot__symbol";
        symbolEl.textContent = symbol || "";
        slot.appendChild(label);
        slot.appendChild(valueEl);
        slot.appendChild(symbolEl);
        timeline.appendChild(slot);
      });
      return timeline;
    }
    function navigateToView(key) {
      const btn = document.querySelector(`[data-view="${key}"]`);
      if (btn) {
        btn.click();
      } else {
        document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
        const id = views[key];
        document.getElementById(id)?.classList.remove("hidden");
      }
    }

    async function focusDayPanel(fecha, pais) {
      if (!fecha) return;
      if (dayFecha) {
        dayFecha.value = fecha;
        updateDayFechaDow(fecha);
      }
      if (dayPais && pais) {
        dayPais.value = pais;
        updateSlotVisibility(pais);
      }
      navigateToView("day");
      try {
        await refreshSlots();
        updateCountdownDisplay?.();
      } catch (err) {
        console.error("focus day error", err);
      }
    }



    if (historyLimitSelect && !historyLimitSelect.value) historyLimitSelect.value = "9";
    updateLocalModeUI();

    historySearchBtn?.addEventListener("click", () => {
      historyPageIndex = 0;
      refreshHistoryPanel();
      document.getElementById("history-filters").open = false;
    });
    historyRefreshBtn?.addEventListener("click", () => {
      refreshHistoryPanel({ forceReload: true });
    });
    historyNumberFilter?.addEventListener("input", () => { historyPageIndex = 0; refreshHistoryPanel(); });
    historyClearBtn?.addEventListener("click", () => {
      historyPageIndex = 0;
      if (historyNumberFilter) historyNumberFilter.value = "";
      if (historyDateInput) historyDateInput.value = "";
      if (historyHourSelect) historyHourSelect.value = "";
      if (historyCountrySelect) historyCountrySelect.value = "";
      if (historyLimitSelect) historyLimitSelect.value = "15";
      refreshHistoryPanel({ defaultView: true });
    });
    document.getElementById('history-reset-inline')?.addEventListener('click', () => historyClearBtn?.click());
    [historyDateInput, historyHourSelect, historyCountrySelect, historyLimitSelect].forEach(control => control?.addEventListener('change', () => { historyPageIndex = 0; refreshHistoryPanel(); }));
    document.getElementById('history-prev')?.addEventListener('click', () => { historyPageIndex--; refreshHistoryPanel(); });
    document.getElementById('history-next')?.addEventListener('click', () => { historyPageIndex++; refreshHistoryPanel(); });
    drawsLocalToggle?.addEventListener("click", async () => {
      const nextState = !preferLocalSnapshot;
      if (nextState) {
        const snapshot = ensureLocalSnapshotState();
        if (!snapshot.draws.length) {
          showToast(
            "Aún no hay datos en el modo local. Pulsa “Actualizar” cuando tengas conexión para guardarlos.",
            { variant: "warning" },
          );
          return;
        }
      }
      preferLocalSnapshot = nextState;
      setLocalDrawSnapshotMode(nextState);
      updateLocalModeUI();
      invalidateDrawCache();
      await refreshSlots({ forceReload: !nextState });
      await refreshHistoryPanel({ forceReload: !nextState });
      showToast(
        nextState
          ? "Modo local activado: los slots del día usarán los sorteos guardados en este navegador."
          : "Modo local desactivado: se volverá a consultar Supabase para los slots.",
        { variant: "info" },
      );
    });

    function compareDrawDesc(a, b) {
      if (a.fecha && b.fecha && a.fecha !== b.fecha) {
        return b.fecha.localeCompare(a.fecha);
      }
      const horarioDiff = (HORARIO_ORDER[b.horario] ?? 0) - (HORARIO_ORDER[a.horario] ?? 0);
      if (horarioDiff !== 0) return horarioDiff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }

    function latestRealDate(draws = []) {
      return draws
        .filter((d) => d?.fecha)
        .map((d) => d.fecha)
        .sort((a, b) => b.localeCompare(a))[0] || null;
    }

    const renderHistoryBadge = (label, extraClass, title = "") =>
      `<span class="history-pill ${extraClass}"${title ? ` title="${title}"` : ""}><span class="history-pill__dot"></span>${label}</span>`;

    function historyBadges(draw, latestDate) {
      const badges = [];
      if (draw.fecha === todayISO) {
        badges.push(renderHistoryBadge("Hoy", "history-pill--today", "Resultado registrado hoy"));
      } else if (latestDate && draw.fecha === latestDate) {
        badges.push(renderHistoryBadge("Reciente", "history-pill--recent", "Día más reciente con registros"));
      }
      return badges.join("");
    }

    function computeYearCoverage(draws = []) {
      const map = new Map();
      draws.forEach((draw) => {
        const fecha = (draw?.fecha || "").trim();
        if (!fecha) return;
        const year = parseInt(fecha.slice(0, 4), 10);
        if (!Number.isFinite(year)) return;
        const entry = map.get(year) || { year, min: null, max: null, count: 0 };
        entry.count += 1;
        if (!entry.min || fecha < entry.min) entry.min = fecha;
        if (!entry.max || fecha > entry.max) entry.max = fecha;
        map.set(year, entry);
      });
      return Array.from(map.values()).sort((a, b) => b.year - a.year);
    }

    function renderHistoryCoverage(draws = []) {
      if (!historyCoveragePanel) return;
      const currentYear = new Date().getFullYear();
      const coverage = computeYearCoverage(draws);
      const pastYears = coverage.filter((entry) => entry.year < currentYear);
      if (!pastYears.length) {
        historyCoveragePanel.innerHTML =
          "<p class='hint'>Aún no registras sorteos de años anteriores — importa o agrega uno para llevar control.</p>";
        return;
      }
      const rows = [];
      let cursorYear = currentYear - 1;
      pastYears.forEach((record) => {
        for (let year = cursorYear; year > record.year; year -= 1) {
          rows.push({ year, missing: true });
        }
        rows.push({ ...record, missing: false });
        cursorYear = record.year - 1;
      });
      const list = document.createElement("div");
      list.className = "history-coverage__list";
      rows.forEach((row) => {
        if (!row.year || row.year >= currentYear) return;
        const item = document.createElement("div");
        item.className = "history-coverage__row";
        if (row.missing) item.classList.add("history-coverage__row--missing");
        const yearEl = document.createElement("div");
        yearEl.className = "history-coverage__year";
        yearEl.textContent = row.year;
        const info = document.createElement("div");
        info.className = "history-coverage__info";
        if (row.missing) {
          info.innerHTML = `
            <div class="history-coverage__label">Pendiente</div>
            <div class="history-coverage__range">Sin sorteos registrados para ${row.year}.</div>
          `;
        } else {
          const countLabel = `${row.count} sorteo${row.count === 1 ? "" : "s"}`;
          const lastLabel = row.max ? formatFriendlyDate(row.max) : "";
          const firstLabel = row.min && row.min !== row.max ? formatFriendlyDate(row.min) : "";
          const rangeText = firstLabel ? `Primer registro: ${firstLabel}` : "";
          info.innerHTML = `
            <div class="history-coverage__label">Último: ${lastLabel}</div>
            <div class="history-coverage__range">${countLabel}${rangeText ? ` · ${rangeText}` : ""}</div>
          `;
        }
        item.append(yearEl, info);
        list.appendChild(item);
      });
      historyCoveragePanel.innerHTML = "";
      historyCoveragePanel.appendChild(list);
    }

    async function refreshHistoryPanel({ forceReload = false, defaultView = false } = {}) {
      if (!historyTableWrap) return;
      const request = ++historyRenderRequest;
      if (defaultView) historyPageIndex = 0;
      if (defaultView && historySummary) {
        historySummary.textContent = "Mostrando los últimos sorteos registrados.";
      }
      if (forceReload) {
        historyTableWrap.innerHTML = "<p class='hint'>Actualizando sorteos…</p>";
      }
      const draws = await getCachedDraws({ force: forceReload });
      if (request !== historyRenderRequest) return;
      renderHistoryCoverage(draws);
      renderRecentRecords(document.getElementById("day-recent-records"), draws, GUIA);
      if (!draws.length) {
        historyTableWrap.innerHTML = "<p class='hint'>Aún no hay sorteos almacenados.</p>";
        if (historySummary) historySummary.textContent = "Sin registros.";
        updateHistoryPagination(paginateHistory([]));
        return;
      }
      const limitValue = parseInt(historyLimitSelect?.value, 10);
      const limit = Number.isFinite(limitValue) ? limitValue : 9;
      let filtered = draws.slice().sort(compareDrawDesc);
      const fechaFiltro = defaultView ? "" : (historyDateInput?.value || "").trim();
      const horarioFiltro = defaultView ? "" : historyHourSelect?.value || "";
      const paisFiltro = defaultView ? "" : historyCountrySelect?.value || "";
      if (fechaFiltro) filtered = filtered.filter((d) => d.fecha === fechaFiltro);
      if (horarioFiltro) filtered = filtered.filter((d) => d.horario === horarioFiltro);
      if (paisFiltro) filtered = filtered.filter((d) => d.pais === paisFiltro);
      const numberQuery = (historyNumberFilter?.value || '').trim().toLocaleLowerCase('es');
      if (numberQuery) filtered = filtered.filter(draw => /^\d{1,2}$/.test(numberQuery)
        ? Number(draw.numero) === Number(numberQuery)
        : (getSymbol(draw.numero) || '').toLocaleLowerCase('es').includes(numberQuery));
      const page = paginateHistory(filtered, historyPageIndex, limit);
      historyPageIndex = page.page;
      updateHistoryPagination(page);
      const rows = page.rows;
      const latestDate = latestRealDate(draws);
      if (!rows.length) {
        historyTableWrap.innerHTML = "<p class='hint'>Sin resultados para esos filtros.</p>";
        if (historySummary) {
          historySummary.textContent = "No se encontraron sorteos que coincidan.";
        }
        return;
      }
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th scope="col">Número / símbolo</th>
            <th scope="col">Fecha</th>
            <th scope="col">Horario</th>
            <th scope="col">País</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      rows.forEach((draw, idx) => {
        const tr = document.createElement("tr");
        const isToday = draw.fecha === todayISO;
        if (isToday || (latestDate && draw.fecha === latestDate)) {
          tr.classList.add("history-row--today");
        }
        tr.innerHTML = `
          <td class="history-result"><strong class="history-number">${formatNumber(draw.numero)}</strong><span>${getSymbol(draw.numero) || "—"}</span></td>
          <td><span class="history-date-long">${formatFriendlyDate(draw.fecha)}</span><span class="history-date-short">${draw.fecha}</span></td>
          <td><span class="history-turn">${draw.horario || "—"}</span></td>
          <td>${draw.pais || "—"}</td>
          <td><span class="history-recorded">Registrado</span>${draw.isTest ? '<span class="history-test">Prueba</span>' : ''}</td>
        `;
        tbody.appendChild(tr);
      });
      historyTableWrap.innerHTML = "";
      historyTableWrap.appendChild(table);
      if (historySummary) {
        const totalMatches = filtered.length;
        const scopeText =
          fechaFiltro || horarioFiltro || paisFiltro || numberQuery
            ? "con filtros aplicados"
            : "del histórico general";
        historySummary.textContent = `${totalMatches.toLocaleString("es-HN")} resultados ${scopeText}`;
      }
    }

    function updateHistoryPagination(page) {
      document.getElementById('history-range').textContent = page.total ? `${page.start}–${page.end} de ${page.total.toLocaleString('es-HN')}` : 'Sin resultados';
      document.getElementById('history-page').textContent = `${page.page + 1} / ${page.pages}`;
      document.getElementById('history-prev').disabled = page.page === 0;
      document.getElementById('history-next').disabled = page.page >= page.pages - 1;
    }

    async function handleDrawsMutated() {
      invalidateDrawCache();
      invalidateMemoryCache();
      invalidatePulso();
      await Promise.allSettled([
        refreshHistoryPanel({ forceReload: true }),
        renderMemoryBoard({ forceReload: true }),
        renderGapPanel({ forceReload: true }),
        numberClocks.onDrawsChanged(),
      ]);
      await reopenMemoryDetail();
    }

    configurarMemoriaNav({ jumpToDayView });
    configurarSuperPremio({ invalidatePulso, cacheSorteos: () => drawsCache });
    initDecemberPanel({
      preferencias: () => userPreferences,
      encolarGuardado: queueUserPreferencesSave,
      obtenerSorteos: getCachedDraws,
      horarioKeys: HORARIO_KEYS,
    });
    initTriggersPanel({
      botonOcupado: withButtonBusy,
      modal: mostrarModal,
    });
    initPega3Panel({
      botonOcupado: withButtonBusy,
      horarioKeys: HORARIO_KEYS,
    });
    const consultarRankingMensual = initMonthlyRankingPanel({ obtenerSorteos: () => getCachedDraws({ excludeTest: true }), obtenerGuia: () => GUIA });
    initHorarioPanel({ obtenerSorteos: () => getCachedDraws({ excludeTest: true }), obtenerGuia: () => GUIA });
    const numberClocks = initNumberClocksPanel({ obtenerSorteos: force => getCachedDraws({ force, excludeTest: true }), obtenerGuia: () => GUIA });
    initConsultaPanel({
      obtenerSorteos: () => getCachedDraws(),
      pais: () => "HN",
    });

    async function bootstrapExtendedPanels() {
      await Promise.allSettled([
        refreshHistoryPanel(),
      ]);
    }

    await bootstrapExtendedPanels();

    // ── Refs para archivo de notas libres (historial antiguo) ────────────────
    const hypoFechaInput = null;   // eliminado del formulario
    const hypoTurnoSelect = null;  // eliminado del formulario
    const hypoNumeroInput = null;  // eliminado del formulario
    const hypoTextoInput = null;   // eliminado del formulario
    const btnHipotesis = null;     // eliminado del formulario
    const hypoSearchInput = document.getElementById("h-search");
    const hypoSearchBtn = document.getElementById("h-search-btn");
    const hypoSearchClearBtn = document.getElementById("h-search-clear");
    let editingHypothesisId = null;
    let lastHypoAutoKey = "";
    let lastHypoAutoId = null;

    hypoSearchBtn?.addEventListener("click", () => refreshHypotesis());
    hypoSearchInput?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); refreshHypotesis(); }
    });
    hypoSearchClearBtn?.addEventListener("click", () => {
      if (hypoSearchInput) hypoSearchInput.value = "";
      refreshHypotesis();
    });

    function resetHypothesisForm() {
      editingHypothesisId = null;
      lastHypoAutoKey = "";
      lastHypoAutoId = null;
    }

    function setHypothesisFormMode(id) {
      editingHypothesisId = id || null;
    }

    function findExistingHypothesis(list = [], { fecha, turno }) {
      if (!fecha || !list.length) return null;
      const turnoValue = (turno || "").trim();
      const exact = list.filter(
        (h) => h?.fecha === fecha && (!turnoValue || (h.turno || "") === turnoValue)
      );
      if (exact.length) {
        return exact.slice().sort((a, b) =>
          (b.createdAt || 0) - (a.createdAt || 0) || (b.id || 0) - (a.id || 0)
        )[0];
      }
      if (!turnoValue) return null;
      const fallback = list.filter((h) => h?.fecha === fecha);
      if (!fallback.length) return null;
      return fallback.slice().sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0) || (b.id || 0) - (a.id || 0)
      )[0];
    }

    async function autoFillHypothesisForm() { /* formulario eliminado */ }

    // ── PARES VINCULADOS ──────────────────────────────────────────────────────

    const PAIRS_SCOPE = "number_pairs";

    function pairKey(a, b) {
      return `pair:${Math.min(a, b)}:${Math.max(a, b)}`;
    }

    async function savePairToDb(pair) {
      return DB.saveKnowledge([{
        key: pairKey(pair.numA, pair.numB),
        scope: PAIRS_SCOPE,
        data: pair,
        updatedAt: Date.now(),
      }]);
    }

    async function listPairsFromDb() {
      const rows = await DB.getKnowledgeByScope(PAIRS_SCOPE);
      return rows.map((r) => r.data).filter(Boolean);
    }

    async function deletePairFromDb(numA, numB) {
      return DB.deleteKnowledgeByKey(pairKey(numA, numB));
    }

    // Muestra el símbolo de un número en un elemento
    function showPairNumInfo(elId, raw) {
      const el = document.getElementById(elId);
      if (!el) return;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 99) { el.textContent = ""; return; }
      const pad = String(n).padStart(2, "0");
      const info = GUIA?.[pad];
      el.textContent = info ? `${info.simbolo || ""}${info.familia ? ` · ${info.familia}` : ""}` : pad;
    }

    // Render de la lista de pares guardados
    async function renderPairList() {
      const listEl = document.getElementById("p-list");
      if (!listEl) return;
      listEl.innerHTML = "<p class='hint' style='font-size:.82rem'>Cargando…</p>";
      let pairs;
      try { pairs = await listPairsFromDb(); }
      catch (err) {
        listEl.innerHTML = `<p class='hint'>Error al cargar: ${escapeHtml(err.message)}</p>`;
        return;
      }
      if (!pairs.length) {
        listEl.innerHTML = "<p class='hint' style='font-size:.82rem'>Aún no hay pares registrados.</p>";
        return;
      }
      listEl.innerHTML = "";
      for (const pair of pairs) {
        const padA = String(pair.numA).padStart(2, "0");
        const padB = String(pair.numB).padStart(2, "0");
        const simA = GUIA?.[padA]?.simbolo || padA;
        const simB = GUIA?.[padB]?.simbolo || padB;
        const card = document.createElement("div");
        card.className = "pair-card";
        card.innerHTML = `
          <div class="pair-card__nums">
            <span class="pair-card__num">${padA}</span>
            <span class="pair-card__sim">${simA}</span>
            <span class="pair-card__arrow">↔</span>
            <span class="pair-card__num">${padB}</span>
            <span class="pair-card__sim">${simB}</span>
          </div>
          ${pair.nota ? `<div class="pair-card__nota">${pair.nota}</div>` : ""}
        `;
        const delBtn = document.createElement("button");
        delBtn.className = "pair-card__del btn-ghost";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", async () => {
          if (!await mostrarModal("Eliminar par", `¿Eliminar el par ${padA} ↔ ${padB}?`, { okText: "Eliminar", okVariant: "danger" })) return;
          await deletePairFromDb(pair.numA, pair.numB);
          invalidatePulso();
          renderPairList();
          renderPulso();
        });
        card.appendChild(delBtn);
        listEl.appendChild(card);
      }
    }

    // Bind del formulario de pares
    (function bindPairForm() {
      const pNumA = document.getElementById("p-numA");
      const pNumB = document.getElementById("p-numB");
      const pGuardar = document.getElementById("p-guardar");
      const pStatus = document.getElementById("p-status");

      const padOnBlur = (input, infoId) => {
        if (!input) return;
        input.addEventListener("blur", () => {
          const raw = input.value.trim();
          if (/^\d{1,2}$/.test(raw)) input.value = raw.padStart(2, "0");
          showPairNumInfo(infoId, input.value);
        });
        input.addEventListener("input", () => showPairNumInfo(infoId, input.value));
      };
      padOnBlur(pNumA, "p-infoA");
      padOnBlur(pNumB, "p-infoB");

      pGuardar?.addEventListener("click", async () => {
        const rawA = (pNumA?.value || "").trim();
        const rawB = (pNumB?.value || "").trim();
        if (!/^\d{1,2}$/.test(rawA) || !/^\d{1,2}$/.test(rawB)) {
          if (pStatus) pStatus.textContent = "Ingresa dos números válidos.";
          return;
        }
        const numA = parseInt(rawA, 10);
        const numB = parseInt(rawB, 10);
        if (numA === numB) {
          if (pStatus) pStatus.textContent = "Los dos números deben ser distintos.";
          return;
        }
        const nota = (document.getElementById("p-nota")?.value || "").trim();
        const padA = String(numA).padStart(2, "0");
        const padB = String(numB).padStart(2, "0");
        const pair = {
          numA,
          numB,
          simboloA: GUIA?.[padA]?.simbolo || "",
          simboloB: GUIA?.[padB]?.simbolo || "",
          nota,
        };
        try {
          if (pGuardar) pGuardar.disabled = true;
          await savePairToDb(pair);
          if (pStatus) pStatus.textContent = `Par ${padA} ↔ ${padB} guardado.`;
          if (pNumA) pNumA.value = "";
          if (pNumB) pNumB.value = "";
          document.getElementById("p-nota").value = "";
          document.getElementById("p-infoA").textContent = "";
          document.getElementById("p-infoB").textContent = "";
          await renderPairList();
          invalidatePulso();
          renderPulso();
        } catch (err) {
          if (pStatus) pStatus.textContent = `Error: ${err.message}`;
        } finally {
          if (pGuardar) pGuardar.disabled = false;
        }
      });
    })();

    // ── CONSTELACIONES ────────────────────────────────────────────────────────

    const CONST_SCOPE = "constellations";

    function constKey(nombre) {
      return `const:${nombre.toLowerCase().replace(/\s+/g, "_")}`;
    }

    async function saveConstellationToDb(c) {
      return DB.saveKnowledge([{ key: constKey(c.nombre), scope: CONST_SCOPE, data: c, updatedAt: Date.now() }]);
    }

    async function listConstellationsFromDb() {
      const rows = await DB.getKnowledgeByScope(CONST_SCOPE);
      return rows.map(r => r.data).filter(Boolean);
    }

    async function deleteConstellationFromDb(nombre) {
      return DB.deleteKnowledgeByKey(constKey(nombre));
    }

    /**
     * Dado el listado de constelaciones y el historial (excl. test),
     * devuelve las que están activas: disparadas dentro de su ventana
     * y con miembros aún pendientes.
     */
    function detectActiveConstellations(constellations, draws) {
      if (!constellations.length || !draws.length) return [];
      const TURN_ORDER = { "11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4 };
      const sorted = [...draws].sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        return (TURN_ORDER[a.horario] ?? 2) - (TURN_ORDER[b.horario] ?? 2);
      });
      const todayMs = Date.now();
      const results = [];

      for (const c of constellations) {
        const ventanaDias = c.ventanaDias || 10;
        const cutoff = new Date(todayMs - ventanaDias * 86_400_000).toISOString().slice(0, 10);
        const recentDraws = sorted.filter(d => d.fecha >= cutoff);
        const miembros = (c.miembros || []).map(Number);
        if (!miembros.length) continue;

        let activadoEn = null, activadoPor = null;

        if (c.tipo === "disparador_fijo" && c.disparador != null) {
          const trig = recentDraws.find(d => Number(d.numero) === Number(c.disparador));
          if (trig) { activadoEn = trig.fecha; activadoPor = Number(c.disparador); }
        } else {
          // cualquier miembro dispara
          const first = recentDraws.find(d => miembros.includes(Number(d.numero)));
          if (first) { activadoEn = first.fecha; activadoPor = Number(first.numero); }
        }
        if (!activadoEn) continue;

        const drawsSince = sorted.filter(d => d.fecha >= activadoEn);
        const numsSince = new Set(drawsSince.map(d => Number(d.numero)));
        const vistos    = miembros.filter(m => numsSince.has(m));
        const faltantes = miembros.filter(m => !numsSince.has(m));
        if (!faltantes.length) continue; // todos ya cayeron, ciclo completo

        const diasActivo    = Math.round((todayMs - new Date(activadoEn).getTime()) / 86_400_000);
        const diasRestantes = ventanaDias - diasActivo;
        results.push({ c, activadoEn, activadoPor, vistos, faltantes, diasActivo, diasRestantes });
      }
      return results;
    }

    async function renderConstellationList() {
      const listEl = document.getElementById("c-list");
      if (!listEl) return;
      const constellations = await listConstellationsFromDb();
      if (!constellations.length) {
        listEl.innerHTML = "<p class='hint' style='font-size:.82rem'>Sin constelaciones registradas aún.</p>";
        return;
      }
      listEl.innerHTML = "";
      for (const c of constellations) {
        const card = document.createElement("div");
        card.className = "const-card";
        const miembros = (c.miembros || []).map(Number);
        const chipsHtml = miembros.map(m => {
          const pad = String(m).padStart(2, "0");
          const sim = GUIA?.[pad]?.simbolo || "";
          return `<span class="const-chip">${pad} <small>${sim}</small></span>`;
        }).join("");
        const tipoLabel = c.tipo === "disparador_fijo"
          ? `Disparador: <strong>${String(c.disparador).padStart(2,"0")} ${GUIA?.[String(c.disparador).padStart(2,"0")]?.simbolo || ""}</strong>`
          : "Grupo libre";
        card.innerHTML = `
          <div class="const-card__head">
            <span class="const-card__name">${c.nombre}</span>
            <span class="const-card__meta">${tipoLabel} · ${c.ventanaDias || 10}d</span>
          </div>
          <div class="const-card__members">${chipsHtml}</div>
          ${c.nota ? `<div class="const-card__nota">${c.nota}</div>` : ""}
        `;
        const delBtn = document.createElement("button");
        delBtn.className = "btn-ghost small";
        delBtn.textContent = "Eliminar";
        delBtn.style.cssText = "margin-top:8px;font-size:.75rem;opacity:.5";
        delBtn.addEventListener("click", async () => {
          if (!await mostrarModal("Eliminar constelación", `¿Eliminar la constelación "${c.nombre}"?`, { okText: "Eliminar", okVariant: "danger" })) return;
          await deleteConstellationFromDb(c.nombre);
          invalidatePulso();
          renderConstellationList();
          renderPulso();
        });
        card.appendChild(delBtn);
        listEl.appendChild(card);
      }
    }

    // Bind del formulario de constelaciones
    (function bindConstellationForm() {
      let _members = [];

      function renderMemberChips() {
        const el = document.getElementById("c-members-chips");
        if (!el) return;
        el.innerHTML = _members.map((m, i) => {
          const pad = String(m).padStart(2, "0");
          const sim = GUIA?.[pad]?.simbolo || "";
          return `<span class="const-chip const-chip--editable" data-i="${i}">${pad} <small>${sim}</small> <button class="const-chip__del" data-i="${i}">✕</button></span>`;
        }).join("") || "<span style='color:var(--color-muted);font-size:.8rem'>Agrega al menos 2 números</span>";
        el.querySelectorAll(".const-chip__del").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.i, 10);
            _members.splice(idx, 1);
            renderMemberChips();
          });
        });
      }

      // Mostrar/ocultar disparador según tipo
      document.querySelectorAll("input[name='c-tipo']").forEach(r => {
        r.addEventListener("change", () => {
          const row = document.getElementById("c-disparador-row");
          if (row) row.style.display = r.value === "disparador_fijo" && r.checked ? "" : "none";
        });
      });

      // Info disparador
      document.getElementById("c-disparador")?.addEventListener("input", (e) => {
        const el = document.getElementById("c-info-disparador");
        if (!el) return;
        const n = parseInt(e.target.value.trim(), 10);
        if (!Number.isFinite(n) || n < 0 || n > 99) { el.textContent = ""; return; }
        const pad = String(n).padStart(2, "0");
        el.textContent = GUIA?.[pad]?.simbolo || pad;
      });

      // Agregar miembro
      function addMember() {
        const raw = (document.getElementById("c-add-num")?.value || "").trim();
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 99) return;
        if (_members.includes(n)) { showToast("Ese número ya está en el grupo.", { variant: "info" }); return; }
        _members.push(n);
        document.getElementById("c-add-num").value = "";
        renderMemberChips();
      }
      document.getElementById("c-add-btn")?.addEventListener("click", addMember);
      document.getElementById("c-add-num")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addMember(); }
      });

      // Guardar
      document.getElementById("c-guardar")?.addEventListener("click", async () => {
        const nombre = (document.getElementById("c-nombre")?.value || "").trim();
        const ventanaDias = parseInt(document.getElementById("c-ventana")?.value, 10) || 10;
        const tipo = document.querySelector("input[name='c-tipo']:checked")?.value || "grupo_libre";
        const disparadorRaw = (document.getElementById("c-disparador")?.value || "").trim();
        const disparador = tipo === "disparador_fijo" ? parseInt(disparadorRaw, 10) : null;
        const nota = (document.getElementById("c-nota")?.value || "").trim();
        const statusEl = document.getElementById("c-status");

        if (!nombre) { if (statusEl) statusEl.textContent = "Escribe un nombre."; return; }
        if (_members.length < 2) { if (statusEl) statusEl.textContent = "Agrega al menos 2 miembros."; return; }
        if (tipo === "disparador_fijo" && !Number.isFinite(disparador)) {
          if (statusEl) statusEl.textContent = "Ingresa el número disparador."; return;
        }

        const constellation = { nombre, tipo, disparador, miembros: [..._members], ventanaDias, nota };
        try {
          await saveConstellationToDb(constellation);
          if (statusEl) statusEl.textContent = `"${nombre}" guardada.`;
          _members = [];
          renderMemberChips();
          document.getElementById("c-nombre").value = "";
          document.getElementById("c-nota").value = "";
          if (document.getElementById("c-disparador")) document.getElementById("c-disparador").value = "";
          invalidatePulso();
          renderConstellationList();
          renderPulso();
        } catch (err) {
          if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        }
      });

      renderMemberChips();
    })();


    function getHypothesisFilterNumero() {
      const raw = (hypoSearchInput?.value || "").trim();
      if (!raw) return "";
      if (!/^\d{1,2}$/.test(raw)) return "";
      return raw.padStart(2, "0");
    }

    const hypothesisWeekdayFormatter = new Intl.DateTimeFormat("es-ES", { weekday: "long" });

    function formatHypothesisDateLabel(value) {
      if (!value) return "(sin fecha)";
      const parsed = parseDrawDate(value);
      if (!parsed) return value;
      const weekdayRaw = hypothesisWeekdayFormatter.format(parsed);
      const weekday = `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}`;
      const isoDate = formatDateISO(parsed);
      return `${weekday} ${isoDate || value}`;
    }

    const uppercaseEmphasisRegex = /([A-ZÁÉÍÓÚÜÑ0-9]{2,})/g;

    function buildHypoNotesLine(line = "") {
      const frag = document.createDocumentFragment();
      if (!line) return frag;
      let lastIndex = 0;
      let match;
      while ((match = uppercaseEmphasisRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(line.slice(lastIndex, match.index)));
        }
        const strongText = match[0];
        const emphasis = document.createElement("span");
        emphasis.className = "hypo-notes-emphasis";
        emphasis.textContent = strongText;
        frag.appendChild(emphasis);
        lastIndex = match.index + strongText.length;
      }
      if (lastIndex < line.length) {
        frag.appendChild(document.createTextNode(line.slice(lastIndex)));
      }
      return frag;
    }

    function createHypoNotesContent(text = "") {
      const fragment = document.createDocumentFragment();
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        fragment.appendChild(buildHypoNotesLine(line));
        if (index < lines.length - 1) {
          fragment.appendChild(document.createElement("br"));
        }
      });
      return fragment;
    }

    async function refreshHypotesis() {
      const cont = document.getElementById("h-list");
      const numeroDisplay = document.getElementById("h-numero-display");
      if (!cont) return;
      cont.classList.add("cards", "hypo-list");

      const filterNumero = getHypothesisFilterNumero();

      if (!filterNumero) {
        if (numeroDisplay) numeroDisplay.innerHTML = "";
        cont.innerHTML = "<p class='hint'>Ingresa un número (00–99) y presiona «Ver hipótesis».</p>";
        return;
      }

      const hyps = await DB._getAll("hypotheses");
      seedHypothesisCache(hyps);
      const filtered = hyps.filter((h) => formatNumber(h.numero) === filterNumero);

      const simbolo = getSymbol(parseInt(filterNumero, 10)) || "";
      if (numeroDisplay) {
        numeroDisplay.innerHTML = `
          <span class="hypo-num-big">${filterNumero}</span>
          ${simbolo ? `<span class="hypo-sym-big">${simbolo}</span>` : ""}
        `;
      }

      if (!filtered.length) {
        cont.innerHTML = `<p class='hint'>Aún no hay hipótesis registradas para el ${filterNumero}.</p>`;
        return;
      }
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      cont.innerHTML = "";
      for (const h of filtered) {
        const card = document.createElement("div");
        card.className = "card hypo-card";

        const simbolo = h.simbolo || getSymbol(h.numero) || "";
        const estado = (h.estado || "pendiente").toLowerCase();
        const fecha = formatHypothesisDateLabel(h.fecha || "");
        const turno = h.turno || "";
        const razonesTexto = (h.razones || []).filter(Boolean).join(" · ") || "Sin notas";

        const nStr = String(h.numero).padStart(2, "0");

        const head = document.createElement("div");
        head.className = "card-head";

        const topWrap = document.createElement("div");
        topWrap.className = "hypo-card-top";

        const img = document.createElement("img");
        img.src = `data/img/${nStr}.png`;
        img.alt = simbolo || nStr;
        img.className = "hypo-card-img";
        img.addEventListener("error", function onErr() {
          img.removeEventListener("error", onErr);
          img.src = `data/img/${nStr}.jpg`;
          img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
        }, { once: true });
        topWrap.appendChild(img);

        const titleWrap = document.createElement("div");
        const title = document.createElement("span");
        title.className = "hypo-title";
        title.textContent = `${formatNumber(h.numero)} ${simbolo}`.trim();
        titleWrap.appendChild(title);
        topWrap.appendChild(titleWrap);

        head.appendChild(topWrap);

        const badge = document.createElement("span");
        badge.className = `badge-state badge-${estado}`;
        badge.textContent = estado;
        head.appendChild(badge);

        card.appendChild(head);

        const body = document.createElement("div");
        body.className = "card-body hypo-body";

        const fechaSpan = document.createElement("span");
        fechaSpan.innerHTML = `<strong>Fecha:</strong> ${fecha}${turno ? ` • ${turno}` : ""}`;
        body.appendChild(fechaSpan);

        const notaSpan = document.createElement("span");
        const notaLabel = document.createElement("strong");
        notaLabel.textContent = "Notas:";
        const notaTexto = document.createElement("span");
        notaTexto.className = "hypo-notes";
        const notasFragment = createHypoNotesContent(razonesTexto);
        notaTexto.appendChild(notasFragment);
        notaSpan.appendChild(notaLabel);
        notaSpan.appendChild(document.createTextNode(" "));
        notaSpan.appendChild(notaTexto);
        body.appendChild(notaSpan);

        card.appendChild(body);

        const actions = document.createElement("div");
        actions.className = "hypo-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn-secondary";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => {
          editingHypothesisId = h.id;
          if (hypoFechaInput) hypoFechaInput.value = h.fecha || "";
          if (hypoTurnoSelect) hypoTurnoSelect.value = h.turno || "";
          if (hypoNumeroInput) hypoNumeroInput.value = String(h.numero).padStart(2, "0");
          if (hypoTextoInput) hypoTextoInput.value = (h.razones && h.razones[0]) || "";
          if (btnHipotesis) btnHipotesis.textContent = "Actualizar hipótesis";
          showToast(`Editando hipótesis ${formatNumber(h.numero)}`, { variant: "info", timeout: 2000 });
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn-danger";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.addEventListener("click", async () => {
          const confirmDelete = await mostrarModal("Eliminar hipótesis", `¿Eliminar la hipótesis ${formatNumber(h.numero)}?`, { okText: "Eliminar", okVariant: "danger" });
          if (!confirmDelete) return;
          try {
            await eliminarHipotesis(h.id);
            invalidateHypothesisCache();
            if (editingHypothesisId === h.id) {
              resetHypothesisForm();
            }
            await refreshHypotesis();
            showToast("Hipótesis eliminada.", { variant: "success", timeout: 2000 });
          } catch (err) {
            console.error("eliminar hipotesis error", err);
            showToast(`No se pudo eliminar la hipótesis: ${err.message}`, { variant: "danger" });
          }
        });
        actions.appendChild(deleteBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn-ghost";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", () => {
          resetHypothesisForm();
          showToast("Edición cancelada.", { variant: "warning", timeout: 1800 });
        });
        actions.appendChild(cancelBtn);

        card.appendChild(actions);

        cont.appendChild(card);
      }
    }

    btnHipotesis?.addEventListener("click", async () => {
      const fecha = hypoFechaInput?.value;
      const turno = hypoTurnoSelect?.value;
      const numeroRaw = hypoNumeroInput?.value.trim() ?? "";
      const texto = hypoTextoInput?.value.trim() ?? "";
      if (!/^\d{1,2}$/.test(numeroRaw)) {
        showToast("Ingresa un número válido (00-99) para la hipótesis.", { variant: "warning" });
        return;
      }
      const numero = parseInt(numeroRaw, 10);
      try {
        if (editingHypothesisId) {
          await actualizarHipotesis(
            editingHypothesisId,
            numero,
            getSymbol(numero),
            texto,
            { fecha, turno }
          );
          resetHypothesisForm();
          showToast("Hipótesis actualizada.", { variant: "success" });
        } else {
          await crearHipotesis(numero, getSymbol(numero), texto, { fecha, turno });
          resetHypothesisForm();
          showToast("Hipótesis guardada.", { variant: "success" });
        }
        await refreshHypotesis();
      } catch (err) {
        console.error("hipotesis error", err);
        showToast(`No se pudo guardar la hipótesis: ${err.message}`, { variant: "danger" });
      }
    });

    const resultPulso = document.getElementById("result-pulso");

    // ── PULSO: análisis de candidatos por conversión/equivalencia ──────────────

    // ── Caché de Pulso ────────────────────────────────────────────────────────
    // El panel solo se recalcula cuando hay nuevos datos, no al navegar.
    let _pulsoStale = true;
    function invalidatePulso() { _pulsoStale = true; }

    // ── Helpers de UI para el motor de señales ────────────────────────────────

    /** Crea un <img> del número con fallback silencioso */
    function numImg(pad, alt = "") {
      const img = document.createElement("img");
      img.src = `data/img/${pad}.png`;
      img.alt = alt;
      img.className = "scenario-number__img";
      img.addEventListener("error", function onErr() {
        img.removeEventListener("error", onErr);
        img.src = `data/img/${pad}.jpg`;
        img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
      }, { once: true });
      return img;
    }

    /**
     * Panel colapsable "Ver todos los caídos" — agrupa draws por día.
     * Tabs: Hoy | Semana | Mes
     * @param {Array}  sortedDraws — sorteos ordenados asc (el array `sorted` de renderPulso)
     * @param {object} guia        — GUIA (para símbolo)
     */
    function buildVerCaidosPanel(sortedDraws, guia) {
      const today = new Date().toISOString().slice(0, 10);
      const msDay = 86400000;
      const startOfWeek = new Date(Date.now() - 6 * msDay).toISOString().slice(0, 10);
      const startOfMonth = today.slice(0, 7); // "YYYY-MM"

      const HORARIO_ORD = { "11AM": 0, "3PM": 1, "9PM": 2 };
      const DOW_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const MES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

      function fmtFecha(f) {
        const d = new Date(`${f}T12:00:00`);
        return `${DOW_ES[d.getDay()]} ${d.getDate()}-${MES_ES[d.getMonth()]}`;
      }

      function filterDraws(mode) {
        return [...sortedDraws]
          .filter(d => {
            if (!d.fecha || !d.numero) return false;
            if (mode === "hoy")   return d.fecha === today;
            if (mode === "semana") return d.fecha >= startOfWeek;
            if (mode === "mes")   return d.fecha.startsWith(startOfMonth);
            return true; // "todos"
          })
          .sort((a, b) => {
            const dd = b.fecha.localeCompare(a.fecha);
            if (dd !== 0) return dd;
            return (HORARIO_ORD[b.horario] ?? 9) - (HORARIO_ORD[a.horario] ?? 9);
          });
      }

      function buildDrawCard(d) {
        const pad = String(parseInt(d.numero, 10)).padStart(2, "0");
        const sym = guia?.[pad]?.simbolo || "";
        const card = document.createElement("div");
        card.className = "scenario-number";
        const img = numImg(pad, sym);
        img.className = "vc-card__img";
        card.appendChild(img);
        const num = document.createElement("span");
        num.className = "vc-card__num";
        num.textContent = pad;
        card.appendChild(num);
        if (sym) {
          const s = document.createElement("span");
          s.className = "vc-card__sym";
          s.textContent = sym;
          card.appendChild(s);
        }
        const h = document.createElement("span");
        h.className = "vc-card__hora";
        h.textContent = d.horario || "";
        card.appendChild(h);
        return card;
      }

      // Calcula la semana del mes (1-based) para una fecha "YYYY-MM-DD"
      function weekOfMonth(fecha) {
        const d = new Date(`${fecha}T12:00:00`);
        return Math.ceil(d.getDate() / 7);
      }

      function buildContent(mode) {
        const draws = filterDraws(mode);
        const content = document.createElement("div");
        content.className = "vc-content";

        if (!draws.length) {
          content.innerHTML = `<p class="hint small" style="padding:10px 0">Sin sorteos en este período.</p>`;
          return content;
        }

        if (mode === "mes") {
          // Agrupar por semana del mes
          const byWeek = new Map();
          draws.forEach(d => {
            const wk = weekOfMonth(d.fecha);
            const list = byWeek.get(wk) || [];
            list.push(d);
            byWeek.set(wk, list);
          });

          // Ordenar semanas desc
          const weeks = [...byWeek.keys()].sort((a, b) => b - a);
          weeks.forEach(wk => {
            const weekDraws = byWeek.get(wk);
            // Rango de días de esa semana
            const days = [...new Set(weekDraws.map(d => d.fecha))].sort();
            const first = fmtFecha(days[0]);
            const last  = days.length > 1 ? fmtFecha(days[days.length - 1]) : null;
            const rangeLabel = last ? `Semana ${wk} · ${first} – ${last}` : `Semana ${wk} · ${first}`;

            const group = document.createElement("div");
            group.className = "vc-group";

            const label = document.createElement("div");
            label.className = "vc-group__label";
            label.textContent = rangeLabel;
            group.appendChild(label);

            // Dentro de cada semana, agrupar por día
            const byDate = new Map();
            weekDraws.forEach(d => {
              const list = byDate.get(d.fecha) || [];
              list.push(d);
              byDate.set(d.fecha, list);
            });

            const inner = document.createElement("div");
            inner.className = "vc-week-inner";
            byDate.forEach((dayDraws, fecha) => {
              const dayWrap = document.createElement("div");
              dayWrap.className = "vc-week-day";
              const dayLabel = document.createElement("span");
              dayLabel.className = "vc-week-day__label";
              dayLabel.textContent = fmtFecha(fecha);
              dayWrap.appendChild(dayLabel);
              const row = document.createElement("div");
              row.className = "vc-group__row";
              dayDraws.forEach(d => row.appendChild(buildDrawCard(d)));
              dayWrap.appendChild(row);
              inner.appendChild(dayWrap);
            });
            group.appendChild(inner);
            content.appendChild(group);
          });
        } else {
          // Hoy / Semana — agrupar por fecha
          const byDate = new Map();
          draws.forEach(d => {
            const list = byDate.get(d.fecha) || [];
            list.push(d);
            byDate.set(d.fecha, list);
          });

          byDate.forEach((dayDraws, fecha) => {
            const group = document.createElement("div");
            group.className = "vc-group";

            const label = document.createElement("div");
            label.className = "vc-group__label";
            label.textContent = fmtFecha(fecha);
            group.appendChild(label);

            const row = document.createElement("div");
            row.className = "vc-group__row";
            dayDraws.forEach(d => row.appendChild(buildDrawCard(d)));
            group.appendChild(row);

            content.appendChild(group);
          });
        }

        return content;
      }

      // ── Estructura principal ──
      const wrap = document.createElement("div");
      wrap.className = "vc-wrap";

      const toggle = document.createElement("button");
      toggle.className = "vc-toggle";
      toggle.innerHTML = `<span class="vc-toggle__icon">▸</span> Ver todos los caídos`;
      wrap.appendChild(toggle);

      const panel = document.createElement("div");
      panel.className = "vc-panel hidden";
      wrap.appendChild(panel);

      // Tabs
      const tabs = document.createElement("div");
      tabs.className = "vc-tabs";
      const TABS = [
        { id: "hoy",    label: "Hoy" },
        { id: "semana", label: "Semana" },
        { id: "mes",    label: "Mes" },
      ];
      let activeMode = "hoy";
      let activeContent = null;

      function switchTab(mode) {
        activeMode = mode;
        tabs.querySelectorAll(".vc-tab").forEach(b =>
          b.classList.toggle("vc-tab--active", b.dataset.mode === mode));
        if (activeContent) activeContent.remove();
        activeContent = buildContent(mode);
        panel.appendChild(activeContent);
      }

      TABS.forEach(({ id, label }) => {
        const btn = document.createElement("button");
        btn.className = "vc-tab";
        btn.dataset.mode = id;
        btn.textContent = label;
        btn.addEventListener("click", () => switchTab(id));
        tabs.appendChild(btn);
      });

      panel.appendChild(tabs);

      // Toggle open/close
      let open = false;
      toggle.addEventListener("click", () => {
        open = !open;
        panel.classList.toggle("hidden", !open);
        toggle.querySelector(".vc-toggle__icon").textContent = open ? "▾" : "▸";
        if (open && !activeContent) switchTab(activeMode);
      });

      return wrap;
    }

    /**
     * Construye una sección de cards para vencidos / en ventana / eliminados.
     * @param {Array}  items   — array de {pad, simbolo, diasDesdeUltima, cicloPromedio, zScore, razon}
     * @param {string} variant — "warn" | "ok" | "elim"
     * @param {string} titulo
     */
    function buildRezagoSection(items, variant, titulo) {
      const wrap = document.createElement("div");
      wrap.className = "scenario-group";

      const head = document.createElement("div");
      head.className = "scenario-group__heading";
      head.textContent = titulo;
      wrap.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "scenario-grid";

      items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "scenario-number";
        card.dataset.variant = variant;

        card.appendChild(numImg(item.pad, item.simbolo));

        const num = document.createElement("span");
        num.className = "scenario-number__num";
        num.textContent = item.pad;
        card.appendChild(num);

        const sim = document.createElement("span");
        sim.className = "scenario-number__sim";
        sim.textContent = item.simbolo || item.pad;
        card.appendChild(sim);

        if (item.badge) {
          const badge = document.createElement("span");
          badge.className = "scenario-number__badge";
          badge.textContent = item.badge;
          card.appendChild(badge);
        }

        if (item.diasDesdeUltima != null) {
          const dias = document.createElement("span");
          dias.className = "scenario-number__dias";
          dias.textContent = item.diasDesdeUltima === 0 ? "hoy mismo" : `${item.diasDesdeUltima}d sin caer`;
          card.appendChild(dias);
        } else if (item.razon) {
          const razon = document.createElement("span");
          razon.className = "scenario-number__dias";
          razon.textContent = item.razon;
          card.appendChild(razon);
        }

        if (item.cicloPromedio) {
          const ciclo = document.createElement("span");
          ciclo.className = "scenario-number__ciclo";
          ciclo.textContent = `ciclo: ${item.cicloPromedio}d`;
          card.appendChild(ciclo);
        } else if (item.subtext) {
          const sub = document.createElement("span");
          sub.className = "scenario-number__ciclo";
          sub.textContent = item.subtext;
          card.appendChild(sub);
        }

        if (item.tooltip) card.title = item.tooltip;
        else if (item.razon) card.title = item.razon;
        grid.appendChild(card);
      });

      wrap.appendChild(grid);
      return wrap;
    }

    async function renderPulso() {
      if (!resultPulso) return;
      if (!_pulsoStale) return; // sin cambios en los datos, no recalcular
      const pais = dayPais?.value; // país seleccionado en la vista Día (null si no hay); los motores lo filtran solo si viene
      resultPulso.innerHTML = `
        <div class="diaria-loader diaria-loader--simple" role="status" aria-label="Cargando historial">
          <span class="processing-spinner"></span>
          <div class="diaria-loader__sub">Cargando historial…</div>
        </div>
      `;
      try {
        const draws = await DB.listDraws({ excludeTest: true });
        if (!draws.length) {
          resultPulso.innerHTML = "<p class='pulso-empty'>Aún no hay sorteos registrados.</p>";
          return;
        }

        // Ordenar para obtener el último sorteo
        const sorted = [...draws].sort((a, b) => {
          const d = (a.fecha || "").localeCompare(b.fecha || "");
          if (d !== 0) return d;
          const ord = ["11AM", "3PM", "9PM"];
          return ord.indexOf(a.horario) - ord.indexOf(b.horario);
        });
        const last = sorted[sorted.length - 1];
        const lastNum = parseInt(last.numero, 10);
        const lastPad = String(lastNum).padStart(2, "0");
        const lastInfo = GUIA?.[lastPad] || {};

        // Turno siguiente estimado
        const TURNOS = ["11AM", "3PM", "9PM"];
        const nextHorarioIdx = (TURNOS.indexOf(last.horario) + 1) % 3;
        const nextHorario = TURNOS[nextHorarioIdx];

        // Estadísticas de relaciones
        const stats = buildRelationStats(draws);
        const groups = getCandidates(lastNum, stats, { horario: nextHorario });
        const signal = getContextSignal(stats, { horario: nextHorario });

        // ── render ────────────────────────────────────────────────────────────
        const frag = document.createDocumentFragment();

        // Fila 1: último sorteo
        const topRow = document.createElement("div");
        topRow.className = "pulso-top-row";
        frag.appendChild(topRow);

        // Fila 2: modo recuperación a todo ancho (se rellena si está activo)
        const recRow = document.createElement("div");
        recRow.className = "pulso-rec-row";
        frag.appendChild(recRow);

        // Fila 3: panel de Líneas — placeholder, se rellena más abajo cuando pais está disponible
        const linRow = document.createElement("div");
        frag.appendChild(linRow);

        // Tarjeta del último sorteo
        const lastCard = document.createElement("div");
        lastCard.className = "pulso-last";
        const dow = new Date(`${last.fecha}T12:00:00`).getDay();
        const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        lastCard.innerHTML = `
          <div class="pulso-last__num">${lastPad}</div>
          <div class="pulso-last__meta">
            <span class="pulso-last__simbolo">${lastInfo.simbolo || "—"}${lastInfo.familia ? ` · ${lastInfo.familia}` : ""}</span>
            <span class="pulso-last__sub">${last.horario} · ${DOW[dow]} ${last.fecha || ""} · ${(last.pais || "").toUpperCase()}</span>
            <span class="pulso-last__sub" style="opacity:0.6">Siguiente estimado: turno ${nextHorario}</span>
          </div>
        `;
        lastCard.appendChild(numImg(lastPad, lastInfo.simbolo || lastPad));
        topRow.appendChild(lastCard);

        // ── Relativos: alerta de disparadores recientes + backtest ──────────────
        try {
          const allDraws = await DB.listDraws();
          const [alertas, backtest] = await Promise.all([
            getRelativosEnAlerta(allDraws, { lookbackDays: 3, pais: pais || null }),
            backtestRelativos(allDraws, { maxWindow: 3 }),
          ]);
          const relAlertaWrap = document.createElement("div");
          relAlertaWrap.innerHTML = renderRelativosAlertaHTML(alertas, backtest, GUIA);
          if (relAlertaWrap.firstElementChild) frag.appendChild(relAlertaWrap.firstElementChild);
        } catch (err) {
          console.warn("relativos-alerta falló:", err?.message || err);
        }

        // ── Convergencia: números apuntados por múltiples caídas del mismo día ──
        try {
          const allDraws = await DB.listDraws();
          const [btConv, nodosActivos] = await Promise.all([
            backtestConvergencia(allDraws, { maxWindow: 5 }),
            getConvergenciaActiva(allDraws, { lookbackDays: 5, pais: pais || null }),
          ]);
          const convWrap = document.createElement("div");
          convWrap.innerHTML = renderConvergenciaHTML(btConv, nodosActivos, GUIA);
          if (convWrap.firstElementChild) frag.appendChild(convWrap.firstElementChild);
        } catch (err) {
          console.warn("convergencia falló:", err?.message || err);
        }

        // ── Régimen actual (etiquetado de contexto) ──────────────────────────────
        try {
          const allDraws = await DB.listDraws();
          const contextos = detectarContexto(allDraws, { pais: pais || null });
          const ctxHtml = renderContextoHTML(contextos);
          if (ctxHtml) {
            const ctxWrap = document.createElement("div");
            ctxWrap.innerHTML = ctxHtml;
            if (ctxWrap.firstElementChild) frag.appendChild(ctxWrap.firstElementChild);
          }
        } catch (err) {
          console.warn("contexto falló:", err?.message || err);
        }

        // ── Post-Repetición: candidatos estratégicos tras un repetido ────────────
        try {
          const allDraws = await DB.listDraws();
          const prResult = analizarPostRepeticion(allDraws, { pais: pais || null });
          const prHtml   = renderPostRepeticionHTML(prResult, GUIA);
          if (prHtml) {
            const prWrap = document.createElement("div");
            prWrap.innerHTML = prHtml;
            if (prWrap.firstElementChild) frag.appendChild(prWrap.firstElementChild);
          }
        } catch (err) {
          console.warn("post-repeticion falló:", err?.message || err);
        }

        // ── Déjà Vu: secuencias similares en el historial ──────────────────────
        try {
          const allDraws = await DB.listDraws();
          const dvResult = analizarDejaVu(allDraws, GUIA, { pais: pais || null });
          const dvHtml   = renderDejaVuHTML(dvResult, GUIA);
          if (dvHtml) {
            const dvWrap = document.createElement("div");
            dvWrap.innerHTML = dvHtml;
            if (dvWrap.firstElementChild) frag.appendChild(dvWrap.firstElementChild);
          }
        } catch (err) {
          console.warn("dejavu falló:", err?.message || err);
        }

        // ── Ausencias y doble aparición (DAPA) ──────────────────────────────────
        try {
          const allDraws = await DB.listDraws();
          const ausResult = analizarAusencias(allDraws, GUIA, { pais: pais || null });
          const ausHtml   = renderAusenciasHTML(ausResult, GUIA);
          if (ausHtml) {
            const ausWrap = document.createElement("div");
            ausWrap.innerHTML = ausHtml;
            if (ausWrap.firstElementChild) frag.appendChild(ausWrap.firstElementChild);
          }
        } catch (err) {
          console.warn("ausencias falló:", err?.message || err);
        }

        // ── Vuelta del día: mismo número con dígitos invertidos en turno posterior ──
        try {
          const allDraws  = await DB.listDraws({ excludeTest: true });
          const vltSpFech = await listSpFromDb().catch(() => []);
          const vltResult = analizarVuelta(allDraws, { pais: pais || null, spFechas: vltSpFech });
          const vltHtml   = renderVueltaHTML(vltResult, GUIA);
          if (vltHtml) {
            const vltWrap = document.createElement("div");
            vltWrap.innerHTML = vltHtml;
            if (vltWrap.firstElementChild) frag.appendChild(vltWrap.firstElementChild);
          }
        } catch (err) {
          console.warn("vuelta-engine falló:", err?.message || err);
        }

        // ── Relativos vencidos: pares (A→B) donde B está tardando más de lo normal ──
        try {
          const allDraws = await DB.listDraws();
          const vencidos = await getVencidos(allDraws, {
            maxDays: 45,
            recentDays: 60,
            minHits: 2,
            threshold: 0.5,
            pais: pais || null,
          });
          const relWrap = document.createElement("div");
          relWrap.innerHTML = renderRelativosHTML(vencidos, GUIA, 10);
          if (relWrap.firstElementChild) frag.appendChild(relWrap.firstElementChild);
        } catch (err) {
          console.warn("relativos-engine falló:", err?.message || err);
        }

        // Recovery mode banner
        const spFechas = await listSpFromDb().catch(() => []);
        const recoveryMode = detectarModoRecuperacion(spFechas);
        if (recoveryMode.activo) {
          const recBanner = document.createElement("div");
          recBanner.className = "pulso-recovery-banner";
          recBanner.innerHTML = `<span>🔴 Modo recuperación activo</span><span>Último super premio: ${recoveryMode.ultimoEvento} · ${recoveryMode.diasTranscurridos} días · ${recoveryMode.diasRestantes}d restantes · Motor ajustado para favorecer números pre-evento</span>`;
          frag.appendChild(recBanner);
        }

        // Grupos de candidatos
        if (groups.length) {
          const groupsWrap = document.createElement("div");
          groupsWrap.className = "pulso-groups";

          for (const group of groups) {
            const groupEl = document.createElement("div");
            groupEl.className = "pulso-group";

            const freqClass = group.pct >= 20 ? "" : "pulso-group__freq--low";
            groupEl.innerHTML = `
              <div class="pulso-group__head">
                <span class="pulso-group__label">${group.label}</span>
                <span class="pulso-group__freq ${freqClass}">${group.pct}% histórico</span>
              </div>
            `;

            const chips = document.createElement("div");
            chips.className = "pulso-chips";
            for (const item of group.items) {
              const chip = document.createElement("div");
              chip.className = "scenario-number";
              const numPad = String(item.numero).padStart(2, "0");
              chip.appendChild(numImg(numPad, numPad));
              const numEl = document.createElement("span");
              numEl.className = "pulso-chip__num";
              numEl.textContent = numPad;
              chip.appendChild(numEl);
              if (item.simbolo) {
                const symEl = document.createElement("span");
                symEl.className = "pulso-chip__sym";
                symEl.textContent = item.simbolo;
                chip.appendChild(symEl);
              }
              if (item.apariciones) {
                const cntEl = document.createElement("span");
                cntEl.className = "pulso-chip__count";
                cntEl.textContent = `${item.apariciones}×`;
                chip.appendChild(cntEl);
              }
              chips.appendChild(chip);
            }
            groupEl.appendChild(chips);
            groupsWrap.appendChild(groupEl);
          }
          frag.appendChild(groupsWrap);
        }

        // Señal contextual
        if (signal) {
          const sigEl = document.createElement("div");
          sigEl.className = "pulso-signal";
          sigEl.textContent = signal;
          frag.appendChild(sigEl);
        }

        // ── Motor de señales unificado ───────────────────────────────────────
        try {
          const pais = last.pais || "";

          // ── Líneas: rellenar el placeholder creado al inicio del frag ──────
          try {
            const allDraws = await DB.listDraws();
            const linResult = analizarLineas(allDraws, GUIA, { pais: pais || null });
            const linHtml   = renderLineasHTML(linResult, GUIA);
            if (linHtml) {
              const linWrap = document.createElement("div");
              linWrap.innerHTML = linHtml;
              if (linWrap.firstElementChild) linRow.appendChild(linWrap.firstElementChild);
            }
          } catch (err) { console.warn("lineas falló:", err?.message || err); }

          // Feedback adaptativo: ajusta topN según rendimiento reciente
          const feedback = await computeFeedback().catch(() => null);
          const adaptiveTopN = feedback?.adaptiveTopN ?? 10;
          const fbHtml = feedback ? renderFeedbackHTML(feedback) : "";
          if (fbHtml) {
            const fbWrap = document.createElement("div");
            fbWrap.innerHTML = fbHtml;
            if (fbWrap.firstElementChild) frag.appendChild(fbWrap.firstElementChild);
          }

          const repetidosPostEvento = recoveryMode.activo && recoveryMode.ultimoEvento
            ? detectarNumerosRepetidosPostEvento(recoveryMode.ultimoEvento, sorted.filter(d => !d.isTest))
            : [];
          const preEvento = recoveryMode.activo && recoveryMode.ultimoEvento
            ? detectarNumerosPreEvento(recoveryMode.ultimoEvento, sorted.filter(d => !d.isTest))
            : [];
          const [motorResult, rezagoResult] = await Promise.allSettled([
            loadSignalEngine().then(m => m.ejecutarMotorSeñales({
              pais,
              turno: nextHorario,
              topN: adaptiveTopN,
              recuperacion: recoveryMode.activo ? {
                activo: true,
                repetidosPostEvento,
                preEvento,
                diasTranscurridos: recoveryMode.diasTranscurridos,
                ultimoEvento: recoveryMode.ultimoEvento,
              } : null,
            })),
            loadSignalEngine().then(m => m.estadoRezago(pais)),
          ]);

          // Markov raw removido — ya está integrado en el motor unificado (evita duplicado con Mesa de Análisis)

          // ── Candidatos del motor unificado ──
          const motor = motorResult.status === "fulfilled" ? motorResult.value : null;
          if (motor?.candidatos?.length) {
            const motorSec = document.createElement("div");
            motorSec.className = "pulso-group";
            motorSec.innerHTML = `
              <div class="pulso-group__head">
                <span class="pulso-group__label">Motor unificado — candidatos para ${nextHorario}</span>
                <span class="pulso-group__freq">${motor.universo} números tras filtros · ${motor.contexto.dataQuality === "alto" ? "historial amplio" : motor.contexto.dataQuality === "medio" ? "historial moderado" : "historial limitado"}</span>
              </div>`;
            const motorChips = document.createElement("div");
            motorChips.className = "pulso-chips";
            // Normalizar barras relativas al líder del grupo
            const _scores = motor.candidatos.map(cc => cc.score);
            const _maxS = _scores[0] || 1;
            const _minS = _scores[_scores.length - 1] || 0;
            const _rng  = _maxS - _minS || _maxS;
            motor.candidatos.forEach((c, ci) => {
              const chip = document.createElement("div");
              chip.className = "scenario-number";
              chip.dataset.variant = c.penalizado ? "penalized" : "motor";
              chip.appendChild(numImg(c.pad, c.simbolo));
              const topSignal = c.signals[0];
              const absScore  = Math.round(c.score * 100);
              const relPct    = ci === 0 ? 100 : Math.round(30 + ((_scores[ci] - _minS) / _rng) * 70);
              chip.insertAdjacentHTML("beforeend", `
                <span class="pulso-chip__num">${c.pad}</span>
                <span class="pulso-chip__sym">${c.simbolo}</span>
                <div class="pulso-chip__bar" style="--pct:${relPct}%"></div>
                <span class="pulso-chip__count" title="Score: ${absScore}/100">${absScore}</span>
                ${topSignal ? `<span class="pulso-chip__hint" title="${topSignal.label}">${topSignal.source}</span>` : ""}`);
              chip.title = c.signals.map((s) => s.label).join("\n");
              motorChips.appendChild(chip);
            });
            motorSec.appendChild(motorChips);
            frag.appendChild(motorSec);

            // ── Hit-tracker: registrar la predicción para validar contra el sorteo real ──
            try {
              // Calcular fecha del próximo sorteo
              // Si el último fue 9PM (idx 2), el próximo 11AM es de mañana; si no, mismo día.
              let targetFecha = last.fecha;
              if (nextHorarioIdx === 0 && last.fecha) {
                const d = new Date(last.fecha + "T00:00:00");
                d.setDate(d.getDate() + 1);
                targetFecha = d.toISOString().slice(0, 10);
              }
              const targetPais = last.pais || pais || null;
              const predictions = motor.candidatos.map((c) => ({
                numero: c.numero,
                score: Math.round(c.score * 1000) / 1000,
                turno: nextHorario,
              }));
              // Fire-and-forget: no bloqueamos la UI si Supabase tarda o falla
              DB.logPredictions(predictions, {
                fecha: targetFecha,
                pais: targetPais,
                turno: nextHorario,
              }).catch((err) => console.warn("logPredictions falló:", err?.message || err));
            } catch (err) {
              console.warn("logPredictions wrapper falló:", err?.message || err);
            }

            // ── Números eliminados (resumen) ──
            if (motor.eliminados?.length) {
              const recElim = motor.eliminados.filter((e) => e.regla === "reciente").slice(0, 6);
              const sobElim = motor.eliminados.filter((e) => e.regla === "sobrecalentado").slice(0, 4);
              if (recElim.length) {
                frag.appendChild(buildRezagoSection(recElim, "elim", "✕ Excluidos — cayeron hace poco (baja probabilidad de repetición inmediata)"));
                // ── Ver todos los caídos (colapsable) — justo bajo los Excluidos ──
                frag.appendChild(buildVerCaidosPanel(sorted, GUIA));
              }
              if (sobElim.length) frag.appendChild(buildRezagoSection(sobElim, "warn", "⚠ Gap inusual — sin caer mucho más de lo habitual en ellos mismos (no hay evidencia de que la casa los evite a propósito)"));
            }
          }

          // ── Calendario adversarial: bloqueos y boosts activos hoy (independiente de candidatos) ──
          let calData = motor?.calendario;
          if (!calData) {
            try {
              const calMod = await import("./popularity-calendar.js");
              const fechaCal = (sorted[sorted.length - 1]?.fecha) || new Date().toISOString().slice(0, 10);
              const efectos = calMod.getEfectosCalendarioPorNumero(fechaCal);
              const proximos = calMod.getEventosProximos(fechaCal, 120);
              const bloqueados = [], boosteados = [];
              efectos.forEach(({ factor, motivos }, numero) => {
                const item = { numero, pad: String(numero).padStart(2, "0"), factor: Math.round(factor * 100) / 100, motivo: motivos[0] };
                if (factor < 1) bloqueados.push(item); else if (factor > 1) boosteados.push(item);
              });
              bloqueados.sort((a, b) => a.factor - b.factor);
              boosteados.sort((a, b) => b.factor - a.factor);
              calData = { bloqueados, boosteados, proximos };
            } catch (e) { /* opcional */ }
          }
          if (calData && (calData.bloqueados?.length || calData.boosteados?.length || calData.proximos?.length)) {
            if (calData.bloqueados?.length) {
              const items = calData.bloqueados.map(b => ({
                pad: b.pad,
                simbolo: GUIA?.[b.pad]?.simbolo || "",
                badge: `−${Math.round((1 - b.factor) * 100)}%`,
                razon: b.motivo,
              }));
              frag.appendChild(buildRezagoSection(items, "cal-block", "📆 Calendario — números bloqueados por contexto (fechas patrias)"));
            }
            if (calData.boosteados?.length) {
              const items = calData.boosteados.map(b => ({
                pad: b.pad,
                simbolo: GUIA?.[b.pad]?.simbolo || "",
                badge: `+${Math.round((b.factor - 1) * 100)}%`,
                razon: b.motivo,
              }));
              frag.appendChild(buildRezagoSection(items, "cal-boost", "📆 Calendario — boost por adyacencia de día del mes"));
            }
            const prox = calData.proximos?.slice(0, 4) || [];
            if (prox.length) {
              const items = [];
              prox.forEach(p => {
                p.numeros.slice(0, 6).forEach(n => {
                  const pad = String(n).padStart(2, "0");
                  items.push({
                    pad,
                    simbolo: GUIA?.[pad]?.simbolo || "",
                    razon: p.label,
                    subtext: `en ${p.diasFaltan}d`,
                  });
                });
              });
              frag.appendChild(buildRezagoSection(items, "cal-prox", "📅 Próximos eventos hondureños"));
            }
          }

          // ── Modelo de popularidad: mercado caliente/frío + cadenas activas ──
          let popData = motor?.popularidad;
          if (!popData) {
            try {
              const popMod = await import("./popularity-model.js");
              const popMap = popMod.calcularPopularidad(sorted, { lookback: 20 });
              const mercado = popMod.getMercado(popMap, { topN: 8 });
              const cadenas = popMod.getCadenasActivas(sorted, { lookback: 15 });
              popData = {
                calientes: mercado.calientes.map(e => ({ numero: e.numero, pad: String(e.numero).padStart(2,"0"), score: e.score, motivo: e.motivos[0] || "Popular" })),
                frios:     mercado.frios.map(e => ({ numero: e.numero, pad: String(e.numero).padStart(2,"0"), score: e.score, dias: e.diasDesdeUltima })),
                reprimidos: mercado.reprimidos.map(e => ({ numero: e.numero, pad: String(e.numero).padStart(2,"0"), score: e.score, dias: e.diasDesdeUltima, zScore: e.zScore, motivo: e.motivos[0] || "Popular reprimido" })),
                libres:    mercado.frios.map(e => ({ numero: e.numero, pad: String(e.numero).padStart(2,"0"), score: e.score })),
                mapaScores: Object.fromEntries([...popMap.entries()].map(([n, v]) => [n, v.score])),
                mapaMotivos: Object.fromEntries([...popMap.entries()].map(([n, v]) => [n, (v.motivos||[]).slice(0,3).join(" · ")])),
                reprimidosSet: new Set(mercado.reprimidos.map(e => e.numero)),
                cadenasActivas: cadenas.slice(0, 6).map(c => ({
                  cadena: c.cadena,
                  triggers: c.triggers.map(n => ({ numero: n, pad: String(n).padStart(2,"0") })),
                  targets:  c.targets.map(n => ({ numero: n, pad: String(n).padStart(2,"0") })),
                  intensidad: Math.round(c.intensidad * 100),
                })),
              };
            } catch (e) { /* opcional */ }
          }
          // ── Mapa de calor de mercado ─────────────────────────────────────
          if (popData?.mapaScores) {
            const scores  = popData.mapaScores;
            const motivos = popData.mapaMotivos || {};
            const repSet  = popData.reprimidosSet || new Set();
            const allScores = Object.values(scores);
            const maxScore  = Math.max(...allScores, 1);

            // Interpola color: verde (libre) → amarillo → rojo (popular/peligroso)
            function scoreColor(s, alpha = 1) {
              const t = Math.min(s / maxScore, 1);
              if (t < 0.5) {
                // verde → amarillo
                const r = Math.round(48  + (255 - 48)  * (t * 2));
                const g = Math.round(209 + (213 - 209) * (t * 2));
                const b = Math.round(88  + (10  - 88)  * (t * 2));
                return `rgba(${r},${g},${b},${alpha})`;
              } else {
                // amarillo → rojo
                const u = (t - 0.5) * 2;
                const r = 255;
                const g = Math.round(213 - 213 * u);
                const b = 10;
                return `rgba(${r},${g},${b},${alpha})`;
              }
            }

            const cells = Array.from({length: 100}, (_, i) => {
              const pd  = String(i).padStart(2, "0");
              const sc  = scores[i] ?? 0;
              const mot = motivos[i] || "Sin señal cultural";
              const isRep = repSet.has(i);
              const sym = GUIA?.[pd]?.simbolo || "";
              const t   = Math.min(sc / maxScore, 1);
              const textDark = t < 0.55;
              return `<div class="mkt-cell${isRep ? " mkt-cell--rep" : ""}"
                style="background:${scoreColor(sc, 0.85)};color:${textDark?"#1a1a1a":"#fff"}"
                title="${pd}${sym?" · "+sym:""}\nScore: ${sc}\n${mot}${isRep?" · 🛑 REPRIMIDO":""}">
                <span class="mkt-cell__num">${pd}</span>
                ${sym ? `<span class="mkt-cell__sym">${sym}</span>` : ""}
                ${isRep ? `<span class="mkt-cell__rep">🛑</span>` : ""}
              </div>`;
            }).join("");

            const mapaEl = document.createElement("div");
            mapaEl.className = "mkt-wrap";
            mapaEl.innerHTML = `
              <div class="mkt-header">
                <span class="mkt-title">🗺 Mapa de mercado — popularidad estimada del público</span>
                <span class="mkt-hint">Toca un número para ver por qué es popular o libre</span>
              </div>
              <div class="mkt-legend">
                <span class="mkt-leg mkt-leg--free">■ Libre (poco comprado)</span>
                <span class="mkt-leg mkt-leg--hot">■ Popular (la casa lo evita)</span>
                <span class="mkt-leg mkt-leg--rep">🛑 Reprimido (popular + sin caer)</span>
              </div>
              <div class="mkt-grid">${cells}</div>
              <div class="mkt-tooltip hidden" id="mkt-tt"></div>
            `;
            frag.insertBefore(mapaEl, frag.firstChild);

            // Tooltip al hacer click en una celda
            mapaEl.querySelectorAll(".mkt-cell").forEach((cell, i) => {
              cell.onclick = () => {
                const pd  = String(i).padStart(2, "0");
                const sc  = scores[i] ?? 0;
                const mot = motivos[i] || "Sin señal cultural";
                const isRep = repSet.has(i);
                const sym = GUIA?.[pd]?.simbolo || "";
                const tt = mapaEl.querySelector("#mkt-tt");
                const pct = Math.round((sc / maxScore) * 100);
                const zona = pct >= 65 ? (isRep ? "🛑 Reprimido" : "🔥 Muy popular") : pct >= 35 ? "🟡 Popularidad media" : "✅ Libre — bajo interés";
                tt.innerHTML = `
                  <strong>${pd}${sym ? " · " + sym : ""}</strong>
                  <span class="mkt-tt__zona">${zona}</span>
                  <span class="mkt-tt__score">Score: ${sc} (${pct}% del máximo)</span>
                  <span class="mkt-tt__mot">${mot}</span>
                  ${isRep ? `<span class="mkt-tt__rep">El público lo compra masivamente pero lleva ${popData.reprimidos?.find(r=>r.numero===i)?.dias ?? "?"} días sin caer. La casa lo retiene.</span>` : ""}
                `;
                tt.classList.remove("hidden");
                // posición relativa al grid
                const cr = cell.getBoundingClientRect();
                const wr = mapaEl.getBoundingClientRect();
                tt.style.top  = (cr.bottom - wr.top + 6) + "px";
                tt.style.left = Math.min(cr.left - wr.left, wr.width - 220) + "px";
              };
            });
            // Cerrar tooltip al clickear fuera
            document.addEventListener("click", e => {
              if (!e.target.closest(".mkt-cell") && !e.target.closest("#mkt-tt")) {
                mapaEl.querySelector("#mkt-tt")?.classList.add("hidden");
              }
            }, { passive: true });
          }

          if (popData && (popData.calientes?.length || popData.frios?.length || popData.libres?.length || popData.reprimidos?.length || popData.cadenasActivas?.length)) {
            const cadenaLabels = {
              mujer_madre: "Mujer / Madre", muerte: "Muerte", boda_novia: "Boda / Novia",
              animales_casa: "Animales de casa", fiesta: "Fiesta", aves: "Aves",
              vejez: "Vejez", dinero: "Dinero", armas_ley: "Armas / Ley",
              infierno: "Infierno / Sombra", cocina: "Cocina", naturaleza: "Naturaleza",
              joyeria: "Joyería", religion: "Religión", transporte: "Transporte",
            };
            // Cadenas activas → cards de targets agrupadas por cadena
            popData.cadenasActivas?.forEach(c => {
              const items = c.targets.map(t => ({
                pad: t.pad,
                simbolo: GUIA?.[t.pad]?.simbolo || "",
                razon: `expectativa de ${cadenaLabels[c.cadena] || c.cadena}`,
                subtext: `por ${c.triggers.map(x => x.pad).join("·")}`,
              }));
              if (items.length) {
                const trigList = c.triggers.map(t => t.pad).join(", ");
                frag.appendChild(buildRezagoSection(items, "pop-cadena",
                  `🔗 Cadena ${cadenaLabels[c.cadena] || c.cadena} activa (${c.intensidad}%) — disparadores ${trigList}`));
              }
            });
            // Calientes
            if (popData.calientes?.length) {
              const items = popData.calientes.map(c => {
                const cayoReciente = c.ultimaMs && (Date.now() - c.ultimaMs) < 3 * 86400000;
                return {
                  pad: c.pad,
                  simbolo: GUIA?.[c.pad]?.simbolo || "",
                  badge: `${c.score}`,
                  razon: cayoReciente
                    ? `⚡ cayó ${formatTimeAgo(c.ultimaMs)} · ${c.motivo}`
                    : c.motivo,
                };
              });
              frag.appendChild(buildRezagoSection(items, "pop-hot", "🔥 Mercado caliente — La Diaria los evita"));
            }
            // Reprimidos: populares + ausencia anómala = el operador los retiene
            const reprimidos = popData.reprimidos?.length ? popData.reprimidos : [];
            if (reprimidos.length) {
              const items = reprimidos.map(r => ({
                pad: r.pad,
                simbolo: GUIA?.[r.pad]?.simbolo || "",
                badge: `${r.score}/${r.dias ?? "—"}d`,
                razon: r.motivo || "Popular reprimido",
                subtext: r.zScore != null ? `${r.zScore > 0 ? "+" : ""}${r.zScore}σ rezago` : (r.dias != null ? `${r.dias} días sin caer` : ""),
                tooltip: "Número que el público sí compra pero el operador retiene. Candidato a explosión cuando se libere.",
              }));
              frag.appendChild(buildRezagoSection(items, "pop-hot", "🛑 Reprimidos — populares + ausencia anómala (operador los retiene)"));
            }
            // Zona fría real (antes "libres") — popularidad baja real, no reprimidos
            const frios = popData.frios?.length ? popData.frios : popData.libres;
            if (frios?.length) {
              const items = frios.map(l => ({
                pad: l.pad,
                simbolo: GUIA?.[l.pad]?.simbolo || "",
                badge: `${l.score}`,
                razon: "popularidad baja real",
                subtext: l.dias != null ? `${l.dias}d sin caer` : "",
              }));
              frag.appendChild(buildRezagoSection(items, "pop-cool", "❄️ Zona fría real — bajo interés del público (no necesariamente más probables)"));
            }
          }

          // ── Motor de variantes: sustituciones probables ──────────────────
          const varData = motor?.variantes;
          if (varData && varData.variantes?.length) {
            const TIPO_LBL = {
              simple_d0: "conv. decena", simple_d1: "conv. unidad",
              compound: "compuesta", compound_mirror: "espejo compuesta",
              equiv_directa: "equivalencia", equiv_espejo: "espejo equiv.",
              mirror: "espejo", encadenado: "encadenada",
            };
            // Semillas
            if (varData.semillas?.length) {
              const items = varData.semillas.slice(0, 6).map(s => ({
                pad: s.pad,
                simbolo: GUIA?.[s.pad]?.simbolo || "",
                badge: `${Math.round(s.peso * 100)}%`,
                razon: "semilla activa",
              }));
              frag.appendChild(buildRezagoSection(items, "variante-seed", "🔁 Motor de variantes — semillas activas"));
            }
            // Top variantes
            const items = varData.variantes.map(v => {
              const principal = v.fuentes[0];
              const tipoLbl = TIPO_LBL[principal?.tipo] || principal?.tipo || "";
              const allSrc = v.fuentes.map(f => `${f.pad} (${TIPO_LBL[f.tipo]||f.tipo})`).join(" · ");
              return {
                pad: v.pad,
                simbolo: GUIA?.[v.pad]?.simbolo || "",
                badge: `${Math.round(v.peso * 100)}%`,
                razon: `${principal?.pad}→${tipoLbl}`,
                tooltip: `desde: ${allSrc}`,
              };
            });
            frag.appendChild(buildRezagoSection(items, "variante", "🔁 Variantes con mayor peso adversarial (sustituciones probables)"));
          }

          // ── Clusters de dígitos activos (solo los que superan el nul-model) ──
          const clustersData = motor?.clusters?.activos;
          if (clustersData && clustersData.length) {
            clustersData.slice(0, 3).forEach(c => {
              const digitos = `{${c.digitos.join(",")}}`;
              // Hits del cluster (cayeron recientes)
              if (c.sorteos?.length) {
                const items = c.sorteos.map(s => ({
                  pad: s.pad,
                  simbolo: GUIA?.[s.pad]?.simbolo || "",
                  razon: `cayó · cluster ${digitos}`,
                }));
                frag.appendChild(buildRezagoSection(items, "cluster-hit",
                  `🎯 Cluster #${c.rank} ${digitos} — ${Math.round(c.cobertura * 100)}% cobertura · ${c.hits}/${c.total} sorteos · p=${c.pValor?.toFixed(3) ?? "—"} vs azar`));
              }
              // Universo combinatorio
              if (c.miembros?.length) {
                const items = c.miembros.slice(0, 16).map(m => ({
                  pad: m.pad,
                  simbolo: GUIA?.[m.pad]?.simbolo || "",
                  razon: `miembro ${digitos}`,
                }));
                frag.appendChild(buildRezagoSection(items, "cluster",
                  `Universo combinatorio del cluster ${digitos} (${c.miembros.length} números)`));
              }
            });
          } else if (motor?.clusters?.descartadosPorNulo > 0) {
            frag.appendChild(buildRezagoSection([], "cluster",
              `🧪 ${motor.clusters.descartadosPorNulo} cluster(s) descartado(s) por el nul-model: su cobertura es explicable por azar (umbral ${Math.round((motor.clusters.umbralNulo ?? 0) * 100)}%).`));
          }

          // ── Recuperación: pre-evento + repetidos (con decay) ─────────────
          const recData = motor?.recuperacion;
          if (recData?.activo && (recData.preEvento?.length || recData.repetidos?.length)) {
            const decayPct = Math.round((recData.decayFactor ?? 0) * 100);
            if (recData.preEvento?.length) {
              const items = recData.preEvento.map(p => ({
                pad: p.pad,
                simbolo: GUIA?.[p.pad]?.simbolo || "",
                badge: `${p.veces}×`,
                razon: "escondido pre-SP",
              }));
              frag.appendChild(buildRezagoSection(items, "recup-pre",
                `🫥 Recuperación · escondidos pre-SP — día ${recData.diasTranscurridos}/14 · intensidad ${decayPct}%`));
            }
            if (recData.repetidos?.length) {
              const items = recData.repetidos.map(r => ({
                pad: r.pad,
                simbolo: GUIA?.[r.pad]?.simbolo || "",
                badge: `${r.veces}×`,
                razon: "repetido post-SP",
              }));
              frag.appendChild(buildRezagoSection(items, "recup-rep",
                `🔁 Recuperación · repetidos post-SP — la operadora insiste`));
            }
          }

          // ── Indicador dominical ──────────────────────────────────────────
          const domData = motor?.dominical;
          if (domData?.esDomingo) {
            const domSec = document.createElement("div");
            domSec.className = "pulso-dominical";
            domSec.innerHTML = `
              <span class="pulso-dominical__icon">☀️</span>
              <div class="pulso-dominical__text">
                <strong>Factor dominical activo</strong>
                <span>Domingo: menor volumen de juego → suavización +18% sobre populares (${domData.afectados} números afectados)</span>
              </div>
            `;
            frag.appendChild(domSec);
          }

          // ── Números vencidos y en ventana (rezago) ──
          const rez = rezagoResult.status === "fulfilled" ? rezagoResult.value : null;
          if (rez?.vencidos?.length)  frag.appendChild(buildRezagoSection(rez.vencidos.slice(0, 6),  "warn", "Vencidos — llevan mucho más de su ciclo normal sin caer"));
          if (rez?.enVentana?.length) frag.appendChild(buildRezagoSection(rez.enVentana.slice(0, 8), "ok",   "En ventana — están dentro de su ciclo histórico reciente (últimos 180 días)"));
        } catch (motorErr) {
          console.warn("signal-engine error (no bloquea)", motorErr);
        }

        // ── Constelaciones activas ────────────────────────────────────────────
        try {
          const constellations = await listConstellationsFromDb();
          if (constellations.length) {
            const active = detectActiveConstellations(constellations, sorted.filter(d => !d.isTest));
            if (active.length) {
              const constSec = document.createElement("div");
              constSec.className = "pulso-group";
              constSec.innerHTML = `<div class="pulso-group__head"><span class="pulso-group__label">Constelaciones activas</span><span class="pulso-group__freq">${active.length} en curso</span></div>`;
              for (const { c, activadoPor, vistos, faltantes, diasActivo, diasRestantes } of active) {
                const padTrig = String(activadoPor).padStart(2, "0");
                const simTrig = GUIA?.[padTrig]?.simbolo || "";
                const vencida = diasRestantes < 0;
                const row = document.createElement("div");
                row.className = `const-active-row${vencida ? " const-active-row--vencida" : ""}`;
                row.innerHTML = `
                  <div class="const-active-head">
                    <span class="const-active-name">${c.nombre}</span>
                    <span class="const-active-trigger">disparado por <strong>${padTrig} ${simTrig}</strong></span>
                    <span class="const-active-dias ${vencida ? "const-active-dias--vencida" : ""}">día ${diasActivo}/${c.ventanaDias || 10}</span>
                  </div>
                  <div class="const-active-members">
                    ${vistos.map(m => { const p = String(m).padStart(2,"0"); return `<span class="const-member const-member--visto" title="${GUIA?.[p]?.simbolo||""}">${p} <small>${GUIA?.[p]?.simbolo||""}</small></span>`; }).join("")}
                    ${faltantes.map(m => { const p = String(m).padStart(2,"0"); return `<span class="const-member const-member--falta" title="${GUIA?.[p]?.simbolo||""}">${p} <small>${GUIA?.[p]?.simbolo||""}</small></span>`; }).join("")}
                  </div>
                `;
                constSec.appendChild(row);
              }
              frag.appendChild(constSec);
            }
          }
        } catch (_) { /* constelaciones opcionales */ }

        // ── Modo Recuperación (Super Premio) — panel completo ────────────────
        try {
          const spFechas = await listSpFromDb();
          const rec = detectarModoRecuperacion(spFechas);
          if (rec && rec.activo) {
            const diasDesde   = rec.diasTranscurridos;
            const spFecha     = rec.ultimoEvento;
            const hist2       = sorted.filter(d => !d.isTest);
            const PAD2        = n => String(n).padStart(2,"0");
            const DOW_REC     = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
            const MES_REC     = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

            // ── 1. Sorteos caídos desde el SP (por día, con imagen) ──────────
            const endRecTime = new Date(spFecha).getTime() + SP_RECOVERY_DAYS * 86_400_000;
            const endRecDate = new Date(endRecTime).toISOString().slice(0,10);
            const drawsPost  = hist2
              .filter(d => d.fecha > spFecha && d.fecha <= endRecDate)
              .sort((a,b) => {
                if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
                const ord = {"11AM":0,"3PM":1,"9PM":2};
                return (ord[a.horario]??9)-(ord[b.horario]??9);
              });

            // Agrupar por día
            const byDay = new Map();
            drawsPost.forEach(d => {
              const list = byDay.get(d.fecha) || [];
              list.push(d);
              byDay.set(d.fecha, list);
            });

            const caídosHtml = drawsPost.length === 0
              ? `<p class="rec-hint">Aún no hay sorteos registrados desde el pago del Super Premio.</p>`
              : [...byDay.entries()].map(([fecha, dayDraws]) => {
                  const dt  = new Date(`${fecha}T12:00:00`);
                  const lbl = `${DOW_REC[dt.getDay()]} ${dt.getDate()}-${MES_REC[dt.getMonth()]}`;
                  const chips = dayDraws.map(d => {
                    const pd  = PAD2(parseInt(d.numero,10));
                    const sym = GUIA?.[pd]?.simbolo || "";
                    return `
                      <div class="scenario-number" data-variant="recent">
                        <img class="rec-card__img" src="data/img/${pd}.png" alt="${pd}"
                          onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
                        <span class="rec-card__num">${pd}</span>
                        ${sym ? `<span class="rec-card__sym">${sym}</span>` : ""}
                        <span class="rec-card__hora">${d.horario}</span>
                      </div>`;
                  }).join("");
                  return `
                    <div class="rec-day">
                      <span class="rec-day__label">${lbl}</span>
                      <div class="rec-day__row">${chips}</div>
                    </div>`;
                }).join("");

            // ── 2. Candidatos históricos: qué números cayeron en recuperaciones
            //       anteriores y AÚN NO han caído en esta ─────────────────────
            const numsCaidosAhora = new Set(drawsPost.map(d => parseInt(d.numero,10)));
            const spHistoricas    = spFechas.filter(f => f !== spFecha).sort();

            // Frecuencia de cada número en recuperaciones históricas
            const histFreq = new Map();
            let totalHistSP = 0;
            spHistoricas.forEach(spH => {
              const endH = new Date(new Date(spH).getTime() + SP_RECOVERY_DAYS * 86_400_000).toISOString().slice(0,10);
              const wDraws = hist2.filter(d => d.fecha > spH && d.fecha <= endH);
              totalHistSP++;
              const seen = new Set(wDraws.map(d => parseInt(d.numero,10)));
              seen.forEach(n => histFreq.set(n, (histFreq.get(n)||0) + 1));
            });

            // Candidatos = frecuentes en historial de SP pero que aún no cayeron ahora
            const candidatos = [...histFreq.entries()]
              .filter(([n]) => !numsCaidosAhora.has(n))
              .sort((a,b) => b[1]-a[1])
              .slice(0, 12);

            const candidatosHtml = totalHistSP === 0
              ? `<p class="rec-hint">No hay recuperaciones anteriores registradas para comparar.</p>`
              : candidatos.length === 0
              ? `<p class="rec-hint">✅ Todos los candidatos históricos ya han aparecido en esta recuperación.</p>`
              : candidatos.map(([n, hits]) => {
                  const pd   = PAD2(n);
                  const sym  = GUIA?.[pd]?.simbolo || "";
                  const pct  = Math.round((hits / totalHistSP) * 100);
                  const str  = pct >= 60 ? "rec-cand--strong" : pct >= 35 ? "rec-cand--med" : "";
                  return `
                    <div class="scenario-number" data-variant="recovery" data-strength="${str}" title="Cayó en ${hits} de ${totalHistSP} recuperaciones anteriores">
                      <img class="rec-cand__img" src="data/img/${pd}.png" alt="${pd}"
                        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
                      <span class="rec-cand__num">${pd}</span>
                      ${sym ? `<span class="rec-cand__sym">${sym}</span>` : ""}
                      <span class="rec-cand__pct">${pct}%</span>
                    </div>`;
                }).join("");

            // ── Hit-Tracker: validación estadística del pool histórico ────────
            // Solo números que aparecieron en ≥50% de los ciclos de recuperación anteriores.
            // Un pool de 91/100 es ruido puro (99% azar). Con ≥50% el pool es pequeño
            // y significativo: cada hit confirma un patrón real, no coincidencia.
            const minCiclosPool = totalHistSP > 0 ? Math.max(1, Math.ceil(totalHistSP * 0.5)) : 1;
            const candPool      = new Set(
              [...histFreq.entries()].filter(([,v]) => v >= minCiclosPool).map(([k]) => k)
            );
            const hitsEsteCiclo = [...candPool].filter(n => numsCaidosAhora.has(n));
            const diasConHit    = new Set(
              drawsPost.filter(d => candPool.has(parseInt(d.numero,10))).map(d => d.fecha)
            ).size;
            const diasMonitor   = new Set(drawsPost.map(d => d.fecha)).size;
            const NPool         = candPool.size;
            // P(≥1 del pool en 2 sorteos sin reemplazo)
            const baseRandom    = NPool > 0
              ? Math.round((1 - ((100-NPool)*(99-NPool))/(100*99)) * 100) : 0;
            const hitRateActual = diasMonitor > 0
              ? Math.round(diasConHit / diasMonitor * 100) : 0;

            // Retroactivo: para cada SP histórico, calcular pool que tenía y cuántos días hubo hit
            const ciclosHist = [];
            for (let _ci = 0; _ci < spHistoricas.length; _ci++) {
              const spH     = spHistoricas[_ci];
              const pastOfH = spFechas.filter(f => f < spH);
              if (pastOfH.length < 1) continue;
              const freqH = new Map();
              pastOfH.forEach(sp2 => {
                const end2 = new Date(new Date(sp2).getTime() + SP_RECOVERY_DAYS * 86_400_000).toISOString().slice(0,10);
                hist2.filter(d => d.fecha > sp2 && d.fecha <= end2).forEach(d => {
                  const n = parseInt(d.numero,10);
                  freqH.set(n, (freqH.get(n)||0)+1);
                });
              });
              const minH  = Math.max(1, Math.ceil(pastOfH.length * 0.5));
              const poolH = new Set([...freqH.entries()].filter(([,v]) => v >= minH).map(([k]) => k));
              if (poolH.size === 0) continue;
              const endH     = new Date(new Date(spH).getTime() + SP_RECOVERY_DAYS * 86_400_000).toISOString().slice(0,10);
              const wH       = hist2.filter(d => d.fecha > spH && d.fecha <= endH);
              const daysH    = new Set(wH.map(d => d.fecha));
              const daysHitH = new Set(wH.filter(d => poolH.has(parseInt(d.numero,10))).map(d => d.fecha));
              if (daysH.size > 0) ciclosHist.push({
                sp: spH, poolSz: poolH.size,
                dCon: daysHitH.size, dTotal: daysH.size,
                rate: Math.round(daysHitH.size / daysH.size * 100)
              });
            }
            const avgRate = ciclosHist.length > 0
              ? Math.round(ciclosHist.reduce((s,c) => s + c.rate, 0) / ciclosHist.length) : null;

            // Semáforo del pool: compara rendimiento real vs azar
            // Verde  = supera al azar → el pool tiene valor predictivo
            // Amarillo = dentro del rango del azar (±15%) → resultado neutro, seguir monitoreando
            // Rojo   = por debajo del azar → el pool no está siendo útil este ciclo
            const _poolSemaforo = diasMonitor === 0 ? "neutral"
              : hitRateActual >= baseRandom           ? "good"
              : hitRateActual >= baseRandom * 0.85    ? "warn"
              : "bad";

            const hitTrackerHtml = `
              <div class="rec-ht">
                <div class="rec-ht__head">
                  📊 Validación del pool
                  ${hitsEsteCiclo.length > 0 ? `<span class="rec-ht__badge--hit">✓ ${hitsEsteCiclo.length} caíd${hitsEsteCiclo.length===1?"o":"os"} del pool este ciclo</span>` : ""}
                  ${avgRate !== null ? `<span class="rec-ht__badge--avg${avgRate >= baseRandom ? " rec-ht__badge--avg-good" : ""}">${avgRate}% prom. histórico vs ${baseRandom}% azar</span>` : ""}
                </div>
                <div class="rec-ht__stats">
                  <div class="rec-ht__stat">
                    <span class="rec-ht__val${hitRateActual >= baseRandom ? " rec-ht__val--good" : ""}">${hitRateActual}%</span>
                    <span class="rec-ht__lbl">${diasConHit}/${diasMonitor} días con hit</span>
                  </div>
                  <div class="rec-ht__stat">
                    <span class="rec-ht__val rec-ht__val--base">${baseRandom}%</span>
                    <span class="rec-ht__lbl">línea base (azar)</span>
                  </div>
                  <div class="rec-ht__stat rec-ht__stat--${_poolSemaforo}">
                    <span class="rec-ht__val rec-ht__val--${_poolSemaforo}">${hitsEsteCiclo.length}<small>/${NPool}</small></span>
                    <span class="rec-ht__lbl">del pool cayeron</span>
                  </div>
                  ${avgRate !== null ? `<div class="rec-ht__stat${avgRate >= baseRandom ? " rec-ht__stat--good" : ""}">
                    <span class="rec-ht__val${avgRate >= baseRandom ? " rec-ht__val--good" : ""}">${avgRate}%</span>
                    <span class="rec-ht__lbl">${ciclosHist.length} ciclos previos</span>
                  </div>` : ""}
                </div>
                ${ciclosHist.length > 0 ? `
                <div class="rec-ht__cycles">
                  ${ciclosHist.slice(-6).map(c => `
                    <div class="rec-ht__cycle" title="SP ${c.sp} · pool ${c.poolSz} núms · ${c.dCon}/${c.dTotal} días con hit">
                      <span class="rec-ht__cy-sp">${c.sp.slice(5)}</span>
                      <div class="rec-ht__cy-track">
                        <div class="rec-ht__cy-fill${c.rate >= baseRandom ? " rec-ht__cy-fill--good" : ""}" style="width:${Math.min(c.rate,100)}%"></div>
                        <div class="rec-ht__cy-base" style="left:${Math.min(baseRandom,97)}%"></div>
                      </div>
                      <span class="rec-ht__cy-pct${c.rate >= baseRandom ? " rec-ht__cy-pct--good" : ""}">${c.rate}%</span>
                    </div>`).join("")}
                </div>` : ""}
                ${hitsEsteCiclo.length > 0 ? `
                <div class="rec-ht__hit-row">
                  <span class="rec-ht__hit-lbl">Ya cayeron este ciclo:</span>
                  ${hitsEsteCiclo.map(n => {
                    const pd  = PAD2(n);
                    const sym = GUIA?.[pd]?.simbolo || "";
                    return `<div class="rec-ht__hit-chip">
                      <img class="rec-ht__hit-img" src="data/img/${pd}.png" alt="${pd}"
                        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
                      <span class="rec-ht__hit-num">${pd}</span>
                      ${sym ? `<span class="rec-ht__hit-sym">${sym}</span>` : ""}
                    </div>`;
                  }).join("")}
                </div>` : ""}
              </div>`;

            // ── 3. Números que ya repitieron (ya existía) ────────────────────
            const reps = detectarNumerosRepetidosPostEvento(spFecha, hist2);
            const repsHtml = reps.length
              ? reps.map(({numero, veces}) => {
                  const pd  = PAD2(numero);
                  const sym = GUIA?.[pd]?.simbolo || "";
                  return `
                    <div class="scenario-number" data-variant="repeated">
                      <img class="rec-card__img" src="data/img/${pd}.png" alt="${pd}"
                        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
                      <span class="rec-card__num">${pd}</span>
                      ${sym ? `<span class="rec-card__sym">${sym}</span>` : ""}
                      <span class="rec-card__hora">${veces}×</span>
                    </div>`;
                }).join("")
              : `<p class="rec-hint">Sin repeticiones todavía.</p>`;

            // ── Render del panel ─────────────────────────────────────────────
            const recSec = document.createElement("div");
            recSec.className = "rec-panel";
            recSec.innerHTML = `
              <div class="rec-panel__head">
                <span class="rec-panel__title">⚡ Modo Recuperación — Día ${diasDesde} de ${SP_RECOVERY_DAYS}</span>
                <span class="rec-panel__meta">SP pagado el ${spFecha} · ${rec.diasRestantes} días restantes</span>
              </div>

              <div class="rec-panel__body">
                <div class="rec-section">
                  <div class="rec-section__title">
                    🎯 Candidatos históricos aún sin caer
                    ${totalHistSP > 0 ? `<span class="rec-section__badge">Basado en ${totalHistSP} SP anteriores</span>` : ""}
                  </div>
                  <p class="rec-hint">Números que cayeron en <strong>al menos la mitad de los ciclos de recuperación anteriores</strong>. La validación del pool solo mide estos candidatos de alta frecuencia — los que tienen patrón real, no los que aparecieron por azar alguna vez.</p>
                  ${hitTrackerHtml}
                  <div class="rec-cands">${candidatosHtml}</div>
                </div>

                <div class="rec-section">
                  <div class="rec-section__title">📅 Caídos desde el SP <span class="rec-section__badge">${drawsPost.length} sorteos</span></div>
                  <div class="rec-days">${caídosHtml}</div>
                </div>

                <div class="rec-section">
                  <div class="rec-section__title">🔁 Repitiendo en este período</div>
                  <div class="rec-day__row" style="margin-top:6px">${repsHtml}</div>
                </div>
              </div>
            `;
            recRow.appendChild(recSec);
          }
        } catch (_) { /* recovery opcional */ }

        resultPulso.innerHTML = "";
        resultPulso.appendChild(frag);
        _pulsoStale = false; // caché válido hasta el próximo cambio de datos
      } catch (err) {
        console.error("renderPulso error", err);
        resultPulso.innerHTML = `<p class='pulso-empty'>No se pudo calcular: ${err.message}</p>`;
      }
    }


    // ── Trío del Día ────────────────────────────────────────────────────────────
    const HORARIO_ORDER_P3 = { "11AM": 0, "3PM": 1, "9PM": 2 };
    const TIPO_LABELS = {
      simple:        "Conv. simple",
      compound:      "Conv. compuesta",
      compound_mirror:"Espejo compuesta",
      equiv_directa: "Equivalencia",
      equiv_espejo:  "Equiv. espejo",
      mirror:        "Espejo",
      encadenado:    "Encadenado",
    };

    async function jumpToDayView(fecha, pais) {
      if (!fecha) return;
      if (dayFecha) {
        dayFecha.value = fecha;
        updateDayFechaDow(fecha);
      }
      if (pais && dayPais) {
        dayPais.value = pais;
        updateSlotVisibility(pais);
      }
      const dayBtn = Array.from(sidebarButtons || []).find((btn) => btn.dataset.view === "day");
      dayBtn?.click();
      await refreshSlots();
      updateCountdownDisplay?.();
      await refreshHistoryPanel({ forceReload: true });
    }


    // ── Modo Consulta histórica ──────────────────────────────────────────────
    async function ejecutarConsulta() {
      const raw     = document.getElementById("cq-numero")?.value.trim() ?? "";
      const horario = document.getElementById("cq-horario")?.value || null;
      const output  = document.getElementById("cq-output");
      if (!output) return;

      const num = parseInt(raw, 10);
      if (isNaN(num) || num < 0 || num > 99) {
        output.innerHTML = `<p class="hint small">Ingresa un número entre 00 y 99.</p>`;
        return;
      }

      output.innerHTML = `<p class="hint small">Consultando historial…</p>`;
      try {
        const draws      = await getCachedDraws({ excludeTest: true });
        const rezagoMap  = (await loadSignalEngine()).calcularRezago(draws);
        const result     = consultarNumero(num, draws, GUIA, { horario, rezagoMap });
        output.innerHTML = renderConsultaHTML(result, GUIA);
      } catch (err) {
        output.innerHTML = `<p class="hint small">Error: ${err.message}</p>`;
      }
    }

    initToolSelect(document.getElementById("cq-horario"), { label: "Turno" });
    document.getElementById("cq-btn")?.addEventListener("click", ejecutarConsulta);
    document.getElementById("cq-numero")?.addEventListener("keydown", e => {
      if (e.key === "Enter") ejecutarConsulta();
    });

    const btnGeometria = document.getElementById("g-generar");
    btnGeometria?.addEventListener("click", async () => {
      const fecha = geometryDateInput?.value;
      const paisSeleccionado = geometryPaisSelect?.value || dayPais?.value || "HN";
      if (!fecha) {
        showToast("Selecciona una fecha para generar la cruceta/triángulo.", { variant: "warning" });
        return;
      }
      const cruceta = generarCruceta(fecha);
      renderCruceta(cruceta);
      const niveles = generarTrianguloInvertido(fecha);
      const contTri = document.getElementById("g-tri");
      if (contTri) dibujarTrianguloInvertido(contTri, niveles);
      await renderTurnoCruceta(fecha, paisSeleccionado);
    });

    function renderCruceta(data) {
      const cont = document.getElementById("g-cruceta");
      if (!cont) return;
      cont.innerHTML = `
        <div class="c-row">
          <div class="ball small">${formatNumber(data.norte)}</div>
        </div>
        <div class="c-row">
          <div class="ball small">${formatNumber(data.oeste)}</div>
          <div class="ball small">${formatNumber(data.centro)}</div>
          <div class="ball small">${formatNumber(data.este)}</div>
        </div>
        <div class="c-row">
          <div class="ball small">${formatNumber(data.sur)}</div>
        </div>
      `;
    }

    async function renderTurnoCruceta(fecha, pais) {
      const cont = document.getElementById("g-turnos");
      const candWrap = document.getElementById("g-turnos-cands");
      if (!cont || !candWrap) return;
      cont.innerHTML = "<p class='hint'>Calculando cruceta con los sorteos de 11 AM y 3 PM…</p>";
      candWrap.innerHTML = "";
      try {
        const draws = await getCachedDraws();
        const draw11 = pickDraw(draws, fecha, pais, "11AM");
        const draw3 = pickDraw(draws, fecha, pais, "3PM");
        if (!draw11 || !draw3) {
          cont.innerHTML = `<p class='hint'>Registra los sorteos reales de 11 AM y 3 PM para ${fecha} (${pais}).</p>`;
          return;
        }
        const cruceta = generarCrucetaTurnos(draw11.numero, draw3.numero);
        const formatNode = (value) => `${value}`;
        cont.innerHTML = `
          <div class="c-row">
            <div class="ball small">${formatNode(cruceta.north)}</div>
          </div>
          <div class="c-row">
            <div class="ball small">${formatNode(cruceta.west)}</div>
            <div class="ball small">${formatNode(cruceta.center)}</div>
            <div class="ball small">${formatNode(cruceta.east)}</div>
          </div>
          <div class="c-row">
            <div class="ball small">${formatNode(cruceta.south)}</div>
          </div>
          <p class="geom-note">11 AM: ${formatNumber(draw11.numero)} · 3 PM: ${formatNumber(
            draw3.numero,
          )} · ${pais}</p>
        `;
        if (cruceta.candidates.length) {
          candWrap.innerHTML = `
            <p class="geom-note">Candidatos sugeridos para las 9 PM</p>
            <div class="geom-candidate-chips">
              ${cruceta.candidates
                .map(
                  (num) =>
                    `<span class="geom-chip"><strong>${formatNumber(num)}</strong><small>${getSymbol(num) || ""}</small></span>`,
                )
                .join("")}
            </div>
            ${
              cruceta.candidateNotes?.length
                ? `<ul class="geom-steps">${cruceta.candidateNotes
                    .map((note) => `<li>${note.detail}</li>`)
                    .join("")}</ul>`
                : ""
            }
            ${
              cruceta.steps?.length
                ? `<details class="geom-steps-details"><summary>Ver operaciones</summary><ul class="geom-steps">${cruceta.steps
                    .map((step) => `<li><strong>${step.label}:</strong> ${step.expr} ⇒ ${step.result}</li>`)
                    .join("")}</ul></details>`
                : ""
            }
          `;
        } else {
          candWrap.innerHTML = "<p class='hint'>Sin candidatos suficientes con estos datos.</p>";
        }
      } catch (err) {
        console.error("cruceta turnos error", err);
        cont.innerHTML = `<p class='hint'>No se pudo calcular la cruceta de turnos: ${err.message}</p>`;
      }
    }

    const btnDup = document.getElementById("btn-list-dup");
    const btnMarkTestDup = document.getElementById("btn-marktest-dup");
    const btnDeleteDup = document.getElementById("btn-delete-dup");
    const dupOut = document.getElementById("dup-out");
    const btnFixDates = document.getElementById("btn-fix-dates");
    const fixDatesOut = document.getElementById("fix-dates-out");

    btnDup?.addEventListener("click", refreshDuplicados);

    btnMarkTestDup?.addEventListener("click", async () => {
      const ids = getSelectedDupIds();
      if (!ids.length) {
        showToast("Selecciona al menos un registro duplicado.", { variant: "warning" });
        return;
      }
      try {
        await marcarGrupoComoTest(ids);
        await refreshDuplicados();
        await refreshSlots();
        showToast("Marcados como prueba.", { variant: "success" });
        await rebuildKnowledge();
        await handleDrawsMutated();
      } catch (err) {
        console.error("mark dup error", err);
        showToast(`No se pudo marcar como prueba: ${err.message}`, { variant: "danger" });
      }
    });

    btnDeleteDup?.addEventListener("click", async () => {
      const ids = getSelectedDupIds();
      if (!ids.length) {
        showToast("Selecciona registros para eliminar.", { variant: "warning" });
        return;
      }
      const confirmar = await mostrarModal(
        "Eliminar registros",
        "¿Eliminar los registros seleccionados?",
        { okText: "Eliminar", cancelText: "Cancelar", okVariant: "danger" }
      );
      if (!confirmar) return;
      try {
        await borrarIds(ids);
        await refreshDuplicados();
        await refreshSlots();
        showToast("Registros eliminados.", { variant: "success" });
        await rebuildKnowledge();
        await handleDrawsMutated();
      } catch (err) {
        console.error("delete dup error", err);
        showToast(`No se pudieron eliminar los registros: ${err.message}`, { variant: "danger" });
      }
    });

    async function refreshDuplicados() {
      if (!dupOut) return;
      dupOut.innerHTML = "<p class='hint'>Buscando duplicados…</p>";
      try {
        const grupos = await revisarDuplicados();
        if (!grupos.length) {
          dupOut.innerHTML = "<p class='hint'>Sin duplicados detectados.</p>";
          return;
        }
        dupOut.innerHTML = "";
        grupos.forEach((group, idx) => {
          const box = document.createElement("div");
          box.className = "card";
          box.style.width = "100%";
          box.style.marginBottom = "10px";
          const head = document.createElement("div");
          head.className = "card-head";
          head.textContent = `Grupo #${idx + 1}`;
          const list = document.createElement("div");
          list.className = "card-body";
          list.style.flexDirection = "column";
          list.style.alignItems = "flex-start";
          group.forEach((reg) => {
            const label = document.createElement("label");
            label.className = "symbol-tag";
            label.innerHTML = `
              <input type="checkbox" value="${reg.id}" />
              <span>${formatNumber(reg.numero)}</span>
              <span>${reg.fecha} ${reg.horario} ${reg.pais}</span>
              <span class="hint">${reg.isTest ? "test" : "real"}</span>
            `;
            list.appendChild(label);
          });
          box.appendChild(head);
          box.appendChild(list);
          dupOut.appendChild(box);
        });
      } catch (err) {
        console.error("dup error", err);
        dupOut.innerHTML = `<p class='hint'>No se pudieron obtener duplicados: ${err.message}</p>`;
      }
    }

    function getSelectedDupIds() {
      if (!dupOut) return [];
      return Array.from(dupOut.querySelectorAll("input[type='checkbox']:checked"))
        .map((el) => parseInt(el.value, 10))
        .filter((n) => !Number.isNaN(n));
    }

    btnFixDates?.addEventListener("click", async () => {
      if (!fixDatesOut) return;
      btnFixDates.disabled = true;
      fixDatesOut.innerHTML = "<p class='hint'>Revisando registros…</p>";
      try {
        const cambios = await corregirFechasDesfasadas({ maxAheadDays: 1 });
        if (!cambios.length) {
          fixDatesOut.innerHTML = "<p class='hint'>No se detectaron sorteos adelantados.</p>";
          showToast("No se encontraron registros con desfase.", { variant: "info" });
          return;
        }
        const detailItems = cambios
          .map(
            (reg) =>
              `<li>${reg.before} → ${reg.after} • ${reg.horario || ""} ${reg.pais || ""} #${formatNumber(reg.numero)}</li>`
          )
          .join("");
        fixDatesOut.innerHTML = `
          <p class='hint'>Se corrigieron ${cambios.length} registro(s) con desfase:</p>
          <ul class="analysis-note">${detailItems}</ul>
        `;
        await refreshSlots();
        await handleDrawsMutated();
        await rebuildKnowledge();
        showToast(`Listo: ${cambios.length} registro(s) corrigieron su fecha.`, { variant: "success" });
      } catch (err) {
        console.error("fix dates error", err);
        fixDatesOut.innerHTML = `<p class='hint'>No se pudo completar la corrección: ${err.message}</p>`;
        showToast(`Error al corregir fechas: ${err.message}`, { variant: "danger" });
      } finally {
        btnFixDates.disabled = false;
      }
    });

    // ✅ Navegación lateral
    const logoutBtn = document.getElementById("btn-logout");

    async function cerrarSesion() {
      try {
        await supabaseLogout();
      } catch (err) {
        console.error("logout error", err);
      } finally {
        window.location.href = "./login.html";
      }
    }

    logoutBtn?.addEventListener("click", cerrarSesion);

    const syncRemoteBtn = document.getElementById("btn-sync-remote");

    async function runRemoteSync({ silent = false } = {}) {
      const btn = syncRemoteBtn;
      if (btn) { btn.disabled = true; }
      try {
        const prevCount = (pendingDayQueue || []).length;
        pendingDayQueue = await loadPendingDayQueue();
        updatePendingIndicator();
        await refreshSlots({ forceReload: true });
        await handleDrawsMutated();
        if (!silent) {
          const newCount = (pendingDayQueue || []).length;
          const diff = newCount - prevCount;
          if (diff > 0) {
            showToast(`Sincronizado — ${diff} sorteo${diff > 1 ? "s" : ""} nuevo${diff > 1 ? "s" : ""} encontrado${diff > 1 ? "s" : ""}.`, { variant: "success" });
          } else {
            showToast("Sistema al día — sin nuevos sorteos.", { variant: "info" });
          }
        }
      } catch (err) {
        if (!silent) showToast("No se pudo sincronizar: " + err.message, { variant: "danger" });
      } finally {
        if (btn) { btn.disabled = false; }
      }
    }

    syncRemoteBtn?.addEventListener("click", () => runRemoteSync());

    // Auto-sync al iniciar: espera a que todo se asiente y consulta Supabase
    setTimeout(() => runRemoteSync(), 1500);

    // ✅ Cambio de vistas
    const views = {
      day: "view-day",
      history: "view-history",
      hypo: "view-hypo",
      analysis: "view-analysis",
      transform: "view-transform",
      pega3: "view-pega3",
      consulta: "view-consulta",
      horario: "view-horario",
      clocks: "view-clocks",
      monthly: "view-monthly",
      geometry: "view-geometry",
      memory: "view-memory",
      guide: "view-guide",
      config: "view-config",
      maint: "view-maint",
      modes: "view-modes",
      calc:  "view-calc",
      wiki:  "view-wiki",
      superpremio: "view-superpremio",
      suerte: "view-suerte",
    };
    const sidebarButtons = document.querySelectorAll('[data-view]');
    const markNavigation = initProductShell({ navigate: navigateTo, getDayContext: getFilters });
    function navigateTo(key) {
      if (key === 'login') { window.location.href = './login.html?mode=switch'; return; }
      if (['config', 'maint'].includes(key) && document.documentElement.dataset.role !== 'admin') return;
      const id = views[key];
      const el = document.getElementById(id);
      if (!el) return logWarn('Vista no encontrada:', key);
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('hidden', view !== el));
      markNavigation(key);
      numberClocks.setActive(key === 'clocks');
      if (key === 'history') refreshHistoryPanel().catch(() => {});
        if (id === "view-monthly") consultarRankingMensual();
        if (id === "view-guide") mostrarGuia();
        if (id === "view-wiki")  initWiki();
        if (id === "view-hypo") { renderPairList(); renderConstellationList(); }
        if (id === "view-analysis") {
          renderPulso().catch(() => {});
        }
        if (id === "view-superpremio") renderSuperPremioPanel().catch(() => {});
        if (id === "view-transform") renderCompanerosPanel().catch(() => {});
        if (id === "view-maint") {
          refreshDuplicados();
          getCachedDraws().then((draws) => renderHistoryCoverage(draws)).catch(() => {});
        }
        if (id === "view-modes") refreshModesPanel();
        if (id === "view-calc")  initCalc();
        if (id === "view-pega3") {
          syncPega3Context();
          refreshPega3Historial();
          renderPega3Panels();
        }
        if (id === "view-memory") {
          renderMemoryBoard();
          renderGapPanel();
        }
        if (id === "view-suerte") initSuerte();
      if (location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const navigateFromHash = () => navigateTo(views[location.hash.slice(1)] ? location.hash.slice(1) : 'day');
    window.addEventListener('hashchange', navigateFromHash);
    navigateFromHash();

    // ════════════════════════════════════════════════════════════════
    // TIRADA DE SUERTE — generador sin sesgo con crypto.getRandomValues
    // ════════════════════════════════════════════════════════════════
    function initSuerte() {
      // ── Generador sin sesgo (rejection sampling) ─────────────────
      function randInt(max) {
        // Descarta valores que causarían sesgo de módulo
        const limit = 256 - (256 % max);
        let v;
        do { v = crypto.getRandomValues(new Uint8Array(1))[0]; } while (v >= limit);
        return v % max;
      }

      // ── Estado ───────────────────────────────────────────────────
      let lineaActual = null;   // 0-9

      // ── Referencias DOM ──────────────────────────────────────────
      const stepNum   = document.getElementById("suerte-step-num");
      const btnLinea  = document.getElementById("suerte-btn-linea");
      const btnNum    = document.getElementById("suerte-btn-num");
      const resLinea  = document.getElementById("suerte-linea-result");
      const resNum    = document.getElementById("suerte-num-result");
      const numHint   = document.getElementById("suerte-num-hint");
      const histWrap  = document.getElementById("suerte-hist-wrap");
      const histEl    = document.getElementById("suerte-hist");
      const histClear = document.getElementById("suerte-hist-clear");
      if (!btnLinea || !btnNum) return;

      // ── Animación de dados ────────────────────────────────────────
      function animarYMostrar(el, duración, fnValor, fnRender) {
        el.classList.add("suerte-result--rolling");
        let ticks = 0;
        const total = Math.floor(duración / 60);
        const iv = setInterval(() => {
          el.innerHTML = `<span class="suerte-result__roll">${fnValor()}</span>`;
          ticks++;
          if (ticks >= total) {
            clearInterval(iv);
            el.classList.remove("suerte-result--rolling");
            el.classList.add("suerte-result--done");
            setTimeout(() => el.classList.remove("suerte-result--done"), 600);
            fnRender(el);
          }
        }, 60);
      }

      // ── Render de resultado de línea ─────────────────────────────
      function renderLinea(el, linea) {
        const pad = n => String(n).padStart(2, "0");
        el.innerHTML = `
          <div class="suerte-linea-card">
            <span class="suerte-linea-card__num">${linea}</span>
            <span class="suerte-linea-card__range">Línea ${pad(linea * 10)} — del ${pad(linea*10)} al ${pad(linea*10+9)}</span>
          </div>`;
      }

      // ── Render de resultado de número ────────────────────────────
      function renderNumero(el, num) {
        const pad = String(num).padStart(2, "0");
        const info = GUIA?.[pad] || {};
        const sym  = info.simbolo || "";
        const fam  = info.familia || "";
        el.innerHTML = `
          <div class="suerte-num-card">
            <img class="suerte-num-card__img" src="data/img/${pad}.png" alt="${pad}"
              onerror="this.src='data/img/${pad}.jpg';this.onerror=()=>this.style.display='none'">
            <span class="suerte-num-card__num">${pad}</span>
            ${sym ? `<span class="suerte-num-card__sym">${sym}</span>` : ""}
            ${fam ? `<span class="suerte-num-card__fam">${fam}</span>` : ""}
          </div>`;
      }

      // ── Añadir al historial ───────────────────────────────────────
      function agregarHistorial(linea, num) {
        const pad  = String(num).padStart(2, "0");
        const info = GUIA?.[pad] || {};
        const sym  = info.simbolo || "";
        const item = document.createElement("div");
        item.className = "suerte-hist-item";
        item.innerHTML = `
          <img class="suerte-hist-item__img" src="data/img/${pad}.png" alt="${pad}"
            onerror="this.src='data/img/${pad}.jpg';this.onerror=()=>this.style.display='none'">
          <span class="suerte-hist-item__num">${pad}</span>
          ${sym ? `<span class="suerte-hist-item__sym">${sym}</span>` : ""}
          <span class="suerte-hist-item__linea">L${linea}</span>`;
        histEl.prepend(item);
        histWrap.style.display = "";
      }

      // ── Botón 1: tirar línea ──────────────────────────────────────
      btnLinea.onclick = () => {
        btnLinea.disabled = true;
        lineaActual = null;
        // Desbloquear paso 2 solo cuando termine
        btnNum.disabled = true;
        btnNum.classList.add("suerte-btn--disabled");
        stepNum.classList.add("suerte-step--locked");
        resNum.innerHTML = `<span class="suerte-result__dash">—</span>`;
        numHint.textContent = "Primero tira la línea";

        animarYMostrar(
          resLinea, 900,
          () => randInt(10),       // valor intermedio durante animación
          el => {
            lineaActual = randInt(10);
            renderLinea(el, lineaActual);
            numHint.textContent = `Rango: ${String(lineaActual*10).padStart(2,"0")} – ${String(lineaActual*10+9).padStart(2,"0")}`;
            stepNum.classList.remove("suerte-step--locked");
            btnNum.disabled = false;
            btnNum.classList.remove("suerte-btn--disabled");
            btnLinea.disabled = false;
          }
        );
      };

      // ── Botón 2: elegir número ────────────────────────────────────
      btnNum.onclick = () => {
        if (lineaActual === null) return;
        btnNum.disabled = true;

        const base = lineaActual * 10;
        animarYMostrar(
          resNum, 700,
          () => base + randInt(10),  // valor intermedio durante animación
          el => {
            const num = base + randInt(10);
            renderNumero(el, num);
            agregarHistorial(lineaActual, num);
            btnNum.disabled = false;
          }
        );
      };

      // ── Limpiar historial ─────────────────────────────────────────
      if (histClear) {
        histClear.onclick = () => {
          histEl.innerHTML = "";
          histWrap.style.display = "none";
        };
      }
    }

    // New product defaults are applied once; subsequent choices remain user preferences.
    if (localStorage.getItem('ld-design-version') !== '2') {
      localStorage.setItem('ld-theme', 'light');
      localStorage.setItem('ld-accent', 'azul');
      localStorage.setItem('ld-design-version', '2');
    }
    // Tema del producto
    (function initTheme() {
      const saved = localStorage.getItem("ld-theme") || "light";
      document.documentElement.setAttribute("data-theme", saved);
      const themeIcon = document.getElementById("theme-icon");
      if (themeIcon) themeIcon.className = saved === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";

      const themeBtn = document.getElementById("btn-toggle-theme");
      if (themeBtn) {
        themeBtn.addEventListener("click", () => {
          const current = document.documentElement.getAttribute("data-theme") || "dark";
          const next = current === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", next);
          localStorage.setItem("ld-theme", next);
          const icon = document.getElementById("theme-icon");
          if (icon) icon.className = next === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
          themeBtn.classList.toggle("active", next === "light");
        });
        // Marcar activo si ya está en light
        if (saved === "light") themeBtn.classList.add("active");
      }
    })();

    // ✅ Selector de acento (color de la interfaz)
    (function initAccent() {
      const ACCENTS = ["teal", "azul", "grafito", "dorado"];
      const saved = localStorage.getItem("ld-accent") || "azul";
      document.documentElement.setAttribute("data-accent", ACCENTS.includes(saved) ? saved : "azul");

      const accentBtn = document.getElementById("btn-toggle-accent");
      const panel = document.getElementById("accent-picker-panel");
      if (!accentBtn || !panel) return;

      const swatches = Array.from(panel.querySelectorAll(".accent-swatch"));
      const markActive = (accent) => {
        swatches.forEach((sw) => sw.classList.toggle("active", sw.dataset.accent === accent));
      };
      markActive(document.documentElement.getAttribute("data-accent"));

      const closePanel = () => {
        panel.classList.add("hidden");
        accentBtn.setAttribute("aria-expanded", "false");
      };
      const openPanel = () => {
        panel.classList.remove("hidden");
        accentBtn.setAttribute("aria-expanded", "true");
      };

      accentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (panel.classList.contains("hidden")) openPanel();
        else closePanel();
      });

      swatches.forEach((sw) => {
        sw.addEventListener("click", (e) => {
          e.stopPropagation();
          const accent = sw.dataset.accent;
          document.documentElement.setAttribute("data-accent", accent);
          localStorage.setItem("ld-accent", accent);
          markActive(accent);
          closePanel();
        });
      });

      document.addEventListener("click", (e) => {
        if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== accentBtn) {
          closePanel();
        }
      });
    })();

    // ── Notificaciones del navegador ──
    initNotifications().catch(() => {});

    // ── Super Premio Picker: inyectar en panel Números Rápidos al arranque ──
    try {
      const spDraws = await DB.listDraws({ excludeTest: true });
      initSuperPremioPicker(spDraws, GUIA);
    } catch (err) {
      console.warn("[superpremio-picker] No se pudo inicializar:", err?.message || err);
    }

    try {
      await refreshHypotesis();
      await refreshSlots();
      await rebuildKnowledge();
      await refreshModesPanel();
    } catch (err) {
      console.error("initial load error", err);
      showToast("La app no pudo cargar completamente. Revisa la consola para más detalles.", { variant: "danger" });
    } finally {
      hideSavingModal();
      await waitForFirstPaint();
      hideBootLoader();
    }

    // === Presencia en tiempo real ===
    (async () => {
      try {
        const { supabase: _sb } = await import("./supabaseClient.js");
        const { data: { session } } = await _sb.auth.getSession();
        if (!session?.user) return;

        const myEmail   = session.user.email;
        const myProfile = await (await import("./roles.js")).getMyProfile();
        const myRole    = myProfile?.role ?? "lector";
        const myNombre  = myProfile?.nombre || myEmail.split("@")[0];
        const amAdmin   = myRole === "admin";

        const presenceBar   = document.getElementById("presence-bar");
        const presenceCount = document.getElementById("presence-count");
        const presencePanel = document.getElementById("presence-panel");

        const ROLE_COLOR = { admin: "#f2c44a", editor: "#5ec47e", lector: "#a89e88" };
        const ROLE_LABEL = { admin: "Admin", editor: "Editor", lector: "Lector" };

        function renderPresence(state) {
          const users = Object.values(state).flat();
          const count = users.length;

          presenceCount.textContent = count;
          presenceBar.classList.toggle("presence-bar--many", count > 1);

          if (!amAdmin || !presencePanel) return;
          presencePanel.innerHTML = users.map((u) => {
            const c = ROLE_COLOR[u.role] || "#888";
            const l = ROLE_LABEL[u.role] || u.role;
            const isMe = u.email === myEmail;
            const displayName = u.nombre || u.email.split("@")[0];
            return `
              <div class="presence-user">
                <span class="presence-user__dot" style="background:${c}"></span>
                <span class="presence-user__name">${displayName}${isMe ? ' <em>(tú)</em>' : ""}</span>
                <span class="presence-user__role" style="color:${c}">${l}</span>
              </div>`;
          }).join("") || "<p class='presence-empty'>Solo tú</p>";
        }

        const channel = _sb.channel("ld-presence", {
          config: { presence: { key: session.user.id } }
        });

        channel
          .on("presence", { event: "sync" }, () => renderPresence(channel.presenceState()))
          .on("presence", { event: "join" }, () => renderPresence(channel.presenceState()))
          .on("presence", { event: "leave" }, () => renderPresence(channel.presenceState()))
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await channel.track({ email: myEmail, nombre: myNombre, role: myRole, online_at: new Date().toISOString() });
            }
          });

        // Toggle del panel (solo admin)
        if (amAdmin && presencePanel) {
          presenceBar.style.cursor = "pointer";
          presenceBar.title = "Ver usuarios conectados";
          presenceBar.addEventListener("click", () => {
            presencePanel.classList.toggle("hidden");
          });
          document.addEventListener("click", (e) => {
            if (!presenceBar.contains(e.target) && !presencePanel.contains(e.target)) {
              presencePanel.classList.add("hidden");
            }
          });
        }
      } catch (err) {
        console.warn("[presencia] Error al iniciar presencia:", err?.message);
      }
    })();

    // === Panel de gestión de usuarios (solo admin) ===
    async function renderAdminUsersPanel() {
      const container = document.getElementById("admin-users-list");
      if (!container) return;
      const myRole = await getMyRole();
      if (myRole !== "admin") {
        container.innerHTML = "<p class='hint'>⛔ Solo el administrador puede ver esto.</p>";
        return;
      }
      container.innerHTML = "<p class='hint'>Cargando…</p>";
      try {
        const { data: { session } } = await (await import("./supabaseClient.js")).supabase.auth.getSession();
        const myId = session?.user?.id;
        const profiles = await getAllProfiles();
        if (!profiles.length) {
          container.innerHTML = "<p class='hint'>No hay usuarios registrados.</p>";
          return;
        }
        container.innerHTML = "";
        profiles.forEach((p) => {
          const isMe = p.user_id === myId;
          const isBanned = !!p.banned;
          const row = document.createElement("div");
          row.className = `admin-user-row${isBanned ? " admin-user-row--banned" : ""}`;
          row.innerHTML = `
            <div class="admin-user-info">
              <span class="admin-user-email">${p.email}</span>
              ${isMe ? '<span class="admin-user-you">Tú</span>' : ""}
              ${isBanned ? '<span class="admin-user-banned-tag">BANEADO</span>' : ""}
            </div>
            <div class="admin-user-name-row">
              <input class="admin-name-input" type="text" placeholder="Nombre de usuario…" value="${p.nombre || ""}" maxlength="40" />
              <button class="admin-name-save btn-outline" data-uid="${p.user_id}">Guardar nombre</button>
            </div>
            <div class="admin-user-controls">
              <select class="admin-role-select" data-uid="${p.user_id}" ${isMe || isBanned ? "disabled" : ""}>
                ${VALID_ROLES.map((r) => `<option value="${r}" ${r === p.role ? "selected" : ""}>${roleLabel(r)}</option>`).join("")}
              </select>
              <span class="admin-role-badge" style="background:${roleColor(p.role)}22;color:${roleColor(p.role)};border-color:${roleColor(p.role)}55">${roleLabel(p.role)}</span>
              <button class="admin-role-save btn-outline" data-uid="${p.user_id}" ${isMe || isBanned ? "disabled" : ""}>Guardar rol</button>
              ${!isMe ? `<button class="admin-ban-btn ${isBanned ? "admin-ban-btn--unban" : "admin-ban-btn--ban"}" data-uid="${p.user_id}" data-banned="${isBanned}">${isBanned ? "✅ Desbanear" : "🚫 Banear"}</button>` : ""}
            </div>
          `;
          // Color del badge al cambiar el select
          const sel = row.querySelector(".admin-role-select");
          const badge = row.querySelector(".admin-role-badge");
          sel?.addEventListener("change", () => {
            const r = sel.value;
            badge.textContent = roleLabel(r);
            badge.style.background = `${roleColor(r)}22`;
            badge.style.color = roleColor(r);
            badge.style.borderColor = `${roleColor(r)}55`;
          });
          // Guardar rol
          const saveBtn = row.querySelector(".admin-role-save");
          saveBtn?.addEventListener("click", async () => {
            const newRole = sel?.value;
            if (!newRole) return;
            saveBtn.disabled = true;
            saveBtn.textContent = "Guardando…";
            try {
              await updateUserRole(p.user_id, newRole);
              saveBtn.textContent = "✓ Guardado";
              saveBtn.style.color = "var(--color-success)";
              setTimeout(() => { saveBtn.textContent = "Guardar"; saveBtn.style.color = ""; saveBtn.disabled = false; }, 2000);
            } catch (err) {
              saveBtn.textContent = "Error";
              saveBtn.style.color = "var(--color-danger)";
              showToast(`No se pudo guardar el rol: ${err.message}`, { variant: "danger" });
              setTimeout(() => { saveBtn.textContent = "Guardar"; saveBtn.style.color = ""; saveBtn.disabled = false; }, 2500);
            }
          });
          // Guardar nombre
          const nameInput = row.querySelector(".admin-name-input");
          const nameSaveBtn = row.querySelector(".admin-name-save");
          nameSaveBtn?.addEventListener("click", async () => {
            const newName = nameInput?.value?.trim() ?? "";
            nameSaveBtn.disabled = true;
            nameSaveBtn.textContent = "Guardando…";
            try {
              await updateUserName(p.user_id, newName);
              nameSaveBtn.textContent = "✓ Guardado";
              nameSaveBtn.style.color = "var(--color-success)";
              setTimeout(() => { nameSaveBtn.textContent = "Guardar nombre"; nameSaveBtn.style.color = ""; nameSaveBtn.disabled = false; }, 2000);
            } catch (err) {
              nameSaveBtn.textContent = "Error";
              nameSaveBtn.style.color = "var(--color-danger)";
              showToast(`No se pudo guardar el nombre: ${err.message}`, { variant: "danger" });
              setTimeout(() => { nameSaveBtn.textContent = "Guardar nombre"; nameSaveBtn.style.color = ""; nameSaveBtn.disabled = false; }, 2500);
            }
          });

          // Banear / Desbanear
          const banBtn = row.querySelector(".admin-ban-btn");
          banBtn?.addEventListener("click", async () => {
            const currentBanned = banBtn.dataset.banned === "true";
            const action = currentBanned ? "desbanear" : "banear";
            if (!await mostrarModal(`¿Confirmas ${action}?`, `${action === "banear" ? "Banear" : "Desbanear"} a ${p.email}?`, { okText: action === "banear" ? "Banear" : "Desbanear", okVariant: action === "banear" ? "danger" : "secondary" })) return;
            banBtn.disabled = true;
            banBtn.textContent = "…";
            try {
              await setBanStatus(p.user_id, !currentBanned);
              showToast(`Usuario ${currentBanned ? "desbaneado" : "baneado"}: ${p.email}`, { variant: currentBanned ? "success" : "warning" });
              // Re-renderizar el panel para reflejar el cambio
              await renderAdminUsersPanel();
            } catch (err) {
              banBtn.disabled = false;
              banBtn.textContent = currentBanned ? "✅ Desbanear" : "🚫 Banear";
              showToast(`Error: ${err.message}`, { variant: "danger" });
            }
          });
          container.appendChild(row);
        });
      } catch (err) {
        container.innerHTML = `<p class='hint'>Error al cargar usuarios: ${escapeHtml(err.message)}</p>`;
      }
    }

    // Cargar panel cuando se abre Configuración
    document.querySelector('[data-view="config"]')?.addEventListener("click", () => {
      setTimeout(renderAdminUsersPanel, 80);
    });

    // === SISTEMA DE MODALES UNIFICADO ===
    function mostrarModal(titulo, mensaje, opciones = {}) {
      return new Promise((resolve) => {
        const modal = document.getElementById("sys-modal");
        const tEl = document.getElementById("modal-title");
        const mEl = document.getElementById("modal-msg");
        const okBtn = document.getElementById("modal-ok");
        const cancelBtn = document.getElementById("modal-cancel");

        if (!modal) return resolve(false);

        // Personalizar texto
        tEl.textContent = titulo || "Confirmar acción";
        mEl.textContent = mensaje || "¿Deseas continuar?";
        okBtn.textContent = opciones.okText || "Aceptar";
        cancelBtn.textContent = opciones.cancelText || "Cancelar";
        okBtn.className = "";
        cancelBtn.className = "";
        if (opciones.okVariant === "danger") okBtn.classList.add("btn-danger");
        else if (opciones.okVariant === "secondary") okBtn.classList.add("btn-secondary");
        cancelBtn.classList.add("btn-ghost");

        // Mostrar modal
        modal.classList.remove("hidden");

        // Manejo de cierre
        const cerrar = (res) => {
          modal.classList.add("hidden");
          okBtn.onclick = cancelBtn.onclick = null;
          resolve(res);
        };

        okBtn.onclick = () => cerrar(true);
        cancelBtn.onclick = () => cerrar(false);
      });
    }

    // === Notificación breve (sin botones, tipo toast simple) ===
    function mostrarAviso(mensaje, opciones = {}) {
      showToast(mensaje, opciones);
    }


    // === NUEVA FUNCIÓN COMPLETA: Mostrar/Ocultar y eliminar sorteos individualmente ===
    // === Mostrar/Ocultar y eliminar sorteos individualmente (versión robusta) ===
    const btnListAll = document.getElementById("btn-list-all");
    const allOut = document.getElementById("all-out");
    const allFilterDate = document.getElementById("all-filter-date");
    const allFilterText = document.getElementById("all-filter-text");
    const allFilterClear = document.getElementById("all-filter-clear");
    let allDrawsCache = null;

    const hasActiveAllFilters = () => {
      const dateValue = (allFilterDate?.value || "").trim();
      const textValue = (allFilterText?.value || "").trim();
      return Boolean(dateValue || textValue);
    };

    function filterAllDraws(draws = []) {
      const dateValue = (allFilterDate?.value || "").trim();
      const textValue = (allFilterText?.value || "").trim().toLowerCase();
      if (!dateValue && !textValue) return draws;
      return draws.filter((draw) => {
        if (dateValue && draw.fecha !== dateValue) return false;
        if (textValue) {
          const numero = String(draw.numero).padStart(2, "0");
          const simbolo = GUIA[numero]?.simbolo || "";
          const haystack = `${draw.fecha} ${draw.pais} ${draw.horario} ${numero} ${simbolo} ${
            draw.isTest ? "prueba" : "real"
          }`.toLowerCase();
          if (!haystack.includes(textValue)) return false;
        }
        return true;
      });
    }

    async function renderAllTable({ forceReload = false } = {}) {
      if (!allOut) return;
      const shouldReload = forceReload || !Array.isArray(allDrawsCache);
      if (shouldReload) {
        allOut.innerHTML = "<p class='hint'>Cargando todos los sorteos…</p>";
        allDrawsCache = await DB.listDraws({ excludeTest: false });
      }

      const draws = Array.isArray(allDrawsCache) ? allDrawsCache : [];
      if (!draws.length && !hasActiveAllFilters()) {
        allOut.innerHTML = "<p class='hint'>No hay sorteos registrados aún.</p>";
        return;
      }

      const filtered = filterAllDraws(draws);
      if (!filtered.length) {
        const message = hasActiveAllFilters()
          ? "No hay sorteos que coincidan con los filtros aplicados."
          : "No hay sorteos registrados aún.";
        allOut.innerHTML = `<p class='hint'>${message}</p>`;
        return;
      }

      const table = document.createElement("table");
      table.className = "table-history";
      table.innerHTML = `
    <thead>
      <tr>
        <th>#</th><th>Fecha</th><th>País</th><th>Horario</th>
        <th>Número</th><th>Símbolo</th><th>Tipo</th><th>Acciones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
      const tbody = table.querySelector("tbody");

      filtered.forEach((draw, idx) => {
        const numero = String(draw.numero).padStart(2, "0");
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${draw.fecha}</td>
      <td>${draw.pais}</td>
      <td>${draw.horario}</td>
      <td class="num">${numero}</td>
      <td class="sym">${GUIA[numero]?.simbolo || "—"}</td>
      <td class="${draw.isTest ? "test" : ""}">${draw.isTest ? "prueba" : "real"}</td>
      <td>
        <button type="button" class="btn-del" data-id="${draw.id}">🗑</button>
      </td>
    `;
        tbody.appendChild(tr);
      });

      const meta = document.createElement("div");
      meta.className = "panel-meta";
      if (filtered.length === draws.length) {
        meta.textContent = `Mostrando ${filtered.length} sorteos registrados.`;
      } else {
        meta.textContent = `Mostrando ${filtered.length} de ${draws.length} sorteos (aplicando filtros).`;
      }

      allOut.innerHTML = "";
      allOut.appendChild(meta);
      allOut.appendChild(table);
    }

    const refreshAllTableIfVisible = (options) => {
      if (allOut?.dataset.visible === "true") {
        renderAllTable(options);
      }
    };

    btnListAll?.addEventListener("click", async () => {
      if (!allOut) return;

      if (allOut.dataset.visible === "true") {
        allOut.innerHTML = "";
        allOut.dataset.visible = "false";
        btnListAll.textContent = "Ver todos";
        return;
      }

      await renderAllTable({ forceReload: true });
      allOut.dataset.visible = "true";
      btnListAll.textContent = "Ocultar tabla";
    });

    allFilterDate?.addEventListener("input", () => refreshAllTableIfVisible());
    allFilterText?.addEventListener("input", () => refreshAllTableIfVisible());
    allFilterClear?.addEventListener("click", () => {
      if (allFilterDate) allFilterDate.value = "";
      if (allFilterText) allFilterText.value = "";
      refreshAllTableIfVisible();
    });

    // 🔒 Delegación de eventos sobre el contenedor (funciona aunque se regenere la tabla)
    allOut?.addEventListener("click", async (ev) => {
      const delBtn = ev.target.closest?.(".btn-del");
      if (!delBtn) return;

      const id = Number(delBtn.dataset.id);
      if (!Number.isFinite(id)) return;

      const confirmar = await mostrarModal(
        "Eliminar sorteo",
        "¿Seguro que deseas eliminar este sorteo permanentemente?",
        { okText: "Eliminar", cancelText: "Cancelar", okVariant: "danger" }
      );
      if (!confirmar) return;

      try {
        await DB.deleteDrawById(id);
        if (Array.isArray(allDrawsCache)) {
          allDrawsCache = allDrawsCache.filter((draw) => draw.id !== id);
        }
        await handleDrawsMutated();
        await renderAllTable();
        // Si queda la tabla vacía, no forzamos recarga; el usuario puede pulsar "Ocultar" y "Ver todos".
        mostrarAviso("Sorteo eliminado correctamente.", { variant: "success" });
      } catch (err) {
        console.error("delete draw error", err);
        mostrarAviso(`Error al eliminar: ${err.message}`, { variant: "danger" });
      }
    });



    // === Botón para reiniciar completamente la base ===
    const btnNuke = document.getElementById("btn-nuke");
    btnNuke?.addEventListener("click", async () => {
      const confirmar = await mostrarModal(
        "Reiniciar base de datos",
        "¿Seguro que deseas borrar TODOS los datos del sistema?",
        { okText: "Borrar todo", cancelText: "Cancelar", okVariant: "danger" }
      );
      if (!confirmar) return;
      const release = withButtonBusy(btnNuke, "Borrando…");
      try {
        await DB.nuke();
        showToast("Base de datos vaciada correctamente. Reinicia la página para comenzar desde cero.", {
          variant: "success",
          timeout: 6000,
        });
        await rebuildKnowledge();
        await handleDrawsMutated();
      } catch (err) {
        console.error("nuke error", err);
        showToast(`Error al intentar limpiar la base: ${err.message}`, { variant: "danger" });
      } finally {
        release();
      }
    });

    // ══════════════════════════════════════════════════════════════
    //  HISTORIAL PEGA3 EN MANTENIMIENTO
    // ══════════════════════════════════════════════════════════════
    (function initMaintPega3Hist() {
      const btnLoad  = document.getElementById("maint-pega3-load");
      const searchEl = document.getElementById("maint-pega3-search");
      const outEl    = document.getElementById("maint-pega3-out");
      if (!btnLoad || !outEl) return;

      const TURN_ORDER = ["11AM", "12PM", "3PM", "6PM", "9PM"];

      function buildTable(draws) {
        if (!draws.length) return "<p class='hint'>No hay sorteos Pega3 registrados.</p>";

        // Agrupar por año
        const byYear = {};
        draws.forEach(d => {
          const y = (d.fecha || "").slice(0, 4) || "Sin fecha";
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(d);
        });

        const years = Object.keys(byYear).sort((a, b) => b - a);
        return years.map(year => {
          const rows = byYear[year]
            .slice()
            .sort((a, b) => {
              if (b.fecha !== a.fecha) return b.fecha > a.fecha ? 1 : -1;
              return TURN_ORDER.indexOf(a.horario) - TURN_ORDER.indexOf(b.horario);
            })
            .map(d => {
              const pares = (d.pares || []).map(p => String(p).padStart(2, "0")).join(" – ");
              return `<tr>
                <td>${d.fecha || "—"}</td>
                <td>${d.horario || "—"}</td>
                <td>${d.pais || "HN"}</td>
                <td class="maint-p3-pares">${pares}</td>
              </tr>`;
            }).join("");

          return `
            <details class="maint-p3-year" open>
              <summary class="maint-p3-year__head">
                <span>${year}</span>
                <span class="maint-p3-year__count">${byYear[year].length} sorteo${byYear[year].length !== 1 ? "s" : ""}</span>
              </summary>
              <table class="maint-p3-table">
                <thead><tr><th>Fecha</th><th>Turno</th><th>País</th><th>Pares</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </details>`;
        }).join("");
      }

      async function load() {
        outEl.innerHTML = "<p class='hint'>Cargando…</p>";
        try {
          let draws = await DB.listPega3Draws();
          const q = (searchEl.value || "").trim().toLowerCase();
          if (q) draws = draws.filter(d =>
            (d.fecha || "").includes(q) ||
            (d.horario || "").toLowerCase().includes(q) ||
            (d.pais || "").toLowerCase().includes(q) ||
            (d.pares || []).some(p => String(p).padStart(2, "0").includes(q))
          );
          outEl.innerHTML = buildTable(draws);
        } catch (e) {
          outEl.innerHTML = `<p class='hint'>Error al cargar: ${escapeHtml(e.message)}</p>`;
        }
      }

      btnLoad.addEventListener("click", load);
      searchEl.addEventListener("keydown", e => { if (e.key === "Enter") load(); });
    })();

    // ══════════════════════════════════════════════════════════════
    //  CALCULADORA DE APUESTAS
    // ══════════════════════════════════════════════════════════════
    let _calcInited = false;
    function initCalc() {
      if (_calcInited) return;
      _calcInited = true;

      const PAGO_POR_5 = 300;   // cada 5L apostados pagan 300L
      const UNIDAD     = 5;

      const selTipo    = document.getElementById("calc-tipo");
      const selLinea   = document.getElementById("calc-linea");
      const inpMonto   = document.getElementById("calc-monto");
      const inpDias    = document.getElementById("calc-dias");
      const btnCalc    = document.getElementById("calc-btn");
      const divResult  = document.getElementById("calc-result");
      const fieldLinea = document.getElementById("calc-field-linea");
      const fieldCust  = document.getElementById("calc-field-custom");
      const inpCustom  = document.getElementById("calc-custom-count");

      // Botones rápidos de monto
      document.querySelectorAll(".calc-amt-btn").forEach(btn => {
        btn.onclick = () => {
          inpMonto.value = btn.dataset.val;
          document.querySelectorAll(".calc-amt-btn").forEach(b => b.classList.remove("calc-amt-btn--active"));
          btn.classList.add("calc-amt-btn--active");
        };
      });

      // Tipo de jugada cambia campos visibles
      selTipo.onchange = () => {
        const t = selTipo.value;
        fieldLinea.classList.toggle("hidden", t !== "linea");
        fieldCust.classList.toggle("hidden",  t !== "custom");
      };

      btnCalc.onclick = () => {
        const tipo   = selTipo.value;
        const monto  = Math.max(UNIDAD, Math.round(parseFloat(inpMonto.value) / UNIDAD) * UNIDAD);
        const dias   = Math.max(1, parseInt(inpDias.value));
        const nNums  = tipo === "linea" ? 10 : tipo === "numero" ? 1 : Math.max(1, parseInt(inpCustom.value));
        const decena = parseInt(selLinea.value);

        inpMonto.value = monto; // normalizar a múltiplo de 5

        // Pago si cae UN número apostado
        const pagoUnitario = (monto / UNIDAD) * PAGO_POR_5;
        // Inversión diaria total
        const inversionDia = monto * nNums;

        // Filas de escenario por día
        let filasGanancia = "";
        let breakEvenDia  = null;
        for (let d = 1; d <= dias; d++) {
          const gastado = inversionDia * d;
          const neto    = pagoUnitario - gastado;
          if (breakEvenDia === null && neto < 0) breakEvenDia = d;
          const cls  = neto >= 0 ? "calc-row--win" : "calc-row--lose";
          const sign = neto >= 0 ? "+" : "";
          filasGanancia += `
            <div class="calc-row ${cls}">
              <span class="calc-row__dia">Día ${d}</span>
              <span class="calc-row__gasto">Invertido: <strong>L ${gastado.toLocaleString()}</strong></span>
              <span class="calc-row__pago">Cobras: <strong>L ${pagoUnitario.toLocaleString()}</strong></span>
              <span class="calc-row__neto ${neto>=0?"calc-neto--win":"calc-neto--lose"}">${sign}L ${neto.toLocaleString()}</span>
            </div>`;
        }

        // Escenario: no cae ninguno en todos los días
        const perdidaTotal = inversionDia * dias;

        // Tabla comparativa de montos
        const montosComp = [5, 10, 20, 50].filter(m => m !== monto);
        montosComp.unshift(monto);
        let filasComp = montosComp.map(m => {
          const p  = (m / UNIDAD) * PAGO_POR_5;
          const inv = m * nNums;
          const be  = Math.ceil(p / inv);
          return `<tr class="${m===monto?"calc-comp--active":""}">
            <td>L ${m} c/u</td>
            <td>L ${inv.toLocaleString()}/día</td>
            <td>L ${p.toLocaleString()}</td>
            <td>${be} día${be===1?"":"s"}</td>
          </tr>`;
        }).join("");

        const descripcion = tipo === "linea"
          ? `línea del ${decena}0 al ${decena}9 (${nNums} números)`
          : tipo === "numero" ? "número individual"
          : `${nNums} números personalizados`;

        divResult.innerHTML = `
          <div class="calc-summary">
            <div class="calc-summary__item">
              <span class="calc-summary__lbl">Jugada</span>
              <span class="calc-summary__val">${descripcion}</span>
            </div>
            <div class="calc-summary__item">
              <span class="calc-summary__lbl">Apuesta por número</span>
              <span class="calc-summary__val">L ${monto}</span>
            </div>
            <div class="calc-summary__item">
              <span class="calc-summary__lbl">Inversión diaria</span>
              <span class="calc-summary__val">L ${inversionDia.toLocaleString()}</span>
            </div>
            <div class="calc-summary__item">
              <span class="calc-summary__lbl">Premio si cae</span>
              <span class="calc-summary__val calc-summary__val--win">L ${pagoUnitario.toLocaleString()}</span>
            </div>
          </div>

          <h3 class="calc-section-title">📅 ¿En qué día cae? — Ganancia neta</h3>
          <p class="calc-hint-txt">Verde = ganancia, rojo = pérdida neta después de lo invertido hasta ese día.</p>
          <div class="calc-rows">${filasGanancia}</div>

          <div class="calc-alert ${breakEvenDia ? "calc-alert--warn" : "calc-alert--info"}">
            ${breakEvenDia
              ? `⚠ A partir del <strong>día ${breakEvenDia}</strong> lo que llevas invertido supera el premio. Si no cae antes de ese día, ya estás en pérdida aunque caiga.`
              : `✅ En los ${dias} días calculados, el premio siempre supera la inversión acumulada.`}
          </div>

          <div class="calc-loss-box">
            <span class="calc-loss__lbl">Si no cae ninguno en ${dias} día${dias===1?"":"s"}:</span>
            <span class="calc-loss__val">−L ${perdidaTotal.toLocaleString()}</span>
          </div>

          <h3 class="calc-section-title">⚖ Comparar montos — misma jugada (${nNums} número${nNums===1?"":"s"})</h3>
          <table class="calc-comp-table">
            <thead><tr><th>Por número</th><th>Inv./día</th><th>Premio</th><th>Break-even</th></tr></thead>
            <tbody>${filasComp}</tbody>
          </table>
          <p class="calc-hint-txt">Break-even = día desde el que la inversión acumulada supera el premio.</p>
        `;
        divResult.classList.remove("hidden");
      };
    }
