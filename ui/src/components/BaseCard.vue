<template>
  <div class="card" :class="[`card--${variant}`, { 'card--full': full }]">
    <div v-if="title || $slots.header" class="card__header">
      <slot name="header">
        <h3 class="card__title">{{ title }}</h3>
      </slot>
      <div v-if="$slots.action" class="card__action">
        <slot name="action" />
      </div>
    </div>
    <div class="card__body">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title:   { type: String, default: "" },
  variant: { type: String, default: "default" }, // default | gold | cyan | green | red
  full:    { type: Boolean, default: false },
});
</script>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.card--gold   { border-color: var(--gold-dim); }
.card--cyan   { border-color: var(--cyan-dim); }
.card--green  { border-color: var(--green); }
.card--red    { border-color: var(--red); }

.card--full { grid-column: 1 / -1; }

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border-subtle);
}

.card__title {
  font-size: var(--text-sm);
  font-weight: var(--fw-semi);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.card--gold  .card__title { color: var(--gold); }
.card--cyan  .card__title { color: var(--cyan); }
.card--green .card__title { color: var(--green); }

.card__body {
  padding: var(--sp-4);
}

.card__action {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
</style>
