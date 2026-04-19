/**
 * superpremio-picker.js — Selector inteligente de 6 números para Super Premio.
 *
 * El botón solo se habilita los miércoles y sábados (días de sorteo).
 * Incluye botón de activación de notificaciones del navegador.
 */

import {
  isSuperPremioDay,
  nextSuperPremioDate,
  getNotifPermission,
  requestNotifPermission,
  notifySuperPremioIfNeeded,
} from "./notifications.js";

const SP_NUMS = Array.from({ length: 33 }, (_, i) => i + 1); // 1..33
const PAD = (n) => String(n).padStart(2, "0");

// ─── Algoritmo de selección ponderada ────────────────────────────────────────

function calcFreqs(draws) {
  const freq = new Map(SP_NUMS.map((n) => [n, 0]));
  for (const d of draws) {
    const n = parseInt(d.numero, 10);
    if (n >= 1 && n <= 33) freq.set(n, (freq.get(n) || 0) + 1);
  }
  return freq;
}

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

  const legend = document.createElement("div");
  legend.className = "sp-result__legend";
  legend.innerHTML = `<span>❄ Helado = aparece muy poco · 🔵 Frío = aparece poco · 🟡 Tibio = frecuencia media</span>`;
  out.appendChild(legend);

  const combo = document.createElement("div");
  combo.className = "sp-result__combo";
  combo.textContent = nums.map(PAD).join(" – ");
  out.appendChild(combo);

  return out;
}

// ─── Banner de notificaciones ─────────────────────────────────────────────────

function buildNotifBanner() {
  const banner = document.createElement("div");
  banner.className = "sp-notif-banner";

  function refresh() {
    const perm = getNotifPermission();
    if (perm === "unsupported") {
      banner.innerHTML = `<span class="sp-notif-banner__text">⚠ Tu navegador no soporta notificaciones.</span>`;
      return;
    }
    if (perm === "granted") {
      banner.innerHTML = `<span class="sp-notif-banner__text">🔔 Notificaciones activas — te avisamos cada miércoles y sábado.</span>`;
      return;
    }
    if (perm === "denied") {
      banner.innerHTML = `<span class="sp-notif-banner__text muted">🔕 Notificaciones bloqueadas en tu navegador. Actívalas desde la configuración del sitio.</span>`;
      return;
    }
    // "default" — aún no pidió permiso
    banner.innerHTML = `
      <span class="sp-notif-banner__text">🔔 ¿Querés que te avisemos cada día de sorteo?</span>
      <button class="sp-notif-banner__btn">Activar recordatorios</button>`;
    banner.querySelector(".sp-notif-banner__btn")?.addEventListener("click", async () => {
      const result = await requestNotifPermission();
      if (result === "granted") notifySuperPremioIfNeeded();
      refresh();
    });
  }

  refresh();
  return banner;
}

// ─── Inicializador principal ──────────────────────────────────────────────────

export function initSuperPremioPicker(draws, guia = {}) {
  const panel = document.querySelector(".day-card--numbers .day-card__body");
  if (!panel) return;

  const freq = calcFreqs(draws);
  const hoyEsSorteo = isSuperPremioDay();
  const diasSemana = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const hoy = new Date();

  const pickerWrap = document.createElement("div");
  pickerWrap.className = "sp-picker";

  // ── Estado del día ──────────────────────────────────────────────────────────
  const dayBadge = document.createElement("div");
  if (hoyEsSorteo) {
    dayBadge.className = "sp-day-badge sp-day-badge--active";
    dayBadge.innerHTML = `🏆 Hoy es <b>${diasSemana[hoy.getDay()]}</b> — ¡día de Super Premio!`;
  } else {
    const proximo = nextSuperPremioDate();
    dayBadge.className = "sp-day-badge sp-day-badge--waiting";
    dayBadge.innerHTML = `⏳ Próximo sorteo: <b>${proximo}</b>`;
  }
  pickerWrap.appendChild(dayBadge);

  // ── Descripción ─────────────────────────────────────────────────────────────
  const sub = document.createElement("div");
  sub.className = "sp-picker__sub";
  sub.textContent = "Selección ponderada: más peso a los números que menos han salido históricamente del 01 al 33.";
  pickerWrap.appendChild(sub);

  // ── Botón generar ───────────────────────────────────────────────────────────
  const btn = document.createElement("button");
  btn.className = "btn sp-picker__btn";

  if (hoyEsSorteo) {
    btn.innerHTML = "🎲 Generar mis 6 números";
    btn.classList.add("sp-picker__btn--active");
  } else {
    btn.innerHTML = "🔒 Solo disponible miércoles y sábados";
    btn.disabled = true;
    btn.classList.add("sp-picker__btn--locked");
  }
  pickerWrap.appendChild(btn);

  // ── Área de resultado ───────────────────────────────────────────────────────
  const resultArea = document.createElement("div");
  resultArea.className = "sp-picker__result";
  pickerWrap.appendChild(resultArea);

  // ── Banner de notificaciones ────────────────────────────────────────────────
  pickerWrap.appendChild(buildNotifBanner());

  panel.appendChild(pickerWrap);

  // ── Evento del botón ────────────────────────────────────────────────────────
  if (hoyEsSorteo) {
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.innerHTML = "⏳ Sorteando...";
      resultArea.innerHTML = "";

      setTimeout(() => {
        const nums = weightedSample(freq, 6);
        const resultEl = renderResults(nums, freq, guia);
        resultArea.appendChild(resultEl);
        btn.disabled = false;
        btn.innerHTML = "🎲 Volver a generar";
      }, 400);
    });
  }
}
