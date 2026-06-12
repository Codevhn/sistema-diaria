<template>
  <div class="verdict" :class="`verdict--${level}`">
    <i :class="`fa-solid ${icon}`" class="verdict__icon" />
    <span class="verdict__label">{{ label }}</span>
    <span v-if="desc" class="verdict__desc">{{ desc }}</span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  level: { type: String, default: "neutral" }, // win | neutral | lose | warn | unknown
  label: { type: String, required: true },
  desc:  { type: String, default: "" },
});

const icon = computed(() => ({
  win:     "fa-circle-check",
  neutral: "fa-circle-minus",
  lose:    "fa-circle-xmark",
  warn:    "fa-triangle-exclamation",
  unknown: "fa-circle-question",
}[props.level] ?? "fa-circle-question"));
</script>

<style scoped>
.verdict {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-pill);
  font-size: var(--text-sm);
  font-weight: var(--fw-semi);
  border: 1px solid currentColor;
}

.verdict--win     { color: var(--green);  background: var(--green-surface); }
.verdict--neutral { color: var(--yellow); background: var(--yellow-surface); }
.verdict--lose    { color: var(--red);    background: var(--red-surface); }
.verdict--warn    { color: var(--orange); background: rgba(251,146,60,.1); }
.verdict--unknown { color: var(--text-muted); background: var(--bg-raised); border-color: var(--border); }

.verdict__icon  { font-size: .9em; }
.verdict__label { white-space: nowrap; }
.verdict__desc  {
  font-weight: var(--fw-normal);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-left: var(--sp-1);
}
</style>
