-- ══════════════════════════════════════════════════════════════════
-- FIX: Error "Database error creating new user" + RLS faltante
-- Copiar TODO y pegar en: Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════

-- 1. Tabla profiles (si no existe)
CREATE TABLE IF NOT EXISTS profiles (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'lector'
                          CHECK (role IN ('admin', 'editor', 'lector')),
  banned      BOOLEAN     NOT NULL DEFAULT FALSE,
  nombre      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Permisos para supabase_auth_admin (Supabase necesita esto para el trigger)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT ALL ON TABLE profiles TO supabase_auth_admin;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Trigger: crear perfil automáticamente al registrar usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. Perfiles para usuarios que ya existen
INSERT INTO profiles (user_id, email)
SELECT id, email FROM auth.users ON CONFLICT (user_id) DO NOTHING;

-- 5. Rol admin al primer usuario
UPDATE profiles SET role = 'admin'
WHERE user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);

-- 6. Tabla user_preferences (si no existe, crearla)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB        NOT NULL DEFAULT '{}'::JSONB,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 7. RLS en tablas que faltaban (solo si existen)
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reasons','rules','edges','hypothesis_logs','prediction_logs',
    'game_mode_examples','game_mode_logs','hypothesis_reminders','user_preferences'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %s_select ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_insert ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_update ON %I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %s_delete ON %I', t, t);
      EXECUTE format('CREATE POLICY %s_select ON %I FOR SELECT TO authenticated USING (true)', t, t);
      EXECUTE format('CREATE POLICY %s_insert ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN (''admin'',''editor''))', t, t);
      EXECUTE format('CREATE POLICY %s_update ON %I FOR UPDATE TO authenticated USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN (''admin'',''editor''))', t, t);
      EXECUTE format('CREATE POLICY %s_delete ON %I FOR DELETE TO authenticated USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = ''admin'')', t, t);
    END IF;
  END LOOP;
END $$;

-- user_preferences tiene regla especial: cada usuario solo toca lo suyo
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS up_select ON user_preferences;
    DROP POLICY IF EXISTS up_insert ON user_preferences;
    DROP POLICY IF EXISTS up_update ON user_preferences;
    DROP POLICY IF EXISTS up_delete ON user_preferences;
    CREATE POLICY up_select ON user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY up_insert ON user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY up_update ON user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY up_delete ON user_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- FIN. Ahora intenta crear el usuario desde el Dashboard de Supabase
-- ══════════════════════════════════════════════════════════════════
