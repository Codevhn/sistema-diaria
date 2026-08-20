// config.js — Variables de entorno para el navegador.
// Lee de window.__ENV__ (inyectado por el HTML) con fallback a defaults.
// En producción, define window.__ENV__ antes de cargar módulos.

const defaults = {
  SUPABASE_URL: "https://zxdxskldmwzwjmmmqsvc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Ad3HhXrb0jTsUVvq9_PQxg_71XPQmVZ",
};

const env = (typeof window !== "undefined" && window.__ENV__) || {};

export const SUPABASE_URL = env.SUPABASE_URL || defaults.SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || defaults.SUPABASE_ANON_KEY;
