<template>
  <div class="tab-trans">
    <div class="trans-input-bar">
      <div class="control-group">
        <label class="control-label">Número base (00–99)</label>
        <input
          type="number" min="0" max="99"
          v-model.number="inputNum"
          class="num-input"
          placeholder="ej. 47"
          @input="calcular"
        />
      </div>
    </div>

    <div v-if="result" class="trans-grid">
      <!-- Número base destacado -->
      <div class="trans-seed">
        <span class="trans-seed__num">{{ pad(result.base) }}</span>
        <span class="trans-seed__sym" v-if="result.guia">{{ result.guia.simbolo }}</span>
        <span class="trans-seed__label">Base</span>
      </div>

      <!-- Filas de transformaciones -->
      <div class="trans-section">
        <div class="trans-row" v-for="row in rows" :key="row.label">
          <span class="trans-row__label">{{ row.label }}</span>
          <div class="trans-row__chips">
            <div
              v-for="n in row.nums"
              :key="n.valor"
              class="trans-chip"
              :class="`trans-chip--${row.variant}`"
            >
              <span class="trans-chip__num">{{ pad(n.valor) }}</span>
              <small class="trans-chip__sym" v-if="n.simbolo">{{ n.simbolo }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <i class="fa-solid fa-calculator" />
      Ingresá un número para ver sus transformaciones.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import {
  getSimpleConversions,
  getCompositeConversions,
  getEquivalencias,
  getMirror,
} from "@motors/conversion-engine.js";
import { loadGuide } from "@motors/guia.js";

const inputNum = ref(null);
const result   = ref(null);
let   guideMap = null;

loadGuide().then(g => { guideMap = g; });

const pad = (n) => String(n).padStart(2, "0");

function sym(n) {
  if (!guideMap) return "";
  return guideMap[pad(n)]?.simbolo ?? "";
}

function toEnriched(nums) {
  return nums.map(v => ({ valor: v, simbolo: sym(v) }));
}

function calcular() {
  const n = inputNum.value;
  if (n === null || n === "" || isNaN(n) || n < 0 || n > 99) {
    result.value = null;
    return;
  }
  const num  = Math.round(n);
  const inv  = parseInt(pad(num).split("").reverse().join(""), 10);
  const adj  = (100 - num + 100) % 100;
  const mir  = getMirror(num);

  result.value = {
    base: num,
    guia: guideMap?.[pad(num)] ?? null,
  };

  rows.value = [
    { label: "Invertido",             nums: toEnriched([inv]),                          variant: "inv" },
    { label: "Ajuste (100 − n)",      nums: toEnriched([adj]),                          variant: "adj" },
    { label: "Espejo",                nums: toEnriched([mir].filter(v => v !== num)),   variant: "mir" },
    { label: "Conversión simple",     nums: toEnriched(getSimpleConversions(num)),      variant: "simple" },
    { label: "Conversión compuesta",  nums: toEnriched(getCompositeConversions(num)),   variant: "compound" },
    { label: "Equivalencias",         nums: toEnriched(getEquivalencias(num)),          variant: "equiv" },
  ].filter(r => r.nums.length > 0);
}

const rows = ref([]);
</script>

<style scoped>
.tab-trans { display: flex; flex-direction: column; gap: var(--sp-5); }

.trans-input-bar {
  display: flex; align-items: flex-end; gap: var(--sp-4);
  flex-wrap: wrap;
}
.control-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.control-label { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.num-input {
  font-family: var(--font-mono); font-size: var(--text-xl); font-weight: var(--fw-bold);
  width: 80px; text-align: center;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
}
.num-input:focus { outline: none; border-color: var(--gold); }
.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.trans-grid { display: flex; flex-direction: column; gap: var(--sp-4); }

.trans-seed {
  display: flex; align-items: baseline; gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: var(--gold-surface); border: 1px solid var(--gold-dim);
  border-radius: var(--r-md); width: fit-content;
}
.trans-seed__num { font-family: var(--font-mono); font-size: var(--text-2xl); font-weight: var(--fw-bold); color: var(--gold); }
.trans-seed__sym { font-size: var(--text-lg); color: var(--text-secondary); }
.trans-seed__label { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }

.trans-section { display: flex; flex-direction: column; gap: var(--sp-2); }

.trans-row {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.trans-row:last-child { border-bottom: none; }
.trans-row__label {
  font-size: var(--text-xs); color: var(--text-muted);
  min-width: 160px; flex-shrink: 0;
}
.trans-row__chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.trans-chip {
  display: inline-flex; flex-direction: column; align-items: center; gap: 1px;
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-raised);
  cursor: default;
}
.trans-chip__num { font-family: var(--font-mono); font-weight: var(--fw-semi); font-size: var(--text-sm); }
.trans-chip__sym { font-size: 10px; color: var(--text-muted); }

.trans-chip--inv     { border-color: var(--cyan-dim);   background: var(--cyan-surface);   }
.trans-chip--adj     { border-color: var(--gold-dim);   background: var(--gold-surface);   }
.trans-chip--mir     { border-color: var(--border);     }
.trans-chip--simple  { border-color: var(--green);      background: var(--green-surface);  }
.trans-chip--compound{ border-color: var(--orange);     background: rgba(251,146,60,.08);  }
.trans-chip--equiv   { border-color: var(--text-muted); }

.empty-state {
  display: flex; align-items: center; gap: var(--sp-2);
  color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-6) 0;
}
</style>
