// guide-grid.js — v3.3.1
import { GUIA, getColorPolaridad } from "./loader.js";
import { DB } from "./storage.js";

function createGuideCard(num, info, { compact = false } = {}) {
  const color = getColorPolaridad(num);
  const nStr = String(num).padStart(2, "0");
  const card = document.createElement("div");
  card.className = compact ? "guide-card guide-card--compact" : "guide-card";
  card.style.borderColor = color;
  card.title = `Energía por color • Familia: ${info.familia || "—"}`;
  card.innerHTML = `
    <div class="guide-num" style="color:${color}">${nStr}</div>
    <div class="guide-sym">${info.simbolo || "—"}</div>
    <div class="guide-fam">${info.familia || "—"}</div>
    <div class="guide-img"><div class="img-placeholder">IMG</div></div>
  `;
  return card;
}

export async function mostrarGuia() {
  const cont = document.getElementById("guide-grid");
  const familyContainer = document.getElementById("guide-families");
  const searchInput = document.getElementById("guide-search");
  if (!cont) return;
  cont.innerHTML = "";
  if (familyContainer) familyContainer.innerHTML = "";

  if (!GUIA || !Object.keys(GUIA).length) {
    cont.innerHTML = "<p class='hint'>⚠️ Guía no cargada.</p>";
    if (familyContainer) {
      familyContainer.innerHTML = "<p class='hint'>Carga la guía para ver las familias.</p>";
    }
    return;
  }

  const entries = Object.entries(GUIA).sort(
    (a, b) => parseInt(a[0]) - parseInt(b[0])
  );
  for (const [num, info] of entries) {
    cont.appendChild(createGuideCard(num, info));
  }

  if (familyContainer) {
    const familyMap = new Map();
    for (const [num, info] of entries) {
      const family = (info.familia || "Sin familia").trim() || "Sin familia";
      if (!familyMap.has(family)) familyMap.set(family, []);
      familyMap.get(family).push([num, info]);
    }
    const fragment = document.createDocumentFragment();
    const renderFamilies = (filter = "") => {
      if (!familyContainer) return;
      familyContainer.innerHTML = "";
      const normalizedFilter = filter.trim().toLowerCase();
      Array.from(familyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
        .forEach(([family, items]) => {
          const matchesFamilyName = family.toLowerCase().includes(normalizedFilter);
          const filteredItems = normalizedFilter
            ? items.filter(([num, info]) => {
                if (matchesFamilyName) return true;
                const numStr = String(num).padStart(2, "0");
                return (
                  numStr.includes(normalizedFilter) ||
                  (info.simbolo || "").toLowerCase().includes(normalizedFilter)
                );
              })
            : items;
          if (!filteredItems.length) return;

          const wrapper = document.createElement("div");
          wrapper.className = "guide-family-card";
          wrapper.innerHTML = `
            <div class="guide-family-head">
              <strong>${family}</strong>
              <span>${filteredItems.length} número${filteredItems.length === 1 ? "" : "s"}</span>
            </div>
          `;
          const grid = document.createElement("div");
          grid.className = "guide-family-grid";
          filteredItems.forEach(([num, info]) => {
            grid.appendChild(createGuideCard(num, info, { compact: true }));
          });
          wrapper.appendChild(grid);
          familyContainer.appendChild(wrapper);
        });
      if (!familyContainer.children.length) {
        familyContainer.innerHTML = "<p class='hint'>No encontramos coincidencias con ese filtro.</p>";
      }
    };

    renderFamilies();
    renderFamilyStats();

    searchInput?.addEventListener("input", (event) => {
      renderFamilies(event.target.value || "");
    });
  }
}

async function renderFamilyStats() {
  const statsWrap = document.getElementById("guide-family-stats");
  if (!statsWrap) return;
  statsWrap.innerHTML = "<p class='hint'>Analizando actividad por familia…</p>";
  try {
    const draws = await DB.listDraws({ excludeTest: true });
    if (!draws.length) {
      statsWrap.innerHTML = "<p class='hint'>Aún no hay sorteos registrados.</p>";
      return;
    }
    const totals = new Map();
    draws.forEach((draw) => {
      const key = String(draw.numero).padStart(2, "0");
      const family = GUIA[key]?.familia || "Sin familia";
      totals.set(family, (totals.get(family) || 0) + 1);
    });
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    const totalDraws = draws.length;
    const list = document.createElement("div");
    list.className = "guide-family-stats";
    sorted.forEach(([family, count]) => {
      const pct = ((count / totalDraws) * 100).toFixed(1);
      const row = document.createElement("div");
      row.className = "guide-family-stat-row";
      row.innerHTML = `
        <div class="gfs-head">
          <strong>${family}</strong>
          <span>${count} (${pct}%)</span>
        </div>
        <div class="gfs-bar">
          <span style="width:${Math.max(4, pct)}%"></span>
        </div>
      `;
      list.appendChild(row);
    });
    statsWrap.innerHTML = "";
    statsWrap.appendChild(list);
  } catch (err) {
    console.error("family stats error", err);
    statsWrap.innerHTML = `<p class='hint'>No se pudo calcular: ${err.message}</p>`;
  }
}
