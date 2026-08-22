/**
 * views/superpremio.js — Panel de Super Premios (calendario + análisis)
 *
 * Extraído de app.js. invalidatePulso se inyecta con configurarSuperPremio()
 * para desacoplar del panel Pulso.
 */

import { DB } from "../storage.js";
import { GUIA } from "../loader.js";
import { showToast } from "../ui/toast.js";

const hooks = {};
export function configurarSuperPremio(callbacks = {}) {
  Object.assign(hooks, callbacks);
}

    // ── SUPER PREMIOS ─────────────────────────────────────────────────────────────

    const SP_SCOPE = "super_premios";
    const SP_RECOVERY_DAYS = 14;
    const SP_PRE_EVENTO_DAYS = 3;
    const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    function spKey(fecha) { return `sp:${fecha}`; }

    async function saveSpToDb(fecha) {
      return DB.saveKnowledge([{ key: spKey(fecha), scope: SP_SCOPE, data: { fecha }, updatedAt: Date.now() }]);
    }
    async function deleteSpFromDb(fecha) {
      return DB.deleteKnowledgeByKey(spKey(fecha));
    }
    async function listSpFromDb() {
      const rows = await DB.getKnowledgeByScope(SP_SCOPE);
      return rows.map(r => r.data?.fecha).filter(Boolean).sort();
    }

    /** Genera todas las fechas miércoles(3) y sábado(6) entre fromYear y toYear inclusive.
     *  Retorna: { year: { month(0-11): ["YYYY-MM-DD", ...] } }
     */
    function generateWedSatDates(fromYear, toYear) {
      const result = {};
      const d = new Date(fromYear, 0, 1);
      const end = new Date(toYear, 11, 31);
      while (d <= end) {
        const dow = d.getDay();
        if (dow === 3 || dow === 6) {
          const y = d.getFullYear();
          const m = d.getMonth();
          if (!result[y]) result[y] = {};
          if (!result[y][m]) result[y][m] = [];
          // Usar fecha local, NO toISOString (que convierte a UTC y desfasa el día)
          const mm = String(m + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          result[y][m].push(`${y}-${mm}-${dd}`);
        }
        d.setDate(d.getDate() + 1);
      }
      return result;
    }

    /** Returns recovery mode status based on marked super premios */
    function detectarModoRecuperacion(spFechas) {
      if (!spFechas.length) return { activo: false, diasRestantes: 0, ultimoEvento: null };
      const ultima = [...spFechas].sort().pop();
      const dias = Math.round((Date.now() - new Date(ultima).getTime()) / 86_400_000);
      return {
        activo: dias <= SP_RECOVERY_DAYS,
        diasRestantes: Math.max(0, SP_RECOVERY_DAYS - dias),
        diasTranscurridos: dias,
        ultimoEvento: ultima,
      };
    }

    /** Numbers that appeared in the 3-7 days BEFORE the super premio (window of 5 days).
     *  These are candidates for "the operator was hiding them" — pre-event boost.
     *  Returns [{numero, veces}] sorted by frequency descending. */
    function detectarNumerosPreEvento(spFecha, draws) {
      const [fy, fm, fd] = spFecha.split("-").map(Number);
      const spTime = new Date(fy, fm - 1, fd).getTime();
      const startTime = spTime - 7 * 86_400_000; // 7 días antes
      const endTime   = spTime - 3 * 86_400_000; // 3 días antes (no contar los más cercanos)
      const sd = new Date(startTime);
      const ed = new Date(endTime);
      const startDate = `${sd.getFullYear()}-${String(sd.getMonth()+1).padStart(2,"0")}-${String(sd.getDate()).padStart(2,"0")}`;
      const endDate   = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,"0")}-${String(ed.getDate()).padStart(2,"0")}`;
      const preDraws = draws.filter(d => d.fecha >= startDate && d.fecha <= endDate);
      const counts = {};
      preDraws.forEach(d => { const n = Number(d.numero); counts[n] = (counts[n] || 0) + 1; });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([n, veces]) => ({ numero: Number(n), veces: Number(veces) }));
    }

    /** Numbers that have appeared 2+ times in draws since the super premio date (within recovery window).
     *  Returns [{numero, veces}] sorted by frequency descending. */
    function detectarNumerosRepetidosPostEvento(spFecha, draws) {
      const [fy, fm, fd] = spFecha.split("-").map(Number);
      const spTime = new Date(fy, fm - 1, fd).getTime();
      const endTime = spTime + SP_RECOVERY_DAYS * 86_400_000;
      const ed = new Date(endTime);
      const endDate = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,"0")}-${String(ed.getDate()).padStart(2,"0")}`;
      const postDraws = draws.filter(d => d.fecha > spFecha && d.fecha <= endDate);
      const counts = {};
      postDraws.forEach(d => { const n = Number(d.numero); counts[n] = (counts[n] || 0) + 1; });
      return Object.entries(counts)
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([n, veces]) => ({ numero: Number(n), veces: Number(veces) }));
    }

    /** Analyze what repeated in the SP_RECOVERY_DAYS days after a super premio date */
    function analizarPostEvento(spFecha, draws) {
      const [fy, fm, fd] = spFecha.split("-").map(Number);
      const spTime = new Date(fy, fm - 1, fd).getTime();
      const endTime = spTime + SP_RECOVERY_DAYS * 86_400_000;
      const ed = new Date(endTime);
      const endDate = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,"0")}-${String(ed.getDate()).padStart(2,"0")}`;
      const postDraws = draws.filter(d => d.fecha > spFecha && d.fecha <= endDate);
      const repetidos = detectarNumerosRepetidosPostEvento(spFecha, draws);
      return {
        fecha: spFecha,
        repetidos,                          // [{numero, veces}]
        totalPostSorteos: postDraws.length,
      };
    }

    let _spMarkedSet = new Set(); // cache local de fechas marcadas
    let _spCalendar = null;       // cache del calendario generado
    let _spActiveYear = null;

    async function renderSuperPremioPanel() {
      const tabsEl = document.getElementById("sp-year-tabs");
      const monthsEl = document.getElementById("sp-months");
      const analysisEl = document.getElementById("sp-analysis-panel");
      const badgeEl = document.getElementById("sp-modo-badge");
      if (!tabsEl || !monthsEl) return;

      // Load marked dates
      const spFechas = await listSpFromDb();
      _spMarkedSet = new Set(spFechas);

      // Generate calendar if not cached
      if (!_spCalendar) {
        const currentYear = new Date().getFullYear();
        _spCalendar = generateWedSatDates(2015, currentYear);
      }

      // Recovery mode badge
      const rec = detectarModoRecuperacion(spFechas);
      if (badgeEl) {
        badgeEl.className = `sp-modo-badge sp-modo-badge--${rec.activo ? "on" : "off"}`;
        badgeEl.textContent = rec.activo
          ? `🔴 Modo recuperación activo — ${rec.diasRestantes} días restantes`
          : "⚪ Modo recuperación inactivo";
      }

      // Year tabs
      const years = Object.keys(_spCalendar).map(Number).sort((a, b) => b - a); // newest first
      if (!_spActiveYear || !_spCalendar[_spActiveYear]) _spActiveYear = years[0];

      tabsEl.innerHTML = years.map(y => {
        const countYear = Object.values(_spCalendar[y] || {}).flat().filter(f => _spMarkedSet.has(f)).length;
        return `<button class="sp-year-btn${y === _spActiveYear ? " sp-year-btn--active" : ""}" data-year="${y}">
          ${y}${countYear ? `<span class="sp-year-count">${countYear}</span>` : ""}
        </button>`;
      }).join("");

      tabsEl.querySelectorAll(".sp-year-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          _spActiveYear = parseInt(btn.dataset.year, 10);
          renderSpYear(monthsEl);
          // update active tab style
          tabsEl.querySelectorAll(".sp-year-btn").forEach(b => b.classList.toggle("sp-year-btn--active", parseInt(b.dataset.year,10) === _spActiveYear));
        });
      });

      renderSpYear(monthsEl);

      // Analysis panel
      if (analysisEl && spFechas.length && drawsCache?.length) {
        const hist = drawsCache.filter(d => !d.isTest);
        const analyses = spFechas.map(f => analizarPostEvento(f, hist)).filter(a => a.totalPostSorteos > 0);
        if (analyses.length) {
          // Aggregate: cuántas veces repitió cada número en todas las ventanas post-pago
          const repFreq = {};
          analyses.forEach(a => a.repetidos.forEach(({ numero, veces }) => {
            repFreq[numero] = (repFreq[numero] || 0) + veces;
          }));
          const topReps = Object.entries(repFreq).sort((a,b) => b[1]-a[1]).slice(0, 10);
          // Si hay modo recuperación activo, mostrar los que están repitiendo AHORA
          const currentReps = rec.activo && rec.ultimoEvento
            ? detectarNumerosRepetidosPostEvento(rec.ultimoEvento, hist)
            : [];
          analysisEl.innerHTML = `
            <div class="sp-analysis-box">
              <div class="sp-analysis-head">Análisis histórico — ${analyses.length} super premios registrados</div>
              ${topReps.length ? `
              <div class="sp-analysis-stat" style="margin-top:6px">Números que más repiten en los 14 días post-pago:</div>
              <div class="sp-analysis-chips">
                ${topReps.map(([n, c]) => {
                  const pad = String(n).padStart(2,"0");
                  const sim = GUIA?.[pad]?.simbolo || "";
                  return `<span class="sp-rep-chip">${pad} <small>${sim}</small> <em>${c}×</em></span>`;
                }).join("")}
              </div>` : ""}
              ${rec.activo ? `
              <div class="sp-analysis-stat sp-analysis-stat--warning" style="margin-top:10px">
                ⚠️ Modo recuperación activo. Último pago: <strong>${rec.ultimoEvento}</strong> (hace ${rec.diasTranscurridos} días · ${rec.diasRestantes}d restantes).
              </div>
              ${currentReps.length ? `
              <div class="sp-analysis-stat" style="margin-top:6px">Repitiendo desde ese pago:</div>
              <div class="sp-analysis-chips">
                ${currentReps.map(({ numero, veces }) => {
                  const pad = String(numero).padStart(2,"0");
                  const sim = GUIA?.[pad]?.simbolo || "";
                  return `<span class="sp-rep-chip sp-rep-chip--active">${pad} <small>${sim}</small> <em>${veces}×</em></span>`;
                }).join("")}
              </div>` : `<div class="sp-analysis-stat" style="margin-top:6px;color:var(--color-muted)">Aún no hay repeticiones desde ese pago.</div>`}
              ` : ""}
            </div>
          `;
        } else {
          analysisEl.innerHTML = "";
        }
      } else if (analysisEl) {
        analysisEl.innerHTML = "";
      }
    }

    function renderSpYear(monthsEl) {
      if (!_spCalendar || !_spActiveYear) return;
      const months = _spCalendar[_spActiveYear] || {};
      const sortedMonths = Object.keys(months).map(Number).sort((a,b) => a-b);

      monthsEl.innerHTML = sortedMonths.map(m => {
        const dates = months[m] || [];
        const markedCount = dates.filter(f => _spMarkedSet.has(f)).length;
        const chipsHtml = dates.map(fecha => {
          const day = parseInt(fecha.slice(8), 10);
          // Parsear en local para evitar desfase UTC
          const [fy, fm, fd] = fecha.split("-").map(Number);
          const dow = new Date(fy, fm - 1, fd).getDay();
          const isSat = dow === 6;
          const isMarked = _spMarkedSet.has(fecha);
          return `<button class="sp-date-chip${isSat ? " sp-date-chip--sat" : " sp-date-chip--wed"}${isMarked ? " sp-date-chip--marked" : ""}"
            data-fecha="${fecha}" title="${fecha}">
            <span class="sp-chip-dow">${isSat ? "sáb" : "mié"}</span>
            <span class="sp-chip-day">${day}</span>
          </button>`;
        }).join("");
        return `<div class="sp-month-row">
          <div class="sp-month-label">${MONTHS_ES[m]}<span class="sp-month-count">${markedCount ? markedCount + " ✓" : ""}</span></div>
          <div class="sp-month-chips">${chipsHtml}</div>
        </div>`;
      }).join("");

      monthsEl.querySelectorAll(".sp-date-chip").forEach(chip => {
        chip.addEventListener("click", async () => {
          const fecha = chip.dataset.fecha;
          const wasMarked = _spMarkedSet.has(fecha);
          if (wasMarked) {
            _spMarkedSet.delete(fecha);
            chip.classList.remove("sp-date-chip--marked");
            try {
              await deleteSpFromDb(fecha);
            } catch {
              _spMarkedSet.add(fecha);
              chip.classList.add("sp-date-chip--marked");
              showToast("Error al eliminar fecha del SP", { variant: "danger" });
            }
          } else {
            _spMarkedSet.add(fecha);
            chip.classList.add("sp-date-chip--marked");
            try {
              await saveSpToDb(fecha);
            } catch {
              _spMarkedSet.delete(fecha);
              chip.classList.remove("sp-date-chip--marked");
              showToast("Error al guardar fecha del SP", { variant: "danger" });
            }
          }
          // Update month count
          const row = chip.closest(".sp-month-row");
          const countEl = row?.querySelector(".sp-month-count");
          if (countEl) {
            const monthDates = row.querySelectorAll(".sp-date-chip");
            const cnt = [...monthDates].filter(c => c.classList.contains("sp-date-chip--marked")).length;
            countEl.textContent = cnt ? cnt + " ✓" : "";
          }
          // Update year tab count
          const allMarked = monthsEl.querySelectorAll(".sp-date-chip--marked").length;
          const activeTab = document.querySelector(`.sp-year-btn[data-year="${_spActiveYear}"]`);
          if (activeTab) {
            let countSpan = activeTab.querySelector(".sp-year-count");
            if (allMarked) {
              if (!countSpan) { countSpan = document.createElement("span"); countSpan.className = "sp-year-count"; activeTab.appendChild(countSpan); }
              countSpan.textContent = allMarked;
            } else if (countSpan) countSpan.remove();
          }
          // Refresh analysis and badge
          const spFechas = [..._spMarkedSet].sort();
          const rec = detectarModoRecuperacion(spFechas);
          const badgeEl = document.getElementById("sp-modo-badge");
          if (badgeEl) {
            badgeEl.className = `sp-modo-badge sp-modo-badge--${rec.activo ? "on" : "off"}`;
            badgeEl.textContent = rec.activo
              ? `🔴 Modo recuperación activo — ${rec.diasRestantes} días restantes`
              : "⚪ Modo recuperación inactivo";
          }
          hooks.invalidatePulso?.();
        });
      });
    }

export { renderSuperPremioPanel };
