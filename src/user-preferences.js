import { supabase } from "./supabaseClient.js";
import { logWarn } from "./logger.js";

const TABLE = "user_preferences";

export async function loadUserPreferences(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from(TABLE).select("data").eq("user_id", userId).maybeSingle();
    if (error) {
      logWarn("No se pudieron cargar preferencias de usuario", error);
      return null;
    }
    const prefs = data?.data;
    return prefs && typeof prefs === "object" ? prefs : null;
  } catch (err) {
    logWarn("Excepción al cargar preferencias de usuario", err);
    return null;
  }
}

export async function saveUserPreferences(userId, data = {}) {
  if (!userId) return false;
  const payload = { user_id: userId, data };
  try {
    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "user_id" });
    if (error) {
      logWarn("No se pudieron guardar preferencias de usuario", error);
      return false;
    }
    return true;
  } catch (err) {
    logWarn("Excepción al guardar preferencias de usuario", err);
    return false;
  }
}
