/**
 * views/ritmos-familias.js — Panel descriptivo de ritmos por familia simbólica
 *
 * Filosofía (auditoría 2026-08 · docs/AUDITORIA-EMPIRICA.md):
 *   Cada dato se muestra AL LADO de su baseline de azar. Este panel NO predice:
 *   permite explorar ritmos históricos y detectar, con rigor, si algún día
 *   LOTEHLSA deja de comportarse como una urna uniforme.
 *
 *   Estado por familia:
 *     normal      → gap actual dentro de lo esperado (media+1σ geométrica)
 *     larga       → gap actual > media+1σ (raro HOY, pero ocurre ~13% del tiempo por azar)
 */

import { HORARIO_ORDER } from "../ui/format.js";

const AVES = [21, 28, 76, 89, 92]; // Pájaro, Gallo, Palomas, Búho, Águila

function ordenar(draws) {
  return draws
    .filter((d) => d.fecha && !isNaN(parseInt(d.numero, 10)))
    .map((d) => ({ num: parseInt(d.numero, 10) % 100, fecha: d.fecha, horario: d.horario || "" }))
    .sort((a, b) =>
      a.fecha !== b.fecha
        ? a.fecha < b.fecha ? -1 : 1
        : (HORARIO_ORDER[a.horario] ?? 99) - (HORARIO_ORDER[b.horario] ?? 99)
    );
}

async function cargarGuia() {
  const res = await fetch("./data/guia_suenos.json");
  if (!res.ok) throw new Error("guia no disponible");
  return res.json();
}

function fila(nombre, miembros, gapsMediaTeoricaSorteos, ultimaIdx, totalDraws, turnosDia) {
  if (!miembros.length || ultimaIdx < 0) return "";
  const p = miembros.length / 100; // prob por sorteo
  const mediaAzar = 1 / p;
  const sigma = Math.sqrt(1 - p) / p;
  const gapActual = totalDraws - 1 - ultimaIdx;
  const larga = gapActual > mediaAzar + sigma;
  const estado = larga
    ? `<span class="ritmo-estado ritmo-estado--larga">racha larga</span>`
    : `<span class="ritmo-estado">normal</span>`;
  const notaLarga = larga
    ? ` <span class="hint">(≈13% de las familias está así en cualquier momento por azar)</span>`
    : "";
  return `
    <tr>
      <td>${nombre}</td>
      <td class="honesty-td-num">${miembros.length}</td>
      <td class="honesty-td-num">${(mediaAzar / turnosDia).toFixed(1)} d</td>
      <td class="honesty-td-num">${Math.round(gapActual / turnosDia)} d</td>
      <td class="honesty-td-num">${(mediaAzar + sigma).toFixed(0)} sort.</td>
      <td>${estado}${notaLarga}</td>
    </tr>`;
}

export async function renderRitmosFamilias(rawDraws) {
  const cont = document.getElementById("ritmos-familias");
  if (!cont) return;
  let guia;
  try { guia = await cargarGuia(); } catch { cont.innerHTML = ""; return; }

  const draws = ordenar(rawDraws);
  const n = draws.length;
  if (n < 100) { cont.innerHTML = ""; return; }
  const turnosDia = new Set(draws.slice(-200).map((d) => d.horario)).size || 5;

  // última aparición por número (los sorteos van en orden ascendente)
  const ultima = new Map();
  draws.forEach((d, i) => ultima.set(d.num, i));

  const famOf = {}, elemOf = {};
  for (const [k, v] of Object.entries(guia)) {
    famOf[parseInt(k, 10)] = v.familia || "—";
    elemOf[parseInt(k, 10)] = v.elemento || "—";
  }

  // familias oficiales con ≥3 miembros + grupo aves curado + elementos grandes
  const grupos = new Map(); // clave → {nombre, miembros:Set}
  for (let x = 0; x < 100; x++) {
    const f = famOf[x];
    if (!grupos.has("f:" + f)) grupos.set("f:" + f, { nombre: `Familia ${f}`, miems: new Set() });
    grupos.get("f:" + f).miems.add(x);
    const e = elemOf[x];
    if (!grupos.has("e:" + e)) grupos.set("e:" + e, { nombre: `Elemento ${e}`, miems: new Set() });
    grupos.get("e:" + e).miems.add(x);
  }
  grupos.set("aves", { nombre: "🦅 Aves (21·28·76·89·92)", miems: new Set(AVES) });

  const filas = [];
  for (const g of grupos.values()) {
    if (g.miems.size < 3) continue;
    let ult = -1;
    for (const m of g.miems) {
      const u = ultima.get(m);
      if (u != null && (ult === -1 || u > ult)) ult = u;
    }
    filas.push(fila(g.nombre, [...g.miems], null, ult, n, turnosDia));
  }
  filas.sort((a, b) => a.localeCompare(b));

  cont.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="ctx-head">
          <span class="ctx-head__title">🧭 Ritmos por familia simbólica</span>
          <span class="ctx-head__sub">Descriptivo · cada dato junto a su baseline de azar · sin valor predictivo (ver auditoría)</span>
        </div>
        <table class="honesty-table">
          <thead>
            <tr>
              <th>Grupo</th><th>Nºs</th><th>Gap medio (azar)</th>
              <th>Gap actual</th><th>Umbral racha</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>${filas.join("")}</tbody>
        </table>
        <p class="hint" style="margin-top:8px;">
          Gap medio y umbral derivan del modelo geométrico puro (p = Nºs/100).
          Si un grupo mostrara rachas largas sistemáticamente MÁS allá de ese umbral,
          sería señal real de cambio de conducta — el panel de honestidad la registraría.
        </p>
      </div>
    </div>`;
}
