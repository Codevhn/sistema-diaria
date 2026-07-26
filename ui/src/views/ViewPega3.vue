<template>
  <div class="view-pega3">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-dice" />
        Pega3
      </h1>
      <p class="view-sub">Registrá sorteos de tres pares y analizá candidatos.</p>
    </div>

    <!-- ── Registro ─────────────────────────────────── -->
    <BaseCard title="Registrar sorteo Pega3">
      <div class="reg-form">
        <div class="control-group">
          <label class="control-label">Fecha</label>
          <input type="date" v-model="regFecha" class="select" />
        </div>
        <div class="control-group">
          <label class="control-label">Turno</label>
          <select v-model="regTurno" class="select">
            <option value="">— Seleccioná —</option>
            <option value="11AM">11 AM</option>
            <option value="3PM">3 PM</option>
            <option value="9PM">9 PM</option>
          </select>
        </div>
        <div class="pares-group">
          <label class="control-label">3 Pares (00–99)</label>
          <div class="pares-inputs">
            <input
              v-for="i in 3"
              :key="i"
              type="text"
              inputmode="numeric"
              maxlength="2"
              placeholder="00"
              class="par-input"
              v-model="regPares[i - 1]"
              @keyup.enter="registrarPega3"
            />
          </div>
        </div>
        <BaseBtn
          variant="primary"
          size="sm"
          icon="fa-check"
          :loading="saving"
          :disabled="!canSave"
          @click="registrarPega3"
        >
          Guardar
        </BaseBtn>
      </div>
      <p v-if="regError" class="reg-error">{{ regError }}</p>
    </BaseCard>

    <!-- ── Historial ─────────────────────────────────── -->
    <BaseCard title="Historial Pega3">
      <template #action>
        <div style="display:flex;align-items:center;gap:var(--sp-3)">
          <span class="history-count">{{ pega3Draws.length }} sorteos</span>
          <BaseBtn variant="secondary" size="sm" icon="fa-rotate" :loading="loadingHistory" @click="reloadHistory">
            Actualizar
          </BaseBtn>
        </div>
      </template>

      <div v-if="loadingHistory" class="skeleton" style="height:160px;border-radius:6px" />
      <div v-else-if="historyError" class="error-notice">
        <i class="fa-solid fa-triangle-exclamation" /> {{ historyError }}
      </div>
      <div v-else-if="!pega3Draws.length" class="empty-state">
        <i class="fa-solid fa-inbox" /> Aún no hay sorteos Pega3 registrados.
      </div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Par 1</th>
              <th>Par 2</th>
              <th>Par 3</th>
              <th>Turno</th>
              <th>Fecha</th>
              <th class="del-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in recentPega3" :key="d.id">
              <td class="par-col mono">{{ padNum(d.pares?.[0]) }}</td>
              <td class="par-col mono">{{ padNum(d.pares?.[1]) }}</td>
              <td class="par-col mono">{{ padNum(d.pares?.[2]) }}</td>
              <td>{{ d.horario }}</td>
              <td>{{ d.fecha }}</td>
              <td class="del-col">
                <button
                  class="del-btn"
                  :disabled="deletingId === d.id"
                  :title="`Eliminar sorteo Pega3 del ${d.fecha}`"
                  @click="pedirEliminar(d)"
                >
                  <i class="fa-solid" :class="deletingId === d.id ? 'fa-spinner fa-spin' : 'fa-trash-can'" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="pega3Draws.length > 50" class="history-more">
          Mostrando últimos 50 de {{ pega3Draws.length }} sorteos.
        </p>
      </div>
    </BaseCard>

    <!-- ── Análisis ───────────────────────────────────── -->
    <div class="section-label">
      <i class="fa-solid fa-chart-line" /> Análisis de candidatos
    </div>
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
      <div v-if="!result.seleccion?.top?.length" class="empty-state">
        <i class="fa-solid fa-circle-info" />
        Sin suficientes datos Pega3 para generar candidatos.
      </div>

      <div v-else class="results-grid">
        <div v-if="result.seleccion.turnoObjetivo" class="turno-badge">
          <i class="fa-solid fa-clock" />
          Turno objetivo: <b>{{ result.seleccion.turnoObjetivo.label }}</b>
        </div>

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

        <BaseCard v-if="result.seleccion.secundarios?.length" title="Secundarios">
          <div class="chips-wrap">
            <span
              v-for="c in result.seleccion.secundarios"
              :key="c.numero"
              class="pega3-chip"
            >{{ String(c.numero).padStart(3, '0') }}</span>
          </div>
        </BaseCard>

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
      <p>Presioná <b>Analizar</b> para generar candidatos desde el historial.</p>
    </div>
  </div>

  <ConfirmModal
    :model-value="!!confirmTarget"
    title="Eliminar sorteo Pega3"
    :message="confirmTarget ? `¿Eliminar sorteo del ${confirmTarget.fecha} (${confirmTarget.horario})? Esta acción no se puede deshacer.` : ''"
    confirm-label="Eliminar"
    cancel-label="Cancelar"
    icon="fa-trash-can"
    icon-color="var(--red)"
    variant="danger"
    @confirm="confirmarEliminar"
    @cancel="confirmTarget = null"
  />
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { DB } from "@motors/storage.js";
import { evaluarMotorPega3 } from "@motors/pega3-engine.js";
import BaseCard from "@/components/BaseCard.vue";
import BaseBtn from "@/components/BaseBtn.vue";
import ConfirmModal from "@/components/ConfirmModal.vue";

const result  = ref(null);
const loading = ref(false);
const error   = ref(null);

// --- Registro ---
const regFecha  = ref(new Date().toISOString().slice(0, 10));
const regTurno  = ref("");
const regPares  = ref(["", "", ""]);
const saving    = ref(false);
const regError  = ref(null);

const canSave = computed(() => {
  if (!regFecha.value || !regTurno.value) return false;
  return regPares.value.every(p => p.trim() !== "" && !isNaN(parseInt(p, 10)));
});

async function registrarPega3() {
  if (!canSave.value) return;
  regError.value = null;
  const pares = regPares.value.map(p => parseInt(p.trim(), 10));
  if (pares.some(n => n < 0 || n > 99)) {
    regError.value = "Cada par debe ser un número entre 00 y 99.";
    return;
  }
  saving.value = true;
  try {
    await DB.savePega3Draw({
      fecha:   regFecha.value,
      horario: regTurno.value,
      pais:    "HN",
      pares,
    });
    regPares.value = ["", "", ""];
    await reloadHistory();
  } catch (e) {
    regError.value = e?.message ?? "Error al guardar";
  } finally {
    saving.value = false;
  }
}

// --- Historial ---
const pega3Draws    = ref([]);
const loadingHistory= ref(false);
const historyError  = ref(null);
const deletingId    = ref(null);
const confirmTarget = ref(null);

const recentPega3 = computed(() =>
  [...pega3Draws.value]
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    })
    .slice(0, 50)
);

async function reloadHistory() {
  loadingHistory.value = true;
  historyError.value   = null;
  try {
    pega3Draws.value = await DB.listPega3Draws({ pais: "HN" });
  } catch (e) {
    historyError.value = e?.message ?? String(e);
  } finally {
    loadingHistory.value = false;
  }
}

function pedirEliminar(d) {
  confirmTarget.value = { id: d.id, fecha: d.fecha, horario: d.horario };
}

async function confirmarEliminar() {
  const target = confirmTarget.value;
  confirmTarget.value = null;
  if (!target) return;
  deletingId.value = target.id;
  try {
    await DB.deletePega3Draw(target.id);
    await reloadHistory();
  } catch (e) {
    console.error(e);
  } finally {
    deletingId.value = null;
  }
}

// --- Análisis ---
async function ejecutar() {
  loading.value = true;
  error.value   = null;
  result.value  = null;
  try {
    const draws = await DB.listPega3Draws({ pais: "HN" });
    result.value = evaluarMotorPega3(draws);
  } catch (e) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

const padNum = (n) => n != null ? String(n).padStart(2, "0") : "–";

onMounted(reloadHistory);
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

/* Registro */
.reg-form {
  display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sp-4);
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

.pares-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.pares-inputs { display: flex; gap: var(--sp-2); }
.par-input {
  font-family: var(--font-mono); font-size: var(--text-base);
  width: 56px; text-align: center;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2);
}
.par-input:focus { outline: none; border-color: var(--gold); }
.reg-error { margin-top: var(--sp-2); font-size: var(--text-xs); color: var(--red); }

/* Section label */
.section-label {
  display: flex; align-items: center; gap: var(--sp-2);
  font-size: var(--text-sm); font-weight: var(--fw-semi); color: var(--text-secondary);
}

/* Historial */
.history-count { font-size: var(--text-xs); color: var(--text-muted); }
.history-table-wrap { overflow-x: auto; }
.history-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.history-table th {
  padding: var(--sp-2) var(--sp-3); text-align: left;
  font-weight: var(--fw-semi); color: var(--text-muted);
  font-size: var(--text-xs); text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 1px solid var(--border);
}
.history-table td {
  padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
.history-table tr:last-child td { border-bottom: none; }
.par-col { font-family: var(--font-mono); font-weight: var(--fw-bold); color: var(--gold); }
.del-col { text-align: right; width: 36px; }
.del-btn {
  width: 28px; height: 28px; display: grid; place-items: center;
  border-radius: var(--r-sm); color: var(--text-muted); font-size: .8rem;
  transition: background var(--t-fast), color var(--t-fast);
  opacity: 0;
}
.history-table tr:hover .del-btn { opacity: 1; }
.del-btn:hover { background: var(--red-surface); color: var(--red); }
.del-btn:disabled { opacity: .4; cursor: default; }
.history-more { margin-top: var(--sp-2); font-size: var(--text-xs); color: var(--text-muted); }

/* Controles */
.controls-bar {
  display: flex; align-items: flex-end; gap: var(--sp-4); flex-wrap: wrap;
  padding: var(--sp-4);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-md);
}

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
.mono { font-family: var(--font-mono); }
</style>
