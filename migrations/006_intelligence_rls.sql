-- ══════════════════════════════════════════════════════════════════
-- Migración 006: RLS para las tablas de inteligencia (Sprint 1)
-- Ejecutar en: Supabase → SQL Editor
--
-- Las 9 tablas creadas en sprint1_intelligence_schema.sql quedaron SIN
-- Row Level Security: cualquier usuario autenticado podía leer, alterar
-- o borrar las evaluaciones del sistema (las métricas de acierto eran
-- manipulables). Se aplica el mismo patrón que migración 002:
--   SELECT  → cualquier autenticado
--   INSERT/UPDATE → editor o admin (el ciclo de evaluación corre en
--                   sesiones que también escriben sorteos)
--   DELETE  → solo admin
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  tablas TEXT[] := ARRAY[
    'strategy_events',
    'sequence_resolutions',
    'recovery_episodes',
    'public_pressure',
    'intraday_patterns',
    'system_evaluations',
    'system_score_history',
    'regime_changepoints',
    'active_sequences'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON %I FOR INSERT TO authenticated
         WITH CHECK ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'))$p$,
      t || '_insert', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON %I FOR UPDATE TO authenticated
         USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin','editor'))$p$,
      t || '_update', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON %I FOR DELETE TO authenticated
         USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin')$p$,
      t || '_delete', t
    );
  END LOOP;
END $$;

-- Verificar resultado:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'strategy_events','sequence_resolutions','recovery_episodes',
    'public_pressure','intraday_patterns','system_evaluations',
    'system_score_history','regime_changepoints','active_sequences'
  );
