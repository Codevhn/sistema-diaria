<template>
  <div class="tab-memoria">
    <!-- Controles -->
    <div class="controls-bar">
      <div class="control-group">
        <label class="control-label">Ordenar por</label>
        <select v-model="sortBy" class="select">
          <option value="numero">Número</option>
          <option value="total_desc">Más frecuente</option>
          <option value="total_asc">Menos frecuente</option>
          <option value="days_asc">Más reciente</option>
          <option value="days_desc">Más ausente</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="skeleton" style="height:320px;border-radius:10px" />
    <div v-else-if="error" class="error-notice"><i class="fa-solid fa-triangle-exclamation" /> {{ error }}</div>

    <template v-else-if="summary">
      <!-- Leyenda -->
      <div class="legend">
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--green);opacity:.7" />
          Frecuente
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--yellow);opacity:.7" />
          Moderado
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--red);opacity:.5" />
          Ausente / raro
        </div>
      </div>

      <!-- Órbita 10×10 -->
      <div class="orbit-grid">
        <div
          v-for="entry in sortedSummary"
          :key="entry.numero"
          class="orbit-cell"
          :style="cellStyle(entry)"
          :title="cellTooltip(entry)"
        >
          <span class="orbit-cell__num">{{ pad(entry.numero) }}</span>
          <span class="orbit-cell__days" v-if="entry.daysSinceLast != null">
            {{ Math.round(entry.daysSinceLast) }}d
          </span>
          <span class="orbit-cell__total">{{ entry.total }}</span>
        </div>
      </div>

      <p class="orbit-footnote">
        Total sorteos analizados: {{ totalDraws }} · Haga click en un número para ver su perfil (próximamente).
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { DB } from "@motors/storage.js";
import { resumirActividadNumeros } from "@motors/memory.js";

const sortBy = ref("numero");
const draws  = ref([]);
const loading= ref(false);
const error  = ref(null);

const pad = (n) => String(n).padStart(2, "0");

const summary = computed(() => {
  if (!draws.value.length) return null;
  return resumirActividadNumeros(draws.value, { pais: "HN" });
});

const totalDraws = computed(() =>
  summary.value?.reduce((s, e) => s + e.total, 0) ?? 0
);

const maxTotal = computed(() =>
  summary.value ? Math.max(...summary.value.map(e => e.total), 1) : 1
);

const sortedSummary = computed(() => {
  if (!summary.value) return [];
  const arr = [...summary.value];
  switch (sortBy.value) {
    case "total_desc": return arr.sort((a, b) => b.total - a.total);
    case "total_asc":  return arr.sort((a, b) => a.total - b.total);
    case "days_asc":   return arr.sort((a, b) => (a.daysSinceLast ?? 9999) - (b.daysSinceLast ?? 9999));
    case "days_desc":  return arr.sort((a, b) => (b.daysSinceLast ?? -1) - (a.daysSinceLast ?? -1));
    default:           return arr.sort((a, b) => a.numero - b.numero);
  }
});

function cellStyle(entry) {
  const ratio = entry.total / maxTotal.value;
  let bg, opacity;
  if (entry.daysSinceLast == null || entry.daysSinceLast > 60) {
    bg = "var(--red)"; opacity = 0.2 + ratio * 0.3;
  } else if (entry.daysSinceLast > 20) {
    bg = "var(--yellow)"; opacity = 0.15 + ratio * 0.45;
  } else {
    bg = "var(--green)"; opacity = 0.15 + ratio * 0.55;
  }
  return { background: `color-mix(in srgb, ${bg} ${Math.round(opacity * 100)}%, var(--bg-raised))` };
}

function cellTooltip(entry) {
  const d = entry.daysSinceLast != null ? `${Math.round(entry.daysSinceLast)} días atrás` : "Nunca";
  return `${pad(entry.numero)} · ${entry.total} veces · Último: ${d}`;
}

async function loadDraws() {
  loading.value = true;
  error.value   = null;
  try {
    draws.value = await DB.listDraws({ excludeTest: true });
  } catch (e) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadDraws);
</script>

<style scoped>
.tab-memoria { display: flex; flex-direction: column; gap: var(--sp-5); }

.controls-bar {
  display: flex; align-items: flex-end; gap: var(--sp-4); flex-wrap: wrap;
  padding: var(--sp-4);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-md);
}
.control-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.control-label { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.select {
  font-family: var(--font-sans); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3); cursor: pointer;
}
.select:focus { outline: none; border-color: var(--gold); }

/* Leyenda */
.legend { display: flex; gap: var(--sp-4); flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--text-xs); color: var(--text-secondary); }
.legend-swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }

/* Órbita */
.orbit-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
}
.orbit-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  aspect-ratio: 1;
  border-radius: var(--r-sm);
  cursor: default;
  transition: transform var(--t-fast), filter var(--t-fast);
  padding: 2px;
  min-width: 0;
}
.orbit-cell:hover { transform: scale(1.15); filter: brightness(1.3); z-index: 1; position: relative; }
.orbit-cell__num  { font-family: var(--font-mono); font-weight: var(--fw-bold); font-size: clamp(9px, 1.4vw, 13px); line-height: 1; }
.orbit-cell__days { font-size: clamp(7px, 0.9vw, 10px); color: var(--text-muted); line-height: 1; }
.orbit-cell__total{ font-size: clamp(7px, 0.9vw, 9px); color: var(--text-muted); line-height: 1; }

.orbit-footnote { font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--sp-1); }

.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
</style>
