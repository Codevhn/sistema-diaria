/**
 * views/companeros-panel.js — Curación del mapa de compañeros semánticos
 *
 * Propósito (auditoría 2026-08): el hallazgo validado es que los RELATIVOS
 * oficiales (2 números por semilla) suben 1.43× en modo recuperación post-SP.
 * El mapa de CONVERSIONES SEMÁNTICAS (Carro→Llanta) está incompleto
 * (companion_map.template.json: 6/100). Este panel permite al jugador curarlo
 * gradualmente, con justificación obligatoria por entrada para evitar datos
 * inventados que contaminen el análisis.
 *
 * Almacenamiento: tabla `knowledge`, scope "companeros_mapa".
 *   key "comp:<semilla>" → { semilla, pares: [{n, nota, creado}] }
 *   key "comp:_meta"     → { completo: bool, cerradoEn }
 */

import { initToolSelect } from "../ui/tool-select.js";
import { DB } from "../storage.js";
import { GUIA } from "../loader.js";
import { formatNumber, normalizeNumeroKey } from "../ui/format.js";

const SCOPE = "companeros_mapa";

let semillaActual = null;
let mapa = {}; // semilla(number) → {pares:[{n,nota,creado}]}
let meta = { completo: false, cerradoEn: null };
let cargado = false;
let seedPicker = null;

function simboloDe(n) {
  const g = GUIA[formatNumber(n)];
  return g?.simbolo || "?";
}

async function cargar() {
  try {
    const rows = await DB.getKnowledgeByScope(SCOPE);
    mapa = {};
    for (const row of rows || []) {
      if (!row?.key?.startsWith?.("comp:")) continue;
      if (row.key === "comp:_meta") {
        meta = { completo: !!row.data?.completo, cerradoEn: row.data?.cerradoEn ?? null };
      } else {
        const s = parseInt(row.key.slice(5), 10);
        if (!Number.isNaN(s)) mapa[s] = { pares: Array.isArray(row.data?.pares) ? row.data.pares : [] };
      }
    }
    cargado = true;
  } catch {
    cargado = false;
  }
}

async function guardarSemilla(s) {
  return DB.saveKnowledge([{
    key: `comp:${formatNumber(s)}`,
    scope: SCOPE,
    data: { semilla: s, pares: mapa[s]?.pares ?? [] },
    updatedAt: Date.now(),
  }]);
}

function contarPares() {
  return Object.values(mapa).reduce((t, m) => t + (m.pares?.length || 0), 0);
}

function renderContenedor() {
  const cont = document.getElementById("companeros-panel");
  if (!cont) return null;
  cont.innerHTML = `
    <section class="semantic-map">
      <div class="semantic-map__heading"><h3>Mapa de compañeros</h3><p>Relaciona números y explica su vínculo. Las entradas se guardan en la nube.</p></div>
        <div id="cp-progreso"></div>
        <div class="cp-form">
          <label for="cp-semilla">Semilla
            <select id="cp-semilla"></select>
          </label>
          <label for="cp-num">Compañero
            <input id="cp-num" inputmode="numeric" type="number" min="0" max="99" placeholder="00–99" />
          </label>
          <label class="cp-nota" for="cp-nota">Justificación
            <input id="cp-nota" type="text" maxlength="120" placeholder="Explica por qué están relacionados" />
          </label>
          <button id="cp-agregar" class="btn-outline">Agregar</button>
        </div>
        <div id="cp-lista"></div>
        <div class="cp-actions">
          <button id="cp-exportar" class="btn-outline">Exportar JSON</button>
          <button id="cp-cerrar-mapa" class="btn-outline">Marcar mapa completo</button>
        </div>
        <details class="semantic-map__import">
          <summary>Importar JSON (avanzado)</summary>
          <textarea id="cp-import-text" rows="4"
            placeholder='[{"semilla":94,"n":53,"nota":"carro→llanta"}]'></textarea>
          <button id="cp-importar" class="btn-outline">Importar</button>
          <div id="cp-import-msg"></div>
        </details>
        <p class="semantic-map__rules">
          Reglas: el compañero debe ser 00–99 distinto de la semilla, sin duplicados,
          y la justificación es obligatoria. Cuando el mapa esté completo y marcado
          como tal, los motores analíticos podrán consumirlo.
        </p>
    </section>`;
  return cont;
}

function renderProgreso() {
  const el = document.getElementById("cp-progreso");
  if (!el) return;
  const definidas = Object.values(mapa).filter((m) => m.pares?.length).length;
  el.innerHTML = `
    <div class="semantic-map__counts"><div><b>${definidas}/100</b><span>semillas definidas</span></div><div><b>${contarPares()}</b><span>pares registrados</span></div><div><b>${meta.completo ? "Completo" : "Borrador"}</b><span>estado del mapa</span></div></div>
    ${meta.cerradoEn ? `<p class="hint">Cerrado ${new Date(meta.cerradoEn).toLocaleString("es-HN")}</p>` : ""}`;
}

function renderSelectSemillas() {
  const sel = document.getElementById("cp-semilla");
  if (!sel) return;
  const previo = semillaActual;
  sel.innerHTML = "";
  for (let s = 0; s < 100; s++) {
    const opt = document.createElement("option");
    opt.value = String(s);
    opt.textContent = `${formatNumber(s)} ${simboloDe(s)}${mapa[s]?.pares?.length ? ` (${mapa[s].pares.length})` : ""}`;
    sel.appendChild(opt);
  }
  semillaActual = previo != null ? previo : 0;
  sel.value = String(semillaActual);
  seedPicker?.update();
}

function renderLista() {
  const el = document.getElementById("cp-lista");
  if (!el) return;
  const pares = mapa[semillaActual]?.pares ?? [];
  if (!pares.length) {
    el.innerHTML = `<p class="hint">Sin compañeros definidos para ${formatNumber(semillaActual)} ${simboloDe(semillaActual)}.</p>`;
    return;
  }
  const filas = pares.map((p) => `
    <tr>
      <td class="cp-identity"><img src="data/img/${formatNumber(p.n)}.png" alt="" onerror="this.hidden=true"><div><b>${formatNumber(p.n)}</b><span>${escapeAttr(simboloDe(p.n))}</span></div></td>
      <td class="cp-reason" data-label="Justificación">${escapeAttr(p.nota)}</td>
      <td class="cp-created" data-label="Creado">${new Date(p.creado).toLocaleDateString("es-HN")}</td>
      <td class="cp-remove"><button class="btn-ghost cp-borrar" data-n="${p.n}" aria-label="Eliminar compañero ${formatNumber(p.n)}">✕</button></td>
    </tr>`).join("");
  el.innerHTML = `
    <table class="semantic-map__table">
      <thead><tr><th>Compañero</th><th>Justificación</th><th>Creado</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  el.querySelectorAll(".cp-borrar").forEach((b) =>
    b.addEventListener("click", async () => {
      const n = parseInt(b.dataset.n, 10);
      mapa[semillaActual].pares = mapa[semillaActual].pares.filter((p) => p.n !== n);
      await guardarSemilla(semillaActual);
      refrescar();
    })
  );
}

function escapeAttr(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function refrescar() {
  renderProgreso();
  renderSelectSemillas();
  renderLista();
}

export async function renderCompanerosPanel() {
  seedPicker?.destroy();
  const cont = renderContenedor();
  if (!cont) return;
  seedPicker = initToolSelect(cont.querySelector("#cp-semilla"), { searchable: true, label: "Semilla" });
  cont.querySelector("#cp-agregar").disabled = true;
  await cargar();

  const sel = cont.querySelector("#cp-semilla");
  sel.addEventListener("change", () => { semillaActual = parseInt(sel.value, 10); renderLista(); });

  cont.querySelector("#cp-agregar").addEventListener("click", async () => {
    const numIn = cont.querySelector("#cp-num");
    const notaIn = cont.querySelector("#cp-nota");
    const nRaw = numIn.value.trim();
    const n = Number.isNaN(parseInt(nRaw, 10)) ? NaN : parseInt(nRaw, 10) % 100;
    const nota = notaIn.value.trim();
    if (Number.isNaN(n) || n < 0 || n > 99 || String(nRaw).trim() === "") {
      alert("Compañero inválido: usa un número 00–99."); return;
    }
    if (n === semillaActual) { alert("El compañero no puede ser igual a la semilla."); return; }
    if (nota.length < 4) { alert("La justificación es obligatoria (mínimo 4 caracteres)."); return; }
    mapa[semillaActual] ??= { pares: [] };
    if (mapa[semillaActual].pares.some((p) => p.n === n)) {
      alert(`El ${formatNumber(n)} ya está como compañero de ${formatNumber(semillaActual)}.`); return;
    }
    mapa[semillaActual].pares.push({ n, nota, creado: Date.now() });
    const ok = await guardarSemilla(semillaActual);
    if (!ok) { alert("No se pudo guardar en la base. Intenta de nuevo."); mapa[semillaActual].pares.pop(); return; }
    numIn.value = ""; notaIn.value = "";
    refrescar();
  });

  cont.querySelector("#cp-exportar").addEventListener("click", () => {
    const out = [];
    for (const [s, m] of Object.entries(mapa)) {
      for (const p of m.pares || []) out.push({ semilla: parseInt(s, 10), n: p.n, nota: p.nota });
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "companeros-mapas.json";
    a.click();
  });

  cont.querySelector("#cp-cerrar-mapa").addEventListener("click", async () => {
    const msg = meta.completo
      ? "¿Reabrir el mapa para edición?"
      : "¿Marcar el mapa como COMPLETO? Los motores analíticos podrán consumirlo.";
    if (!confirm(msg)) return;
    meta.completo = !meta.completo;
    meta.cerradoEn = meta.completo ? Date.now() : null;
    await DB.saveKnowledge([{ key: "comp:_meta", scope: SCOPE, data: meta, updatedAt: Date.now() }]);
    renderProgreso();
    cont.querySelector("#cp-cerrar-mapa").textContent =
      meta.completo ? "Reabrir mapa" : "Marcar mapa completo";
  });

  cont.querySelector("#cp-importar").addEventListener("click", async () => {
    const txt = cont.querySelector("#cp-import-text").value.trim();
    const msg = cont.querySelector("#cp-import-msg");
    try {
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error("Debe ser un array JSON");
      let okCount = 0;
      for (const it of arr) {
        const s = parseInt(it.semilla, 10), n = parseInt(it.n, 10);
        const nota = String(it.nota ?? "").trim();
        if (!(s >= 0 && s <= 99) || !(n >= 0 && n <= 99) || s === n || nota.length < 4) continue;
        mapa[s] ??= { pares: [] };
        if (mapa[s].pares.some((p) => p.n === n)) continue;
        mapa[s].pares.push({ n, nota, creado: Date.now() });
        await guardarSemilla(s);
        okCount++;
      }
      msg.innerHTML = `<span class="hint">Importados ${okCount} pares válidos.</span>`;
      refrescar();
    } catch (e) {
      msg.innerHTML = `<span class="hint">Error: ${e.message}</span>`;
    }
  });

  refrescar();
  cont.querySelector("#cp-agregar").disabled = !cargado;
}
