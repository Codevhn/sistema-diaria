// guide-grid.js — v3.4.0
import { GUIA, getColorPolaridad } from "./loader.js";
import { DB } from "./storage.js";

const IMG_BASE = "data/img/";

function createGuideCard(num, info, { compact = false } = {}) {
  const color = getColorPolaridad(num);
  const nStr = String(num).padStart(2, "0");
  const card = document.createElement("div");
  card.className = compact ? "guide-card guide-card--compact" : "guide-card";
  card.dataset.num = nStr;
  card.style.borderColor = color;
  card.style.cursor = "pointer";
  card.title = `${nStr} ${info.simbolo || ""} — clic para ver sus relativos`;
  card.innerHTML = `
    <div class="guide-num" style="color:${color}">${nStr}</div>
    <div class="guide-sym">${info.simbolo || "—"}</div>
    <div class="guide-fam">${info.familia || "—"}</div>
    <div class="guide-img">
      <img
        src="${IMG_BASE}${nStr}.png"
        alt="${info.simbolo || nStr}"
        class="guide-img-photo"
        data-num="${nStr}"
        data-fallback-jpg="${IMG_BASE}${nStr}.jpg"
      />
    </div>
  `;
  const img = card.querySelector("img.guide-img-photo");
  img.addEventListener("error", handleImgError, { once: true });

  // Clic → fila de relativos de este número (con highlight)
  card.addEventListener("click", () => scrollToNum(nStr));

  return card;
}

function handleImgError(e) {
  const img = e.currentTarget;
  const fallback = img.dataset.fallbackJpg;
  if (fallback && img.src !== new URL(fallback, location.href).href) {
    img.removeEventListener("error", handleImgError);
    img.addEventListener("error", () => { img.style.display = "none"; }, { once: true });
    img.src = fallback;
  } else {
    img.style.display = "none";
  }
}

// ─── Tabla de relativos ────────────────────────────────────────────────────────

/**
 * Navega a un número dado: resalta su fila en la tabla de relativos
 * y su card en la guía (scroll al que esté visible primero).
 */
function scrollToNum(pad) {
  // 1. Fila en la tabla de relativos
  const relRow = document.querySelector(`.rel-row[data-num="${pad}"]`);
  if (relRow) {
    relRow.scrollIntoView({ behavior: "smooth", block: "center" });
    relRow.classList.add("rel-row--highlight");
    setTimeout(() => relRow.classList.remove("rel-row--highlight"), 1800);
    return;
  }
  // 2. Fallback: card en la guía
  const guideCard = document.querySelector(`.guide-card[data-num="${pad}"]`);
  if (guideCard) guideCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function makeNumImg(pad, simbolo, compact = false) {
  const color = getColorPolaridad(parseInt(pad, 10));
  const div = document.createElement("div");
  div.className = compact ? "rel-num-card rel-num-card--sm" : "rel-num-card";
  div.style.borderColor = color;
  div.style.cursor = "pointer";
  div.title = `${pad} ${simbolo || "—"} — clic para ir a sus relativos`;
  div.innerHTML = `
    <div class="rel-num-card__img-wrap">
      <img class="rel-num-card__img" src="${IMG_BASE}${pad}.png" alt="${pad}"
        onerror="this.src='${IMG_BASE}${pad}.jpg';this.onerror=()=>this.style.display='none'">
    </div>
    <div class="rel-num-card__num" style="color:${color}">${pad}</div>
    <div class="rel-num-card__sym">${simbolo || "—"}</div>
  `;
  div.addEventListener("click", () => scrollToNum(pad));
  return div;
}

async function renderRelativosTable() {
  const wrap = document.getElementById("guide-relativos");
  if (!wrap) return;
  wrap.innerHTML = "<p class='hint'>Cargando relativos…</p>";

  let data;
  try {
    const res = await fetch("data/relativos_diaria.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    wrap.innerHTML = `<p class='hint'>⚠ No se pudo cargar relativos_diaria.json: ${err.message}</p>`;
    return;
  }

  const pares = data?.pares;
  if (!pares || !Object.keys(pares).length) {
    wrap.innerHTML = "<p class='hint'>No hay datos de relativos.</p>";
    return;
  }

  wrap.innerHTML = "";

  // Ordenar 00–99
  const keys = Object.keys(pares).sort((a, b) => parseInt(a) - parseInt(b));

  for (const pad of keys) {
    const entry = pares[pad];
    const simbolo = GUIA?.[pad]?.simbolo || entry.simbolo || "—";

    const row = document.createElement("div");
    row.className = "rel-row";
    row.dataset.num = pad;

    // Número principal (el click ya viene de makeNumImg → scrollToNum)
    const mainCard = makeNumImg(pad, simbolo, false);
    mainCard.classList.add("rel-row__main");
    row.appendChild(mainCard);

    // Flecha
    const arrow = document.createElement("div");
    arrow.className = "rel-row__arrow";
    arrow.textContent = "→";
    row.appendChild(arrow);

    // Relativos
    const relWrap = document.createElement("div");
    relWrap.className = "rel-row__rels";

    const rels = entry.relativos || [];
    if (rels.length === 0) {
      const empty = document.createElement("span");
      empty.className = "hint";
      empty.style.fontSize = ".78rem";
      empty.textContent = "sin relativos registrados";
      relWrap.appendChild(empty);
    } else {
      rels.forEach((r) => {
        const rPad = r.pad || String(r.numero).padStart(2, "0");
        const rSim = GUIA?.[rPad]?.simbolo || r.simbolo || "—";
        const card = makeNumImg(rPad, rSim, true);
        relWrap.appendChild(card);
      });
    }

    row.appendChild(relWrap);
    wrap.appendChild(row);
  }
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

  // Tabla de relativos (independiente de GUIA — carga su propio JSON)
  renderRelativosTable();
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
