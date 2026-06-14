<template>
  <div class="view-validacion">
    <!-- ── Header ──────────────────────────────────── -->
    <div class="view-header">
      <div class="view-title-row">
        <h1 class="view-title">
          <i class="fa-solid fa-circle-check" />
          Validación
        </h1>
        <HelpTooltip title="¿Cómo se mide la honestidad del sistema?">
          <p>Este panel responde la pregunta que importa: <b>¿el motor predice mejor que elegir al azar?</b></p>
          <p>Con 10 candidatos, elegir al azar acierta el 10% de las veces (baseline). Si el sistema acierta el 15%, el lift es 1.5×.</p>
          <p>El <b>IC95%</b> (intervalo de credibilidad) muestra el rango real del hit-rate dado el número de intentos. Con pocas predicciones el intervalo es amplio; con más datos se estrecha.</p>
          <p>El <b>veredicto</b> es honesto:</p>
          <ul>
            <li><b>Ventaja demostrada</b> — todo el IC95% del lift está sobre 1.0</li>
            <li><b>Sin ventaja demostrada</b> — el intervalo incluye 1.0 (puede ser suerte)</li>
            <li><b>Peor que el azar</b> — todo el intervalo bajo 1.0</li>
          </ul>
          <p>Solo cuentan predicciones <b>selladas</b>: registradas antes del sorteo (verificado por timestamp de servidor). Las post-hoc se excluyen automáticamente.</p>
        </HelpTooltip>
      </div>
      <p class="view-sub">
        Responde sin maquillaje: ¿el sistema le gana al azar?
      </p>
    </div>

    <!-- ── Loading / Error ──────────────────────────── -->
    <div v-if="loading" class="metrics-grid">
      <div v-for="i in 4" :key="i" class="skeleton" style="height:100px;border-radius:10px" />
    </div>

    <div v-else-if="error" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" />
      {{ error }}
    </div>

    <template v-else-if="stats">
      <!-- ── Métricas principales ──────────────────── -->
      <div class="metrics-grid">
        <StatBadge
          label="Hit-rate acumulado"
          :value="pct(stats.hitRate)"
          :sub="stats.resolved ? `${stats.hits}/${stats.resolved} · azar ${pct(stats.baseline)}` : 'Sin datos'"
          :color="liftColor(stats.lift)"
        />
        <StatBadge
          label="Lift vs azar"
          :value="`${stats.lift.toFixed(2)}×`"
          :sub="ci ? `IC95: ${pct(ci.low)} – ${pct(ci.high)}` : ''"
          :color="liftColor(stats.lift)"
        />
        <StatBadge
          :label="`Últimos ${stats.recent.n}`"
          :value="pct(stats.recent.hitRate)"
          :sub="`${stats.recent.hits}/${stats.recent.n} · ${liftSign(stats.recent.lift)}${((stats.recent.lift-1)*100).toFixed(0)}% vs azar`"
          :color="liftColor(stats.recent.lift)"
        />
        <StatBadge
          label="Racha actual"
          :value="streakLabel"
          :sub="`${stats.pending} pendiente${stats.pending !== 1 ? 's' : ''}`"
          color="neutral"
        />
      </div>

      <!-- ── Nota excluidos no sellados ───────────────── -->
      <div v-if="stats.excluidosNoSellados" class="seal-notice">
        <i class="fa-solid fa-lock" />
        <span>
          <b>{{ stats.excluidosNoSellados }}</b> batch{{ stats.excluidosNoSellados !== 1 ? 'es' : '' }} excluido{{ stats.excluidosNoSellados !== 1 ? 's' : '' }}:
          predicciones registradas <em>después</em> del sorteo (post-hoc) no cuentan como evidencia.
        </span>
      </div>

      <!-- ── Veredicto del lift ───────────────────── -->
      <BaseCard title="Veredicto del lift" variant="cyan">
        <div class="verdict-wrap">
          <VerdictBadge :level="liftVerdict.level" :label="liftVerdict.label" />
          <p class="verdict-desc">{{ liftVerdict.desc }}</p>
          <div v-if="ci && stats.resolved >= 10" class="ci-bar-wrap">
            <div class="ci-bar">
              <div
                class="ci-bar__fill"
                :style="`left:${ciBarLeft}%;width:${ciBarWidth}%;background:${ciColor}`"
              />
              <div class="ci-bar__marker" :style="`left:${ciBarBaseline}%`" title="Baseline azar" />
            </div>
            <div class="ci-bar__labels">
              <span>0%</span>
              <span class="ci-bar__baseline-label">azar {{ pct(stats.baseline) }}</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </BaseCard>

      <!-- ── Tests de aleatoriedad ─────────────────── -->
      <BaseCard title="Tests de aleatoriedad del sorteo">
        <template #action>
          <BaseBtn size="sm" icon="fa-rotate" @click="reload">Recargar</BaseBtn>
        </template>

        <div v-if="!audit" class="empty-state">
          <i class="fa-solid fa-flask" />
          Carga sorteos para ejecutar los tests.
        </div>

        <template v-else>
          <div class="audit-header">
            <VerdictBadge
              :level="auditLevel"
              :label="auditLabel.label"
            />
            <span class="audit-meta">
              {{ audit.totalSorteos }} sorteos analizados
              <template v-if="audit.entropia !== null">
                · entropía {{ (audit.entropia * 100).toFixed(1) }}%
              </template>
            </span>
          </div>
          <p class="audit-desc">{{ auditLabel.desc }}</p>

          <div v-if="audit.suficiente" class="audit-table-wrap">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th class="num-col">p-valor</th>
                  <th class="num-col">FDR</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="t in audit.tests"
                  :key="t.nombre"
                  :class="{ 'row--sig': t.significativoFDR }"
                >
                  <td>{{ t.nombre }}</td>
                  <td class="num-col">{{ formatP(t.pValue) }}</td>
                  <td class="num-col sig-col">{{ t.significativoFDR ? '✓' : '' }}</td>
                  <td class="detail-col">
                    {{ t.detalle }}
                    <span v-if="t.advertencia" class="warn-tag">⚠ {{ t.advertencia }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="table-footnote">
              FDR ✓ = significativo tras corrección Benjamini-Hochberg (q = 0.05)
            </p>
          </div>

          <div v-else class="empty-state">
            <i class="fa-solid fa-hourglass-half" />
            Se necesitan {{ audit.minimo }} sorteos para los tests (hay {{ audit.totalSorteos }}).
          </div>
        </template>
      </BaseCard>

      <!-- ── Historial de batches ─────────────────── -->
      <BaseCard v-if="stats.resolvedBatches?.length" title="Historial de predicciones selladas">
        <div class="batch-list">
          <div
            v-for="b in stats.resolvedBatches.slice(0, 20)"
            :key="b.key"
            class="batch-row"
            :class="b.hit ? 'batch-row--hit' : 'batch-row--miss'"
          >
            <span class="batch-icon">{{ b.hit ? '✅' : '❌' }}</span>
            <span class="batch-fecha">{{ b.fecha }} · {{ b.turno }} · {{ (b.pais||'').toUpperCase() }}</span>
            <div class="batch-chips">
              <NumberChip
                v-for="r in sortedRows(b)"
                :key="r.numero"
                :numero="r.numero"
                :symbol="sym(r.numero)"
                :hit="r.estado === 'acierto'"
                size="sm"
              />
            </div>
          </div>
        </div>
      </BaseCard>
    </template>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import { useHitTracker } from "@/composables/useHitTracker.js";
import { useDraws } from "@/composables/useDraws.js";
import { auditarAleatoriedad, VEREDICTO_LABEL } from "@motors/randomness-audit.js";
import BaseCard from "@/components/BaseCard.vue";
import BaseBtn from "@/components/BaseBtn.vue";
import StatBadge from "@/components/StatBadge.vue";
import VerdictBadge from "@/components/VerdictBadge.vue";
import NumberChip from "@/components/NumberChip.vue";
import HelpTooltip from "@/components/HelpTooltip.vue";
import { useGuide } from "@/composables/useGuide.js";

const { stats, ci, loading, error, reload } = useHitTracker(30);
const { sym } = useGuide();
const { draws } = useDraws();

// ── Auditoría de aleatoriedad ────────────────────────
const audit = computed(() => {
  if (!draws.value?.length) return null;
  try {
    return auditarAleatoriedad(draws.value, { pais: "HN" });
  } catch {
    return null;
  }
});

const auditLevel = computed(() => {
  if (!audit.value) return "unknown";
  return {
    compatible_con_azar: "win",
    desviaciones_leves:  "neutral",
    no_uniforme:         "lose",
    insuficiente:        "unknown",
  }[audit.value.veredicto] ?? "unknown";
});

const auditLabel = computed(() => {
  if (!audit.value) return { label: "—", desc: "" };
  return VEREDICTO_LABEL[audit.value.veredicto] ?? VEREDICTO_LABEL.insuficiente;
});

// ── Helpers de formato ───────────────────────────────
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const liftSign = (v) => v >= 1 ? "+" : "";

function liftColor(lift) {
  if (!lift) return "neutral";
  if (lift >= 1.15) return "green";
  if (lift >= 0.85) return "neutral";
  return "red";
}

const streakLabel = computed(() => {
  if (!stats.value) return "—";
  if (stats.value.streakHits)   return `🟢 ${stats.value.streakHits} seguidas`;
  if (stats.value.streakMisses) return `🔴 ${stats.value.streakMisses} fallidas`;
  return "—";
});

// ── Veredicto del lift (texto) ───────────────────────
const liftVerdict = computed(() => {
  if (!stats.value || !stats.value.resolved) {
    return { level: "unknown", label: "Sin datos suficientes", desc: "Registrá sorteos para empezar a medir." };
  }
  const n = stats.value.resolved;
  if (n < 10) {
    return { level: "unknown", label: "Sin datos suficientes", desc: `Solo ${n} predicciones evaluadas; se necesitan ≥10 para empezar a medir.` };
  }
  if (!ci.value) return { level: "unknown", label: "Calculando…", desc: "" };
  const low  = ci.value.low  / stats.value.baseline;
  const high = ci.value.high / stats.value.baseline;
  if (low > 1)  return { level: "win",     label: "Ventaja demostrada",    desc: "Todo el IC95% del lift está por encima de 1: el sistema supera al azar con esta muestra." };
  if (high < 1) return { level: "lose",    label: "Peor que el azar",      desc: "Todo el IC95% está por debajo de 1: con esta muestra el sistema rinde peor que elegir al azar." };
  return         { level: "neutral", label: "Sin ventaja demostrada", desc: "El intervalo del lift contiene 1.0: no se puede afirmar que el sistema le gane al azar (ni que pierda)." };
});

// ── Barra visual del IC95% del hit-rate ─────────────
const ciBarLeft     = computed(() => (ci.value?.low     ?? 0) * 100);
const ciBarWidth    = computed(() => ((ci.value?.high ?? 0) - (ci.value?.low ?? 0)) * 100);
const ciBarBaseline = computed(() => (stats.value?.baseline ?? 0.08) * 100);
const ciColor       = computed(() => ({
  green: "var(--green)", red: "var(--red)", neutral: "var(--yellow)",
}[liftColor(stats.value?.lift)] ?? "var(--yellow)"));

// ── Batch helpers ────────────────────────────────────
function sortedRows(b) {
  return [...b.rows]
    .filter(r => r.estado !== "descartado")
    .sort((a, z) => (z.score ?? 0) - (a.score ?? 0));
}

function formatP(pValue) {
  if (!Number.isFinite(pValue)) return "—";
  if (pValue < 0.001) return "<0.001";
  return pValue.toFixed(3);
}
</script>

<style scoped>
.view-validacion { display: flex; flex-direction: column; gap: var(--sp-6); }

.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--cyan); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }
.view-title-row { display: flex; align-items: center; gap: var(--sp-3); }

/* Métricas */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--sp-3);
}

/* Aviso sellado */
.seal-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: var(--cyan-surface);
  border: 1px solid var(--cyan-dim);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.seal-notice i { color: var(--cyan); margin-top: 2px; flex-shrink: 0; }

/* Error */
.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}

/* Veredicto */
.verdict-wrap { display: flex; flex-direction: column; gap: var(--sp-3); }
.verdict-desc { font-size: var(--text-sm); color: var(--text-secondary); }

/* Barra IC95% */
.ci-bar-wrap { display: flex; flex-direction: column; gap: var(--sp-1); }
.ci-bar {
  position: relative;
  height: 10px;
  background: var(--bg-raised);
  border-radius: var(--r-pill);
  overflow: visible;
}
.ci-bar__fill {
  position: absolute;
  top: 0; bottom: 0;
  border-radius: var(--r-pill);
  opacity: .6;
}
.ci-bar__marker {
  position: absolute;
  top: -3px; bottom: -3px;
  width: 2px;
  background: var(--text-muted);
  border-radius: var(--r-pill);
  transform: translateX(-50%);
}
.ci-bar__labels {
  display: flex; justify-content: space-between;
  font-size: var(--text-xs); color: var(--text-muted);
  font-family: var(--font-mono);
}
.ci-bar__baseline-label {
  position: absolute;
  left: v-bind("`${ciBarBaseline}%`");
  transform: translateX(-50%);
  color: var(--text-secondary);
}

/* Auditoría */
.audit-header {
  display: flex; align-items: center; gap: var(--sp-3);
  flex-wrap: wrap; margin-bottom: var(--sp-2);
}
.audit-meta { font-size: var(--text-xs); color: var(--text-muted); }
.audit-desc { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--sp-4); }

.audit-table-wrap { overflow-x: auto; }
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.audit-table thead tr {
  border-bottom: 1px solid var(--border);
}
.audit-table th {
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  font-weight: var(--fw-semi);
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.audit-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  vertical-align: top;
}
.audit-table tr:last-child td { border-bottom: none; }
.audit-table .num-col { text-align: right; font-family: var(--font-mono); white-space: nowrap; }
.audit-table .detail-col { font-size: var(--text-xs); max-width: 240px; }
.audit-table .sig-col { color: var(--red); font-weight: var(--fw-semi); }
.row--sig td { color: var(--text-primary); }
.row--sig { background: var(--red-surface); }
.warn-tag { color: var(--yellow); font-size: .9em; display: block; }

.table-footnote {
  margin-top: var(--sp-3);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Batches */
.batch-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.batch-row {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--bg-raised);
  flex-wrap: wrap;
}
.batch-row--hit { border-left: 3px solid var(--green); }
.batch-row--miss { border-left: 3px solid var(--red); }
.batch-icon { font-size: 1.1em; flex-shrink: 0; }
.batch-fecha { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; }
.batch-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-left: auto; }

/* Empty */
.empty-state {
  display: flex; align-items: center; gap: var(--sp-2);
  color: var(--text-muted); font-size: var(--text-sm);
  padding: var(--sp-4) 0;
}
</style>
