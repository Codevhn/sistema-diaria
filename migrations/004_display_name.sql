-- ══════════════════════════════════════════════════════════════════
-- Migración 004: Campo nombre (display name) en profiles
-- Ejecutar en: Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nombre TEXT;

-- Verificar:
SELECT profiles.email, profiles.nombre, profiles.role, profiles.banned FROM profiles
JOIN auth.users ON auth.users.id = profiles.user_id
ORDER BY profiles.created_at;
