<template>
  <!-- Login page: render without shell chrome -->
  <RouterView v-if="isLoginPage" />

  <div v-else class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <!-- ── Titlebar ─────────────────────────────────── -->
    <header class="titlebar">
      <button class="titlebar__toggle" @click="toggleSidebar" :aria-label="sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'">
        <i class="fa-solid fa-bars" />
      </button>
      <span class="titlebar__brand">
        <i class="fa-solid fa-star titlebar__brand-icon" />
        Sistema Diaria
      </span>
      <div class="titlebar__right">
        <span class="titlebar__date">{{ todayLabel }}</span>
        <button class="titlebar__logout" title="Cerrar sesión" @click="handleLogout">
          <i class="fa-solid fa-right-from-bracket" />
        </button>
      </div>
    </header>

    <!-- ── Sidebar ──────────────────────────────────── -->
    <nav class="sidebar" aria-label="Navegación principal">
      <ul class="sidebar__list">
        <li v-for="item in navItems" :key="item.name">
          <RouterLink
            :to="{ name: item.name }"
            class="sidebar__item"
            active-class="sidebar__item--active"
          >
            <span class="sidebar__icon-wrap">
              <i :class="`fa-solid ${item.icon}`" />
            </span>
            <span class="sidebar__label">{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <!-- ── Overlay (mobile) ─────────────────────────── -->
    <div
      v-if="!sidebarCollapsed"
      class="sidebar-overlay"
      @click="sidebarCollapsed = true"
    />

    <!-- ── Barra inferior mobile ─────────────────────── -->
    <nav class="bottom-nav" aria-label="Navegación">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="bottom-nav__item"
        active-class="bottom-nav__item--active"
      >
        <i :class="`fa-solid ${item.icon}`" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <!-- ── Contenido principal ──────────────────────── -->
    <main class="main-content">
      <RouterView v-slot="{ Component }">
        <Transition name="view-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth.js";

const route = useRoute();
const router = useRouter();
const { user, logout } = useAuth();

const isLoginPage = computed(() => route.name === "login");

const sidebarCollapsed = ref(false);

const navItems = [
  { name: "hoy",         icon: "fa-gauge",                  label: "Hoy" },
  { name: "prediccion",  icon: "fa-bullseye",               label: "Predicción" },
  { name: "validacion",  icon: "fa-circle-check",           label: "Validación" },
  { name: "exploracion", icon: "fa-magnifying-glass-chart", label: "Exploración" },
  { name: "pega3",       icon: "fa-dice",                   label: "Pega3" },
  { name: "admin",       icon: "fa-gear",                   label: "Admin" },
];

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

async function handleLogout() {
  await logout();
  router.push({ name: "login" });
}

const todayLabel = computed(() => {
  return new Date().toLocaleDateString("es-HN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
});
</script>

<style scoped>
/* ── Shell layout ───────────────────────────────── */
.app-shell {
  display: grid;
  grid-template-areas:
    "titlebar titlebar"
    "sidebar  content";
  grid-template-rows: var(--titlebar-h) 1fr;
  grid-template-columns: var(--sidebar-w) 1fr;
  min-height: 100dvh;
  transition: grid-template-columns var(--t-slow);
}

.app-shell.sidebar-collapsed {
  grid-template-columns: var(--sidebar-w-collapsed) 1fr;
}

/* ── Titlebar ───────────────────────────────────── */
.titlebar {
  grid-area: titlebar;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-4);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.titlebar__toggle {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  transition: background var(--t-fast), color var(--t-fast);
  flex-shrink: 0;
}
.titlebar__toggle:hover {
  background: var(--bg-raised);
  color: var(--text-primary);
}

.titlebar__brand {
  font-weight: var(--fw-semi);
  font-size: var(--text-base);
  color: var(--gold);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  white-space: nowrap;
  overflow: hidden;
  transition: opacity var(--t-normal);
}

.titlebar__brand-icon {
  font-size: .85em;
}

.titlebar__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.titlebar__date {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: capitalize;
}

.titlebar__logout {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  font-size: var(--text-sm);
  transition: background var(--t-fast), color var(--t-fast);
  flex-shrink: 0;
}
.titlebar__logout:hover {
  background: var(--red-surface);
  color: var(--red);
}

/* ── Sidebar ────────────────────────────────────── */
.sidebar {
  grid-area: sidebar;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  padding: var(--sp-4) var(--sp-2);
  overflow-y: auto;
  overflow-x: hidden;
  position: sticky;
  top: var(--titlebar-h);
  height: calc(100dvh - var(--titlebar-h));
}

.sidebar__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--fw-medium);
  transition: background var(--t-fast), color var(--t-fast);
  white-space: nowrap;
  overflow: hidden;
  text-decoration: none;
}

.sidebar__item:hover {
  background: var(--bg-raised);
  color: var(--text-primary);
  text-decoration: none;
}

.sidebar__item--active {
  background: var(--gold-surface);
  color: var(--gold);
}

.sidebar__item--active .sidebar__icon-wrap {
  color: var(--gold);
}

.sidebar__icon-wrap {
  width: 20px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 14px;
}

.sidebar__label {
  transition: opacity var(--t-normal), width var(--t-normal);
}

/* Collapsed state */
.sidebar-collapsed .sidebar__label {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

.sidebar-collapsed .sidebar__item {
  justify-content: center;
  padding: var(--sp-2);
}

/* ── Mobile overlay ─────────────────────────────── */
.sidebar-overlay {
  display: none;
}

/* ── Main content ───────────────────────────────── */
.main-content {
  grid-area: content;
  min-width: 0;
  padding: var(--sp-6);
  overflow-y: auto;
}

/* ── View transition ────────────────────────────── */
.view-fade-enter-active,
.view-fade-leave-active {
  transition: opacity var(--t-normal), transform var(--t-normal);
}
.view-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.view-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Bottom nav (hidden on desktop) ─────────────── */
.bottom-nav { display: none; }

/* ── Mobile ─────────────────────────────────────── */
@media (max-width: 768px) {
  .app-shell {
    grid-template-areas:
      "titlebar"
      "content";
    grid-template-columns: 1fr;
    grid-template-rows: var(--titlebar-h) 1fr;
  }

  .app-shell.sidebar-collapsed {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    top: var(--titlebar-h);
    left: 0;
    height: calc(100dvh - var(--titlebar-h));
    z-index: 200;
    transform: translateX(0);
    transition: transform var(--t-slow);
    width: var(--sidebar-w);
  }

  .sidebar-collapsed .sidebar {
    transform: translateX(-100%);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.5);
    z-index: 199;
    backdrop-filter: blur(2px);
  }

  .main-content {
    padding: var(--sp-4);
    padding-bottom: calc(var(--sp-4) + 60px); /* espacio para bottom nav */
  }

  /* Barra inferior */
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 60px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    z-index: 100;
    overflow-x: auto;
  }

  .bottom-nav__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 10px;
    color: var(--text-muted);
    text-decoration: none;
    transition: color var(--t-fast);
    min-width: 52px;
    padding: var(--sp-1);
  }
  .bottom-nav__item i { font-size: 1.1rem; }
  .bottom-nav__item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 52px; }
  .bottom-nav__item:hover { color: var(--text-secondary); }
  .bottom-nav__item--active { color: var(--gold); }
  .bottom-nav__item--active i { color: var(--gold); }
}
</style>
