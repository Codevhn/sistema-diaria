<template>
  <div class="tab-relativos">

    <!-- Buscador -->
    <div class="search-row">
      <div class="num-input-wrap">
        <input
          type="text"
          inputmode="numeric"
          maxlength="2"
          placeholder="00–99"
          class="num-input"
          v-model="query"
          @input="buscar"
        />
        <span v-if="entry" class="entry-sym">{{ entry.simbolo }}</span>
      </div>
      <p class="search-hint">Ingresá un número para ver sus relativos oficiales de La Diaria Honduras.</p>
    </div>

    <!-- Resultado -->
    <template v-if="entry">
      <div class="result-card">
        <div class="result-header">
          <span class="result-num">{{ pad(numero) }}</span>
          <span class="result-name">{{ entry.simbolo }}</span>
        </div>

        <div class="rel-label">Relativos oficiales</div>
        <div class="rel-list">
          <div
            v-for="r in entry.relativos"
            :key="r.pad"
            class="rel-chip"
          >
            <span class="rel-chip__num">{{ r.pad }}</span>
            <span class="rel-chip__sym">{{ r.simbolo }}</span>
          </div>
        </div>

        <!-- Quién tiene este número como relativo (búsqueda inversa) -->
        <div class="rel-label" style="margin-top:var(--sp-4)">
          Números que lo tienen como relativo
          <span class="rel-count">({{ inversos.length }})</span>
        </div>
        <div v-if="inversos.length" class="rel-list">
          <div
            v-for="inv in inversos"
            :key="inv.pad"
            class="rel-chip rel-chip--inv"
          >
            <span class="rel-chip__num">{{ inv.pad }}</span>
            <span class="rel-chip__sym">{{ inv.simbolo }}</span>
          </div>
        </div>
        <p v-else class="rel-empty">Ninguno apunta a este número.</p>
      </div>
    </template>

    <!-- Estado vacío -->
    <div v-else-if="!loading" class="empty-state">
      <i class="fa-solid fa-arrow-up-long" />
      Ingresá un número arriba
    </div>

    <div v-if="loadError" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" /> {{ loadError }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const query    = ref("");
const numero   = ref(null);
const relativos = ref(null); // full map { "00": { simbolo, relativos: [...] }, ... }
const loading  = ref(false);
const loadError= ref(null);

const pad = (n) => n != null ? String(n).padStart(2, "0") : "";

async function ensureLoaded() {
  if (relativos.value) return;
  loading.value = true;
  try {
    const res = await fetch("./data/relativos_diaria.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    relativos.value = json.pares ?? {};
  } catch (e) {
    loadError.value = e?.message ?? "Error al cargar relativos";
  } finally {
    loading.value = false;
  }
}

async function buscar() {
  const raw = query.value.trim();
  if (raw === "" || isNaN(parseInt(raw, 10))) { numero.value = null; return; }
  const n = parseInt(raw, 10);
  if (n < 0 || n > 99) { numero.value = null; return; }
  await ensureLoaded();
  numero.value = n;
}

const entry = computed(() => {
  if (numero.value == null || !relativos.value) return null;
  return relativos.value[pad(numero.value)] ?? null;
});

const inversos = computed(() => {
  if (numero.value == null || !relativos.value) return [];
  const target = numero.value;
  const result = [];
  for (const [p, e] of Object.entries(relativos.value)) {
    if ((e.relativos ?? []).some(r => r.numero === target)) {
      result.push({ pad: p, simbolo: e.simbolo });
    }
  }
  return result.sort((a, b) => parseInt(a.pad) - parseInt(b.pad));
});
</script>

<style scoped>
.tab-relativos { display: flex; flex-direction: column; gap: var(--sp-5); }

/* Buscador */
.search-row { display: flex; flex-direction: column; gap: var(--sp-2); }
.num-input-wrap { display: flex; align-items: center; gap: var(--sp-3); }
.num-input {
  width: 80px; text-align: center;
  font-family: var(--font-mono); font-size: var(--text-2xl); font-weight: var(--fw-bold);
  background: var(--bg-raised); color: var(--text-primary);
  border: 2px solid var(--border); border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  transition: border-color var(--t-fast);
}
.num-input:focus { outline: none; border-color: var(--gold); }
.entry-sym {
  font-size: var(--text-lg); color: var(--gold); font-weight: var(--fw-semi);
}
.search-hint { font-size: var(--text-xs); color: var(--text-muted); }

/* Resultado */
.result-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--sp-5);
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.result-header { display: flex; align-items: baseline; gap: var(--sp-3); }
.result-num {
  font-family: var(--font-mono); font-size: var(--text-3xl);
  font-weight: var(--fw-bold); color: var(--gold);
}
.result-name { font-size: var(--text-xl); color: var(--text-primary); font-weight: var(--fw-semi); }

.rel-label {
  font-size: var(--text-xs); color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em;
  display: flex; align-items: center; gap: var(--sp-2);
}
.rel-count { font-size: var(--text-xs); color: var(--text-muted); background: var(--bg-overlay); padding: 1px 6px; border-radius: var(--r-pill); }

.rel-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.rel-chip {
  display: flex; align-items: center; gap: var(--sp-2);
  background: var(--bg-overlay); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--sp-2) var(--sp-3);
  transition: border-color var(--t-fast);
}
.rel-chip:hover { border-color: var(--gold-dim); }
.rel-chip--inv { border-color: var(--border-subtle); }
.rel-chip__num {
  font-family: var(--font-mono); font-weight: var(--fw-bold);
  font-size: var(--text-base); color: var(--gold);
  min-width: 24px;
}
.rel-chip__sym { font-size: var(--text-sm); color: var(--text-secondary); }

.rel-empty { font-size: var(--text-sm); color: var(--text-muted); }

.empty-state {
  display: flex; align-items: center; gap: var(--sp-2);
  color: var(--text-muted); font-size: var(--text-sm); padding: var(--sp-4) 0;
}

.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
</style>
