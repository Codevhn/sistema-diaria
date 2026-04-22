/**
 * roles.js — Gestión de roles multiusuario
 *
 * Roles disponibles:
 *   admin  — acceso total + panel de gestión de usuarios
 *   editor — puede agregar sorteos e hipótesis, no puede borrar ni configurar
 *   lector — solo lectura de análisis y paneles
 */

import { supabase } from "./supabaseClient.js";

const VALID_ROLES = ["admin", "editor", "lector"];

const ROLE_LABELS = {
  admin:  "Admin",
  editor: "Editor",
  lector: "Lector",
};

const ROLE_COLORS = {
  admin:  "#f2c44a",
  editor: "#5ec47e",
  lector: "#a89e88",
};

let _roleCache = null;

// ─── Consulta del rol propio ──────────────────────────────────────────────────

export async function getMyRole() {
  if (_roleCache) return _roleCache;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return "lector";
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();
    if (error) throw error;
    _roleCache = data?.role ?? "lector";
  } catch (err) {
    console.warn("[roles] No se pudo leer rol:", err?.message);
    _roleCache = "lector"; // fallback seguro
  }
  return _roleCache;
}

export function clearRoleCache() {
  _roleCache = null;
}

export async function isAdmin()   { return (await getMyRole()) === "admin"; }
export async function isEditor()  { const r = await getMyRole(); return r === "editor"; }
export async function canWrite()  { const r = await getMyRole(); return r === "admin" || r === "editor"; }
export async function canDelete() { return (await getMyRole()) === "admin"; }

// ─── Panel admin: listado de usuarios ────────────────────────────────────────

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Panel admin: cambiar rol ─────────────────────────────────────────────────

export async function updateUserRole(userId, newRole) {
  if (!VALID_ROLES.includes(newRole)) throw new Error(`Rol inválido: ${newRole}`);
  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Aplicar visibilidad en el DOM ───────────────────────────────────────────

/**
 * Llama esto justo después del login.
 * Pone data-role en <html> y oculta/muestra elementos según clase:
 *   .requires-admin  → solo admin
 *   .requires-write  → admin o editor
 *   .lector-only     → solo lector (raramente usado)
 */
export async function applyRoleToDOM() {
  const role = await getMyRole();
  document.documentElement.dataset.role = role;
  return role;
}

// ─── Helpers de presentación ─────────────────────────────────────────────────

export function roleLabel(role)  { return ROLE_LABELS[role]  ?? role; }
export function roleColor(role)  { return ROLE_COLORS[role]  ?? "#888"; }
export { VALID_ROLES };
