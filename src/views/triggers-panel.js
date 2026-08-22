/**
 * views/triggers-panel.js — Panel de Triggers (relaciones, stats y eventos)
 *
 * Extraído de app.js. withButtonBusy y mostrarModal se inyectan vía
 * initTriggersPanel() para desacoplar del núcleo de app.js.
 */

import {
  createRelation as createTriggerRelation,
  updateRelation as updateTriggerRelation,
  deleteRelation as deleteTriggerRelation,
  listRelations as listTriggerRelations,
  listEvents as listTriggerEvents,
  computeRelationStats as computeTriggerStats,
  seedSampleRelations as seedTriggerExamples,
} from "../triggers/triggerEngine.js";
import { showToast } from "../ui/toast.js";
import { formatNumber, normalizeNumeroKey } from "../ui/format.js";

let hooks = {};
export function initTriggersPanel(options = {}) {
  hooks = {
    botonOcupado: options.botonOcupado ?? ((btn, label) => () => {}),
    modal: options.modal ?? (async () => true),
  };
}

    const triggerRelationsList = document.getElementById("trigger-relations-list");
    const triggerStatsList = document.getElementById("trigger-stats-list");
    const triggerEventsList = document.getElementById("trigger-events-list");
    const triggerRelationForm = document.getElementById("trigger-relation-form");
    const triggerFormLegend = document.getElementById("trigger-form-legend");
    const triggerOriginInput = document.getElementById("trigger-origin");
    const triggerTargetInput = document.getElementById("trigger-target");
    const triggerTypeSelect = document.getElementById("trigger-type");
    const triggerWindowMinInput = document.getElementById("trigger-window-min");
    const triggerWindowMaxInput = document.getElementById("trigger-window-max");
    const triggerNotesInput = document.getElementById("trigger-notes");
    const triggerIsActiveInput = document.getElementById("trigger-is-active");
    const triggerFormResetBtn = document.getElementById("trigger-form-reset");
    const triggerFilterOriginInput = document.getElementById("trigger-filter-origin");
    const triggerFilterTargetInput = document.getElementById("trigger-filter-target");
    const triggerFilterTypeSelect = document.getElementById("trigger-filter-type");
    const triggerFilterActiveSelect = document.getElementById("trigger-filter-active");
    const triggerApplyFiltersBtn = document.getElementById("trigger-apply-filters");
    const triggerRefreshRelationsBtn = document.getElementById("trigger-refresh-relations");
    const triggerRefreshStatsBtn = document.getElementById("trigger-refresh-stats");
    const triggerSeedExamplesBtn = document.getElementById("trigger-seed-examples");
    const triggerEventsStatusSelect = document.getElementById("trigger-events-status");
    const triggerEventsOriginInput = document.getElementById("trigger-events-origin");
    const triggerEventsTargetInput = document.getElementById("trigger-events-target");
    const triggerEventsLimitInput = document.getElementById("trigger-events-limit");
    const triggerApplyEventFiltersBtn = document.getElementById("trigger-apply-event-filters");
    const triggerRefreshEventsBtn = document.getElementById("trigger-refresh-events");
    const triggerCloseExpiredBtn = document.getElementById("trigger-close-expired");

    let triggerRelationsCache = [];
    let triggerEditingRelationId = null;
    let triggerRelationFilters = { origin: null, target: null, relationType: "", isActive: "" };
    let triggerEventsFilters = { status: "", origin: null, target: null, limit: 60 };

    const TRIGGER_STATUS_LABELS = {
      OPEN: "Abierto",
      HIT: "Hit",
      LATE_HIT: "Late hit",
      MISS: "Miss",
    };

    function parseTriggerNumberValue(rawValue) {
      const normalized = normalizeNumeroKey(rawValue || "");
      return normalized ? parseInt(normalized, 10) : null;
    }

    function formatDateTime(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleString("es-HN", {
        dateStyle: "short",
        timeStyle: "short",
      });
    }

    function formatPercent(value) {
      if (!Number.isFinite(value)) return "0%";
      return `${(value * 100).toFixed(1)}%`;
    }

    function getTriggerRelationFilters() {
      const origin = parseTriggerNumberValue(triggerFilterOriginInput?.value);
      const target = parseTriggerNumberValue(triggerFilterTargetInput?.value);
      const relationType = (triggerFilterTypeSelect?.value || "").toUpperCase();
      const activeValue = triggerFilterActiveSelect?.value || "";
      return {
        origin,
        target,
        relationType: relationType || "",
        isActive: activeValue === "true" ? true : activeValue === "false" ? false : null,
      };
    }

    function getTriggerEventFilters() {
      const status = (triggerEventsStatusSelect?.value || "").toUpperCase();
      const origin = parseTriggerNumberValue(triggerEventsOriginInput?.value);
      const target = parseTriggerNumberValue(triggerEventsTargetInput?.value);
      const limit = parseInt(triggerEventsLimitInput?.value ?? "60", 10);
      return {
        status: status || "",
        origin,
        target,
        limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 10), 500) : 60,
      };
    }

    function resetTriggerFormState() {
      triggerEditingRelationId = null;
      if (triggerFormLegend) triggerFormLegend.textContent = "Nueva relación";
      triggerRelationForm?.reset();
      if (triggerIsActiveInput) triggerIsActiveInput.checked = true;
    }

    function fillTriggerForm(relation) {
      if (!relation) return;
      triggerEditingRelationId = relation.id;
      triggerOriginInput.value = formatNumber(relation.origin);
      triggerTargetInput.value = formatNumber(relation.target);
      triggerTypeSelect.value = relation.relationType || "DISPARA";
      triggerWindowMinInput.value = relation.windowMinDays ?? 0;
      triggerWindowMaxInput.value = relation.windowMaxDays ?? 5;
      triggerNotesInput.value = relation.notes || "";
      triggerIsActiveInput.checked = relation.isActive;
      if (triggerFormLegend) triggerFormLegend.textContent = `Editando ${formatNumber(relation.origin)}→${formatNumber(relation.target)}`;
    }

    function renderTriggerRelations(list = []) {
      if (!triggerRelationsList) return;
      if (!list.length) {
        triggerRelationsList.innerHTML = "<p class='hint'>No hay relaciones registradas con los filtros actuales.</p>";
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((relation) => {
        const row = document.createElement("div");
        row.className = "trigger-relation-row";
        row.dataset.triggerRelationId = relation.id;
        if (!relation.isActive) row.classList.add("trigger-relation-row--inactive");
        const header = document.createElement("div");
        header.className = "trigger-relation-head";
        header.innerHTML = `
          <strong>${formatNumber(relation.origin)} → ${formatNumber(relation.target)}</strong>
          <span class="trigger-chip trigger-chip--type">${relation.relationType}</span>
          <span class="trigger-chip">Ventana ${relation.windowMinDays}-${relation.windowMaxDays} días</span>
          <span class="trigger-chip ${relation.isActive ? "trigger-chip--active" : "trigger-chip--inactive"}">
            ${relation.isActive ? "Activa" : "Pausada"}
          </span>
        `;
        row.appendChild(header);
        if (relation.notes) {
          const notes = document.createElement("p");
          notes.className = "trigger-relation-notes";
          notes.textContent = relation.notes;
          row.appendChild(notes);
        }
        const actions = document.createElement("div");
        actions.className = "trigger-relation-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn-ghost btn-compact";
        editBtn.textContent = "Editar";
        editBtn.dataset.triggerEdit = relation.id;
        actions.appendChild(editBtn);
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "btn-outline btn-compact";
        toggleBtn.textContent = relation.isActive ? "Pausar" : "Activar";
        toggleBtn.dataset.triggerToggle = relation.id;
        actions.appendChild(toggleBtn);
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn-ghost btn-compact trigger-danger";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.dataset.triggerDelete = relation.id;
        actions.appendChild(deleteBtn);
        row.appendChild(actions);
        fragment.appendChild(row);
      });
      triggerRelationsList.innerHTML = "";
      triggerRelationsList.appendChild(fragment);
    }

    function renderTriggerStats(list = []) {
      if (!triggerStatsList) return;
      if (!list.length) {
        triggerStatsList.innerHTML = "<p class='hint'>Aún no hay eventos suficientes para calcular métricas.</p>";
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((stat) => {
        const item = document.createElement("div");
        item.className = "trigger-stat-row";
        item.innerHTML = `
          <div class="trigger-stat-head">
            <strong>${formatNumber(stat.origin)} → ${formatNumber(stat.target)}</strong>
            <span class="trigger-chip trigger-chip--type">${stat.relationType}</span>
            <span class="trigger-chip">${stat.totalEvents} eventos</span>
          </div>
          <div class="trigger-stat-body">
            <div>
              <span class="trigger-label">Hit rate</span>
              <strong>${formatPercent(stat.hitRate)}</strong>
            </div>
            <div>
              <span class="trigger-label">Miss</span>
              <strong>${formatPercent(stat.missRate)}</strong>
            </div>
            <div>
              <span class="trigger-label">Late hit</span>
              <strong>${formatPercent(stat.lateRate)}</strong>
            </div>
            <div>
              <span class="trigger-label">Promedio</span>
              <strong>${stat.avgLagDays ?? "—"}d</strong>
            </div>
            <div>
              <span class="trigger-label">Mediana</span>
              <strong>${stat.medianLagDays ?? "—"}d</strong>
            </div>
            <div>
              <span class="trigger-label">P80</span>
              <strong>${stat.p80LagDays ?? "—"}d</strong>
            </div>
          </div>
        `;
        fragment.appendChild(item);
      });
      triggerStatsList.innerHTML = "";
      triggerStatsList.appendChild(fragment);
    }

    function renderTriggerEvents(list = []) {
      if (!triggerEventsList) return;
      if (!list.length) {
        triggerEventsList.innerHTML = "<p class='hint'>Sin eventos que coincidan con los filtros solicitados.</p>";
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((event) => {
        const row = document.createElement("div");
        row.className = "trigger-event-row";
        row.dataset.triggerEventStatus = event.status;
        const head = document.createElement("div");
        head.className = "trigger-event-head";
        const statusLabel = TRIGGER_STATUS_LABELS[event.status] || event.status;
        head.innerHTML = `
          <strong>${formatNumber(event.origin)} → ${formatNumber(event.target)}</strong>
          <span class="trigger-chip trigger-chip--status trigger-chip--status-${event.status?.toLowerCase()}">${statusLabel}</span>
          ${
            Number.isFinite(event.lagDays)
              ? `<span class="trigger-chip">Lag ${event.lagDays}d</span>`
              : ""
          }
        `;
        row.appendChild(head);
        const meta = document.createElement("dl");
        meta.className = "trigger-event-meta";
        meta.innerHTML = `
          <div>
            <dt>Origin</dt>
            <dd>${formatDateTime(event.originTs)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>${formatDateTime(event.deadlineTs)}</dd>
          </div>
          <div>
            <dt>Cierre</dt>
            <dd>${formatDateTime(event.closedAt)}</dd>
          </div>
          <div>
            <dt>Hit</dt>
            <dd>${formatDateTime(event.hitTs)}</dd>
          </div>
        `;
        row.appendChild(meta);
        fragment.appendChild(row);
      });
      triggerEventsList.innerHTML = "";
      triggerEventsList.appendChild(fragment);
    }

    async function refreshTriggerRelationsPanel({ showSpinner = true } = {}) {
      if (!triggerRelationsList) return;
      if (showSpinner) {
        triggerRelationsList.innerHTML = "<p class='hint'>Cargando relaciones…</p>";
      }
      try {
        const filters = getTriggerRelationFilters();
        triggerRelationFilters = filters;
        if (triggerFilterOriginInput) {
          triggerFilterOriginInput.value = Number.isInteger(filters.origin)
            ? formatNumber(filters.origin)
            : (triggerFilterOriginInput.value || "").trim();
        }
        if (triggerFilterTargetInput) {
          triggerFilterTargetInput.value = Number.isInteger(filters.target)
            ? formatNumber(filters.target)
            : (triggerFilterTargetInput.value || "").trim();
        }
        const queryFilters = {
          origin: filters.origin ?? undefined,
          target: filters.target ?? undefined,
        };
        if (filters.relationType) queryFilters.relationType = filters.relationType;
        if (typeof filters.isActive === "boolean") queryFilters.isActive = filters.isActive;
        triggerRelationsCache = await listTriggerRelations(queryFilters);
        renderTriggerRelations(triggerRelationsCache);
      } catch (err) {
        console.error("trigger relations render error", err);
        triggerRelationsList.innerHTML = `<p class='hint'>No se pudieron cargar las relaciones: ${err.message}</p>`;
      }
    }

    async function refreshTriggerStatsPanel({ showSpinner = true } = {}) {
      if (!triggerStatsList) return;
      if (showSpinner) {
        triggerStatsList.innerHTML = "<p class='hint'>Calculando métricas…</p>";
      }
      try {
        const filters = triggerRelationFilters || getTriggerRelationFilters();
        const queryFilters = {
          origin: filters.origin ?? undefined,
          target: filters.target ?? undefined,
        };
        if (filters.relationType) queryFilters.relationType = filters.relationType;
        if (typeof filters.isActive === "boolean") queryFilters.isActive = filters.isActive;
        const stats = await computeTriggerStats(queryFilters);
        renderTriggerStats(stats);
      } catch (err) {
        console.error("trigger stats render error", err);
        triggerStatsList.innerHTML = `<p class='hint'>Error al calcular métricas: ${err.message}</p>`;
      }
    }

    async function refreshTriggerEventsPanel({ showSpinner = true } = {}) {
      if (!triggerEventsList) return;
      if (showSpinner) {
        triggerEventsList.innerHTML = "<p class='hint'>Buscando eventos…</p>";
      }
      try {
        const filters = getTriggerEventFilters();
        triggerEventsFilters = filters;
        if (triggerEventsLimitInput) triggerEventsLimitInput.value = filters.limit;
        if (triggerEventsOriginInput) {
          triggerEventsOriginInput.value = Number.isInteger(filters.origin)
            ? formatNumber(filters.origin)
            : (triggerEventsOriginInput.value || "").trim();
        }
        if (triggerEventsTargetInput) {
          triggerEventsTargetInput.value = Number.isInteger(filters.target)
            ? formatNumber(filters.target)
            : (triggerEventsTargetInput.value || "").trim();
        }
        const queryFilters = {
          origin: filters.origin ?? undefined,
          target: filters.target ?? undefined,
          limit: filters.limit,
        };
        if (filters.status) queryFilters.status = filters.status;
        const events = await listTriggerEvents(queryFilters);
        renderTriggerEvents(events);
      } catch (err) {
        console.error("trigger events render error", err);
        triggerEventsList.innerHTML = `<p class='hint'>No se pudieron cargar los eventos: ${err.message}</p>`;
      }
    }

    async function refreshTriggerModule({ force = false } = {}) {
      if (!document.getElementById("view-triggers")) return;
      if (!force && document.getElementById("view-triggers")?.classList.contains("hidden")) return;
      await Promise.allSettled([
        refreshTriggerRelationsPanel(),
        refreshTriggerStatsPanel(),
        refreshTriggerEventsPanel(),
      ]);
    }

    triggerRelationForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const origin = parseTriggerNumberValue(triggerOriginInput?.value);
      const target = parseTriggerNumberValue(triggerTargetInput?.value);
      if (!Number.isInteger(origin) || !Number.isInteger(target)) {
        showToast("Debes indicar un origin y disparado válidos (00–99).", { variant: "warning" });
        return;
      }
      if (triggerOriginInput) triggerOriginInput.value = formatNumber(origin);
      if (triggerTargetInput) triggerTargetInput.value = formatNumber(target);
      const windowMin = parseInt(triggerWindowMinInput?.value ?? "0", 10);
      const windowMax = parseInt(triggerWindowMaxInput?.value ?? "0", 10);
      if (windowMax < windowMin) {
        showToast("La ventana máxima debe ser mayor o igual a la mínima.", { variant: "warning" });
        return;
      }
      const payload = {
        origin,
        target,
        relationType: triggerTypeSelect?.value || "DISPARA",
        windowMinDays: Number.isFinite(windowMin) ? windowMin : 0,
        windowMaxDays: Number.isFinite(windowMax) ? windowMax : 5,
        notes: triggerNotesInput?.value || "",
        isActive: triggerIsActiveInput?.checked ?? true,
      };
      const submitBtn = triggerRelationForm.querySelector('button[type="submit"]');
      const release = hooks.botonOcupado(submitBtn, triggerEditingRelationId ? "Actualizando…" : "Guardando…");
      try {
        if (triggerEditingRelationId) {
          await updateTriggerRelation(triggerEditingRelationId, payload);
          showToast("Relación actualizada.", { variant: "success" });
        } else {
          await createTriggerRelation(payload);
          showToast("Relación creada correctamente.", { variant: "success" });
        }
        resetTriggerFormState();
        await refreshTriggerRelationsPanel({ showSpinner: false });
        await refreshTriggerStatsPanel({ showSpinner: false });
      } catch (err) {
        console.error("trigger save error", err);
        showToast(`No se pudo guardar la relación: ${err.message}`, { variant: "danger" });
      } finally {
        release();
      }
    });

    triggerFormResetBtn?.addEventListener("click", resetTriggerFormState);
    triggerApplyFiltersBtn?.addEventListener("click", () => refreshTriggerRelationsPanel());
    triggerRefreshRelationsBtn?.addEventListener("click", () => refreshTriggerRelationsPanel({ showSpinner: true }));
    triggerRefreshStatsBtn?.addEventListener("click", () => refreshTriggerStatsPanel({ showSpinner: true }));
    triggerRefreshEventsBtn?.addEventListener("click", () => refreshTriggerEventsPanel({ showSpinner: true }));
    triggerApplyEventFiltersBtn?.addEventListener("click", () => {
      const filters = getTriggerEventFilters();
      if (triggerEventsLimitInput) triggerEventsLimitInput.value = filters.limit;
      refreshTriggerEventsPanel();
    });

    triggerRelationsList?.addEventListener("click", async (event) => {
      const editBtn = event.target.closest("[data-trigger-edit]");
      if (editBtn) {
        const relation = triggerRelationsCache.find((item) => item.id === editBtn.dataset.triggerEdit);
        if (relation) fillTriggerForm(relation);
        return;
      }
      const toggleBtn = event.target.closest("[data-trigger-toggle]");
      if (toggleBtn) {
        const relation = triggerRelationsCache.find((item) => item.id === toggleBtn.dataset.triggerToggle);
        if (!relation) return;
        const release = hooks.botonOcupado(toggleBtn, relation.isActive ? "Pausando…" : "Activando…");
        try {
          await updateTriggerRelation(relation.id, { isActive: !relation.isActive });
          showToast(`Relación ${relation.isActive ? "pausada" : "activada"}.`, { variant: "info" });
          await refreshTriggerRelationsPanel({ showSpinner: false });
        } catch (err) {
          console.error("trigger toggle error", err);
          showToast(`No se pudo cambiar el estado: ${err.message}`, { variant: "danger" });
        } finally {
          release();
        }
        return;
      }
      const deleteBtn = event.target.closest("[data-trigger-delete]");
      if (deleteBtn) {
        const relation = triggerRelationsCache.find((item) => item.id === deleteBtn.dataset.triggerDelete);
        if (!relation) return;
        if (!await hooks.modal("Eliminar relación", `¿Eliminar la relación ${formatNumber(relation.origin)}→${formatNumber(relation.target)}?`, { okText: "Eliminar", okVariant: "danger" })) return;
        const release = hooks.botonOcupado(deleteBtn, "Eliminando…");
        try {
          await deleteTriggerRelation(relation.id);
          showToast("Relación eliminada.", { variant: "info" });
          if (triggerEditingRelationId === relation.id) resetTriggerFormState();
          await refreshTriggerRelationsPanel({ showSpinner: false });
          await refreshTriggerStatsPanel({ showSpinner: false });
        } catch (err) {
          console.error("trigger delete error", err);
          showToast(`No se pudo eliminar: ${err.message}`, { variant: "danger" });
        } finally {
          release();
        }
      }
    });

    triggerCloseExpiredBtn?.addEventListener("click", async () => {
      const release = hooks.botonOcupado(triggerCloseExpiredBtn, "Cerrando…");
      try {
        const closed = await closeTriggerEvents();
        if (closed) {
          showToast(`Se cerraron ${closed} evento(s) vencidos.`, { variant: "success" });
        } else {
          showToast("No había eventos vencidos.", { variant: "info" });
        }
        await refreshTriggerEventsPanel({ showSpinner: false });
        await refreshTriggerStatsPanel({ showSpinner: false });
      } catch (err) {
        console.error("close trigger events error", err);
        showToast(`No se pudieron cerrar eventos: ${err.message}`, { variant: "danger" });
      } finally {
        release();
      }
    });

    triggerSeedExamplesBtn?.addEventListener("click", async () => {
      if (!await hooks.modal("Cargar ejemplos", "¿Cargar las relaciones de ejemplo (37→47, 37→96, 44→95)?", { okText: "Cargar" })) return;
      const release = hooks.botonOcupado(triggerSeedExamplesBtn, "Sembrando…");
      try {
        const { created, message } = await seedTriggerExamples();
        if (created) {
          showToast(`Se agregaron ${created} relaciones de ejemplo.`, { variant: "success" });
        } else {
          showToast(message || "Los ejemplos ya estaban registrados.", { variant: "info" });
        }
        await refreshTriggerRelationsPanel({ showSpinner: false });
        await refreshTriggerStatsPanel({ showSpinner: false });
      } catch (err) {
        console.error("trigger seed error", err);
        showToast(`No se pudieron crear los ejemplos: ${err.message}`, { variant: "danger" });
      } finally {
        release();
      }
    });


export { closeExpiredEvents as closeTriggerEvents } from "../triggers/triggerEngine.js";
