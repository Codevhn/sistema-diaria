import { supabase } from "./supabaseClient.js";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
let inactivityTimer = null;
let activityListenersAttached = false;
const activityEvents = ["click", "keydown", "scroll", "mousemove", "touchstart"];
const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") resetInactivityTimer();
};

function cacheSession(session) {
  if (typeof window === "undefined") return;
  window.__LD_SESSION__ = session || null;
}

function clearSupabaseSessionStorage() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  const keys = [];
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i);
    if (key && key.startsWith("sb-")) {
      keys.push(key);
    }
  }
  keys.forEach((key) => window.sessionStorage.removeItem(key));
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || "Error al iniciar sesión");
  }
  cacheSession(data?.session || null);
  startSessionInactivityTimer();
  return data?.user ?? null;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Error al cerrar sesión");
  }
  cacheSession(null);
  clearSupabaseSessionStorage();
  stopSessionInactivityTimer();
  return true;
}

export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("Supabase auth error:", error.message || error);
      await supabase.auth.signOut().catch(() => {});
      clearSupabaseSessionStorage();
      cacheSession(null);
      return null;
    }
    cacheSession(data?.session || null);
    return data?.session?.user ?? null;
  } catch (err) {
    console.error("Supabase auth error:", err?.message || err);
    await supabase.auth.signOut().catch(() => {});
    clearSupabaseSessionStorage();
    cacheSession(null);
    return null;
  }
}

export async function requireAuthOrRedirect(redirectTo = "./login.html") {
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (error || !session?.user) {
      cacheSession(null);
      await supabase.auth.signOut().catch(() => {});
      clearSupabaseSessionStorage();
      window.location.replace(redirectTo);
      return null;
    }
    cacheSession(session || null);
    startSessionInactivityTimer();
    return session.user;
  } catch (err) {
    console.error("Supabase auth error:", err?.message || err);
    cacheSession(null);
    await supabase.auth.signOut().catch(() => {});
    clearSupabaseSessionStorage();
    window.location.replace(redirectTo);
    return null;
  }
}

async function handleInactivityTimeout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Error al cerrar sesión por inactividad", err);
  } finally {
    clearSupabaseSessionStorage();
    cacheSession(null);
    window.location.replace("./login.html");
  }
}

function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  inactivityTimer = setTimeout(handleInactivityTimeout, INACTIVITY_LIMIT_MS);
}

function attachActivityListeners() {
  if (activityListenersAttached || typeof window === "undefined") return;
  activityEvents.forEach((eventName) =>
    window.addEventListener(eventName, resetInactivityTimer, { passive: true })
  );
  window.addEventListener("visibilitychange", handleVisibilityChange);
  activityListenersAttached = true;
}

export function startSessionInactivityTimer() {
  attachActivityListeners();
  resetInactivityTimer();
}

export function stopSessionInactivityTimer() {
  if (!activityListenersAttached || typeof window === "undefined") return;
  activityEvents.forEach((eventName) =>
    window.removeEventListener(eventName, resetInactivityTimer, { passive: true })
  );
  window.removeEventListener("visibilitychange", handleVisibilityChange);
  activityListenersAttached = false;
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}
