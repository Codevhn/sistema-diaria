// guide-grid.js — v3.3.1
import { GUIA, getColorPolaridad } from "./loader.js";

export async function mostrarGuia() {
  const cont = document.getElementById("guide-grid");
  if (!cont) return;
  cont.innerHTML = "";

  if (!GUIA || !Object.keys(GUIA).length) {
    cont.innerHTML = "<p class='hint'>⚠️ Guía no cargada.</p>";
    return;
  }

  const entries = Object.entries(GUIA).sort(
    (a, b) => parseInt(a[0]) - parseInt(b[0])
  );
  for (const [num, info] of entries) {
    const color = getColorPolaridad(num);
    const nStr = String(num).padStart(2, "0");

    const card = document.createElement("div");
    card.className = "guide-card";
    card.style.borderColor = color;
    card.title = `Energía por color • Familia: ${info.familia || "—"}`;

    card.innerHTML = `
      <div class="guide-num" style="color:${color}">${nStr}</div>
      <div class="guide-sym">${info.simbolo || "—"}</div>
      <div class="guide-fam">${info.familia || "—"}</div>
      <div class="guide-img"><div class="img-placeholder">IMG</div></div>
    `;
    cont.appendChild(card);
  }
}
