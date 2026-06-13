<template>
  <div class="tab-pares">
    <div class="controls-bar">
      <div class="control-group">
        <label class="control-label">Último número caído</label>
        <input
          type="number" min="0" max="99" v-model.number="ultimoNum"
          class="num-input" placeholder="ej. 47"
        />
      </div>
      <div class="control-group">
        <label class="control-label">Turno (opcional)</label>
        <select v-model="turno" class="select">
          <option value="">Todos</option>
          <option value="11AM">11 AM</option>
          <option value="3PM">3 PM</option>
          <option value="9PM">9 PM</option>
        </select>
      </div>
      <BaseBtn variant="primary" size="sm" icon="fa-magnifying-glass" :loading="loading" @click="buscar">
        Analizar
      </BaseBtn>
    </div>

    <div v-if="loading" class="skeleton" style="height:200px;border-radius:10px" />
    <div v-else-if="error" class="error-notice"><i class="fa-solid fa-triangle-exclamation" /> {{ error }}</div>

    <template v-else-if="candidates">
      <div v-if="!candidates.length" class="empty-state">
        <i class="fa-solid fa-circle-info" /> No hay candidatos relacionados con ese número.
      </div>
      <div v-else class="candidates-table-wrap">
        <table class="candidates-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Relación</th>
              <th class="num-col">Ocurrencias</th>
              <th class="num-col">Frecuencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in candidates" :key="c.numero">
              <td><NumberChip :numero="c.numero" size="sm" /></td>
              <td class="rel-col">{{ c.relation }}</td>
              <td class="num-col">{{ c.count }}</td>
              <td class="num-col">{{ (c.freq * 100).toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else class="empty-state">
      <i class="fa-solid fa-puzzle-piece" />
      Ingresá el último número caído y presioná Analizar.
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { DB } from "@motors/storage.js";
import { buildRelationStats, getCandidates } from "@motors/relation-analyzer.js";
import NumberChip from "@/components/NumberChip.vue";
import BaseBtn from "@/components/BaseBtn.vue";

const ultimoNum = ref(null);
const turno     = ref("");
const candidates= ref(null);
const loading   = ref(false);
const error     = ref(null);

async function buscar() {
  const n = ultimoNum.value;
  if (n == null || isNaN(n) || n < 0 || n > 99) return;
  loading.value   = true;
  error.value     = null;
  candidates.value= null;
  try {
    const draws = await DB.listDraws({ excludeTest: true });
    const stats = buildRelationStats(draws);
    const raw   = getCandidates(Math.round(n), stats, { horario: turno.value || null });
    candidates.value = raw.map(c => ({
      numero:   c.numero,
      relation: c.relation ?? c.key ?? "—",
      count:    c.count ?? c.total ?? 0,
      freq:     c.freq ?? (c.count ? c.count / (draws.length || 1) : 0),
    })).sort((a, b) => b.count - a.count);
  } catch (e) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.tab-pares { display: flex; flex-direction: column; gap: var(--sp-5); }

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
.num-input {
  font-family: var(--font-mono); font-size: var(--text-base); width: 70px; text-align: center;
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm); padding: var(--sp-2);
}
.num-input:focus { outline: none; border-color: var(--gold); }
.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.candidates-table-wrap { overflow-x: auto; }
.candidates-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.candidates-table th {
  padding: var(--sp-2) var(--sp-3); text-align: left;
  font-weight: var(--fw-semi); color: var(--text-muted); font-size: var(--text-xs);
  text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--border);
}
.candidates-table td { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); }
.candidates-table tr:last-child td { border-bottom: none; }
.num-col { text-align: right; font-family: var(--font-mono); }
.rel-col { color: var(--text-primary); }

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
