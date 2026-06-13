<template>
  <div class="view-hoy">
    <!-- ── Header ──────────────────────────────────── -->
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-gauge" />
        Panel del día
      </h1>
      <p class="view-sub">{{ fechaLabel }} · Registrá resultados y consultá el historial.</p>
    </div>

    <!-- ── Controles ─────────────────────────────── -->
    <div class="controls-bar">
      <div class="control-group">
        <label class="control-label">Fecha</label>
        <input type="date" v-model="fecha" class="select" />
      </div>
      <BaseBtn variant="secondary" icon="fa-rotate" :loading="loadingDraws" @click="reloadDraws">
        Actualizar
      </BaseBtn>
    </div>

    <!-- ── Slots del día ──────────────────────────── -->
    <div class="slots-grid">
      <div
        v-for="slot in TURNOS"
        :key="slot.id"
        class="slot-card"
        :class="{
          'slot-card--filled': getSlotResult(slot.id),
          'slot-card--active': isCurrentSlot(slot.id),
        }"
      >
        <div class="slot-card__header">
          <span class="slot-card__time">{{ slot.label }}</span>
          <span v-if="isCurrentSlot(slot.id)" class="slot-card__now">AHORA</span>
        </div>

        <!-- Resultado existente -->
        <div v-if="getSlotResult(slot.id)" class="slot-card__result">
          <span class="slot-num mono">{{ pad(getSlotResult(slot.id).numero) }}</span>
          <span class="slot-reg">registrado</span>
        </div>

        <!-- Formulario de registro -->
        <div v-else class="slot-card__form">
          <input
            type="text"
            inputmode="numeric"
            maxlength="2"
            placeholder="00–99"
            class="slot-input"
            v-model="formValues[slot.id]"
            @keyup.enter="registrar(slot.id)"
          />
          <BaseBtn
            variant="primary"
            size="sm"
            icon="fa-check"
            :loading="savingSlot === slot.id"
            :disabled="formValues[slot.id] === ''"
            @click="registrar(slot.id)"
          >
            OK
          </BaseBtn>
        </div>

        <div v-if="slotErrors[slot.id]" class="slot-error">
          {{ slotErrors[slot.id] }}
        </div>
      </div>
    </div>

    <!-- ── Historial reciente ──────────────────────── -->
    <BaseCard title="Historial reciente">
      <template #action>
        <span class="history-count">{{ filteredDraws.length }} sorteos</span>
      </template>

      <div v-if="loadingDraws" class="skeleton" style="height:200px;border-radius:6px" />
      <div v-else-if="errorDraws" class="error-notice">
        <i class="fa-solid fa-triangle-exclamation" /> {{ errorDraws }}
      </div>
      <div v-else-if="!filteredDraws.length" class="empty-state">
        <i class="fa-solid fa-inbox" />
        Aún no hay sorteos registrados.
      </div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Turno</th>
              <th class="num-col">Número</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in recentDraws" :key="d.id">
              <td>{{ d.fecha }}</td>
              <td>{{ d.horario }}</td>
              <td class="num-col">
                <NumberChip :numero="d.numero" size="sm" />
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="filteredDraws.length > 50" class="history-more">
          Mostrando últimos 50 de {{ filteredDraws.length }} sorteos.
        </p>
      </div>
    </BaseCard>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { DB } from "@motors/storage.js";
import BaseCard from "@/components/BaseCard.vue";
import BaseBtn from "@/components/BaseBtn.vue";
import NumberChip from "@/components/NumberChip.vue";

const TURNOS = [
  { id: "11AM", label: "11 AM", hour: 11 },
  { id: "3PM",  label: "3 PM",  hour: 15 },
  { id: "9PM",  label: "9 PM",  hour: 21 },
];

const pais        = "HN";
const fecha       = ref(new Date().toISOString().slice(0, 10));
const draws       = ref([]);
const loadingDraws= ref(false);
const errorDraws  = ref(null);
const savingSlot  = ref(null);
const formValues  = ref(Object.fromEntries(TURNOS.map(t => [t.id, ""])));
const slotErrors  = ref({});

const fechaLabel = computed(() => {
  const label = new Date(fecha.value + "T12:00:00").toLocaleDateString("es-HN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const filteredDraws = computed(() =>
  draws.value
    .filter(d => !d.isTest && (d.pais || "").toUpperCase() === pais)
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    })
);

const recentDraws = computed(() => filteredDraws.value.slice(0, 50));

function getSlotResult(turnoId) {
  return draws.value.find(d =>
    d.fecha === fecha.value &&
    (d.pais || "").toUpperCase() === pais &&
    d.horario === turnoId &&
    !d.isPending
  ) ?? null;
}

function isCurrentSlot(turnoId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (fecha.value !== today) return false;
  const nowH = now.getHours();
  const slot  = TURNOS.find(t => t.id === turnoId);
  const next  = TURNOS[TURNOS.indexOf(slot) + 1];
  return nowH >= (slot?.hour ?? 0) - 1 && nowH < (next?.hour ?? 24);
}

async function reloadDraws() {
  loadingDraws.value = true;
  errorDraws.value   = null;
  try {
    draws.value = await DB.listDraws({ excludeTest: false });
  } catch (e) {
    errorDraws.value = e?.message ?? String(e);
  } finally {
    loadingDraws.value = false;
  }
}

async function registrar(turnoId) {
  const raw = String(formValues.value[turnoId] ?? "").trim();
  if (raw === "") return;
  const numero = parseInt(raw, 10);
  if (isNaN(numero) || numero < 0 || numero > 99) {
    slotErrors.value[turnoId] = "Número fuera de rango (00–99)";
    return;
  }
  savingSlot.value  = turnoId;
  slotErrors.value  = { ...slotErrors.value, [turnoId]: null };
  try {
    await DB.saveDraw({
      numero,
      fecha:   fecha.value,
      pais:    pais,
      horario: turnoId,
    });
    formValues.value[turnoId] = "";
    await reloadDraws();
  } catch (e) {
    slotErrors.value = { ...slotErrors.value, [turnoId]: e?.message ?? "Error al guardar" };
  } finally {
    savingSlot.value = null;
  }
}

const pad = (n) => String(n).padStart(2, "0");

onMounted(reloadDraws);
</script>

<style scoped>
.view-hoy { display: flex; flex-direction: column; gap: var(--sp-6); }

.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--gold); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }

/* Controles */
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

/* Slots */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-3);
}
@media (max-width: 480px) {
  .slots-grid { grid-template-columns: 1fr; }
}
.slot-card {
  display: flex; flex-direction: column; gap: var(--sp-2);
  padding: var(--sp-4);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-md);
  transition: border-color var(--t-fast);
}
.slot-card--filled  { border-color: var(--green); background: var(--green-surface); }
.slot-card--active  { border-color: var(--gold); }

.slot-card__header { display: flex; align-items: center; justify-content: space-between; }
.slot-card__time   { font-weight: var(--fw-semi); font-size: var(--text-sm); }
.slot-card__now {
  font-size: 10px; font-weight: var(--fw-bold); color: var(--gold);
  background: var(--gold-surface); border: 1px solid var(--gold-dim);
  border-radius: var(--r-pill); padding: 1px 6px; letter-spacing: .05em;
}

.slot-card__result { display: flex; align-items: baseline; gap: var(--sp-2); }
.slot-num { font-size: var(--text-2xl); font-weight: var(--fw-bold); color: var(--green); }
.slot-reg  { font-size: var(--text-xs); color: var(--text-muted); }

.slot-card__form { display: flex; gap: var(--sp-2); align-items: center; }
.slot-input {
  font-family: var(--font-mono); font-size: var(--text-base);
  width: 64px; text-align: center;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2);
}
.slot-input:focus { outline: none; border-color: var(--gold); }
.slot-input::-webkit-outer-spin-button,
.slot-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.slot-error { font-size: var(--text-xs); color: var(--red); }

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
.num-col { text-align: right; }
.history-more { margin-top: var(--sp-2); font-size: var(--text-xs); color: var(--text-muted); }

/* Error / Empty */
.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
.empty-state {
  display: flex; align-items: center; gap: var(--sp-2);
  color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-4) 0;
}
</style>
