<template>
  <div class="view-hoy">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-gauge" />
        Panel del día
      </h1>
      <p class="view-sub">Registro y seguimiento de los sorteos de hoy.</p>
    </div>

    <!-- Grid de tarjetas -->
    <div class="view-grid">
      <BaseCard title="Último sorteo" variant="gold">
        <div class="placeholder-content skeleton" style="height:120px" />
      </BaseCard>

      <BaseCard title="Resultado esperado">
        <div class="placeholder-content skeleton" style="height:120px" />
      </BaseCard>

      <BaseCard title="Historial de hoy" :full="true">
        <div class="placeholder-content skeleton" style="height:200px" />
      </BaseCard>
    </div>

    <div class="wip-notice">
      <i class="fa-solid fa-hammer" />
      Vista en construcción — Fase 2
    </div>
  </div>
</template>

<script setup>
import BaseCard from "@/components/BaseCard.vue";
</script>

<style scoped>
.view-hoy { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl);
  font-weight: var(--fw-bold);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--text-primary);
}
.view-title i { color: var(--gold); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }

.view-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
}

.wip-notice {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface);
  border: 1px solid var(--yellow);
  border-radius: var(--r-md);
  color: var(--yellow);
  font-size: var(--text-sm);
  width: fit-content;
}
</style>
