<template>
  <div class="tab-cruceta">
    <!-- Controles -->
    <div class="controls-bar">
      <div class="control-group">
        <label class="control-label">Fecha</label>
        <input type="date" v-model="fecha" class="select" />
      </div>
      <div class="divider-v" />
      <div class="control-group">
        <label class="control-label">Cruceta turnos — Nº 11 AM</label>
        <input type="number" min="0" max="99" v-model.number="n11" class="num-input" placeholder="—" />
      </div>
      <div class="control-group">
        <label class="control-label">Nº 3 PM</label>
        <input type="number" min="0" max="99" v-model.number="n3" class="num-input" placeholder="—" />
      </div>
    </div>

    <div class="crucetas-row">
      <!-- Cruceta de fecha -->
      <div class="cruceta-panel" v-if="cruz">
        <h3 class="panel-title">Cruceta de fecha</h3>
        <div class="cross-grid">
          <div class="cross-cell cross-cell--north">{{ pad(cruz.norte) }}</div>
          <div class="cross-cell cross-cell--west" >{{ pad(cruz.oeste) }}</div>
          <div class="cross-cell cross-cell--center">{{ pad(cruz.centro) }}</div>
          <div class="cross-cell cross-cell--east" >{{ pad(cruz.este) }}</div>
          <div class="cross-cell cross-cell--south">{{ pad(cruz.sur) }}</div>
        </div>
      </div>

      <!-- Triángulo invertido -->
      <div class="cruceta-panel" v-if="triangulo?.length">
        <h3 class="panel-title">Triángulo invertido</h3>
        <div class="triangulo">
          <div
            v-for="(nivel, li) in triangulo"
            :key="li"
            class="triangulo__row"
          >
            <span
              v-for="(d, di) in nivel"
              :key="di"
              class="triangulo__digit"
              :class="{ 'triangulo__digit--final': li === triangulo.length - 1 }"
            >{{ d }}</span>
          </div>
        </div>
      </div>

      <!-- Cruceta de turnos -->
      <div class="cruceta-panel" v-if="cruceTurnos">
        <h3 class="panel-title">Cruceta 11 AM + 3 PM</h3>
        <div class="cross-grid">
          <div class="cross-cell cross-cell--north">{{ cruceTurnos.north }}</div>
          <div class="cross-cell cross-cell--west" >{{ cruceTurnos.west }}</div>
          <div class="cross-cell cross-cell--center">{{ cruceTurnos.center }}</div>
          <div class="cross-cell cross-cell--east" >{{ cruceTurnos.east }}</div>
          <div class="cross-cell cross-cell--south">{{ cruceTurnos.south }}</div>
        </div>
        <div class="candidates-row" v-if="cruceTurnos.candidates?.length">
          <span class="control-label">Candidatos</span>
          <div class="cand-chips">
            <span
              v-for="c in cruceTurnos.candidates"
              :key="c"
              class="cand-chip"
            >{{ pad(c) }}</span>
          </div>
        </div>
        <details class="steps-detail">
          <summary>Ver pasos</summary>
          <ul class="steps-list">
            <li v-for="s in cruceTurnos.steps" :key="s.label">
              <b>{{ s.label }}</b>: {{ s.expr }} → <b>{{ s.result }}</b>
            </li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import {
  generarCruceta,
  generarTrianguloInvertido,
  generarCrucetaTurnos,
} from "@motors/geometry.js";

const fecha = ref(new Date().toISOString().slice(0, 10));
const n11   = ref(null);
const n3    = ref(null);

const pad = (n) => String(n).padStart(2, "0");

const cruz = computed(() => {
  if (!fecha.value) return null;
  try { return generarCruceta(fecha.value); } catch { return null; }
});

const triangulo = computed(() => {
  if (!fecha.value) return null;
  try { return generarTrianguloInvertido(fecha.value); } catch { return null; }
});

const cruceTurnos = computed(() => {
  if (n11.value == null || n3.value == null) return null;
  if (n11.value < 0 || n11.value > 99 || n3.value < 0 || n3.value > 99) return null;
  try { return generarCrucetaTurnos(Math.round(n11.value), Math.round(n3.value)); } catch { return null; }
});
</script>

<style scoped>
.tab-cruceta { display: flex; flex-direction: column; gap: var(--sp-5); }

.controls-bar {
  display: flex; align-items: flex-end; gap: var(--sp-4); flex-wrap: wrap;
  padding: var(--sp-4);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-md);
}
.divider-v { width: 1px; height: 40px; background: var(--border); align-self: flex-end; }
.control-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.control-label { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.select {
  font-family: var(--font-sans); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
}
.select:focus { outline: none; border-color: var(--gold); }
.num-input {
  font-family: var(--font-mono); font-size: var(--text-base);
  width: 70px; text-align: center;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2);
}
.num-input:focus { outline: none; border-color: var(--gold); }
.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.crucetas-row {
  display: flex; flex-wrap: wrap; gap: var(--sp-6); align-items: flex-start;
}

.cruceta-panel {
  display: flex; flex-direction: column; gap: var(--sp-3);
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--sp-4);
  min-width: 200px;
}
.panel-title {
  font-size: var(--text-xs); color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em; font-weight: var(--fw-semi);
}

/* Cruz 5-cell grid */
.cross-grid {
  display: grid;
  grid-template-areas:
    ".     north  ."
    "west  center east"
    ".     south  .";
  grid-template-columns: 60px 60px 60px;
  grid-template-rows:    60px 60px 60px;
  gap: 4px;
}
.cross-cell {
  display: grid; place-items: center;
  font-family: var(--font-mono); font-size: var(--text-lg); font-weight: var(--fw-bold);
  border-radius: var(--r-sm);
  background: var(--bg-raised); border: 1px solid var(--border);
}
.cross-cell--north  { grid-area: north;  border-color: var(--cyan-dim); color: var(--cyan); }
.cross-cell--south  { grid-area: south;  border-color: var(--cyan-dim); color: var(--cyan); }
.cross-cell--west   { grid-area: west;   border-color: var(--gold-dim); color: var(--gold); }
.cross-cell--east   { grid-area: east;   border-color: var(--gold-dim); color: var(--gold); }
.cross-cell--center { grid-area: center; border-color: var(--green); color: var(--green); background: var(--green-surface); }

/* Triángulo */
.triangulo { display: flex; flex-direction: column; gap: 4px; align-items: center; }
.triangulo__row { display: flex; gap: 4px; }
.triangulo__digit {
  width: 28px; height: 28px; display: grid; place-items: center;
  font-family: var(--font-mono); font-weight: var(--fw-semi); font-size: var(--text-sm);
  border-radius: var(--r-sm);
  background: var(--bg-raised); border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
.triangulo__digit--final {
  background: var(--gold-surface); border-color: var(--gold);
  color: var(--gold); font-size: var(--text-base);
  width: 36px; height: 36px;
}

/* Candidatos */
.candidates-row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.cand-chips { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.cand-chip {
  font-family: var(--font-mono); font-weight: var(--fw-semi);
  padding: var(--sp-1) var(--sp-3);
  background: var(--gold-surface); border: 1px solid var(--gold-dim);
  border-radius: var(--r-pill); color: var(--gold);
  font-size: var(--text-sm);
}

/* Steps */
.steps-detail { margin-top: var(--sp-2); }
.steps-detail summary {
  font-size: var(--text-xs); color: var(--text-muted); cursor: pointer;
  user-select: none;
}
.steps-list {
  list-style: none; display: flex; flex-direction: column; gap: var(--sp-1);
  margin-top: var(--sp-2); padding-left: var(--sp-3);
  border-left: 2px solid var(--border);
  font-size: var(--text-xs); color: var(--text-secondary);
}
</style>
