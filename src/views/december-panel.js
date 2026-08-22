/**
 * views/december-panel.js — Panel de estrategia de Diciembre (vestigial)
 *
 * Extraído de app.js. Los elementos DOM (december-*) no existen hoy en
 * index.html, por lo que el panel queda inerte hasta que se restablezca
 * el marcado. Dependencias de app.js inyectadas vía initDecemberPanel().
 */

import { DB } from "../storage.js";
import { computeDecemberStrategy } from "../december-strategy.js";
import { logWarn } from "../logger.js";
import { showToast } from "../ui/toast.js";
import {
  DAY_MS,
  parseISODate,
  formatFriendlyDate,
  formatNumber,
  getSymbol,
  formatWindowRange,
} from "../ui/format.js";

let hooks = {};
export function initDecemberPanel(options = {}) {
  hooks = {
    preferencias: options.preferencias ?? (() => ({})),
    encolarGuardado: options.encolarGuardado ?? (() => {}),
    obtenerSorteos: options.obtenerSorteos ?? (async () => []),
    horarioKeys: options.horarioKeys ?? [],
  };
  decemberReminderStore = loadDecemberReminderStore();
}

    let decemberStrategyData = null;
    let decemberSelectedYear = null;
    let decemberSelectedNumero = null;
    let decemberReminderStore = {};

const DECEMBER_REMINDER_KEY = "ld-v3-december-reminders";

    function loadDecemberReminderStore() {
      if (hooks.preferencias?.()?.decemberReminders && typeof hooks.preferencias?.()?.decemberReminders === "object") {
        return { ...hooks.preferencias?.()?.decemberReminders };
      }
      if (typeof window === "undefined" || typeof window.localStorage === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(DECEMBER_REMINDER_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (err) {
        logWarn("No se pudieron cargar recordatorios de diciembre", err);
        return {};
      }
    }

    function saveDecemberReminderStore(store) {
      const isEmpty = !store || !Object.keys(store).length;
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        try {
          if (isEmpty) {
            window.localStorage.removeItem(DECEMBER_REMINDER_KEY);
          } else {
            window.localStorage.setItem(DECEMBER_REMINDER_KEY, JSON.stringify(store));
          }
        } catch (err) {
          logWarn("No se pudieron guardar recordatorios de diciembre", err);
        }
      }
      hooks.encolarGuardado?.({ decemberReminders: isEmpty ? {} : store });
    }

    const describeDecemberTurns = (turnHints = []) => {
      if (!Array.isArray(turnHints) || !turnHints.length) return "";
      const [first] = turnHints;
      if (!first?.pair) return "";
      const label = first.pair.replace("->", " → ");
      const parts = [];
      if (first.count) {
        parts.push(`${first.count} ${first.count === 1 ? "evento" : "eventos"}`);
      }
      if (first.weight) {
        parts.push(`${Math.round(first.weight * 100)}%`);
      }
      if (!parts.length) return label;
      return `${label} · ${parts.join(" · ")}`;
    };

    const describeWatcherStatus = (watcher) => {
      if (!watcher) {
        return {
          label: "Seguimiento",
          message: "Sin datos suficientes.",
        };
      }
      const windowRange = watcher.activeWindow ? formatWindowRange(watcher.activeWindow.windowStart, watcher.activeWindow.windowEnd) : null;
      const gapLabel = watcher.activeWindow?.gap ? `+${watcher.activeWindow.gap} días` : "";
      const hitInfo = watcher.activeWindow?.hit;
      switch (watcher.status) {
        case "due":
          return {
            label: "Ventana activa",
            message: `Esperando repetición entre ${windowRange || "la ventana estimada"} (${gapLabel}).`,
            detail: hitInfo ? `Último impacto: ${formatFriendlyDate(hitInfo.fecha)} ${hitInfo.horario || ""}` : "",
          };
        case "tracking":
          return {
            label: "Escucha temprana",
            message: `La ventana abre el ${windowRange || "próximamente"} (${gapLabel}).`,
            detail: "Prepara tus jugadas antes de que se activen los turnos frecuentes.",
          };
        case "hit":
        case "completed":
          return {
            label: watcher.status === "hit" ? "Confirmado" : "Ciclo cerrado",
            message: hitInfo
              ? `Reapareció el ${formatFriendlyDate(hitInfo.fecha)} en ${hitInfo.horario || "—"}.`
              : "Repetición confirmada este año.",
            detail: "Revisa si suele encadenar otra aparición después de este punto.",
          };
        case "missed":
          return {
            label: "Ventana perdida",
            message: `No se presentó en la ventana ${windowRange || ""}.`,
            detail: "Observa si abre un nuevo ciclo antes de cerrar el mes.",
          };
        case "origin":
        default:
          return {
            label: "Nuevo en diciembre",
            message: "Aún sin repetición. Sigue la línea para detectar el primer regreso.",
            detail: "",
          };
      }
    };

    const WATCH_TURN_LABELS = {
      "11AM": "11 AM",
      "3PM": "3 PM",
      "9PM": "9 PM",
    };
    const MAX_WATCH_SCHEDULE_DAYS = 7;
    const formatWatchDayLabel = (date) => {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const dowLabel = DOW_FULL_LABEL[date.getDay()] || "";
      const shortDow = dowLabel ? `${dowLabel.slice(0, 3)}.` : "";
      const day = String(date.getDate()).padStart(2, "0");
      const month = MONTH_ABBR[date.getMonth()] || "";
      return `${shortDow ? `${shortDow} ` : ""}${day} ${month}`.trim();
    };
    const getWatcherHighlightTurns = (watcher) => {
      const highlights = new Set();
      const turnHints = watcher?.activeWindow?.turnHints || [];
      turnHints.forEach((hint) => {
        if (!hint?.pair) return;
        const [, toTurn] = hint.pair.split("->");
        const normalized = (toTurn || "").trim();
        if (normalized && hooks.horarioKeys.includes(normalized)) {
          highlights.add(normalized);
        }
      });
      const hitTurn = watcher?.activeWindow?.hit?.horario;
      if (hitTurn && hooks.horarioKeys.includes(hitTurn)) {
        highlights.add(hitTurn);
      }
      return highlights;
    };
    const buildWatcherSchedule = (watcher) => {
      if (!watcher?.activeWindow) {
        return "<div class='december-watch__schedule'><div class='december-watch__schedule-empty'>Aún sin ventana estimada para este número.</div></div>";
      }
      const startIso = watcher.activeWindow.windowStart || watcher.activeWindow.expectedDate;
      const endIso = watcher.activeWindow.windowEnd || watcher.activeWindow.windowStart || watcher.activeWindow.expectedDate;
      const startDate = parseISODate(startIso);
      const endDate = parseISODate(endIso);
      if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime()) || !(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
        return "<div class='december-watch__schedule'><div class='december-watch__schedule-empty'>No se pudo dibujar el calendario de esta ventana.</div></div>";
      }
      const days = [];
      let cursor = new Date(startDate);
      let guard = 0;
      while (cursor.getTime() <= endDate.getTime() && guard < MAX_WATCH_SCHEDULE_DAYS) {
        days.push({
          label: formatWatchDayLabel(cursor),
        });
        cursor = new Date(cursor.getTime() + DAY_MS);
        guard += 1;
      }
      if (!days.length) {
        days.push({ label: formatWatchDayLabel(startDate) });
      }
      const highlights = getWatcherHighlightTurns(watcher);
      const dayBlocks = days
        .map((day) => `
          <div class="december-watch__day">
            <div class="december-watch__day-label">${day.label}</div>
            <div class="december-watch__turns">
              ${hooks.horarioKeys.map((turno) => {
                const activeClass = highlights.has(turno) ? "is-highlighted" : "";
                return `<span class="december-watch__turn ${activeClass}">${WATCH_TURN_LABELS[turno] || turno}</span>`;
              }).join("")}
            </div>
          </div>
        `)
        .join("");
      const toleranceText =
        Number.isFinite(watcher.activeWindow?.gap) && Number.isFinite(watcher.activeWindow?.tolerance)
          ? `+${watcher.activeWindow.gap}d · ±${watcher.activeWindow.tolerance}d`
          : "";
      const rangeLabel = formatWindowRange(startIso, endIso);
      return `
        <div class="december-watch__schedule">
          <div class="december-watch__schedule-head">
            <span>${rangeLabel && rangeLabel !== "—" ? `Ventana ${rangeLabel}` : "Ventana estimada"}</span>
            ${toleranceText ? `<span class="hint small">${toleranceText}</span>` : ""}
          </div>
          <div class="december-watch__calendar">${dayBlocks}</div>
        </div>
      `;
    };

    function syncDecemberYearOptions() {
      if (!decemberYearSelect) return;
      const years = decemberStrategyData?.years || [];
      decemberYearSelect.innerHTML = "";
      if (!years.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "—";
        decemberYearSelect.appendChild(option);
        decemberYearSelect.disabled = true;
        decemberSelectedYear = null;
        return;
      }
      decemberYearSelect.disabled = false;
      years.forEach((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = year;
        if (year === decemberSelectedYear) option.selected = true;
        decemberYearSelect.appendChild(option);
      });
      if (!decemberSelectedYear) {
        decemberSelectedYear = years[0];
        decemberYearSelect.value = years[0];
      }
    }

    function renderDecemberSummary() {
      if (!decemberSummaryEl) return;
      if (!decemberStrategyData?.summary) {
        decemberSummaryEl.innerHTML = "<span class='hint'>Registra sorteos de diciembre para iniciar el seguimiento.</span>";
        return;
      }
      const { totalNumbers = 0, totalRepeats = 0, draws = 0, yearsTracked = 0 } = decemberStrategyData.summary;
      decemberSummaryEl.innerHTML = `
        <strong>${totalNumbers}</strong> números vigilados ·
        <strong>${totalRepeats}</strong> repeticiones identificadas ·
        ${yearsTracked} año(s) analizados (${draws} sorteos de diciembre)
      `;
    }

    function renderDecemberWatchlist() {
      if (!decemberWatchlistEl) return;
      decemberWatchlistEl.innerHTML = "";
      if (!decemberStrategyData || !decemberSelectedYear) {
        decemberWatchlistEl.innerHTML = "<p class='december-empty'>Selecciona un año con datos para ver la vigilancia.</p>";
        return;
      }
      const watchers =
        decemberStrategyData.watchersByYear?.get(decemberSelectedYear) || [];
      if (!watchers.length) {
        decemberWatchlistEl.innerHTML = "<p class='december-empty'>Este año todavía no registra repeticiones en diciembre.</p>";
        return;
      }
      const selectedExists = watchers.some((watcher) => watcher.numero === decemberSelectedNumero);
      if (!selectedExists) {
        decemberSelectedNumero = watchers[0]?.numero ?? null;
      }
      watchers.forEach((watcher) => {
        const item = document.createElement("button");
        item.type = "button";
        const statusClass = watcher.status ? `december-watch--${watcher.status}` : "";
        const activeClass = watcher.numero === decemberSelectedNumero ? "december-watch--active" : "";
        item.className = `december-watch ${statusClass} ${activeClass}`.trim();
        item.dataset.decemberNum = watcher.numero;
        const badgeClass = `december-badge december-badge--${watcher.status || "origin"}`;
        const statusInfo = describeWatcherStatus(watcher);
        const badgeLabel = statusInfo.label;
        const turnHint = describeDecemberTurns(watcher.activeWindow?.turnHints);
        const scheduleMarkup = buildWatcherSchedule(watcher);
        item.innerHTML = `
          <div class="december-watch__number">
            <span>${formatNumber(watcher.numero)}</span>
            <span class="december-watch__symbol">${watcher.symbol || ""}</span>
          </div>
          <div class="december-watch__status">
            <span class="${badgeClass}">${badgeLabel}</span>
            <span class="december-status-line">${statusInfo.message}</span>
            ${statusInfo.detail ? `<small>${statusInfo.detail}</small>` : ""}
            ${turnHint ? `<small>${turnHint}</small>` : ""}
          </div>
          ${scheduleMarkup}
        `;
        decemberWatchlistEl.appendChild(item);
      });
    }

    function renderDecemberReminders() {
      if (!decemberRemindersEl) return;
      const entries = Object.values(decemberReminderStore || {}).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      if (!entries.length) {
        decemberRemindersEl.innerHTML =
          "<p class='december-empty'>Sin recordatorios activos. Puedes guardar un número desde el panel de detalle.</p>";
        return;
      }
      const head = document.createElement("div");
      head.className = "december-panel-head";
      head.innerHTML = `
        <h4>Recordatorios activos</h4>
        <p class="hint small">Se guardan localmente y en tus preferencias.</p>
      `;
      const list = document.createElement("div");
      list.className = "december-reminders__list";
      entries.forEach((item) => {
        const row = document.createElement("div");
        row.className = "december-reminder";
        row.innerHTML = `
          <div>
            <strong>${formatNumber(item.numero)}</strong> <span>${item.symbol || ""}</span>
            <div class="hint small">${item.note || ""}</div>
          </div>
        `;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Quitar";
        removeBtn.addEventListener("click", () => {
          const key = formatNumber(item.numero);
          if (decemberReminderStore[key]) {
            delete decemberReminderStore[key];
            saveDecemberReminderStore(decemberReminderStore);
            renderDecemberReminders();
            renderDecemberWatchlist();
            if (decemberSelectedNumero === item.numero) renderDecemberDetail();
          }
        });
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
      decemberRemindersEl.innerHTML = "";
      decemberRemindersEl.append(head, list);
    }

    function renderDecemberDetail() {
      if (!decemberDetailEl) return;
      decemberDetailEl.innerHTML = "";
      if (!decemberStrategyData || decemberSelectedNumero === null || decemberSelectedNumero === undefined) {
        decemberDetailEl.innerHTML = "<p class='hint'>Selecciona un número para ver su seguimiento de diciembre.</p>";
        return;
      }
      const entry = decemberStrategyData.perNumber?.get(decemberSelectedNumero);
      if (!entry) {
        decemberDetailEl.innerHTML = `<p class='hint'>El número ${formatNumber(decemberSelectedNumero)} no tiene historial de diciembre.</p>`;
        return;
      }
      const watcher =
        decemberStrategyData.watchersByYear?.get(decemberSelectedYear)?.find(
          (item) => item.numero === entry.numero
        ) || null;
      const head = document.createElement("div");
      head.className = "december-detail__head";
      head.innerHTML = `
        <div class="december-detail__number">
          <span>${formatNumber(entry.numero)}</span>
          <span>${entry.symbol || ""}</span>
        </div>
        <div class="hint">${entry.history?.length || 0} año(s) con actividad en diciembre.</div>
      `;
      const chips = document.createElement("div");
      chips.className = "december-detail__chips";
      const yearsChip = document.createElement("div");
      yearsChip.className = "december-window-chip";
      yearsChip.innerHTML = `<strong>${entry.history?.length || 0}</strong> años rastreados`;
      const repeatsChip = document.createElement("div");
      repeatsChip.className = "december-window-chip";
      repeatsChip.innerHTML = `<strong>${entry.totalRepeats || 0}</strong> repeticiones históricas`;
      chips.append(yearsChip, repeatsChip);
      const windowsWrap = document.createElement("div");
      windowsWrap.className = "december-detail__chips";
      if (entry.windows?.length) {
        entry.windows.slice(0, 3).forEach((window) => {
          const chip = document.createElement("div");
          chip.className = "december-window-chip";
          const repeatsLabel =
            window.count === 1 ? "1 repetición registrada" : `${window.count || 0} repeticiones registradas`;
          const example = window.examples?.[0];
          const exampleText =
            example && example.from?.fecha && example.to?.fecha
              ? `${formatFriendlyDate(example.from.fecha)} · ${example.from.horario || "—"} → ${formatFriendlyDate(example.to.fecha)} · ${
                  example.to.horario || "—"
                }`
              : "";
          const turnHint = window.turnHints?.length ? describeDecemberTurns(window.turnHints) : "";
          chip.innerHTML = `
            <strong>+${window.gap} días</strong>
            <div class="hint small">${repeatsLabel}</div>
            ${exampleText ? `<div class="hint">Ej: ${exampleText}</div>` : ""}
            ${
              turnHint
                ? `<div class="hint small">Horarios frecuentes: ${turnHint}</div>`
                : ""
            }
            <div class="hint small">Ventana estimada ±${window.tolerance || 0}d.</div>
          `;
          windowsWrap.appendChild(chip);
        });
      } else {
        const chip = document.createElement("div");
        chip.className = "december-window-chip";
        chip.textContent = "Sin ventanas suficientes. Espera más repeticiones.";
        windowsWrap.appendChild(chip);
      }
      const actions = document.createElement("div");
      actions.className = "december-detail__actions";
      const reminderKey = formatNumber(entry.numero);
      const reminderActive = Boolean(decemberReminderStore?.[reminderKey]);
      const reminderBtn = document.createElement("button");
      reminderBtn.type = "button";
      reminderBtn.className = reminderActive ? "btn-outline" : "btn-primary";
      reminderBtn.textContent = reminderActive ? "Quitar recordatorio" : "Guardar recordatorio";
      reminderBtn.addEventListener("click", () => {
        toggleDecemberReminder(entry, watcher);
      });
      actions.appendChild(reminderBtn);
      const sequences = document.createElement("div");
      sequences.className = "december-sequences";
      if (Array.isArray(entry.history) && entry.history.length) {
        entry.history
          .slice()
          .sort((a, b) => b.year - a.year)
          .forEach((segment) => {
            const sequence = document.createElement("div");
            sequence.className = "december-sequence";
            const yearLabel = document.createElement("div");
            yearLabel.className = "december-sequence__year";
            yearLabel.textContent = `${segment.year} · ${segment.hits.length} aparición(es)`;
            const timeline = document.createElement("div");
            timeline.className = "december-sequence__timeline";
            segment.hits.forEach((hit, index) => {
              const row = document.createElement("div");
              row.className = "december-timeline__row";
              const title = document.createElement("div");
              title.innerHTML = `<strong>${formatFriendlyDate(hit.fecha)}</strong> · ${hit.horario || ""} ${entry.symbol || ""}`;
              const meta = document.createElement("div");
              meta.className = "december-timeline__meta";
              if (index === 0) {
                meta.textContent = "Primer impacto del mes (origen).";
              } else {
                const event = segment.events?.[index - 1];
                const gap = Number.isFinite(event?.gapFromPrev) ? event.gapFromPrev : null;
                meta.textContent = gap
                  ? `Reaparece ${gap === 1 ? "al día siguiente" : `tras ${gap} días`}.`
                  : "Reaparece tras varios días.";
              }
              row.append(title, meta);
              timeline.appendChild(row);
            });
            sequence.append(yearLabel, timeline);
            sequences.appendChild(sequence);
          });
      } else {
        const empty = document.createElement("p");
        empty.className = "december-empty";
        empty.textContent = "Este número aún no registra diciembre suficientes para dibujar una secuencia.";
        sequences.appendChild(empty);
      }
      decemberDetailEl.append(head, chips, windowsWrap, actions, sequences);
      if (watcher) {
        const statusInfo = describeWatcherStatus(watcher);
        const status = document.createElement("p");
        status.className = "hint";
        const windowText = watcher.activeWindow
          ? `Ventana ${formatWindowRange(watcher.activeWindow.windowStart, watcher.activeWindow.windowEnd)} (+${watcher.activeWindow.gap || "?"}d)`
          : "";
        status.innerHTML = `<strong>${statusInfo.label}</strong> · ${statusInfo.message}${windowText ? ` · ${windowText}` : ""}${
          statusInfo.detail ? ` <br />${statusInfo.detail}` : ""
        }`;
        decemberDetailEl.appendChild(status);
      }
    }

    function toggleDecemberReminder(entry, watcher) {
      if (!entry) return;
      const key = formatNumber(entry.numero);
      if (decemberReminderStore[key]) {
        delete decemberReminderStore[key];
      } else {
        const windowInfo = watcher?.activeWindow;
        decemberReminderStore[key] = {
          numero: entry.numero,
          symbol: entry.symbol || "",
          note: windowInfo
            ? `Ventana ${formatWindowRange(windowInfo.windowStart, windowInfo.windowEnd)} (+${windowInfo.gap}d)`
            : "Seguimiento manual",
          createdAt: Date.now(),
          year: decemberSelectedYear,
          windowStart: windowInfo?.windowStart || null,
          windowEnd: windowInfo?.windowEnd || null,
        };
      }
      saveDecemberReminderStore(decemberReminderStore);
      renderDecemberReminders();
      renderDecemberWatchlist();
      renderDecemberDetail();
    }

    function handleDecemberSearch() {
      const raw = (decemberSearchInput?.value || "").trim();
      if (!raw) {
        showToast("Ingresa un número para buscar en diciembre.", { variant: "info" });
        return;
      }
      const numero = parseInt(raw, 10);
      if (!Number.isFinite(numero) || numero < 0 || numero > 99) {
        showToast("Ingresa un número válido entre 00 y 99.", { variant: "warning" });
        return;
      }
      if (!decemberStrategyData?.perNumber?.has(numero)) {
        showToast(`El número ${formatNumber(numero)} aún no aparece en diciembre.`, { variant: "info" });
        return;
      }
      const entry = decemberStrategyData.perNumber.get(numero);
      if (entry?.history?.length) {
        const latestYear = entry.history[entry.history.length - 1].year;
        if (latestYear && latestYear !== decemberSelectedYear) {
          decemberSelectedYear = latestYear;
          syncDecemberYearOptions();
        }
      }
      decemberSelectedNumero = numero;
      renderDecemberWatchlist();
      renderDecemberDetail();
    }

    async function refreshDecemberStrategyPanel({ force = false } = {}) {
      if (!decemberCard) return;
      try {
        const draws = await hooks.obtenerSorteos({ force });
        if (!draws.length) {
          decemberStrategyData = null;
          decemberSelectedYear = null;
          decemberSelectedNumero = null;
          renderDecemberSummary();
          if (decemberWatchlistEl) {
            decemberWatchlistEl.innerHTML = "<p class='december-empty'>Aún no hay sorteos de diciembre cargados.</p>";
          }
          if (decemberDetailEl) {
            decemberDetailEl.innerHTML = "<p class='hint'>Cuando se registren sorteos en diciembre verás aquí la estrategia.</p>";
          }
          renderDecemberReminders();
          return;
        }
        decemberStrategyData = computeDecemberStrategy(draws, {
          referenceDate: new Date(),
          getSymbol,
        });
        const years = decemberStrategyData?.years || [];
        if (!years.length) {
          decemberSelectedYear = null;
          decemberSelectedNumero = null;
        } else if (!decemberSelectedYear || !years.includes(decemberSelectedYear)) {
          decemberSelectedYear = years[0];
        }
        syncDecemberYearOptions();
        const activeWatchers =
          decemberStrategyData.watchersByYear?.get(decemberSelectedYear) || [];
        if (activeWatchers.length) {
          const hasSelected = activeWatchers.some((watcher) => watcher.numero === decemberSelectedNumero);
          if (!hasSelected) {
            decemberSelectedNumero = activeWatchers[0].numero;
          }
        } else {
          decemberSelectedNumero = null;
        }
        renderDecemberSummary();
        renderDecemberWatchlist();
        renderDecemberDetail();
        renderDecemberReminders();
      } catch (err) {
        console.error("december panel error", err);
        if (decemberSummaryEl) {
          decemberSummaryEl.innerHTML =
            "<span class='text-danger'>No se pudo calcular la estrategia de diciembre. Reintenta más tarde.</span>";
        }
      }
    }

    decemberWatchlistEl?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-december-num]");
      if (!item) return;
      const numero = Number(item.dataset.decemberNum);
      if (!Number.isFinite(numero)) return;
      decemberSelectedNumero = numero;
      renderDecemberWatchlist();
      renderDecemberDetail();
    });

    decemberYearSelect?.addEventListener("change", () => {
      const year = parseInt(decemberYearSelect.value, 10);
      if (!Number.isFinite(year)) return;
      decemberSelectedYear = year;
      renderDecemberWatchlist();
      renderDecemberDetail();
    });

    decemberRefreshBtn?.addEventListener("click", () => {
      refreshDecemberStrategyPanel({ force: true });
    });

    decemberSearchBtn?.addEventListener("click", handleDecemberSearch);
    decemberSearchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleDecemberSearch();
      }
    });
    decemberClearBtn?.addEventListener("click", () => {
      if (decemberSearchInput) decemberSearchInput.value = "";
      const watchers =
        decemberStrategyData?.watchersByYear?.get(decemberSelectedYear) || [];
      decemberSelectedNumero = watchers[0]?.numero ?? null;
      renderDecemberWatchlist();
      renderDecemberDetail();
    });
