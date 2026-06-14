<template>
  <div class="view-exploracion">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-magnifying-glass-chart" />
        Exploración
      </h1>
      <p class="view-sub">Herramientas manuales de análisis.</p>
    </div>

    <!-- Sub-tabs -->
    <div class="sub-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        class="sub-tab"
        :class="{ 'sub-tab--active': activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        <i :class="`fa-solid ${tab.icon}`" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Panel activo -->
    <div class="tab-panel">
      <Suspense>
        <template #default>
          <component :is="activeComponent" />
        </template>
        <template #fallback>
          <div class="skeleton" style="height:300px;border-radius:10px" />
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineAsyncComponent } from "vue";

const TabMemoria        = defineAsyncComponent(() => import("@/components/exploracion/TabMemoria.vue"));
const TabTransformaciones = defineAsyncComponent(() => import("@/components/exploracion/TabTransformaciones.vue"));
const TabCruceta        = defineAsyncComponent(() => import("@/components/exploracion/TabCruceta.vue"));
const TabPares          = defineAsyncComponent(() => import("@/components/exploracion/TabPares.vue"));
const TabGuia           = defineAsyncComponent(() => import("@/components/exploracion/TabGuia.vue"));
const TabRelativos      = defineAsyncComponent(() => import("@/components/exploracion/TabRelativos.vue"));

const tabs = [
  { id: "memoria",          icon: "fa-brain",               label: "Memoria",         component: TabMemoria },
  { id: "transformaciones", icon: "fa-wand-magic-sparkles", label: "Transformaciones",component: TabTransformaciones },
  { id: "cruceta",          icon: "fa-draw-polygon",        label: "Cruceta",         component: TabCruceta },
  { id: "pares",            icon: "fa-puzzle-piece",        label: "Pares",           component: TabPares },
  { id: "relativos",        icon: "fa-link",                label: "Relativos",       component: TabRelativos },
  { id: "suenos",           icon: "fa-book",                label: "Guía de Sueños",  component: TabGuia },
];

const activeTab = ref("memoria");

const activeComponent = computed(() =>
  tabs.find(t => t.id === activeTab.value)?.component ?? null
);
</script>

<style scoped>
.view-exploracion { display: flex; flex-direction: column; gap: var(--sp-5); }

.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--cyan); font-size: .85em; }
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
  white-space: nowrap;
}
.sub-tab:hover { background: var(--bg-raised); color: var(--text-primary); }
.sub-tab--active { background: var(--gold-surface); color: var(--gold); }

.tab-panel {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--sp-5);
}
</style>
