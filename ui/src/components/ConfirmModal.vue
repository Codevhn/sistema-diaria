<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-overlay" @click.self="$emit('cancel')">
        <div class="modal-panel" role="dialog" :aria-label="title">
          <div class="modal-header">
            <i v-if="icon" :class="`fa-solid ${icon} modal-icon`" :style="iconColor ? `color:${iconColor}` : ''" />
            <span class="modal-title">{{ title }}</span>
          </div>
          <p v-if="message" class="modal-message">{{ message }}</p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--cancel" @click="$emit('cancel')">
              {{ cancelLabel }}
            </button>
            <button class="modal-btn modal-btn--confirm" :class="`modal-btn--${variant}`" @click="$emit('confirm')">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue:   { type: Boolean, default: false },
  title:        { type: String,  default: "¿Confirmar?" },
  message:      { type: String,  default: "" },
  confirmLabel: { type: String,  default: "Confirmar" },
  cancelLabel:  { type: String,  default: "Cancelar" },
  icon:         { type: String,  default: "" },
  iconColor:    { type: String,  default: "" },
  variant:      { type: String,  default: "danger" }, // danger | primary
});
defineEmits(["confirm", "cancel"]);
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(4px);
  z-index: 600;
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-4);
}

.modal-panel {
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  width: 100%; max-width: 360px;
  padding: var(--sp-6);
  display: flex; flex-direction: column; gap: var(--sp-4);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex; align-items: center; gap: var(--sp-3);
}
.modal-icon { font-size: 1.1rem; }
.modal-title { font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--text-primary); }

.modal-message {
  font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.55;
  margin: 0;
}

.modal-actions {
  display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-1);
}

.modal-btn {
  font-family: var(--font-sans); font-size: var(--text-sm); font-weight: var(--fw-medium);
  padding: var(--sp-2) var(--sp-4); border-radius: var(--r-md);
  transition: background var(--t-fast), color var(--t-fast);
  cursor: pointer;
}
.modal-btn--cancel {
  background: var(--bg-raised); color: var(--text-secondary);
  border: 1px solid var(--border);
}
.modal-btn--cancel:hover { background: var(--bg-overlay); color: var(--text-primary); }

.modal-btn--danger  { background: var(--red);  color: #fff; }
.modal-btn--danger:hover  { filter: brightness(1.15); }
.modal-btn--primary { background: var(--gold); color: #000; }
.modal-btn--primary:hover { filter: brightness(1.1); }

/* Transición */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity var(--t-normal); }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
