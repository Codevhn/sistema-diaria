-- 008_core_indexes.sql
-- Índices para tablas core con queries frecuentes.
-- Seguro: todos usan IF NOT EXISTS — re-ejecutable.

-- draws: query principal es listDraws ORDER BY created_at WHERE is_pending
-- Ya existe idx_draws_is_pending. Agregamos fecha + horario para sorts y filtros.
CREATE INDEX IF NOT EXISTS idx_draws_fecha
  ON draws (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_draws_horario
  ON draws (horario);

-- Compuesto: el más usado por listDraws + filter por país
CREATE INDEX IF NOT EXISTS idx_draws_pais_fecha
  ON draws (pais, fecha DESC);

-- notebook_entries: listNotebookEntries ordena por created_at
CREATE INDEX IF NOT EXISTS idx_notebook_fecha
  ON notebook_entries (fecha DESC);

-- hypothesis_logs: getHypothesisLogsByNumber filtra por numero
CREATE INDEX IF NOT EXISTS idx_hypothesis_logs_numero
  ON hypothesis_logs (numero);

-- prediction_logs: logPredictions filtra por estado + target_fecha
CREATE INDEX IF NOT EXISTS idx_prediction_logs_estado
  ON prediction_logs (estado)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_prediction_logs_target
  ON prediction_logs (target_fecha, target_pais);

-- game_mode_logs: listGameModeLogs filtra por mode_id + fecha
CREATE INDEX IF NOT EXISTS idx_game_mode_logs_mode
  ON game_mode_logs (mode_id, fecha);

-- pega3: listPega3Draws filtra por pais + horario
CREATE INDEX IF NOT EXISTS idx_pega3_pais_turno
  ON pega3 (pais, horario);
