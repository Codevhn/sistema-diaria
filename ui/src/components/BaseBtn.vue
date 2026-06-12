<template>
  <button
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--loading': loading, 'btn--icon-only': iconOnly }]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <i v-if="icon && !loading" :class="`fa-solid ${icon}`" class="btn__icon" />
    <i v-if="loading" class="fa-solid fa-spinner fa-spin btn__icon" />
    <span v-if="!iconOnly"><slot /></span>
  </button>
</template>

<script setup>
defineProps({
  variant:  { type: String,  default: "secondary" }, // primary | secondary | ghost | danger
  size:     { type: String,  default: "md" },         // sm | md | lg
  icon:     { type: String,  default: "" },
  loading:  { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  iconOnly: { type: Boolean, default: false },
});
defineOptions({ inheritAttrs: false });
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  border-radius: var(--r-sm);
  font-weight: var(--fw-medium);
  font-size: var(--text-sm);
  border: 1px solid transparent;
  transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast), box-shadow var(--t-fast);
  white-space: nowrap;
  cursor: pointer;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }

/* Sizes */
.btn--sm { padding: var(--sp-1) var(--sp-3); font-size: var(--text-xs); }
.btn--md { padding: var(--sp-2) var(--sp-4); }
.btn--lg { padding: var(--sp-3) var(--sp-6); font-size: var(--text-base); }
.btn--icon-only.btn--sm { padding: var(--sp-1); width: 28px; height: 28px; }
.btn--icon-only.btn--md { padding: var(--sp-2); width: 36px; height: 36px; }

/* Primary (gold) */
.btn--primary {
  background: var(--gold);
  color: var(--text-inverse);
  font-weight: var(--fw-semi);
}
.btn--primary:not(:disabled):hover {
  background: #d9a326;
  box-shadow: var(--shadow-gold);
}

/* Secondary */
.btn--secondary {
  background: var(--bg-raised);
  color: var(--text-primary);
  border-color: var(--border);
}
.btn--secondary:not(:disabled):hover {
  background: var(--bg-overlay);
  border-color: var(--text-muted);
}

/* Ghost */
.btn--ghost {
  color: var(--text-secondary);
}
.btn--ghost:not(:disabled):hover {
  background: var(--bg-raised);
  color: var(--text-primary);
}

/* Danger */
.btn--danger {
  background: var(--red-surface);
  color: var(--red);
  border-color: var(--red);
}
.btn--danger:not(:disabled):hover {
  background: var(--red);
  color: #fff;
}

.btn__icon { font-size: .9em; }
</style>
