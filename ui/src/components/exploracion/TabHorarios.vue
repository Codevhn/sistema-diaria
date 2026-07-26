<template>
  <div class="tab-horarios">

    <!-- Carga / error -->
    <div v-if="loading" class="skeleton" style="height:220px;border-radius:10px" />
    <div v-else-if="loadError" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" /> {{ loadError }}
    </div>

    <template v-else>
      <!-- Resumen por turno -->
      <div class="turno-summary">
        <div
          v-for="t in TURNOS"
          :key="t.id"
          class="turno-card"
          :class="`turno-card--${t.key}`"
          :style="`--tc:${t.color};--tc-bg:${t.bg}`"
        >
          <span class="turno-card__label">{{ t.label }}</span>
          <span class="turno-card__count">{{ dominantCounts[t.id] }}</span>
          <span class="turno-card__hint">números dominantes</span>
        </div>
        <div class="turno-card turno-card--empty">
          <span class="turno-card__label">Sin datos</span>
          <span class="turno-card__count">{{ dominantCounts['—'] }}</span>
          <span class="turno-card__hint">nunca registrados</span>
        </div>
      </div>

      <!-- Controles -->
      <div class="controls-row">
        <div class="search-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon" />
          <input
            type="text"
            inputmode="numeric"
            maxlength="2"
            placeholder="Buscar número (ej. 51)"
            class="search-input"
            v-model="search"
          />
        </div>
        <select v-model="filterTurno" class="select">
          <option value="">Todos los turnos</option>
          <option v-for="t in TURNOS" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
        <select v-model="sortBy" class="select">
          <option value="numero">Ordenar por número</option>
          <option value="total_desc">Más sorteos primero</option>
          <option value="11AM_desc">Mayor % 11 AM</option>
          <option value="3PM_desc">Mayor % 3 PM</option>
          <option value="9PM_desc">Mayor % 9 PM</option>
        </select>
      </div>

      <!-- Tabla -->
      <div class="table-wrap">
        <table class="horarios-table">
          <thead>
            <tr>
              <th>Número</th>
              <th class="bar-col">Distribución</th>
              <th class="num-col turno-11am">11 AM</th>
              <th class="num-col turno-3pm">3 PM</th>
              <th class="num-col turno-9pm">9 PM</th>
              <th class="num-col">Total</th>
              <th>Dominante</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.numero"
              :class="{ 'row--highlighted': search && String(row.numero) === String(parseInt(search, 10)) }"
            >
              <td>
                <div class="num-cell">
                  <span class="num-badge mono">{{ row.pad }}</span>
                  <span v-if="row.simbolo" class="sym-text">{{ row.simbolo }}</span>
                </div>
              </td>
              <td class="bar-col">
                <div class="dist-bar" v-if="row.total > 0">
                  <div
                    v-for="t in TURNOS"
                    :key="t.id"
                    class="dist-seg"
                    :style="`width:${row.pcts[t.id]}%;background:${t.color};opacity:${row.dominant === t.id ? 1 : 0.45}`"
                    :title="`${t.label}: ${row.counts[t.id]} (${row.pcts[t.id]}%)`"
                  />
                </div>
                <span v-else class="no-data">—</span>
              </td>
              <td class="num-col" :class="{ 'cell--dominant': row.dominant === '11AM' }">
                <template v-if="row.total > 0">
                  <span class="count-val">{{ row.counts['11AM'] }}</span>
                  <span class="pct-val">{{ row.pcts['11AM'] }}%</span>
                </template>
                <span v-else class="no-data">—</span>
              </td>
              <td class="num-col" :class="{ 'cell--dominant': row.dominant === '3PM' }">
                <template v-if="row.total > 0">
                  <span class="count-val">{{ row.counts['3PM'] }}</span>
                  <span class="pct-val">{{ row.pcts['3PM'] }}%</span>
                </template>
                <span v-else class="no-data">—</span>
              </td>
              <td class="num-col" :class="{ 'cell--dominant': row.dominant === '9PM' }">
                <template v-if="row.total > 0">
                  <span class="count-val">{{ row.counts['9PM'] }}</span>
                  <span class="pct-val">{{ row.pcts['9PM'] }}%</span>
                </template>
                <span v-else class="no-data">—</span>
              </td>
              <td class="num-col total-col">{{ row.total || '—' }}</td>
              <td>
                <span
                  v-if="row.dominant"
                  class="dominant-badge"
                  :style="`background:${turnoMap[row.dominant]?.bg};color:${turnoMap[row.dominant]?.color};border-color:${turnoMap[row.dominant]?.border}`"
                >
                  {{ row.dominant }}
                </span>
                <span v-else class="no-data">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="totalSorteos > 0" class="footer-note">
        Análisis sobre {{ totalSorteos }} sorteos Honduras · {{ rows.length }} números
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { DB } from "@motors/storage.js";
import { useGuide } from "@/composables/useGuide.js";

const { sym } = useGuide();

const TURNOS = [
  { id: "11AM", label: "11 AM", key: "am",  color: "var(--gold)",   bg: "var(--gold-surface)",   border: "var(--gold-dim)" },
  { id: "3PM",  label: "3 PM",  key: "pm",  color: "var(--cyan)",   bg: "var(--cyan-surface)",   border: "var(--cyan-dim)" },
  { id: "9PM",  label: "9 PM",  key: "noc", color: "var(--orange)", bg: "rgba(251,146,60,.12)",  border: "rgba(251,146,60,.35)" },
];

const turnoMap = Object.fromEntries(TURNOS.map(t => [t.id, t]));

const rows       = ref([]);
const loading    = ref(false);
const loadError  = ref(null);
const search     = ref("");
const filterTurno= ref("");
const sortBy     = ref("numero");

const totalSorteos = computed(() => rows.value.reduce((s, r) => s + r.total, 0));

const dominantCounts = computed(() => {
  const c = { "11AM": 0, "3PM": 0, "9PM": 0, "—": 0 };
  for (const r of rows.value) c[r.dominant ?? "—"]++;
  return c;
});

const filteredRows = computed(() => {
  let list = rows.value;

  if (search.value.trim()) {
    const q = parseInt(search.value.trim(), 10);
    if (!isNaN(q)) list = list.filter(r => r.numero === q);
  }

  if (filterTurno.value) list = list.filter(r => r.dominant === filterTurno.value);

  const [field, dir] = sortBy.value.split("_");
  list = [...list].sort((a, b) => {
    if (field === "numero") return a.numero - b.numero;
    if (field === "total")  return dir === "desc" ? b.total - a.total : a.total - b.total;
    const tId = field; // e.g. "11AM"
    return dir === "desc" ? b.pcts[tId] - a.pcts[tId] : a.pcts[tId] - b.pcts[tId];
  });

  return list;
});

async function cargar() {
  loading.value  = true;
  loadError.value= null;
  try {
    const draws = await DB.listDraws({ excludeTest: true });
    const hn = draws.filter(d =>
      (d.pais || "").toUpperCase() === "HN" && d.horario && !d.isPending
    );

    const map = {};
    for (const d of hn) {
      const key = String(d.numero).padStart(2, "0");
      if (!map[key]) map[key] = { "11AM": 0, "3PM": 0, "9PM": 0 };
      if (d.horario in map[key]) map[key][d.horario]++;
    }

    rows.value = Array.from({ length: 100 }, (_, i) => {
      const pad    = String(i).padStart(2, "0");
      const counts = map[pad] ?? { "11AM": 0, "3PM": 0, "9PM": 0 };
      const total  = TURNOS.reduce((s, t) => s + counts[t.id], 0);
      const dominant = total === 0
        ? null
        : TURNOS.reduce((best, t) => counts[t.id] >= counts[best.id] ? t : best, TURNOS[0]).id;
      const pcts = {};
      for (const t of TURNOS) {
        pcts[t.id] = total > 0 ? Math.round((counts[t.id] / total) * 100) : 0;
      }
      return { numero: i, pad, counts, total, dominant, pcts, simbolo: sym(i) };
    });
  } catch (e) {
    loadError.value = e?.message ?? "Error al cargar sorteos";
  } finally {
    loading.value = false;
  }
}

onMounted(cargar);
</script>

<style scoped>
.tab-horarios { display: flex; flex-direction: column; gap: var(--sp-4); }

/* Resumen */
.turno-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--sp-3);
}
.turno-card {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--tc-bg, var(--bg-raised));
  border: 1px solid var(--border);
}
.turno-card--am  { border-color: var(--gold-dim); }
.turno-card--pm  { border-color: var(--cyan-dim); }
.turno-card--noc { border-color: rgba(251,146,60,.35); }
.turno-card--empty { opacity: .6; }

.turno-card__label {
  font-size: var(--text-xs); font-weight: var(--fw-semi);
  color: var(--tc, var(--text-muted));
  text-transform: uppercase; letter-spacing: .06em;
}
.turno-card__count {
  font-family: var(--font-mono); font-size: var(--text-2xl);
  font-weight: var(--fw-bold); color: var(--tc, var(--text-primary));
}
.turno-card__hint { font-size: var(--text-xs); color: var(--text-muted); }

/* Controles */
.controls-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3);
}
.search-wrap {
  position: relative; display: flex; align-items: center;
}
.search-icon {
  position: absolute; left: var(--sp-3);
  font-size: .75rem; color: var(--text-muted); pointer-events: none;
}
.search-input {
  font-family: var(--font-mono); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3) var(--sp-2) calc(var(--sp-3) + 1.2rem);
  width: 200px;
}
.search-input:focus { outline: none; border-color: var(--gold); }
.select {
  font-family: var(--font-sans); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3); cursor: pointer;
}
.select:focus { outline: none; border-color: var(--gold); }

/* Tabla */
.table-wrap { overflow-x: auto; }
.horarios-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.horarios-table th {
  padding: var(--sp-2) var(--sp-3); text-align: left;
  font-weight: var(--fw-semi); color: var(--text-muted); font-size: var(--text-xs);
  text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.horarios-table td {
  padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}
.horarios-table tr:last-child td { border-bottom: none; }
.horarios-table tr:hover td { background: var(--bg-raised); }
.row--highlighted td { background: var(--gold-surface) !important; }

/* Columnas */
.num-col { text-align: right; font-family: var(--font-mono); }
.bar-col { min-width: 100px; }
.turno-11am { color: var(--gold); }
.turno-3pm  { color: var(--cyan); }
.turno-9pm  { color: var(--orange); }

/* Número */
.num-cell { display: flex; align-items: center; gap: var(--sp-2); }
.num-badge {
  font-weight: var(--fw-bold); color: var(--gold); font-size: var(--text-base);
  min-width: 28px;
}
.sym-text { font-size: var(--text-xs); color: var(--text-secondary); }

/* Barra de distribución */
.dist-bar {
  display: flex; height: 8px; border-radius: var(--r-pill);
  overflow: hidden; background: var(--bg-overlay);
  gap: 1px;
}
.dist-seg { height: 100%; transition: width .2s; min-width: 1px; }

/* Celda dominante */
.cell--dominant { font-weight: var(--fw-bold); }
.count-val { margin-right: var(--sp-1); }
.pct-val { font-size: var(--text-xs); color: var(--text-muted); }

/* Badge dominante */
.dominant-badge {
  display: inline-block;
  font-size: var(--text-xs); font-weight: var(--fw-bold);
  padding: 2px 8px; border-radius: var(--r-pill);
  border: 1px solid transparent;
  white-space: nowrap;
}

.total-col { color: var(--text-primary); font-weight: var(--fw-semi); }
.no-data { color: var(--text-muted); font-size: var(--text-xs); }

.footer-note {
  font-size: var(--text-xs); color: var(--text-muted);
  text-align: center; padding-top: var(--sp-2);
}

.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
</style>
