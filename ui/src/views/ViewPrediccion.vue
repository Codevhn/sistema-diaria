<template>
  <div class="view-prediccion">
    <!-- ── Header ──────────────────────────────────── -->
    <div class="view-header">
      <div class="view-title-row">
        <h1 class="view-title">
          <i class="fa-solid fa-bullseye" />
          Predicción
        </h1>
        <HelpTooltip title="¿Cómo funciona la predicción?">
          <p>El motor combina <b>7 señales estadísticas</b> para generar un ranking de los 10 números más probables para el próximo sorteo de Honduras:</p>
          <ul>
            <li><b>Markov O1 y O2</b> — probabilidades de transición basadas en secuencias históricas</li>
            <li><b>Rezago / Poisson</b> — números que están "vencidos" según su ciclo promedio</li>
            <li><b>Modos de juego</b> — patrones detectados en el comportamiento reciente</li>
            <li><b>Patrones secuenciales</b> — hallazgos estadísticos (rachas, alternancia, etc.)</li>
            <li><b>Tendencias semanales</b> — comportamiento por día de la semana</li>
          </ul>
          <p>El <b>score</b> (0–100) refleja qué fracción del peso total de los motores señaló ese número. Un 60 significa que señales con el 60% del peso total lo apuntan.</p>
          <p><b>Importante:</b> el sistema no predice el futuro — detecta patrones estadísticos. Un score alto no garantiza que el número caiga.</p>
        </HelpTooltip>
      </div>
      <p class="view-sub">Motor unificado de señales — top candidatos para el próximo sorteo de Honduras.</p>
    </div>

    <!-- ── Controles ───────────────────────────────── -->
    <div class="controls-bar">
      <div class="control-group">
        <label class="control-label">Turno</label>
        <select v-model="turno" class="select">
          <option value="">Todos</option>
          <option value="11AM">11 AM</option>
          <option value="3PM">3 PM</option>
          <option value="9PM">9 PM</option>
        </select>
      </div>
      <BaseBtn variant="primary" icon="fa-play" :loading="loading" @click="ejecutar">
        Calcular
      </BaseBtn>
    </div>

    <!-- ── Error ───────────────────────────────────── -->
    <div v-if="error" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" />
      {{ error }}
    </div>

    <!-- ── Skeleton loading ────────────────────────── -->
    <div v-if="loading" class="results-grid">
      <div class="skeleton" style="height:320px;border-radius:10px;grid-column:1/-1" />
    </div>

    <!-- ── Resultados ──────────────────────────────── -->
    <template v-if="result && !loading">
      <!-- Contexto rápido -->
      <div class="context-bar" v-if="result.contexto">
        <span class="ctx-item">
          <i class="fa-solid fa-database" />
          {{ result.contexto.totalSorteos }} sorteos
        </span>
        <span class="ctx-item" v-if="result.contexto.ultimoSorteo?.numero != null">
          <i class="fa-solid fa-arrow-right" />
          Último: <b class="mono">{{ pad(result.contexto.ultimoSorteo.numero) }}</b>
          · {{ result.contexto.ultimoSorteo.horario }}
          · {{ result.contexto.ultimoSorteo.fecha }}
        </span>
        <span class="ctx-item">
          <i class="fa-solid fa-chart-network" />
          Cobertura Markov: {{ result.contexto.markovCobertura }}%
        </span>
        <span class="ctx-item" v-if="result.universo != null">
          <i class="fa-solid fa-filter" />
          Universo: {{ result.universo }}/100 números
        </span>
      </div>

      <div class="results-grid">
        <!-- Top candidatos -->
        <BaseCard title="Top candidatos" variant="gold" :full="false">
          <div v-if="!result.candidatos?.length" class="empty-state">
            <i class="fa-solid fa-circle-info" />
            {{ result.contexto?.error || 'Sin candidatos generados.' }}
          </div>
          <div v-else class="candidates-list">
            <div
              v-for="(c, i) in result.candidatos"
              :key="c.numero"
              class="candidate-row"
            >
              <span class="candidate-rank">#{{ i + 1 }}</span>
              <NumberChip :numero="c.numero" size="lg" :score="c.score" />
              <div class="candidate-bar-wrap">
                <div
                  class="candidate-bar"
                  :style="`width:${Math.round((c.score ?? 0) * 100)}%;background:${scoreColor(c.score)}`"
                />
                <span class="candidate-score-label">{{ Math.round((c.score ?? 0) * 100) }}</span>
              </div>
              <div class="candidate-motors" v-if="c.motores?.length">
                <span
                  v-for="m in c.motores.slice(0, 3)"
                  :key="m"
                  class="motor-tag"
                >{{ m }}</span>
              </div>
            </div>
          </div>
        </BaseCard>

        <!-- Eliminados -->
        <BaseCard title="Números eliminados" v-if="result.eliminados?.length">
          <div class="chips-wrap">
            <NumberChip
              v-for="n in result.eliminados"
              :key="n.numero"
              :numero="n.numero"
              size="sm"
            />
          </div>
          <p class="elim-note">
            {{ result.eliminados.length }} números descartados por el motor de eliminación.
          </p>
        </BaseCard>

        <!-- Inteligencia adicional -->
        <BaseCard v-if="result.inteligencia" title="Contexto inteligencia" :full="false">
          <pre class="intel-pre">{{ JSON.stringify(result.inteligencia, null, 2) }}</pre>
        </BaseCard>
      </div>
    </template>

    <!-- Estado vacío inicial -->
    <div v-if="!result && !loading && !error" class="empty-start">
      <div class="empty-start__icon"><i class="fa-solid fa-bullseye" /></div>
      <p>Seleccioná país y turno, luego presioná <b>Calcular</b>.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useSignalEngine } from "@/composables/useSignalEngine.js";
import BaseCard from "@/components/BaseCard.vue";
import BaseBtn from "@/components/BaseBtn.vue";
import NumberChip from "@/components/NumberChip.vue";
import HelpTooltip from "@/components/HelpTooltip.vue";

const { result, loading, error, run } = useSignalEngine();

const turno = ref("");

async function ejecutar() {
  await run({ pais: "HN", turno: turno.value || null });
}

const pad = (n) => String(n).padStart(2, "0");

function scoreColor(score) {
  if (score >= 0.5) return "var(--gold)";
  if (score >= 0.3) return "var(--cyan)";
  return "var(--text-muted)";
}
</script>

<style scoped>
.view-prediccion { display: flex; flex-direction: column; gap: var(--sp-6); }

.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--gold); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }
.view-title-row { display: flex; align-items: center; gap: var(--sp-3); }

/* Controles */
.controls-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding: var(--sp-4);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.control-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.control-label { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.select {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  background: var(--bg-raised);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
  cursor: pointer;
  transition: border-color var(--t-fast);
}
.select:focus { outline: none; border-color: var(--gold); }

/* Error */
.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}

/* Context bar */
.context-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  padding: var(--sp-2) var(--sp-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.ctx-item { display: flex; align-items: center; gap: var(--sp-1); }
.ctx-item i { color: var(--text-muted); }
.ctx-item b { color: var(--text-primary); }

/* Grid resultados */
.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--sp-4);
}

/* Candidatos */
.candidates-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.candidate-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.candidate-row:last-child { border-bottom: none; }
.candidate-rank {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  width: 24px;
  flex-shrink: 0;
}
.candidate-bar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.candidate-bar {
  height: 6px;
  border-radius: var(--r-pill);
  min-width: 2px;
  transition: width var(--t-normal);
}
.candidate-score-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  flex-shrink: 0;
  width: 24px;
  text-align: right;
}
.candidate-motors {
  display: flex;
  gap: var(--sp-1);
  flex-wrap: wrap;
}
.motor-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--bg-overlay);
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
}

/* Eliminados */
.chips-wrap { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.elim-note { margin-top: var(--sp-2); font-size: var(--text-xs); color: var(--text-muted); }

/* Intel */
.intel-pre {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

/* Empty */
.empty-state {
  display: flex; align-items: center; gap: var(--sp-2);
  color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-4) 0;
}
.empty-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-12) var(--sp-4);
  color: var(--text-muted);
  text-align: center;
}
.empty-start__icon {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: var(--gold-surface);
  display: grid; place-items: center;
  font-size: 1.8rem;
  color: var(--gold);
}
.empty-start p { font-size: var(--text-sm); max-width: 280px; }
</style>
