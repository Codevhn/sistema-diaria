-- 005_draws_is_pending.sql
-- storage.js consulta y escribe la columna draws.is_pending (savePendingDraw,
-- confirmPendingDraw, findExistingDraw) pero la columna nunca quedó versionada
-- en schema.sql ni en ninguna migración. Si la base se reconstruye desde el
-- repo, todo el flujo de sorteos pendientes falla con error 42703.
-- IF NOT EXISTS hace la migración segura para bases donde la columna ya se
-- agregó a mano.

ALTER TABLE draws ADD COLUMN IF NOT EXISTS is_pending BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: las consultas de pendientes filtran siempre por is_pending.
CREATE INDEX IF NOT EXISTS idx_draws_is_pending ON draws (is_pending) WHERE is_pending;

-- Añadir también la columna 'numero' validada en rango (defensivo: el frontend
-- no valida el rango 0-99 al guardar y un dato fuera de rango corrompe gaps,
-- cadencias y evaluaciones silenciosamente).
-- NOT VALID: aplica solo a filas nuevas, así la migración no falla si ya
-- existe algún dato histórico fuera de rango (limpiarlo es tarea aparte).
ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_numero_rango;
ALTER TABLE draws ADD CONSTRAINT draws_numero_rango CHECK (numero BETWEEN 0 AND 99) NOT VALID;
