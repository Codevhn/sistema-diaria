import { supabase } from "./supabaseClient.js";
import { logWarn } from "./logger.js";

const TABLE = "user_preferences";
const LOCAL_STORAGE_KEY = "ld:user-preferences";
const globalScope = typeof window !== "undefined" ? window : globalThis;
const localStore =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : undefined;
const sessionStore =
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : undefined;

const remoteFlag = globalScope?.__ENABLE_REMOTE_USER_PREFS;
const remoteExplicit =
  typeof remoteFlag === "string" ? remoteFlag === "true" : remoteFlag === true;
const sessionRemoteDisabled = sessionStore?.getItem("ld:prefs:remoteDisabled") === "1";
let remotePrefsEnabled = remoteExplicit && !sessionRemoteDisabled;
let localCache = null;

const clone = (prefs) => {
  if (!prefs || typeof prefs !== "object") return null;
  if (typeof structuredClone === "function") return structuredClone(prefs);
  try {
    return JSON.parse(JSON.stringify(prefs));
  } catch {
    return { ...prefs };
  }
};

function readLocalStore() {
  if (!localStore) return {};
  if (localCache) return localCache;
  try {
    const raw = localStore.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      localCache = {};
      return localCache;
    }
    const parsed = JSON.parse(raw);
    localCache = parsed && typeof parsed === "object" ? parsed : {};
    return localCache;
  } catch (err) {
    logWarn("No se pudo leer preferencias locales", err);
    localCache = {};
    return localCache;
  }
}

function persistLocalStore(store) {
  if (!localStore) return false;
  localCache = store;
  try {
    localStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    logWarn("No se pudieron guardar preferencias locales", err);
    return false;
  }
}

function getLocalPreferences(userId) {
  if (!userId) return null;
  const store = readLocalStore();
  const prefs = store?.[userId];
  return prefs && typeof prefs === "object" ? clone(prefs) : null;
}

function setLocalPreferences(userId, data = {}) {
  if (!userId) return false;
  const store = { ...readLocalStore(), [userId]: clone(data) || {} };
  return persistLocalStore(store);
}

function disableRemotePreferences() {
  if (!remotePrefsEnabled) return;
  remotePrefsEnabled = false;
  try {
    sessionStore?.setItem("ld:prefs:remoteDisabled", "1");
  } catch {
    /* noop */
  }
}

export async function loadUserPreferences(userId) {
  if (!userId) return null;
  if (!remotePrefsEnabled) {
    return getLocalPreferences(userId);
  }
  try {
    const { data, error } = await supabase.from(TABLE).select("data").eq("user_id", userId).maybeSingle();
    if (error) {
      logWarn("No se pudieron cargar preferencias de usuario", error);
      disableRemotePreferences();
      return getLocalPreferences(userId);
    }
    const prefs = data?.data;
    if (prefs && typeof prefs === "object") {
      setLocalPreferences(userId, prefs);
      return clone(prefs);
    }
    return null;
  } catch (err) {
    logWarn("Excepción al cargar preferencias de usuario", err);
    disableRemotePreferences();
    return getLocalPreferences(userId);
  }
}

export async function saveUserPreferences(userId, data = {}) {
  if (!userId) return false;
  setLocalPreferences(userId, data);
  if (!remotePrefsEnabled) return true;
  const payload = { user_id: userId, data };
  try {
    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "user_id" });
    if (error) {
      logWarn("No se pudieron guardar preferencias de usuario", error);
      disableRemotePreferences();
      return false;
    }
    return true;
  } catch (err) {
    logWarn("Excepción al guardar preferencias de usuario", err);
    disableRemotePreferences();
    return false;
  }
}
