import { createRouter, createWebHashHistory } from "vue-router";
import { supabase } from "@motors/supabaseClient.js";

const routes = [
  {
    path: "/",
    redirect: "/hoy",
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/ViewLogin.vue"),
    meta: { public: true },
  },
  {
    path: "/hoy",
    name: "hoy",
    component: () => import("@/views/ViewHoy.vue"),
    meta: { icon: "fa-gauge", label: "Hoy" },
  },
  {
    path: "/prediccion",
    name: "prediccion",
    component: () => import("@/views/ViewPrediccion.vue"),
    meta: { icon: "fa-bullseye", label: "Predicción" },
  },
  {
    path: "/validacion",
    name: "validacion",
    component: () => import("@/views/ViewValidacion.vue"),
    meta: { icon: "fa-circle-check", label: "Validación" },
  },
  {
    path: "/exploracion",
    name: "exploracion",
    component: () => import("@/views/ViewExploracion.vue"),
    meta: { icon: "fa-magnifying-glass-chart", label: "Exploración" },
  },
  {
    path: "/pega3",
    name: "pega3",
    component: () => import("@/views/ViewPega3.vue"),
    meta: { icon: "fa-dice", label: "Pega3" },
  },
  {
    path: "/admin",
    name: "admin",
    component: () => import("@/views/ViewAdmin.vue"),
    meta: { icon: "fa-gear", label: "Admin", requiresAdmin: true },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta?.public) return true;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return { name: "login" };
    }
  } catch {
    return { name: "login" };
  }
  return true;
});
