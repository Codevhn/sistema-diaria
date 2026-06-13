// Shim: redirige el createClient de esm.sh al paquete npm instalado.
// El alias de Vite apunta aquí cuando cualquier motor importa supabaseClient.js
export { createClient } from "@supabase/supabase-js";
