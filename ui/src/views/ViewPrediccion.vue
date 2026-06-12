<template>
  <div class="view-prediccion">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-bullseye" />
        Predicción
      </h1>
      <p class="view-sub">Top candidatos del motor unificado y escenarios de análisis.</p>
    </div>
    <div class="view-grid">
      <BaseCard title="Top Candidatos" variant="gold">
        <div class="placeholder-content skeleton" style="height:200px" />
      </BaseCard>
      <BaseCard title="Régimen activo">
        <div class="placeholder-content skeleton" style="height:200px" />
      </BaseCard>
      <BaseCard title="Escenarios" :full="true">
        <div class="placeholder-content skeleton" style="height:200px" />
      </BaseCard>
    </div>
    <div class="wip-notice">
      <i class="fa-solid fa-hammer" /> Vista en construcción — Fase 2
    </div>
  </div>
</template>

<script setup>
import BaseCard from "@/components/BaseCard.vue";
</script>

<style scoped>
.view-prediccion { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--gold); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }
.view-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
}
.wip-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface); border: 1px solid var(--yellow);
  border-radius: var(--r-md); color: var(--yellow);
  font-size: var(--text-sm); width: fit-content;
}
</style>
