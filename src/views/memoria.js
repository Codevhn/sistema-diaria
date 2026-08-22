/**
 * views/memoria.js — Tablero de Memoria y Monitor de Huecos
 *
 * Extraído de app.js. La navegación (jumpToDayView) se inyecta con
 * configurarMemoriaNav() para evitar dependencia circular con app.js.
 */

import { DB } from "../storage.js";
import {
  construirPerfilNumero,
  resumirActividadNumeros,
  construirGapSummary,
} from "../memory.js";
import { mostrarTransformaciones } from "../transform-visual.js";
import {
  DAY_MS,
  HORARIO_ORDER,
  formatNumber,
  formatFriendlyDate,
  getSymbol,
} from "../ui/format.js";

const nav = {};
export function configurarMemoriaNav(callbacks = {}) {
  Object.assign(nav, callbacks);
}

// ── Estado del tablero ──
    let memoryCachedDraws = null;
    let memorySelectedNumero = null;
    let memorySummary = [];
    let memoryGapData = [];
    let memoryGapTimer = null;
    async function getMemoryDraws({ force = false } = {}) {
      if (!memoryCachedDraws || force) {
        memoryCachedDraws = await DB.listDraws({ excludeTest: false });
      }
      return memoryCachedDraws.slice();
    }
    function invalidateMemoryCache() {
      memoryCachedDraws = null;
    }

// ── Refs DOM ──
const memoryBoardGrid = document.getElementById("memory-board-grid");
const memoryDetail = document.getElementById("memory-detail");
const memoryRefreshBtn = document.getElementById("memory-refresh");
const memoryGapGrid = document.getElementById("memory-gap-grid");
const memoryGapRefreshBtn = document.getElementById("memory-gap-refresh");
const dayPais = document.getElementById("day-pais");

    const MEMORY_RELATION_LABELS = {
      mismo: "Directo",
      invertido: "Invertido",
      "100-n": "Ajuste (100−n)",
      vecino: "Ajuste ±1",
      "mapa simple": "Mapa simple",
      "mapa compuesta": "Mapa compuesta",
    };
    const MEMORY_RELATION_VALUES = {
      mismo: (profile) => [profile.base],
      invertido: (profile) => (profile.ctx?.mirror !== null ? [profile.ctx.mirror] : []),
      "100-n": (profile) => (profile.ctx?.adjust !== null ? [profile.ctx.adjust] : []),
      vecino: (profile) => profile.ctx?.neighbors ?? [],
      "mapa simple": (profile) => profile.ctx?.simpleConversions ?? [],
      "mapa compuesta": (profile) => profile.ctx?.compositeConversions ?? [],
    };

    const formatDaysGap = (value) => {
      if (value === null || typeof value === "undefined") return "—";
      const abs = Math.abs(value);
      if (abs < 0.5) return "<1 día";
      if (abs < 2) return `${abs.toFixed(1)} días`;
      return `${Math.round(abs)} días`;
    };
    const formatGapText = (value) => formatDaysGap(value);

    /**
     * Convierte milisegundos de "hace X tiempo" a texto legible con minutos/horas/días.
     * @param {number} ms — timestamp pasado (Date.now() al momento del evento)
     */
    function formatTimeAgo(ms) {
      if (!ms) return "—";
      const diff = Date.now() - ms;
      if (diff < 0) return "ahora mismo";
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "ahora mismo";
      if (mins < 60) return `hace ${mins} min`;
      const hours = Math.floor(diff / 3600000);
      if (hours < 24) return `hace ${hours} h`;
      const days = Math.floor(diff / 86400000);
      if (days === 1) return "hace 1 día";
      return `hace ${days} días`;
    }

    const relativeDaysLabel = (value) => {
      if (value === null || typeof value === "undefined") return "Nunca";
      // value es float en días — convertir a granularidad fina
      const totalMins = Math.round(value * 24 * 60);
      if (totalMins < 2) return "Ahora mismo";
      if (totalMins < 60) return `Hace ${totalMins} min`;
      const totalHours = Math.round(value * 24);
      if (totalHours < 24) return `Hace ${totalHours} h`;
      if (value < 1.5) return "Ayer";
      if (value < 7) return `Hace ${Math.round(value)} días`;
      if (value < 30) return `Hace ${Math.round(value)} días`;
      const months = Math.round(value / 30);
      if (months < 12) return `Hace ${months} mes${months === 1 ? "" : "es"}`;
      const years = Math.round(months / 12);
      return `Hace ${years} año${years === 1 ? "" : "s"}`;
    };

    const formatShortSpan = (value) => {
      if (!Number.isFinite(value)) return "—";
      const abs = Math.abs(value);
      if (abs >= 1) return `${Math.round(abs)} d`;
      const hours = abs * 24;
      if (hours >= 1) return `${Math.round(hours)} h`;
      const minutes = Math.max(1, Math.round(hours * 60));
      return `${minutes} m`;
    };

    const getGapState = (avg, current) => {
      if (!Number.isFinite(avg) || !Number.isFinite(current) || avg <= 0) {
        return { status: "unknown", remaining: null, diff: Infinity };
      }
      const remaining = avg - current;
      const diffAbs = Math.abs(remaining);
      if (diffAbs <= 2) {
        return { status: "window", remaining, diff: diffAbs };
      }
      if (remaining > 2) {
        return { status: "waiting", remaining, diff: diffAbs };
      }
      return { status: "overdue", remaining, diff: diffAbs };
    };

    function updateGapCard(card, nowMs = Date.now()) {
      if (!card) return;
      const valueEl = card.querySelector("[data-gap-value]");
      const metaEl = card.querySelector("[data-gap-meta]");
      const avgAttr = card.dataset.avgGap;
      const lastAttr = card.dataset.lastTs;
      const avgGap = avgAttr ? Number(avgAttr) : null;
      const lastTs = lastAttr ? Number(lastAttr) : null;
      const currentDays =
        Number.isFinite(lastTs) && lastTs > 0 ? (nowMs - lastTs) / DAY_MS : null;
      const state = getGapState(avgGap, currentDays);
      card.dataset.status = state.status;

      const countdownLabel = (() => {
        if (state.status === "unknown") return "Sin historial";
        if (!Number.isFinite(avgGap) || !Number.isFinite(currentDays)) return "—";
        const remaining = avgGap - currentDays;
        if (remaining >= 0) {
          if (remaining >= 1) return `${Math.round(remaining)} día(s) restantes`;
          return `${Math.round(remaining * 24)} hora(s) restantes`;
        }
        const overdue = Math.abs(remaining);
        if (overdue >= 1) return `Atrasado ${Math.round(overdue)} día(s)`;
        return `Atrasado ${Math.round(overdue * 24)} hora(s)`;
      })();

      const formattedValue = (() => {
        if (state.status === "unknown") return "Sin historial";
        if (state.status === "window") {
          const delta = formatShortSpan(state.remaining);
          return `En ventana (${state.remaining >= 0 ? "−" : "+"}${delta})`;
        }
        if (state.status === "waiting") {
          return `Faltan ${formatShortSpan(state.remaining)}`;
        }
        return `Atrasado ${formatShortSpan(Math.abs(state.remaining))}`;
      })();
      const formattedMeta = (() => {
        const current = Number.isFinite(currentDays) ? formatShortSpan(currentDays) : "—";
        const avg = Number.isFinite(avgGap) ? formatShortSpan(avgGap) : "—";
        const lastTxt = card.dataset.lastLabel || "";
        return `Actual: ${current} · Prom: ${avg}${lastTxt ? ` · Últ: ${lastTxt}` : ""}`;
      })();
      if (valueEl) valueEl.textContent = formattedValue;
      if (metaEl) metaEl.textContent = formattedMeta;
      const countdownEl = card.querySelector("[data-gap-countdown]");
      if (countdownEl) countdownEl.textContent = countdownLabel;
    }

    function updateGapCardsTime() {
      if (!memoryGapGrid) return;
      const now = Date.now();
      memoryGapGrid.querySelectorAll("[data-gap-card='true']").forEach((card) => {
        updateGapCard(card, now);
      });
    }

    function scheduleGapTimer() {
      if (memoryGapTimer) clearInterval(memoryGapTimer);
      if (!memoryGapGrid) return;
      if (!memoryGapGrid.querySelector("[data-gap-card='true']")) return;
      memoryGapTimer = setInterval(updateGapCardsTime, 60 * 1000);
    }

    function highlightMemoryNode(numero) {
      if (!memoryBoardGrid) return;
      memoryBoardGrid.querySelectorAll(".memory-node").forEach((node) => {
        const nodeNum = parseInt(node.dataset.numero, 10);
        node.classList.toggle("active", Number.isFinite(numero) && nodeNum === numero);
      });
    }

    function renderMemoryDetailEmpty(message) {
      if (!memoryDetail) return;
      memoryDetail.innerHTML = `<p class="hint">${message}</p>`;
    }

    function buildRelationCards(profile, limitValues = 4) {
      const cards = [];
      Object.entries(MEMORY_RELATION_LABELS).forEach(([key, label]) => {
        const count = profile.relationCounts[key] || 0;
        if (!count) return;
        const resolver = MEMORY_RELATION_VALUES[key];
        const values = resolver ? resolver(profile) : [profile.base];
        const uniqueValues = Array.from(new Set(values.filter((val) => Number.isFinite(val))));
        cards.push({
          key,
          label,
          count,
          values: uniqueValues.slice(0, limitValues),
          extraValues: uniqueValues.length > limitValues ? uniqueValues.length - limitValues : 0,
        });
      });
      return cards;
    }

function buildVariantEntries(profile) {
      const variants = [];
      const ctx = profile.ctx;
      if (!ctx) return variants;
      const pushVariant = (key, label, value, extra = "") => {
        if (value === null || typeof value === "undefined") return;
        const variantKey = `${key}-${value}`;
        variants.push({
          key,
          label,
          value,
          extra,
          last: profile.variantStats[variantKey] || null,
        });
      };
      pushVariant("invertido", "Invertido", ctx.mirror);
      pushVariant("100-n", "100 − n", ctx.adjust);
      ctx.neighbors.forEach((value) => {
        const delta = ((value - ctx.base + 100) % 100) === 1 ? "+1" : "-1";
        pushVariant("vecino", `Ajuste ${delta}`, value, delta);
      });
      ctx.simpleConversions.forEach((value) => pushVariant("mapa simple", "Mapa simple", value));
      ctx.compositeConversions.forEach((value) =>
        pushVariant("mapa compuesta", "Mapa compuesta", value)
      );
      return variants;
}

    async function renderGapPanel({ forceReload = false } = {}) {
      if (!memoryGapGrid) return;
      memoryGapGrid.innerHTML = "<p class='hint'>Calculando huecos…</p>";
      if (memoryGapTimer) {
        clearInterval(memoryGapTimer);
        memoryGapTimer = null;
      }
      try {
        const draws = await getMemoryDraws({ force: forceReload });
        const summary = construirGapSummary(draws, { referenceDate: new Date() });
        memoryGapData = summary;
        const sorted = summary
          .slice()
          .sort((a, b) => {
            const stateA = getGapState(a.avgGap, a.currentGap);
            const stateB = getGapState(b.avgGap, b.currentGap);
            const priority = { window: 0, waiting: 1, overdue: 2, unknown: 3 };
            const diffPriority =
              (priority[stateA.status] ?? 3) - (priority[stateB.status] ?? 3);
            if (diffPriority !== 0) return diffPriority;
            return (stateA.diff ?? Infinity) - (stateB.diff ?? Infinity);
          });

        const hasHistory = summary.some((entry) => entry.count > 0);
        if (!hasHistory) {
          memoryGapGrid.innerHTML =
            "<p class='hint'>Aún no hay suficientes registros para calcular huecos.</p>";
          return;
        }
        const fragment = document.createDocumentFragment();
        sorted.forEach((entry) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "memory-gap-card";
          card.dataset.gapCard = "true";
          card.dataset.numero = entry.numero;
          if (Number.isFinite(entry.avgGap)) card.dataset.avgGap = String(entry.avgGap);
          else card.dataset.avgGap = "";
          if (Number.isFinite(entry.lastTimestamp))
            card.dataset.lastTs = String(entry.lastTimestamp);
          else card.dataset.lastTs = "";
          const state = getGapState(entry.avgGap, entry.currentGap);
          card.dataset.status = state.status;
          if (entry.lastFecha) {
            const lastLabel = `${formatFriendlyDate(entry.lastFecha)}${
              entry.lastHorario ? ` ${entry.lastHorario}` : ""
            }`.trim();
            card.dataset.lastLabel = lastLabel;
          } else {
            card.dataset.lastLabel = "";
          }
          const rawSymbol = getSymbol(entry.numero);
          const symbol = rawSymbol && rawSymbol.trim().length ? rawSymbol : "Sin símbolo";
          card.innerHTML = `
            <div class="memory-gap-card__head">
              <div class="memory-gap-card__identity">
                <span class="memory-gap-card__number">${formatNumber(entry.numero)}</span>
                <span class="memory-gap-card__symbol">${symbol}</span>
              </div>
              <div class="memory-gap-card__stats">
                <span class="memory-gap-card__label">Apariciones</span>
                <span class="memory-gap-card__count">${entry.count || 0}</span>
              </div>
            </div>
            <div class="memory-gap-card__value" data-gap-value>—</div>
            <div class="memory-gap-card__countdown" data-gap-countdown>—</div>
            <div class="memory-gap-card__meta" data-gap-meta>Actual: — · Promedio: —</div>
          `;
          card.addEventListener("click", () => openMemoryDetail(entry.numero));
          fragment.appendChild(card);
        });
        memoryGapGrid.innerHTML = "";
        memoryGapGrid.appendChild(fragment);
        updateGapCardsTime();
        scheduleGapTimer();
      } catch (err) {
        console.error("memory gap error", err);
        memoryGapGrid.innerHTML = "<p class='hint'>No se pudo generar el monitor de huecos.</p>";
      }
    }

    function renderMemoryDetail(profile) {
      if (!memoryDetail) return;
      if (!profile || profile.base === null) {
        renderMemoryDetailEmpty("Selecciona un número válido.");
        return;
      }
      if (!profile.timeline.length) {
        renderMemoryDetailEmpty("Aún no hay registros para este número.");
        return;
      }
      const symbol = getSymbol(profile.base);
      const lastDirect = profile.lastDirect;
      const variants = buildVariantEntries(profile);
      const relationCards = buildRelationCards(profile);
      const gapAverage = formatDaysGap(profile.gaps.average);
      const gapMax = formatDaysGap(profile.gaps.max);
      const gapCurrent = formatDaysGap(profile.gaps.current);
      const turnItems = Object.entries(profile.turnStats)
        .map(([turno, stats]) => ({
          turno,
          order: HORARIO_ORDER[turno] ?? 99,
          count: stats.count || 0,
          lastFecha: stats.lastFecha || null,
          lastPais: stats.lastPais || "",
        }))
        .sort((a, b) => a.order - b.order);
      const recentTimeline = profile.timeline.slice(-8).reverse();

      memoryDetail.innerHTML = `
        <div class="memory-detail__header">
          <div>
            <div class="memory-detail__number">${formatNumber(profile.base)}</div>
            <div class="memory-detail__symbol">${symbol || "Sin símbolo registrado"}</div>
          </div>
          <div class="memory-tag">Última vez: ${
            lastDirect
              ? `${formatFriendlyDate(lastDirect.fecha)} · ${lastDirect.horario || "—"} · hace ${formatDaysGap(profile.gaps.current)}`
              : "sin caídas directas"
          }</div>
        </div>
        <div class="memory-stats">
          <div class="memory-stat">
            <strong>${profile.totals.direct}</strong>
            <span>Apariciones</span>
          </div>
          <div class="memory-stat">
            <strong>${profile.totals.transforms}</strong>
            <span>Transformaciones</span>
          </div>
          <div class="memory-stat">
            <strong>${gapAverage}</strong>
            <span>Promedio</span>
          </div>
        </div>
        <div class="memory-stats">
          <div class="memory-stat">
            <strong>${gapMax}</strong>
            <span>Hueco máximo</span>
          </div>
          <div class="memory-stat">
            <strong>${gapCurrent}</strong>
            <span>Hueco actual</span>
          </div>
        </div>
        <div>
          <h4>Transformaciones activas</h4>
          <div class="memory-transform-grid">
            ${
              relationCards.length
                ? relationCards
                    .map(
                      (card) => `<div class="memory-transform-card">
                        <div class="memory-transform-count">${card.count}</div>
                        <div class="memory-transform-label">${card.label}</div>
                        <div class="memory-transform-values">
                          ${
                            card.values
                              .map(
                                (value) =>
                                  `<span class="memory-transform-chip">${formatNumber(value)}</span>`
                              )
                              .join("")
                          }
                          ${
                            card.extraValues
                              ? `<span class="memory-transform-chip">+${card.extraValues}</span>`
                              : ""
                          }
                        </div>
                      </div>`
                    )
                    .join("")
                : "<p class='hint'>Aún no hay conversiones registradas.</p>"
            }
          </div>
        </div>
        <div>
          <h4>Variantes rastreadas</h4>
          <div class="memory-variant-grid">
            ${
              variants.length
                ? variants
                    .map((variant) => {
                      const lastSeen = variant.last
                        ? `${formatFriendlyDate(variant.last.fecha)} · ${variant.last.horario || "—"}`
                        : "Sin registro";
                      return `<div class="memory-variant-card">
                        <strong>${formatNumber(variant.value)}</strong>
                        <div>${variant.label}</div>
                        <small>${lastSeen}</small>
                      </div>`;
                    })
                    .join("")
                : "<p class='hint'>No hay variantes configuradas para este número.</p>"
            }
          </div>
        </div>
        <div>
          <h4>Actividad por turno</h4>
          <div class="memory-turns">
            ${
              turnItems.length
                ? turnItems
                    .map(
                      (item) => `<div class="memory-turn">
                        <strong>${item.turno}</strong>
                        <div>${item.count} registro(s)</div>
                        <small>${item.lastFecha ? formatFriendlyDate(item.lastFecha) : "—"}</small>
                      </div>`
                    )
                    .join("")
                : "<p class='hint'>Sin datos por turno.</p>"
            }
          </div>
        </div>
        <div>
          <h4>Línea temporal</h4>
          <div class="memory-timeline" id="memory-timeline-list"></div>
        </div>
      `;
      const timelineContainer = memoryDetail.querySelector("#memory-timeline-list");
      if (timelineContainer) {
        if (!recentTimeline.length) {
          timelineContainer.innerHTML = "<p class='hint'>Sin registros aún.</p>";
        } else {
          recentTimeline.forEach((entry) => {
            const relText = entry.relaciones
              .map((key) => MEMORY_RELATION_LABELS[key] || key)
              .join(" · ");
            const meta = `${formatFriendlyDate(entry.fecha)} · ${entry.horario || "—"}`;
            const gapText = entry.gapToNextDays !== null
              ? `Próx. aparición después de ${formatGapText(entry.gapToNextDays)}`
              : "Último registro";
            const row = document.createElement("div");
            row.className = "memory-timeline-entry";
            row.innerHTML = `
              <div class="memory-timeline-head">
                <strong>${formatNumber(entry.numero)}</strong>
                <span class="memory-gap-badge">${gapText}</span>
              </div>
              <div>${relText || "—"}</div>
              <div class="memory-timeline-meta">${meta}</div>
            `;
            const actions = document.createElement("div");
            actions.className = "memory-timeline-actions";
            const jumpBtn = document.createElement("button");
            jumpBtn.type = "button";
            jumpBtn.className = "btn-ghost";
            jumpBtn.textContent = "Ver día";
            jumpBtn.addEventListener("click", () => {
              nav.jumpToDayView(entry.fecha, entry.pais || dayPais?.value || "HN");
            });
            actions.appendChild(jumpBtn);
            row.appendChild(actions);
            timelineContainer.appendChild(row);
          });
        }
      }
    }

    async function openMemoryDetail(numero) {
      if (!Number.isFinite(numero)) return;
      memorySelectedNumero = numero;
      highlightMemoryNode(numero);
      if (memoryDetail) {
        memoryDetail.innerHTML = "<p class='hint'>Calculando expediente…</p>";
      }
      try {
        const draws = await getMemoryDraws();
        const profile = construirPerfilNumero(draws, numero, { referenceDate: new Date() });
        renderMemoryDetail(profile);
        memoryDetail?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        console.error("memory detail error", err);
        renderMemoryDetailEmpty("No se pudo cargar el perfil de este número.");
      }
    }

    async function renderMemoryBoard({ forceReload = false } = {}) {
      if (!memoryBoardGrid) return;
      memoryBoardGrid.innerHTML = "<p class='hint'>Procesando historial…</p>";
      try {
        const draws = await getMemoryDraws({ force: forceReload });
        const summary = resumirActividadNumeros(draws, { referenceDate: new Date() });
        memorySummary = summary;
        const maxCount = summary.reduce((max, entry) => Math.max(max, entry.total), 0);
        if (!summary.length || maxCount === 0) {
          memoryBoardGrid.innerHTML =
            "<p class='hint'>Aún no hay sorteos registrados. Guarda resultados para activar esta vista.</p>";
          renderMemoryDetailEmpty("Selecciona un número para ver su bitácora.");
          return;
        }
        const fragment = document.createDocumentFragment();
        summary.forEach((entry) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "memory-node";
          btn.dataset.numero = entry.numero;
          const ratio = maxCount ? entry.total / maxCount : 0;
          btn.style.setProperty("--memory-node-intensity", Math.min(1, ratio).toFixed(2));
          if (entry.numero === memorySelectedNumero) btn.classList.add("active");
          btn.innerHTML = `
            <span class="memory-node__number">${formatNumber(entry.numero)}</span>
            <span class="memory-node__count">${entry.total || "—"}</span>
            <span class="memory-node__meta">${relativeDaysLabel(entry.daysSinceLast)}</span>
          `;
          fragment.appendChild(btn);
        });
        memoryBoardGrid.innerHTML = "";
        memoryBoardGrid.appendChild(fragment);
      } catch (err) {
        console.error("memory board error", err);
        memoryBoardGrid.innerHTML = "<p class='hint'>No se pudo generar el mapa.</p>";
      }
    }

    memoryRefreshBtn?.addEventListener("click", async () => {
      await renderMemoryBoard({ forceReload: true });
      await renderGapPanel({ forceReload: true });
      if (Number.isFinite(memorySelectedNumero)) openMemoryDetail(memorySelectedNumero);
    });

    memoryGapRefreshBtn?.addEventListener("click", async () => {
      await renderGapPanel({ forceReload: true });
    });

    memoryBoardGrid?.addEventListener("click", (event) => {
      const target = event.target.closest(".memory-node");
      if (!target) return;
      const numero = parseInt(target.dataset.numero, 10);
      if (!Number.isFinite(numero)) return;
      openMemoryDetail(numero);
    });

    await renderMemoryBoard();
    await renderGapPanel();

    const toggleTech = document.getElementById("toggle-tech");
    const memOut = document.getElementById("mem-out");
    toggleTech?.addEventListener("click", async () => {
      if (!memOut) return;
      memOut.classList.toggle("hidden");
      if (!memOut.classList.contains("hidden")) {
        const draws = await DB.listDraws({ excludeTest: false });
        memOut.textContent = JSON.stringify(draws.slice(-50), null, 2);
      }
    });

    const btnTransform = document.getElementById("t-ver");
    btnTransform?.addEventListener("click", () => {
      const raw = document.getElementById("t-numero")?.value.trim() ?? "";
      const numero = parseInt(raw, 10);
      mostrarTransformaciones(numero);
    });

async function reopenMemoryDetail() {
  if (Number.isFinite(memorySelectedNumero)) {
    await openMemoryDetail(memorySelectedNumero);
  }
}

export { invalidateMemoryCache, renderMemoryBoard, renderGapPanel, openMemoryDetail, reopenMemoryDetail };
