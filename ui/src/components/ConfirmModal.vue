<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-overlay" @click.self="$emit('cancel')">
        <div class="modal-panel" role="dialog" :aria-modal="true" :aria-label="title">
          <div class="modal-header">
            <div class="modal-icon-wrap" v-if="icon">
              <i class="fa-solid" :class="icon" :style="iconColor ? `color:${iconColor}` : ''" />
            </div>
            <h2 class="modal-title">{{ title }}</h2>
          </div>
          <p class="modal-message">{{ message }}</p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--cancel" @click="$emit('cancel')">{{ cancelLabel }}</button>
            <button
              class="modal-btn"
              :class="`modal-btn--${variant}`"
              @click="$emit('confirm')"
            >{{ confirmLabel }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue:   { type: Boolean, default: false },
  title:        { type: String,  default: "Confirmar" },
  message:      { type: String,  default: "" },
  confirmLabel: { type: String,  default: "Confirmar" },
  cancelLabel:  { type: String,  default: "Cancelar" },
  icon:         { type: String,  default: "" },
  iconColor:    { type: String,  default: "" },
  variant:      { type: String,  default: "primary" }, // primary | danger
});
defineEmits(["confirm", "cancel"]);
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, .6);
  display: grid; place-items: center;
  padding: var(--sp-4);
}
.modal-panel {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: var(--sp-6);
  width: 100%; max-width: 400px;
  display: flex; flex-direction: column; gap: var(--sp-4);
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.modal-header { display: flex; align-items: center; gap: var(--sp-3); }
.modal-icon-wrap {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--bg-raised); display: grid; place-items: center;
  flex-shrink: 0; font-size: 1rem;
}
.modal-title { font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--text-primary); }
.modal-message { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
.modal-actions { display: flex; gap: var(--sp-3); justify-content: flex-end; }
.modal-btn {
  font-size: var(--text-sm); font-weight: var(--fw-semi);
  padding: var(--sp-2) var(--sp-4); border-radius: var(--r-sm);
  transition: background var(--t-fast), color var(--t-fast);
}
.modal-btn--cancel {
  background: var(--bg-raised); color: var(--text-secondary);
  border: 1px solid var(--border);
}
.modal-btn--cancel:hover { background: var(--bg-overlay); color: var(--text-primary); }
.modal-btn--primary {
  background: var(--gold); color: #000;
  border: 1px solid var(--gold);
}
.modal-btn--primary:hover { opacity: .85; }
.modal-btn--danger {
  background: var(--red-surface); color: var(--red);
  border: 1px solid var(--red);
}
.modal-btn--danger:hover { background: var(--red); color: #fff; }

/* Transition */
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity var(--t-fast); }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .modal-panel,
.modal-fade-leave-active .modal-panel { transition: transform var(--t-fast); }
.modal-fade-enter-from .modal-panel { transform: scale(.96) translateY(-8px); }
.modal-fade-leave-to .modal-panel   { transform: scale(.96) translateY(-8px); }
</style>
