<template>
  <div class="help-wrap">
    <button
      class="help-btn"
      :aria-label="`Ayuda: ${title}`"
      @click.stop="open = !open"
      @keydown.escape="open = false"
    >
      <i class="fa-regular fa-circle-question" />
    </button>
    <Teleport to="body">
      <Transition name="help-fade">
        <div v-if="open" class="help-overlay" @click="open = false">
          <div class="help-panel" @click.stop>
            <div class="help-panel__header">
              <span class="help-panel__title">{{ title }}</span>
              <button class="help-panel__close" @click="open = false">
                <i class="fa-solid fa-xmark" />
              </button>
            </div>
            <div class="help-panel__body">
              <slot />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from "vue";
defineProps({ title: { type: String, default: "Ayuda" } });
const open = ref(false);
</script>

<style scoped>
.help-wrap { display: inline-flex; }

.help-btn {
  width: 22px; height: 22px; display: grid; place-items: center;
  border-radius: 50%;
  color: var(--text-muted); font-size: .85em;
  transition: color var(--t-fast), background var(--t-fast);
}
.help-btn:hover { color: var(--cyan); background: var(--cyan-surface); }

/* Overlay */
.help-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.5);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-4);
}

.help-panel {
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  max-width: 480px; width: 100%;
  max-height: 80dvh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.help-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0;
  background: var(--bg-overlay);
}
.help-panel__title { font-weight: var(--fw-semi); font-size: var(--text-base); }
.help-panel__close {
  width: 28px; height: 28px; display: grid; place-items: center;
  border-radius: var(--r-sm); color: var(--text-muted);
  transition: background var(--t-fast), color var(--t-fast);
}
.help-panel__close:hover { background: var(--bg-raised); color: var(--text-primary); }

.help-panel__body {
  padding: var(--sp-5);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.65;
}
.help-panel__body :deep(b)  { color: var(--text-primary); }
.help-panel__body :deep(ul) { padding-left: var(--sp-4); margin: var(--sp-2) 0; }
.help-panel__body :deep(li) { margin-bottom: var(--sp-1); }
.help-panel__body :deep(p)  { margin-bottom: var(--sp-3); }
.help-panel__body :deep(code) {
  font-family: var(--font-mono); font-size: .9em;
  background: var(--bg-raised); border-radius: 3px;
  padding: 1px 5px;
}

/* Transición */
.help-fade-enter-active, .help-fade-leave-active { transition: opacity var(--t-normal); }
.help-fade-enter-from, .help-fade-leave-to { opacity: 0; }
</style>
