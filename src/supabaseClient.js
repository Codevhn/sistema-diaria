import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Placeholder credentials; replace with project-specific values.
const SUPABASE_URL = "https://zxdxskldmwzwjmmmqsvc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ad3HhXrb0jTsUVvq9_PQxg_71XPQmVZ";

// Storage: usamos localStorage (default de Supabase) en vez de sessionStorage.
// Motivo: sessionStorage + autoRefreshToken tiene condiciones de carrera que
// hacen que la sesión se invalide a los pocos segundos de iniciar. La
// seguridad de "cerrar al cerrar pestaña" ya la cubre el timer de inactividad
// de 1h en auth.js (startSessionInactivityTimer) + el JWT exp del servidor.
const storage =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage,
  },
});
