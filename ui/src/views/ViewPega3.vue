<template>
  <div class="view-pega3">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-dice" />
        Pega3
      </h1>
      <p class="view-sub">Motor independiente de análisis de tres dígitos.</p>
    </div>

    <!-- Controles -->
    <div class="controls-bar">
      <BaseBtn variant="primary" icon="fa-play" :loading="loading" @click="ejecutar">
        Analizar
      </BaseBtn>
    </div>

    <div v-if="error" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" /> {{ error }}
    </div>
    <div v-if="loading" class="skeleton" style="height:300px;border-radius:10px" />

    <template v-else-if="result">
      <!-- Sin datos -->
      <div v-if="!result.seleccion?.top?.length" class="empty-state">
        <i class="fa-solid fa-circle-info" />
        Sin suficientes datos Pega3 para generar candidatos.
      </div>

      <div v-else class="results-grid">
        <!-- Turno objetivo -->
        <div v-if="result.seleccion.turnoObjetivo" class="turno-badge">
          <i class="fa-solid fa-clock" />
          Turno objetivo: <b>{{ result.seleccion.turnoObjetivo.label }}</b>
        </div>

        <!-- Top candidatos -->
        <BaseCard title="Top candidatos" variant="gold" :full="false">
          <div class="pega3-candidates">
            <div
              v-for="(c, i) in result.seleccion.top"
              :key="c.numero"
              class="pega3-row"
            >
              <span class="rank">#{{ i + 1 }}</span>
              <span class="pega3-num mono">{{ String(c.numero).padStart(3, '0') }}</span>
              <div class="bar-wrap">
                <div class="bar" :style="`width:${Math.round(c.score * 100)}%`" />
                <span class="bar-label">{{ Math.round(c.score * 100) }}</span>
              </div>
            </div>
          </div>
        </BaseCard>

        <!-- Secundarios -->
        <BaseCard v-if="result.seleccion.secundarios?.length" title="Secundarios">
          <div class="chips-wrap">
            <span
              v-for="c in result.seleccion.secundarios"
              :key="c.numero"
              class="pega3-chip"
            >{{ String(c.numero).padStart(3, '0') }}</span>
          </div>
        </BaseCard>

        <!-- Comodín -->
        <BaseCard v-if="result.seleccion.comodin" title="Comodín">
          <div class="comodin-wrap">
            <span class="pega3-num comodin-num mono">
              {{ String(result.seleccion.comodin.numero).padStart(3, '0') }}
            </span>
            <p class="comodin-note secondary">
              Score: {{ Math.round((result.seleccion.comodin.score ?? 0) * 100) }}
            </p>
          </div>
        </BaseCard>

        <!-- Sesgos -->
        <BaseCard title="Sesgos detectados" :full="true">
          <div class="sesgos-row" v-if="result.sesgos.fuertes.length">
            <span class="sesgo-label sesgo-label--strong">Fuertes</span>
            <div class="chips-wrap">
              <span v-for="s in result.sesgos.fuertes.slice(0,8)" :key="s.numero" class="pega3-chip pega3-chip--strong">
                {{ String(s.numero).padStart(3,'0') }}
              </span>
            </div>
          </div>
          <div class="sesgos-row" v-if="result.sesgos.moderados.length">
            <span class="sesgo-label sesgo-label--mod">Moderados</span>
            <div class="chips-wrap">
              <span v-for="s in result.sesgos.moderados.slice(0,8)" :key="s.numero" class="pega3-chip">
                {{ String(s.numero).padStart(3,'0') }}
              </span>
            </div>
          </div>
          <div class="empty-state" v-if="!result.sesgos.fuertes.length && !result.sesgos.moderados.length">
            <i class="fa-solid fa-circle-info" /> Sin sesgos significativos detectados.
          </div>
        </BaseCard>
      </div>
    </template>

    <div v-else-if="!loading" class="empty-start">
      <div class="empty-start__icon"><i class="fa-solid fa-dice" /></div>
      <p>Seleccioná un país y presioná <b>Analizar</b>.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { DB } from "@motors/storage.js";
import { evaluarMotorPega3 } from "@motors/pega3-engine.js";
import BaseCard from "@/components/BaseCard.vue";
import BaseBtn from "@/components/BaseBtn.vue";

const result  = ref(null);
const loading = ref(false);
const error   = ref(null);

async function ejecutar() {
  loading.value = true;
  error.value   = null;
  result.value  = null;
  try {
    const draws = await DB.listDraws({ excludeTest: true });
    const filtered = draws.filter(d => (d.pais || "").toUpperCase() === "HN");
    result.value = evaluarMotorPega3(filtered);
  } catch (e) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.view-pega3 { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--orange); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }

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

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp-4);
}
.turno-badge {
  grid-column: 1 / -1;
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  background: var(--cyan-surface); border: 1px solid var(--cyan-dim);
  border-radius: var(--r-md); font-size: var(--text-sm); color: var(--cyan);
}

/* Candidatos */
.pega3-candidates { display: flex; flex-direction: column; gap: var(--sp-2); }
.pega3-row {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-1) 0; border-bottom: 1px solid var(--border-subtle);
}
.pega3-row:last-child { border-bottom: none; }
.rank { font-size: var(--text-xs); color: var(--text-muted); width: 24px; flex-shrink: 0; }
.pega3-num { font-size: var(--text-lg); font-weight: var(--fw-bold); color: var(--gold); }
.bar-wrap { flex: 1; display: flex; align-items: center; gap: var(--sp-2); }
.bar { height: 6px; background: var(--gold); border-radius: var(--r-pill); min-width: 2px; }
.bar-label { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); flex-shrink: 0; width: 24px; text-align: right; }

/* Chips */
.chips-wrap { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.pega3-chip {
  font-family: var(--font-mono); font-weight: var(--fw-semi); font-size: var(--text-sm);
  padding: var(--sp-1) var(--sp-2);
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.pega3-chip--strong { border-color: var(--gold-dim); color: var(--gold); background: var(--gold-surface); }

/* Comodín */
.comodin-wrap { display: flex; flex-direction: column; gap: var(--sp-1); }
.comodin-num { font-size: var(--text-2xl); color: var(--cyan); }

/* Sesgos */
.sesgos-row { display: flex; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--border-subtle); }
.sesgos-row:last-child { border-bottom: none; }
.sesgo-label { font-size: var(--text-xs); font-weight: var(--fw-semi); white-space: nowrap; min-width: 70px; padding-top: 4px; }
.sesgo-label--strong { color: var(--gold); }
.sesgo-label--mod    { color: var(--cyan); }

/* States */
.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
.empty-state { display: flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-4) 0; }
.empty-start {
  display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);
  padding: var(--sp-12) var(--sp-4); color: var(--text-muted); text-align: center;
}
.empty-start__icon {
  width: 64px; height: 64px; border-radius: 50%;
  background: rgba(251,146,60,.12); display: grid; place-items: center;
  font-size: 1.8rem; color: var(--orange);
}
.empty-start p { font-size: var(--text-sm); max-width: 260px; }
.secondary { color: var(--text-secondary); font-size: var(--text-sm); }
</style>
