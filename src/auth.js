import { supabase } from "./supabaseClient.js";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const SESSION_RETRY_ATTEMPTS = 5;
const SESSION_RETRY_DELAY_MS = 200;
let inactivityTimer = null;
let activityListenersAttached = false;
const activityEvents = ["click", "keydown", "scroll", "mousemove", "touchstart"];
const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") resetInactivityTimer();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSessionWithRetry(options = {}) {
  const attempts = Math.max(1, options?.attempts ?? SESSION_RETRY_ATTEMPTS);
  const delayMs = options?.delayMs ?? SESSION_RETRY_DELAY_MS;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data?.session?.user) {
        return data.session;
      }
      lastError = null;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (i < attempts - 1) {
      await wait(delayMs * (i + 1));
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
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
  startSessionInactivityTimer();
  return data?.user ?? null;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Error al cerrar sesión");
  }
  clearSupabaseSessionStorage();
  stopSessionInactivityTimer();
  return true;
}

export async function getCurrentUser(options = {}) {
  try {
    const session = await fetchSessionWithRetry(options);
    return session?.user ?? null;
  } catch (err) {
    console.error("Supabase auth error:", err?.message || err);
    await supabase.auth.signOut().catch(() => {});
    clearSupabaseSessionStorage();
    return null;
  }
}

export async function requireAuthOrRedirect(redirectTo = "./login.html", options = {}) {
  const user = await getCurrentUser(options);
  if (!user) {
    await supabase.auth.signOut().catch(() => {});
    clearSupabaseSessionStorage();
    window.location.replace(redirectTo);
    return null;
  }
  startSessionInactivityTimer();
  return user;
}

async function handleInactivityTimeout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Error al cerrar sesión por inactividad", err);
  } finally {
    clearSupabaseSessionStorage();
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
