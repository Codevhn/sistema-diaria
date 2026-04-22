-- ══════════════════════════════════════════════════════════════════
-- Migración 003: Campo banned en profiles
-- Ejecutar en: Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- 1. Agregar columna banned
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Policy: solo admin puede actualizar banned
--    (la policy de update admin ya existe de la migración 002,
--     cubre todos los campos incluyendo banned)

-- Verificar:
SELECT profiles.email, profiles.role, profiles.banned FROM profiles
JOIN auth.users ON auth.users.id = profiles.user_id
ORDER BY profiles.created_at;
