import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Placeholder credentials; replace with project-specific values.
const SUPABASE_URL = "https://zxdxskldmwzwjmmmqsvc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ad3HhXrb0jTsUVvq9_PQxg_71XPQmVZ";

const storage =
  typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // persist solo en sessionStorage para que cierre al cerrar pestaña
    autoRefreshToken: true,
    storage,
  },
});
