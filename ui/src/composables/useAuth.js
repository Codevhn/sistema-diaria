import { ref } from "vue";
import { supabase } from "@motors/supabaseClient.js";

const user = ref(null);
const loading = ref(true);

// Initialize once — shared across the whole app
supabase.auth.getSession().then(({ data }) => {
  user.value = data?.session?.user ?? null;
  loading.value = false;
});

supabase.auth.onAuthStateChange((_event, session) => {
  user.value = session?.user ?? null;
});

export function useAuth() {
  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || "Error al iniciar sesión");
    return data?.user ?? null;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return { user, loading, login, logout };
}
