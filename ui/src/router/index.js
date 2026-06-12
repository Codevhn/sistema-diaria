import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  {
    path: "/",
    redirect: "/hoy",
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
