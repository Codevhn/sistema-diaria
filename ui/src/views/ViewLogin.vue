<template>
  <div class="login-shell">
    <div class="login-card">
      <div class="login-logo">
        <i class="fa-solid fa-star" />
      </div>
      <h1 class="login-title">Sistema Diaria</h1>
      <p class="login-sub">Honduras · Acceso restringido</p>

      <form class="login-form" @submit.prevent="submit">
        <div class="field-group">
          <label class="field-label">Correo</label>
          <input
            v-model="email"
            type="email"
            class="field-input"
            placeholder="usuario@ejemplo.com"
            autocomplete="email"
            required
          />
        </div>

        <div class="field-group">
          <label class="field-label">Contraseña</label>
          <input
            v-model="password"
            type="password"
            class="field-input"
            placeholder="••••••••"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="error" class="login-error">
          <i class="fa-solid fa-triangle-exclamation" />
          {{ error }}
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          <i v-if="loading" class="fa-solid fa-spinner fa-spin" />
          <i v-else class="fa-solid fa-right-to-bracket" />
          {{ loading ? "Ingresando…" : "Ingresar" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth.js";

const { login } = useAuth();
const router = useRouter();

const email    = ref("");
const password = ref("");
const error    = ref(null);
const loading  = ref(false);

async function submit() {
  error.value   = null;
  loading.value = true;
  try {
    await login(email.value, password.value);
    router.replace({ name: "hoy" });
  } catch (e) {
    error.value = e?.message ?? "Error al iniciar sesión";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-shell {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: var(--sp-4);
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-8) var(--sp-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
}

.login-logo {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--gold-surface);
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  color: var(--gold);
  border: 1px solid var(--gold-dim);
}

.login-title {
  font-size: var(--text-xl);
  font-weight: var(--fw-bold);
  color: var(--text-primary);
  margin: 0;
}

.login-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.field-input {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  background: var(--bg-raised);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: var(--sp-3) var(--sp-3);
  transition: border-color var(--t-fast);
}
.field-input:focus {
  outline: none;
  border-color: var(--gold);
}
.field-input::placeholder {
  color: var(--text-muted);
}

.login-error {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--red-surface);
  border: 1px solid var(--red);
  border-radius: var(--r-md);
  color: var(--red);
  font-size: var(--text-sm);
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  background: var(--gold);
  color: #000;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--fw-semi);
  border-radius: var(--r-md);
  transition: opacity var(--t-fast), background var(--t-fast);
  cursor: pointer;
}
.login-btn:hover:not(:disabled) {
  background: var(--gold-dim);
}
.login-btn:disabled {
  opacity: .6;
  cursor: default;
}
</style>
