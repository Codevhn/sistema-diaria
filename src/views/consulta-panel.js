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

const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(2)}%`);
const pad2 = (n) => String(n).padStart(2, "0");

function etiquetaSignificancia(pValue) {
  if (pValue === null || pValue === undefined || Number.isNaN(pValue)) return "";
  if (pValue < 0.01) return `<span class="consulta-tag consulta-tag--fuerte">p=${pValue.toFixed(4)} — infrecuente por azar</span>`;
  if (pValue < 0.05) return `<span class="consulta-tag consulta-tag--media">p=${pValue.toFixed(4)} — algo infrecuente</span>`;
  return `<span class="consulta-tag consulta-tag--normal">p=${pValue.toFixed(3)} — compatible con azar</span>`;
}

function renderResultado(r) {
  const f = r.frecuencia;
  const g = r.gap;
  const v = r.vuelta;
  const t = r.transiciones;

  return `
    <div class="consulta-card">
      <h3>Número ${pad2(r.numero)} — ${r.totalSorteos} sorteos analizados</h3>

      <section class="consulta-section">
        <h4>Frecuencia</h4>
        <p>Cayó <b>${f.hits}</b> de ${f.total} veces (${pct(f.tasaObservada)}).
           Esperado por azar: ${pct(f.esperadoAzar)}.
           IC95%: ${pct(f.ic.low)}–${pct(f.ic.high)}.
           ${etiquetaSignificancia(f.pValue)}</p>
      </section>

      <section class="consulta-section">
        <h4>Gap (rezago)</h4>
        ${g.gapPromedio === null
          ? `<p>No hay suficientes apariciones para calcular el gap.</p>`
          : `<p>Gap actual: <b>${g.gapActual}</b> sorteos sin caer.
             Gap promedio histórico: <b>${g.gapPromedio.toFixed(1)}</b> sorteos
             (sobre ${g.ocurrencias} apariciones).</p>`}
      </section>

      <section class="consulta-section">
        <h4>Vuelta (espejo de dígitos)</h4>
        ${!v.aplica
          ? `<p>Este número es palíndromo (${pad2(r.numero)}): no tiene espejo distinto.</p>`
          : v.total === 0
            ? `<p>Sin suficientes apariciones con ventana completa para evaluar la vuelta al ${pad2(v.mirror)}.</p>`
            : `<p>Tras caer ${pad2(r.numero)}, su vuelta (${pad2(v.mirror)}) cayó dentro de los 5 sorteos
               siguientes en <b>${v.hits}</b> de ${v.total} veces (${pct(v.tasaObservada)}).
               Esperado por azar en esa misma ventana: ${pct(v.esperadoAzar)}.
               ${etiquetaSignificancia(v.pValue)}</p>`}
      </section>

      <section class="consulta-section">
        <h4>Qué suele caer justo después</h4>
        ${t.total === 0
          ? `<p>No hay suficientes apariciones para analizar transiciones.</p>`
          : `<table class="consulta-table">
               <thead><tr><th>Sucesor</th><th>Veces</th><th>Observado</th><th>Esperado azar</th><th></th></tr></thead>
               <tbody>
                 ${t.filas.map((fila) => `
                   <tr>
                     <td>${pad2(fila.sucesor)}</td>
                     <td>${fila.hits}/${fila.total}</td>
                     <td>${pct(fila.tasaObservada)}</td>
                     <td>${pct(fila.esperadoAzar)}</td>
                     <td>${etiquetaSignificancia(fila.pValue)}</td>
                   </tr>`).join("")}
               </tbody>
             </table>
             <p class="consulta-nota">${t.advertencia}</p>`}
      </section>
    </div>`;
}
