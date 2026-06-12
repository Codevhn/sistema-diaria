<template>
  <div class="view-pega3">
    <div class="view-header">
      <h1 class="view-title">
        <i class="fa-solid fa-dice" />
        Pega3
      </h1>
      <p class="view-sub">Módulo independiente para análisis de tres dígitos.</p>
    </div>
    <BaseCard title="Motor Pega3">
      <div class="placeholder-content skeleton" style="height:300px" />
    </BaseCard>
    <div class="wip-notice">
      <i class="fa-solid fa-hammer" /> Vista en construcción — Fase 3
    </div>
  </div>
</template>

<script setup>
import BaseCard from "@/components/BaseCard.vue";
</script>

<style scoped>
.view-pega3 { display: flex; flex-direction: column; gap: var(--sp-6); }
.view-header { display: flex; flex-direction: column; gap: var(--sp-1); }
.view-title {
  font-size: var(--text-xl); font-weight: var(--fw-bold);
  display: flex; align-items: center; gap: var(--sp-3);
}
.view-title i { color: var(--orange); font-size: .85em; }
.view-sub { color: var(--text-secondary); font-size: var(--text-sm); }
.wip-notice {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--yellow-surface); border: 1px solid var(--yellow);
  border-radius: var(--r-md); color: var(--yellow);
  font-size: var(--text-sm); width: fit-content;
}
</style>
