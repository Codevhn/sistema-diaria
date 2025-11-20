import { supabase } from "./supabaseClient.js";

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || "Error al iniciar sesión");
  }
  return data?.user ?? null;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Error al cerrar sesión");
  }
  return true;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Supabase auth error:", error.message || error);
    return null;
  }
  return data?.user ?? null;
}
