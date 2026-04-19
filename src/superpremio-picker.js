/**
 * superpremio-picker.js — Selector inteligente de 6 números para Super Premio.
 *
 * La Diaria Super Premio usa los números 01–33. La observación del jugador:
 * los ganadores tienden a ser números poco frecuentes en los sorteos diarios.
 * Este módulo calcula la frecuencia de cada número 01–33 en el historial real
 * y usa selección ponderada inversa: a menor frecuencia → mayor probabilidad de salir.
 *
 * Export principal:
 *   initSuperPremioPicker(draws, guia)  → void (inyecta el panel en el DOM)
 */

const SP_NUMS = Array.from({ length: 33 }, (_, i) => i + 1); // 1..33
const PAD = (n) => String(n).padStart(2, "0");

// ─── Algoritmo de selección ponderada ────────────────────────────────────────

/**
 * Cuenta cuántas veces aparece cada número 01-33 en el historial de sorteos.
 * @param {Array} draws  - array de { numero }
 * @returns {Map<number, number>}  num → frecuencia
 */
function calcFreqs(draws) {
  const freq = new Map(SP_NUMS.map((n) => [n, 0]));
  for (const d of draws) {
    const n = parseInt(d.numero, 10);
    if (n >= 1 && n <= 33) freq.set(n, (freq.get(n) || 0) + 1);
  }
  return freq;
}

/**
 * Selección aleatoria ponderada sin reemplazo.
 * Peso de cada número = (maxFreq - freq + 1)^2  → favorece fuertemente los fríos.
 * @param {Map<number,number>} freq
 * @param {number} count
 * @returns {number[]}
 */
function weightedSample(freq, count = 6) {
  const maxFreq = Math.max(...freq.values());
  const pool = SP_NUMS.map((n) => ({
    n,
    w: Math.pow(maxFreq - freq.get(n) + 1, 2),
  }));

  const selected = [];
  while (selected.length < count && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let rand = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].w;
      if (rand <= 0) { idx = i; break; }
    }
    selected.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return selected.sort((a, b) => a - b);
}

// ─── Renderizado ─────────────────────────────────────────────────────────────

function buildBall(num, freq, maxFreq, guia) {
  const pad = PAD(num);
  const simbolo = guia[pad]?.simbolo || "";
  const f = freq.get(num) ?? 0;
  // Temperatura: 0=helado, 1=frío, 2=tibio
  const tempRatio = maxFreq > 0 ? f / maxFreq : 0;
  const tempCls = tempRatio < 0.33 ? "sp-ball--ice"
    : tempRatio < 0.66 ? "sp-ball--cold"
    : "sp-ball--warm";
  const tempLabel = tempRatio < 0.33 ? "❄ Helado"
    : tempRatio < 0.66 ? "🔵 Frío"
    : "🟡 Tibio";

  const wrap = document.createElement("div");
  wrap.className = "sp-ball-wrap";
  wrap.innerHTML = `
    <div class="sp-ball ${tempCls}" data-num="${pad}">
      <div class="sp-ball__img-wrap">
        <img class="sp-ball__img" src="data/img/${pad}.png" alt="${pad}"
          onerror="this.src='data/img/${pad}.jpg';this.onerror=()=>this.style.display='none'">
      </div>
      <div class="sp-ball__circle">
        <span class="sp-ball__num">${pad}</span>
      </div>
      <div class="sp-ball__sym">${simbolo}</div>
      <div class="sp-ball__temp">${tempLabel}</div>
    </div>`;
  return wrap;
}

function renderResults(nums, freq, guia) {
  const maxFreq = Math.max(...freq.values());
  const out = document.createElement("div");
  out.className = "sp-result";

  const header = document.createElement("div");
  header.className = "sp-result__header";
  header.innerHTML = `<span>Tu combinación de hoy</span><span class="sp-result__hint">Números seleccionados por baja frecuencia histórica</span>`;
  out.appendChild(header);

  const ballRow = document.createElement("div");
  ballRow.className = "sp-balls-row";
  nums.forEach((n, i) => {
    const ball = buildBall(n, freq, maxFreq, guia);
    ball.style.animationDelay = `${i * 120}ms`;
    ball.classList.add("sp-ball-wrap--anim");
    ballRow.appendChild(ball);
  });
  out.appendChild(ballRow);

  // Leyenda de temperatura
  const legend = document.createElement("div");
  legend.className = "sp-result__legend";
  legend.innerHTML = `
    <span>❄ Helado = aparece muy poco · 🔵 Frío = aparece poco · 🟡 Tibio = frecuencia media</span>`;
  out.appendChild(legend);

  // Combo texto para copiar fácil
  const combo = document.createElement("div");
  combo.className = "sp-result__combo";
  combo.textContent = nums.map(PAD).join(" – ");
  out.appendChild(combo);

  return out;
}

// ─── Inicializador principal ──────────────────────────────────────────────────

/**
 * Inyecta el botón y el área de resultado en el panel "Números rápidos".
 * @param {Array}  draws  - historial de sorteos de DB.listDraws()
 * @param {object} guia   - GUIA de sueños
 */
export function initSuperPremioPicker(draws, guia = {}) {
  const panel = document.querySelector(".day-card--numbers .day-card__body");
  if (!panel) return;

  // Precalcular frecuencias una vez
  const freq = calcFreqs(draws);

  // Contenedor del picker
  const pickerWrap = document.createElement("div");
  pickerWrap.className = "sp-picker";

  // Cabecera
  const head = document.createElement("div");
  head.className = "sp-picker__head";
  head.innerHTML = `
    <div>
      <div class="sp-picker__sub">Selección ponderada: más peso a los números que menos han salido históricamente del 01 al 33</div>
    </div>`;
  pickerWrap.appendChild(head);

  // Botón generar
  const btn = document.createElement("button");
  btn.className = "btn sp-picker__btn";
  btn.innerHTML = "🎲 Generar mis 6 números";
  pickerWrap.appendChild(btn);

  // Área de resultado
  const resultArea = document.createElement("div");
  resultArea.className = "sp-picker__result";
  pickerWrap.appendChild(resultArea);

  panel.appendChild(pickerWrap);

  // ── Evento del botón ──────────────────────────────────────────────────────
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.innerHTML = "⏳ Sorteando...";
    resultArea.innerHTML = "";

    // Pequeño delay para que se vea la animación del botón
    setTimeout(() => {
      const nums = weightedSample(freq, 6);
      const resultEl = renderResults(nums, freq, guia);
      resultArea.appendChild(resultEl);

      btn.disabled = false;
      btn.innerHTML = "🎲 Volver a generar";
    }, 400);
  });
}
