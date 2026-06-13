<template>
  <div class="tab-guia">
    <div class="search-bar">
      <div class="search-wrap">
        <i class="fa-solid fa-magnifying-glass search-icon" />
        <input
          type="text"
          v-model="query"
          class="search-input"
          placeholder="Buscar por número o símbolo… ej: 'perro', '42'"
        />
        <button v-if="query" class="search-clear" @click="query = ''">
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </div>

    <div v-if="loadingGuide" class="skeleton" style="height:200px;border-radius:10px" />
    <div v-else-if="guideError" class="error-notice">
      <i class="fa-solid fa-triangle-exclamation" /> {{ guideError }}
    </div>

    <template v-else>
      <p class="result-count">{{ filtered.length }} entradas</p>
      <div class="guide-grid">
        <div
          v-for="entry in filtered.slice(0, 200)"
          :key="entry.num"
          class="guide-card"
        >
          <div class="guide-card__header">
            <span class="guide-card__num">{{ entry.num }}</span>
            <span class="guide-card__sym" v-if="entry.simbolo">{{ entry.simbolo }}</span>
          </div>
          <p class="guide-card__desc" v-if="entry.descripcion">{{ entry.descripcion }}</p>
        </div>
      </div>
      <p v-if="filtered.length > 200" class="more-hint">
        Mostrando 200 de {{ filtered.length }}. Refiná la búsqueda para ver más.
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

const query       = ref("");
const guide       = ref(null);
const loadingGuide= ref(false);
const guideError  = ref(null);

const filtered = computed(() => {
  if (!guide.value) return [];
  const entries = Object.entries(guide.value).map(([num, v]) => ({
    num,
    simbolo:    v.simbolo    ?? "",
    descripcion:v.descripcion?? v.desc ?? "",
    keywords:   (v.keywords  ?? []).join(" "),
  }));
  const q = query.value.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e =>
    e.num.includes(q) ||
    e.simbolo.toLowerCase().includes(q) ||
    e.descripcion.toLowerCase().includes(q) ||
    e.keywords.toLowerCase().includes(q)
  );
});

onMounted(async () => {
  loadingGuide.value = true;
  try {
    const res = await fetch("./data/guia_suenos.json");
    if (!res.ok) throw new Error(`Error ${res.status} al cargar guía`);
    guide.value = await res.json();
  } catch (e) {
    guideError.value = e?.message ?? String(e);
  } finally {
    loadingGuide.value = false;
  }
});
</script>

<style scoped>
.tab-guia { display: flex; flex-direction: column; gap: var(--sp-4); }

.search-bar {
  padding: var(--sp-3);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-md);
}
.search-wrap {
  position: relative; display: flex; align-items: center;
}
.search-icon {
  position: absolute; left: var(--sp-3); color: var(--text-muted); font-size: .9em;
  pointer-events: none;
}
.search-input {
  width: 100%; padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-8);
  font-family: var(--font-sans); font-size: var(--text-sm);
  background: var(--bg-raised); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--r-sm);
}
.search-input:focus { outline: none; border-color: var(--gold); }
.search-clear {
  position: absolute; right: var(--sp-3); color: var(--text-muted);
  font-size: .8em; transition: color var(--t-fast);
}
.search-clear:hover { color: var(--text-primary); }

.result-count { font-size: var(--text-xs); color: var(--text-muted); }

.guide-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--sp-2);
}
.guide-card {
  background: var(--bg-raised); border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm); padding: var(--sp-2) var(--sp-3);
  transition: border-color var(--t-fast);
}
.guide-card:hover { border-color: var(--gold-dim); }
.guide-card__header { display: flex; align-items: baseline; gap: var(--sp-2); margin-bottom: 2px; }
.guide-card__num {
  font-family: var(--font-mono); font-weight: var(--fw-bold);
  font-size: var(--text-sm); color: var(--gold);
}
.guide-card__sym { font-size: var(--text-base); }
.guide-card__desc { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; }

.error-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface); border: 1px solid var(--red);
  border-radius: var(--r-md); color: var(--red); font-size: var(--text-sm);
}
.more-hint { font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--sp-2); }
</style>
