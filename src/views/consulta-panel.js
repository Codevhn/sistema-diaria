/**
 * views/consulta-panel.js — Panel de Consulta Histórica ("anotador avanzado")
 *
 * No genera candidatos ni predicciones. El jugador elige un número y el
 * panel muestra su evidencia histórica real (frecuencia, gap, vuelta,
 * transiciones) siempre junto a lo que el azar predice para esa misma
 * medida — el mismo criterio que honesty-panel.js aplica al sistema
 * completo, aplicado aquí a una consulta puntual.
 */

import { consultarNumero } from "../query-engine.js";
import { GUIA } from "../loader.js";
import { formatFriendlyDate } from "../ui/format.js";

let getDraws = async () => [];
let paisActivo = () => "HN";

export function initConsultaPanel(options = {}) {
  getDraws = options.obtenerSorteos ?? getDraws;
  paisActivo = options.pais ?? paisActivo;

  const input = document.getElementById("consulta-numero-input");
  const btn = document.getElementById("consulta-btn-buscar");
  const out = document.getElementById("consulta-resultado");
  if (!input || !btn || !out) return;

  btn.addEventListener("click", () => ejecutarConsulta(input, out));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") ejecutarConsulta(input, out);
  });
}

async function ejecutarConsulta(input, out) {
  const numero = parseInt(input.value, 10);
  if (!Number.isInteger(numero) || numero < 0 || numero > 99) {
    out.innerHTML = `<div class="consulta-error">Ingresá un número entre 0 y 99.</div>`;
    return;
  }
  out.innerHTML = `<div class="consulta-loading">Consultando historial…</div>`;
  try {
    const draws = await getDraws();
    const pais = typeof paisActivo === "function" ? paisActivo() : paisActivo;
    const r = consultarNumero(numero, draws, { pais });
    out.innerHTML = renderResultado(r);
  } catch (err) {
    out.innerHTML = `<div class="consulta-error">No se pudo consultar: ${err?.message || err}</div>`;
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
const miles = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("es-HN"));
const simbolo = (n) => GUIA?.[pad2(n)]?.simbolo || "";
// Número + símbolo juntos, como se ven en el resto de la app (ej: "74 Edificio")
const numSym = (n) => {
  const s = simbolo(n);
  return s ? `${pad2(n)} <span class="consulta-sym">${s}</span>` : pad2(n);
};

// Una tarjeta "stat tile": valor grande arriba, etiqueta chica abajo.
// Sin porcentajes ni comparación contra azar — eso es auditoría, no esto.
function statTile(value, label) {
  return `<div class="consulta-stat">
    <span class="consulta-stat__value">${value}</span>
    <span class="consulta-stat__label">${label}</span>
  </div>`;
}

function renderHero(r) {
  const pd = pad2(r.numero);
  const sym = simbolo(r.numero);
  const u = r.ultimaAparicion;
  const ultimaTexto = u
    ? `Salió por última vez el <b>${formatFriendlyDate(u.fecha)}</b>, turno <b>${u.horario}</b>.`
    : `Sin registro de ninguna aparición en el historial cargado.`;

  return `
    <div class="consulta-hero">
      <img class="consulta-hero__img" src="data/img/${pd}.png" alt="${pd}"
        onerror="this.src='data/img/${pd}.jpg';this.onerror=()=>this.style.display='none'">
      <div class="consulta-hero__num">${pd}</div>
      <div class="consulta-hero__sym">${sym}</div>
      <div class="consulta-hero__ultima">${ultimaTexto}</div>
    </div>`;
}

function renderHistorialReciente(r) {
  const h = r.historialReciente;
  if (!h || !h.length) {
    return `<section class="consulta-section">
      <h4>Historial reciente</h4>
      <p>Sin apariciones registradas todavía.</p>
    </section>`;
  }
  return `
    <section class="consulta-section">
      <h4>Historial reciente — últimas ${h.length} apariciones</h4>
      <p class="consulta-nota">Esto es la materia prima cruda: fecha, horario, y qué cayó justo antes/después
        cada vez. Armá tu propia hipótesis a partir de esto — el sistema no la arma por vos.</p>
      <table class="consulta-table">
        <thead><tr><th>Fecha</th><th>Horario</th><th>Cayó antes</th><th>Cayó después</th></tr></thead>
        <tbody>
          ${h.map((ap) => `
            <tr>
              <td>${formatFriendlyDate(ap.fecha)}</td>
              <td>${ap.horario}</td>
              <td>${ap.anterior === null ? "—" : numSym(ap.anterior)}</td>
              <td>${ap.siguiente === null ? "—" : numSym(ap.siguiente)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </section>`;
}

function renderResultado(r) {
  const f = r.frecuencia;
  const g = r.gap;
  const v = r.vuelta;
  const t = r.transiciones;

  return `
    <div class="consulta-card">
      ${renderHero(r)}
      <p class="consulta-nota consulta-nota--total">${r.totalSorteos} sorteos analizados en total.</p>

      ${renderHistorialReciente(r)}

      <section class="consulta-section">
        <h4>Frecuencia</h4>
        <div class="consulta-stats">
          ${statTile(miles(f.hits), "veces cayó")}
          ${statTile(miles(f.total), "sorteos analizados")}
        </div>
      </section>

      <section class="consulta-section">
        <h4>Gap (rezago)</h4>
        ${g.gapPromedio === null
          ? `<p>No hay suficientes apariciones para calcular el gap.</p>`
          : `<div class="consulta-stats">
               ${statTile(g.gapActual, "sorteos sin caer ahora")}
               ${statTile(g.gapPromedio.toFixed(1), "gap promedio histórico")}
             </div>`}
      </section>

      <section class="consulta-section">
        <h4>Vuelta (espejo de dígitos)</h4>
        ${!v.aplica
          ? `<p>Este número es palíndromo (${numSym(r.numero)}): no tiene espejo distinto.</p>`
          : v.total === 0
            ? `<p>Sin suficientes apariciones con ventana completa para evaluar la vuelta al ${numSym(v.mirror)}.</p>`
            : `<p class="consulta-lead">Vuelta: ${numSym(v.mirror)}</p>
               <div class="consulta-stats">
                 ${statTile(`${v.hits} de ${v.total}`, "veces cayó dentro de los 5 sorteos siguientes")}
               </div>`}
      </section>

      <section class="consulta-section">
        <h4>Qué suele caer justo después</h4>
        ${t.total === 0
          ? `<p>No hay suficientes apariciones para analizar transiciones.</p>`
          : `<table class="consulta-table">
               <thead><tr><th>Sucesor</th><th>Veces</th></tr></thead>
               <tbody>
                 ${t.filas.map((fila) => `
                   <tr>
                     <td>${numSym(fila.sucesor)}</td>
                     <td>${fila.hits}</td>
                   </tr>`).join("")}
               </tbody>
             </table>`}
      </section>
    </div>`;
}
