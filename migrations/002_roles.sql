-- ══════════════════════════════════════════════════════════════════
-- Migración 002: Sistema de roles multiusuario
-- Ejecutar en: Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- 1. Tabla de perfiles/roles
CREATE TABLE IF NOT EXISTS profiles (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'lector'
                          CHECK (role IN ('admin', 'editor', 'lector')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Trigger: auto-crear perfil al registrar un usuario nuevo
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Poblar perfiles para usuarios existentes (primera vez)
INSERT INTO profiles (user_id, email)
SELECT id, email FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 4. RLS en profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer todos los perfiles
-- (el admin panel necesita listar todos los users)
CREATE POLICY profiles_select
  ON profiles FOR SELECT TO authenticated
  USING (true);

-- Solo el propio usuario puede ver su fila de forma más específica
-- (cubierto por la policy anterior, esta es redundante pero explícita)

-- Solo un admin puede actualizar roles
CREATE POLICY profiles_update_admin
  ON profiles FOR UPDATE TO authenticated
  USING   ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

-- 5. RLS en draws: lectores solo leen, editors/admins escriben, solo admin borra
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY draws_select ON draws FOR SELECT TO authenticated USING (true);

CREATE POLICY draws_insert ON draws FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin', 'editor')
  );

CREATE POLICY draws_update ON draws FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin', 'editor')
  );

CREATE POLICY draws_delete ON draws FOR DELETE TO authenticated
  USING (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin'
  );

-- 6. RLS en otras tablas de escritura (hypotheses, game_modes, pega3, etc.)
--    Mismo patrón: SELECT libre, INSERT/UPDATE para editor+, DELETE solo admin

ALTER TABLE hypotheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY hyp_select ON hypotheses FOR SELECT TO authenticated USING (true);
CREATE POLICY hyp_insert ON hypotheses FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY hyp_update ON hypotheses FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY hyp_delete ON hypotheses FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

ALTER TABLE game_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY gm_select ON game_modes FOR SELECT TO authenticated USING (true);
CREATE POLICY gm_write  ON game_modes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY gm_update ON game_modes FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY gm_delete ON game_modes FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

ALTER TABLE pega3 ENABLE ROW LEVEL SECURITY;
CREATE POLICY pega3_select ON pega3 FOR SELECT TO authenticated USING (true);
CREATE POLICY pega3_insert ON pega3 FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY pega3_delete ON pega3 FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

-- notebook_entries: todos pueden leer/escribir (es personal), solo admin borra
ALTER TABLE notebook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY nb_select ON notebook_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY nb_insert ON notebook_entries FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'));
CREATE POLICY nb_delete ON notebook_entries FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

-- knowledge: solo admin escribe (datos del sistema)
ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY know_select ON knowledge FOR SELECT TO authenticated USING (true);
CREATE POLICY know_write  ON knowledge FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');
CREATE POLICY know_update ON knowledge FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin');

-- 7. Asignar rol admin al primer usuario registrado (el más antiguo)
--    IMPORTANTE: ejecutar esto y verificar que el email sea el tuyo
UPDATE profiles
SET role = 'admin'
WHERE user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);

-- Verificar resultado:
SELECT u.email, p.role, p.created_at
FROM profiles p JOIN auth.users u ON u.id = p.user_id
ORDER BY p.created_at;
