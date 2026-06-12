<template>
  <div class="view-admin">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-gear" />
        Admin
      </h1>
      <p class="view-sub">Configuración, mantenimiento y modos de juego.</p>
    </div>
    <BaseCard title="Configuración del sistema">
      <div class="placeholder-content skeleton" style="height:200px" />
    </BaseCard>
    <div class="wip-notice">
      <i class="fa-solid fa-hammer" /> Vista en construcción — Fase 4
    </div>
  </div>
</template>

<script setup>
import BaseCard from "@/components/BaseCard.vue";
</script>

<style scoped>
.view-admin { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--text-muted); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }
.wip-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface); border: 1px solid var(--yellow);
  border-radius: var(--r-md); color: var(--yellow);
  font-size: var(--text-sm); width: fit-content;
}
</style>
