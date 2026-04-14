-- Columns are named in snake_case to mirror the original Dexie fields.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE draws (
  id            BIGSERIAL PRIMARY KEY,
  fecha         DATE         NOT NULL,
  pais          TEXT         NOT NULL,
  horario       TEXT         NOT NULL,
  numero        INTEGER      NOT NULL,
  is_test       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_draws_fecha_pais_horario_numero
  ON draws (fecha, pais, horario, numero);

CREATE TABLE hypotheses (
  id          BIGSERIAL PRIMARY KEY,
  numero      INTEGER      NOT NULL,
  simbolo     TEXT,
  estado      TEXT         NOT NULL DEFAULT 'pendiente',
  fecha       DATE,
  turno       TEXT,
  score       DOUBLE PRECISION DEFAULT 0,
  razones     TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE TABLE reasons (
  id          BIGSERIAL PRIMARY KEY,
  owner_type  TEXT         NOT NULL,
  owner_id    BIGINT       NOT NULL,
  texto       TEXT         NOT NULL,
  tags        TEXT[]       DEFAULT ARRAY[]::TEXT[],
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE rules (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT         NOT NULL,
  descripcion TEXT         NOT NULL,
  parametros  JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE edges (
  id            BIGSERIAL PRIMARY KEY,
  from_fact_id  BIGINT,
  to_id         BIGINT,
  rule_id       TEXT,
  weight        DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge (
  key         TEXT PRIMARY KEY,
  scope       TEXT         NOT NULL DEFAULT 'general',
  data        JSONB,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE hypothesis_logs (
  id                 BIGSERIAL PRIMARY KEY,
  hypothesis_id      BIGINT,
  numero             INTEGER,
  estado             TEXT,
  fecha_resultado    DATE,
  pais_resultado     TEXT,
  horario_resultado  TEXT,
  fecha_hipotesis    DATE,
  turno_hipotesis    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hypothesis_logs_numero_estado
  ON hypothesis_logs (numero, estado);

CREATE TABLE prediction_logs (
  id                 BIGSERIAL PRIMARY KEY,
  target_fecha       DATE,
  target_pais        TEXT,
  turno              TEXT,
  numero             INTEGER      NOT NULL,
  score              DOUBLE PRECISION,
  estado             TEXT         NOT NULL DEFAULT 'pendiente',
  resultado_horario  TEXT,
  resolved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prediction_logs_target_fecha_pais
  ON prediction_logs (target_fecha, target_pais);

CREATE TABLE game_modes (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT         NOT NULL,
  tipo        TEXT         NOT NULL,
  descripcion TEXT         NOT NULL DEFAULT '',
  operacion   TEXT         NOT NULL DEFAULT '',
  parametros  JSONB,
  offset      INTEGER,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE TABLE game_mode_examples (
  id          BIGSERIAL PRIMARY KEY,
  mode_id     BIGINT REFERENCES game_modes(id) ON DELETE CASCADE,
  original    TEXT         NOT NULL,
  resultado   TEXT         NOT NULL,
  nota        TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE game_mode_logs (
  id          BIGSERIAL PRIMARY KEY,
  mode_id     BIGINT REFERENCES game_modes(id) ON DELETE CASCADE,
  fecha       DATE,
  pais        TEXT,
  turno       TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_mode_logs_mode_id_fecha
  ON game_mode_logs (mode_id, fecha);

CREATE TABLE hypothesis_reminders (
  id          BIGSERIAL PRIMARY KEY,
  numero      INTEGER      NOT NULL,
  nota        TEXT,
  simbolo     TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_hypothesis_reminders_numero
  ON hypothesis_reminders (numero);

CREATE TABLE notebook_entries (
  id          BIGSERIAL PRIMARY KEY,
  fecha       DATE         NOT NULL,
  pais        TEXT         NOT NULL,
  numeros     JSONB        NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pega3 (
  id          BIGSERIAL PRIMARY KEY,
  fecha       DATE         NOT NULL,
  horario     TEXT         NOT NULL,
  pais        TEXT         NOT NULL,
  pares       INTEGER[]    NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pega3_fecha_horario_pais
  ON pega3 (fecha, horario, pais);

CREATE TABLE user_preferences (
  user_id     UUID PRIMARY KEY REFERENCES auth.users (id),
  data        JSONB        NOT NULL DEFAULT '{}'::JSONB,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION set_user_preferences_updated_at();

-- Trigger Engine
CREATE TABLE trigger_relations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin           SMALLINT     NOT NULL CHECK (origin BETWEEN 0 AND 99),
  target           SMALLINT     NOT NULL CHECK (target BETWEEN 0 AND 99),
  relation_type    TEXT         NOT NULL CHECK (relation_type IN ('DISPARA', 'AVISA', 'REFUERZA')),
  window_min_days  INTEGER      NOT NULL DEFAULT 0 CHECK (window_min_days >= 0),
  window_max_days  INTEGER      NOT NULL DEFAULT 5 CHECK (window_max_days >= window_min_days),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_trigger_relations_unique
  ON trigger_relations (user_id, origin, target, relation_type);

CREATE TABLE trigger_events (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation_id    UUID         NOT NULL REFERENCES trigger_relations(id) ON DELETE CASCADE,
  origin         SMALLINT     NOT NULL CHECK (origin BETWEEN 0 AND 99),
  target         SMALLINT     NOT NULL CHECK (target BETWEEN 0 AND 99),
  origin_draw_id BIGINT       REFERENCES draws(id),
  origin_ts      TIMESTAMPTZ  NOT NULL,
  deadline_ts    TIMESTAMPTZ  NOT NULL,
  status         TEXT         NOT NULL CHECK (status IN ('OPEN', 'HIT', 'MISS', 'LATE_HIT')),
  hit_draw_id    BIGINT       REFERENCES draws(id),
  hit_ts         TIMESTAMPTZ,
  lag_days       INTEGER      CHECK (lag_days >= 0),
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trigger_events_user_status ON trigger_events (user_id, status);
CREATE INDEX idx_trigger_events_user_origin_ts ON trigger_events (user_id, origin_ts);
CREATE INDEX idx_trigger_events_user_origin_target ON trigger_events (user_id, origin, target);

ALTER TABLE trigger_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY trigger_relations_select_owner
  ON trigger_relations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY trigger_relations_insert_owner
  ON trigger_relations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY trigger_relations_update_owner
  ON trigger_relations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY trigger_relations_delete_owner
  ON trigger_relations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY trigger_events_select_owner
  ON trigger_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY trigger_events_insert_owner
  ON trigger_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY trigger_events_update_owner
  ON trigger_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY trigger_events_delete_owner
  ON trigger_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION set_trigger_relations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trigger_relations_updated_at
BEFORE UPDATE ON trigger_relations
FOR EACH ROW
EXECUTE FUNCTION set_trigger_relations_updated_at();

CREATE VIEW trigger_relation_stats AS
SELECT
  tr.id AS relation_id,
  tr.user_id,
  tr.origin,
  tr.target,
  tr.relation_type,
  tr.window_min_days,
  tr.window_max_days,
  tr.is_active,
  tr.notes,
  tr.created_at,
  tr.updated_at,
  COUNT(te.id) AS total_events,
  COUNT(te.id) FILTER (WHERE te.status = 'HIT') AS hit_count,
  COUNT(te.id) FILTER (WHERE te.status = 'MISS') AS miss_count,
  COUNT(te.id) FILTER (WHERE te.status = 'LATE_HIT') AS late_hit_count,
  CASE
    WHEN COUNT(te.id) > 0 THEN
      (COUNT(te.id) FILTER (WHERE te.status = 'HIT'))::DECIMAL / COUNT(te.id)
    ELSE 0
  END AS hit_rate,
  CASE
    WHEN COUNT(te.id) > 0 THEN
      (COUNT(te.id) FILTER (WHERE te.status = 'MISS'))::DECIMAL / COUNT(te.id)
    ELSE 0
  END AS miss_rate,
  CASE
    WHEN COUNT(te.id) > 0 THEN
      (COUNT(te.id) FILTER (WHERE te.status = 'LATE_HIT'))::DECIMAL / COUNT(te.id)
    ELSE 0
  END AS late_rate,
  AVG(te.lag_days) FILTER (WHERE te.status IN ('HIT', 'LATE_HIT')) AS avg_lag_days,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY te.lag_days)
    FILTER (WHERE te.status IN ('HIT', 'LATE_HIT')) AS median_lag_days,
  percentile_cont(0.8) WITHIN GROUP (ORDER BY te.lag_days)
    FILTER (WHERE te.status IN ('HIT', 'LATE_HIT')) AS p80_lag_days
FROM trigger_relations tr
LEFT JOIN trigger_events te
  ON te.relation_id = tr.id AND te.user_id = tr.user_id
GROUP BY
  tr.id,
  tr.user_id,
  tr.origin,
  tr.target,
  tr.relation_type,
  tr.window_min_days,
  tr.window_max_days,
  tr.is_active,
  tr.notes,
  tr.created_at,
  tr.updated_at;
