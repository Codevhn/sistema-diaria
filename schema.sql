-- PostgreSQL schema equivalent to the Dexie.js stores used in the app.
-- Columns are named in snake_case to mirror the original Dexie fields.

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
