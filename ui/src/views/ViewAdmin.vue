<template>
  <div class="view-admin">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-gear" />
        Admin
      </h1>
      <p class="view-sub">Configuración del sistema, mantenimiento de datos y modos de juego.</p>
    </div>

    <!-- Sub-tabs -->
    <div class="sub-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="sub-tab"
        :class="{ 'sub-tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <i :class="`fa-solid ${tab.icon}`" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ── MANTENIMIENTO ──────────────────────────── -->
    <div v-if="activeTab === 'maint'" class="tab-panel">
      <h3 class="section-title">Mantenimiento de datos</h3>
      <div class="maint-actions">
        <div class="maint-card">
          <div class="maint-card__info">
            <b>Revisar duplicados</b>
            <p>Detecta sorteos duplicados en la base de datos.</p>
          </div>
          <BaseBtn variant="secondary" icon="fa-copy" :loading="loadingDups" @click="revisarDuplicados">
            Revisar
          </BaseBtn>
        </div>

        <div v-if="dups !== null" class="dup-results">
          <div v-if="!dups.length" class="ok-notice">
            <i class="fa-solid fa-circle-check" /> No se encontraron duplicados.
          </div>
          <div v-else class="warn-notice">
            <i class="fa-solid fa-triangle-exclamation" />
            {{ dups.length }} grupo{{ dups.length !== 1 ? 's' : '' }} de duplicados encontrado{{ dups.length !== 1 ? 's' : '' }}.
            <details class="dup-detail">
              <summary>Ver detalle</summary>
              <pre class="dup-pre">{{ JSON.stringify(dups.slice(0,5), null, 2) }}</pre>
            </details>
          </div>
        </div>
        <div v-if="maintError" class="error-notice">
          <i class="fa-solid fa-triangle-exclamation" /> {{ maintError }}
        </div>
      </div>
    </div>

    <!-- ── CONFIGURACIÓN ─────────────────────────── -->
    <div v-if="activeTab === 'config'" class="tab-panel">
      <h3 class="section-title">Preferencias</h3>
      <div class="config-section">
        <div class="config-row">
          <label class="config-label">País por defecto</label>
          <select v-model="prefs.paisDefault" class="select">
            <option value="HN">Honduras (HN)</option>
            <option value="GT">Guatemala (GT)</option>
            <option value="SV">El Salvador (SV)</option>
          </select>
        </div>
        <div class="config-row">
          <label class="config-label">Top-N candidatos</label>
          <select v-model.number="prefs.topN" class="select">
            <option :value="5">5</option>
            <option :value="8">8</option>
            <option :value="10">10</option>
            <option :value="15">15</option>
          </select>
        </div>
        <div class="config-row">
          <label class="config-label">Ventana reciente (batches)</label>
          <input type="number" min="5" max="100" v-model.number="prefs.recentWindow" class="num-input" />
        </div>
        <BaseBtn variant="primary" icon="fa-floppy-disk" @click="savePrefs">
          Guardar preferencias
        </BaseBtn>
        <div v-if="prefsSaved" class="ok-notice" style="margin-top:var(--sp-2)">
          <i class="fa-solid fa-circle-check" /> Guardado.
        </div>
      </div>
    </div>

    <!-- ── MODOS ─────────────────────────────────── -->
    <div v-if="activeTab === 'modos'" class="tab-panel">
      <h3 class="section-title">Modos de juego</h3>
      <div v-if="loadingModos" class="skeleton" style="height:200px;border-radius:8px" />
      <div v-else-if="modosError" class="error-notice">
        <i class="fa-solid fa-triangle-exclamation" /> {{ modosError }}
      </div>
      <div v-else-if="!modos.length" class="empty-state">
        <i class="fa-solid fa-circle-info" /> No hay modos creados todavía.
      </div>
      <div v-else class="modos-list">
        <div v-for="m in modos" :key="m.id" class="modo-row">
          <div class="modo-row__info">
            <b>{{ m.nombre ?? m.name ?? `Modo ${m.id}` }}</b>
            <span class="secondary">{{ m.descripcion ?? m.desc ?? '' }}</span>
          </div>
          <div class="modo-row__actions">
            <BaseBtn variant="ghost" size="sm" icon="fa-trash" @click="eliminarModo(m.id)">
              Eliminar
            </BaseBtn>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { revisarDuplicados as checkDups } from "@motors/maintenance.js";
import { listModesWithExamples, deleteMode } from "@motors/modes.js";
import BaseBtn from "@/components/BaseBtn.vue";

const tabs = [
  { id: "maint",  icon: "fa-wrench",  label: "Mantenimiento" },
  { id: "config", icon: "fa-sliders", label: "Configuración" },
  { id: "modos",  icon: "fa-layer-group", label: "Modos" },
];
const activeTab = ref("maint");

// ── Mantenimiento ──
const dups        = ref(null);
const loadingDups = ref(false);
const maintError  = ref(null);

async function revisarDuplicados() {
  loadingDups.value = true;
  maintError.value  = null;
  try {
    dups.value = await checkDups();
  } catch (e) {
    maintError.value = e?.message ?? String(e);
  } finally {
    loadingDups.value = false;
  }
}

// ── Configuración ──
const PREFS_KEY = "sd_ui_prefs";
const prefs = ref({
  paisDefault:   "HN",
  topN:          10,
  recentWindow:  30,
});
const prefsSaved = ref(false);

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) Object.assign(prefs.value, JSON.parse(raw));
  } catch {}
}
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.value));
  prefsSaved.value = true;
  setTimeout(() => { prefsSaved.value = false; }, 2000);
}

// ── Modos ──
const modos        = ref([]);
const loadingModos = ref(false);
const modosError   = ref(null);

async function cargarModos() {
  loadingModos.value = true;
  modosError.value   = null;
  try {
    modos.value = await listModesWithExamples();
  } catch (e) {
    modosError.value = e?.message ?? String(e);
  } finally {
    loadingModos.value = false;
  }
}

async function eliminarModo(id) {
  try {
    await deleteMode(id);
    modos.value = modos.value.filter(m => m.id !== id);
  } catch (e) {
    modosError.value = e?.message ?? String(e);
  }
}

onMounted(() => { loadPrefs(); cargarModos(); });
</script>

<style scoped>
.view-admin { display: flex; flex-direction: column; gap: var(--sp-5); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--text-muted); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }

.sub-tabs {
  display: flex; gap: var(--sp-1); flex-wrap: wrap;
  padding: var(--sp-1);
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-md); width: fit-content;
}
.sub-tab {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  font-size: var(--text-sm); color: var(--text-secondary);
  transition: background var(--t-fast), color var(--t-fast);
}
.sub-tab:hover { background: var(--bg-raised); color: var(--text-primary); }
.sub-tab--active { background: var(--gold-surface); color: var(--gold); }

.tab-panel {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--sp-5);
  display: flex; flex-direction: column; gap: var(--sp-4);
}
.section-title {
  font-size: var(--text-sm); font-weight: var(--fw-semi);
  color: var(--text-secondary); text-transform: uppercase; letter-spacing: .06em;
}

/* Mantenimiento */
.maint-actions { display: flex; flex-direction: column; gap: var(--sp-4); }
.maint-card {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-4); background: var(--bg-raised); border-radius: var(--r-md);
  border: 1px solid var(--border-subtle);
}
.maint-card__info { display: flex; flex-direction: column; gap: var(--sp-1); }
.maint-card__info p { font-size: var(--text-xs); color: var(--text-muted); }

/* Config */
.config-section { display: flex; flex-direction: column; gap: var(--sp-4); }
.config-row { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; }
.config-label { font-size: var(--text-sm); color: var(--text-secondary); min-width: 160px; }
.select {
  font-family: var(--font-sans); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3); cursor: pointer;
}
.select:focus { outline: none; border-color: var(--gold); }
.num-input {
  font-family: var(--font-mono); font-size: var(--text-sm); width: 80px;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm); padding: var(--sp-2) var(--sp-3);
  text-align: center;
}
.num-input:focus { outline: none; border-color: var(--gold); }

/* Modos */
.modos-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.modo-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised); border-radius: var(--r-sm);
  border: 1px solid var(--border-subtle);
}
.modo-row__info { display: flex; flex-direction: column; gap: 2px; }
.modo-row__actions { flex-shrink: 0; }
.secondary { font-size: var(--text-xs); color: var(--text-muted); }

/* Notices */
.ok-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  background: var(--green-surface); border: 1px solid var(--green);
  border-radius: var(--r-sm); color: var(--green); font-size: var(--text-sm);
}
.warn-notice {
  display: flex; align-items: flex-start; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface); border: 1px solid var(--yellow);
  border-radius: var(--r-md); color: var(--yellow); font-size: var(--text-sm);
  flex-direction: column;
}
.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
.empty-state { display: flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-4) 0; }

.dup-detail summary { cursor: pointer; font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--sp-1); }
.dup-pre { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); white-space: pre-wrap; margin-top: var(--sp-2); }
</style>
