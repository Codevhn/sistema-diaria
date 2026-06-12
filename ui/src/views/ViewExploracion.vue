<template>
  <div class="view-exploracion">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-magnifying-glass-chart" />
        Exploración
      </h1>
      <p class="view-sub">Herramientas de análisis: memoria, transformaciones, pares, constelaciones, sueños.</p>
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

    <BaseCard :title="activeLabel">
      <div class="placeholder-content skeleton" style="height:300px" />
    </BaseCard>

    <div class="wip-notice">
      <i class="fa-solid fa-hammer" /> Vista en construcción — Fase 3
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import BaseCard from "@/components/BaseCard.vue";

const tabs = [
  { id: "memoria",         icon: "fa-brain",                 label: "Memoria" },
  { id: "transformaciones",icon: "fa-wand-magic-sparkles",   label: "Transformaciones" },
  { id: "cruceta",         icon: "fa-draw-polygon",          label: "Cruceta" },
  { id: "pares",           icon: "fa-puzzle-piece",          label: "Pares" },
  { id: "constelaciones",  icon: "fa-star",                  label: "Constelaciones" },
  { id: "suenos",          icon: "fa-book",                  label: "Guía de Sueños" },
];

const activeTab = ref("memoria");
const activeLabel = computed(() => tabs.find(t => t.id === activeTab.value)?.label ?? "");
</script>

<style scoped>
.view-exploracion { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--cyan); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }

.sub-tabs {
  display: flex;
  gap: var(--sp-1);
  flex-wrap: wrap;
  padding: var(--sp-1);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  width: fit-content;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: background var(--t-fast), color var(--t-fast);
}
.sub-tab:hover { background: var(--bg-raised); color: var(--text-primary); }
.sub-tab--active { background: var(--gold-surface); color: var(--gold); }

.wip-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface); border: 1px solid var(--yellow);
  border-radius: var(--r-md); color: var(--yellow);
  font-size: var(--text-sm); width: fit-content;
}
</style>
