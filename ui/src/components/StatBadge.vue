<template>
  <div class="stat-badge" :class="`stat-badge--${color}`">
    <span class="stat-badge__label">{{ label }}</span>
    <span class="stat-badge__value">{{ value }}</span>
    <span v-if="sub" class="stat-badge__sub">{{ sub }}</span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  sub:   { type: String, default: "" },
  color: { type: String, default: "neutral" }, // neutral | gold | green | red | cyan
});
</script>

<style scoped>
.stat-badge {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-raised);
  border-radius: var(--r-md);
  border: 1px solid var(--border-subtle);
}

.stat-badge__label {
  font-size: var(--text-xs);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .08em;
}

.stat-badge__value {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-badge__sub {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

/* Color variants */
.stat-badge--gold  .stat-badge__value { color: var(--gold); }
.stat-badge--green .stat-badge__value { color: var(--green); }
.stat-badge--red   .stat-badge__value { color: var(--red); }
.stat-badge--cyan  .stat-badge__value { color: var(--cyan); }
</style>
