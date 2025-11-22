import { supabase } from "./supabaseClient.js";

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || "Error al iniciar sesión");
  }
  setLoginStamp(Date.now());
  return data?.user ?? null;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Error al cerrar sesión");
  }
  clearLoginStamp();
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

const AUTH_STAMP_KEY = "ld-auth-login-at";
const MAX_SESSION_AGE_MS = 60 * 60 * 1000; // 1 hora de vigencia local

export function setLoginStamp(value) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(AUTH_STAMP_KEY, String(value || Date.now()));
    }
  } catch (_) {
    /* ignore */
  }
}

function getLoginStamp() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return 0;
    return parseInt(window.localStorage.getItem(AUTH_STAMP_KEY), 10) || 0;
  } catch (_) {
    return 0;
  }
}

export function clearLoginStamp() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(AUTH_STAMP_KEY);
    }
  } catch (_) {
    /* ignore */
  }
}

export async function requireAuthOrRedirect(redirectTo = "./login.html") {
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    const stamp = getLoginStamp();
    const isStampStale = !stamp || Date.now() - stamp > MAX_SESSION_AGE_MS;
    if (error || !session?.user || isStampStale) {
      await supabase.auth.signOut();
      clearLoginStamp();
      window.location.href = redirectTo;
      return null;
    }
    return session.user;
  } catch (err) {
    console.error("Supabase auth error:", err?.message || err);
    try {
      await supabase.auth.signOut();
      clearLoginStamp();
    } catch (_) {
      /* noop */
    }
    window.location.href = redirectTo;
    return null;
  }
}
