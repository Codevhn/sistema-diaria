<template>
  <span
    class="chip"
    :class="[chipClass, { 'chip--hit': hit, 'chip--pending': pending }]"
    :title="tooltip"
  >
    <span class="chip__num">{{ formatted }}</span>
    <small v-if="symbol" class="chip__sym">{{ symbol }}</small>
    <span v-if="score != null" class="chip__score">{{ scoreLabel }}</span>
  </span>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  numero:  { type: Number, required: true },
  score:   { type: Number, default: null },
  symbol:  { type: String, default: "" },
  hit:     { type: Boolean, default: false },
  pending: { type: Boolean, default: false },
  size:    { type: String, default: "md" }, // sm | md | lg
});

const formatted = computed(() => String(props.numero).padStart(2, "0"));

const chipClass = computed(() => `chip--${props.size}`);

const scoreLabel = computed(() => {
  if (props.score == null) return "";
  return `${Math.round(props.score * 100)}`;
});

const tooltip = computed(() => {
  const base = `Número ${formatted.value}`;
  if (props.symbol) return `${base} · ${props.symbol}`;
  if (props.score != null) return `${base} · score ${scoreLabel.value}`;
  return base;
});
</script>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: var(--r-pill);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  cursor: default;
  user-select: none;
  transition: background var(--t-fast), border-color var(--t-fast);
}

/* Tamaños */
.chip--sm { padding: 2px 8px;  font-size: var(--text-xs); }
.chip--md { padding: 4px 10px; font-size: var(--text-sm); }
.chip--lg { padding: 6px 14px; font-size: var(--text-base); }

.chip__num { font-weight: var(--fw-semi); }

.chip__sym {
  font-family: var(--font-sans);
  color: var(--text-muted);
  font-size: .75em;
}

.chip__score {
  font-size: .7em;
  color: var(--text-muted);
  margin-left: 2px;
}

/* Estados */
.chip--hit {
  background: var(--green-surface);
  border-color: var(--green);
  color: var(--green);
}

.chip--pending {
  background: var(--yellow-surface);
  border-color: var(--yellow);
  color: var(--yellow);
}

.chip:not(.chip--hit):not(.chip--pending):hover {
  background: var(--bg-overlay);
  border-color: var(--gold-dim);
}
</style>
