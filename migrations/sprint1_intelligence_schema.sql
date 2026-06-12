-- =============================================================================
-- SPRINT 1 — Inteligencia Adversarial v4.0
-- Nuevas tablas para: estrategias, secuencias, presión, autoevaluación
-- NO modifica ninguna tabla existente.
-- Ejecutar en Supabase SQL Editor (Project > SQL Editor > New query)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ESTRATEGIAS DE LA CASA
--    Registra qué estrategia usó La Casa en cada sorteo detectado.
--    Se puebla automáticamente por strategy-classifier.js
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_events (
  id              BIGSERIAL    PRIMARY KEY,
  draw_id         BIGINT       REFERENCES draws(id) ON DELETE SET NULL,
  strategy_id     TEXT         NOT NULL,
  numero          SMALLINT     NOT NULL CHECK (numero BETWEEN 0 AND 99),
  numero_origen   SMALLINT     CHECK (numero_origen BETWEEN 0 AND 99),
  tipo_variante   TEXT,
  turno           TEXT,
  fecha           DATE         NOT NULL,
  confianza       REAL         NOT NULL DEFAULT 0 CHECK (confianza BETWEEN 0 AND 1),
  validado        BOOLEAN      NOT NULL DEFAULT FALSE,
  notas           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_events_fecha
  ON strategy_events (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_events_strategy_id
  ON strategy_events (strategy_id);

CREATE INDEX IF NOT EXISTS idx_strategy_events_numero
  ON strategy_events (numero);

COMMENT ON TABLE strategy_events IS
  'Cada fila es una instancia en que el clasificador detectó una estrategia de La Casa. '
  'strategy_id referencia el catálogo: S01=PagoDirectoTardío, S02=PagoVariante, '
  'S03=VueltaIntraDía, S04=PagoAnticipado, S05=DesvíoSecuencia, '
  'S06=ModoRecuperaciónPostSuperpremio, S07=BloqueoPopulares, S08=LiberaciónCluster, '
  'S09=SecuenciaFragmentada, S10=EspejoTurno, S11=RepeticiónControlada, '
  'S12=FinCicloMensual.';

-- ---------------------------------------------------------------------------
-- 2. HISTORIAL DE RESOLUCIONES DE SECUENCIA
--    Cada fila = una instancia en que número_origen "llamó" a número_resolución.
--    Incluye si fue resolución directa o por variante, y cuántos sorteos pasaron.
--    Permite calcular la distribución estadística real de cada par A→B.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequence_resolutions (
  id                  BIGSERIAL    PRIMARY KEY,
  numero_origen       SMALLINT     NOT NULL CHECK (numero_origen BETWEEN 0 AND 99),
  numero_resolucion   SMALLINT     NOT NULL CHECK (numero_resolucion BETWEEN 0 AND 99),
  tipo_variante       TEXT         NOT NULL DEFAULT 'crudo',
  -- 'crudo' | 'espejo' | 'conv_d0' | 'conv_d1' | 'compound' |
  -- 'equiv_d0' | 'equiv_d1' | 'compound_equiv' | 'relativo' | 'familia'
  sorteos_gap         SMALLINT     NOT NULL CHECK (sorteos_gap >= 0),
  dias_gap            SMALLINT     NOT NULL CHECK (dias_gap >= 0),
  mismo_dia           BOOLEAN      NOT NULL DEFAULT FALSE,
  turno_origen        TEXT,
  turno_resolucion    TEXT,
  fecha_origen        DATE         NOT NULL,
  fecha_resolucion    DATE         NOT NULL,
  draw_origen_id      BIGINT       REFERENCES draws(id) ON DELETE SET NULL,
  draw_resolucion_id  BIGINT       REFERENCES draws(id) ON DELETE SET NULL,
  strategy_id         TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seq_res_origen
  ON sequence_resolutions (numero_origen);

CREATE INDEX IF NOT EXISTS idx_seq_res_origen_resolucion
  ON sequence_resolutions (numero_origen, numero_resolucion);

CREATE INDEX IF NOT EXISTS idx_seq_res_fecha_origen
  ON sequence_resolutions (fecha_origen DESC);

CREATE INDEX IF NOT EXISTS idx_seq_res_mismo_dia
  ON sequence_resolutions (mismo_dia) WHERE mismo_dia = TRUE;

COMMENT ON TABLE sequence_resolutions IS
  'Historial completo de cómo se resolvieron las secuencias en la práctica. '
  'Permite calcular: media de sorteos_gap, σ, distribución por tipo_variante, '
  'frecuencia de resolución el mismo día (vuelta intra-día S03/S10).';

-- ---------------------------------------------------------------------------
-- 3. EPISODIOS DE RECUPERACIÓN
--    Registra períodos especiales: post-superpremio, bloqueo extendido, etc.
--    El sistema aprende el "comportamiento de La Casa" en cada episodio
--    para mejorar predicciones en futuros episodios similares.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recovery_episodes (
  id                  BIGSERIAL    PRIMARY KEY,
  tipo_evento         TEXT         NOT NULL,
  -- 'superpremio' | 'bloqueo_extendido' | 'liberacion_masiva' |
  -- 'cambio_regimen' | 'fin_mes' | 'evento_cultural'
  fecha_inicio        DATE         NOT NULL,
  fecha_fin           DATE,
  duracion_sorteos    SMALLINT,
  numeros_evitados    SMALLINT[],
  numeros_favorecidos SMALLINT[],
  estrategia_activa   TEXT,
  regimen_detectado   TEXT,
  resolucion          TEXT,
  score_impacto       REAL         CHECK (score_impacto BETWEEN -1 AND 1),
  -- negativo = La Casa pagó menos de lo esperado; positivo = pagó más
  notas               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_episodes_tipo
  ON recovery_episodes (tipo_evento);

CREATE INDEX IF NOT EXISTS idx_recovery_episodes_fecha
  ON recovery_episodes (fecha_inicio DESC);

COMMENT ON TABLE recovery_episodes IS
  'Cada episodio especial de La Casa. Permite que el sistema aprenda '
  'el patrón de comportamiento post-superpremio y en otros eventos, '
  'y aplique ese conocimiento en futuros episodios del mismo tipo.';

-- ---------------------------------------------------------------------------
-- 4. PRESIÓN PÚBLICA ESTIMADA
--    Estimación por sorteo de cuánta presión (apuestas públicas) tiene
--    cada número. No se mide directamente; se infiere de señales indirectas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public_pressure (
  id          BIGSERIAL    PRIMARY KEY,
  numero      SMALLINT     NOT NULL CHECK (numero BETWEEN 0 AND 99),
  fecha       DATE         NOT NULL,
  turno       TEXT,
  presion     REAL         NOT NULL DEFAULT 0 CHECK (presion BETWEEN 0 AND 1),
  fuentes     JSONB        NOT NULL DEFAULT '{}'::JSONB,
  -- {gap_largo: 0.3, saladito: 0.2, secuencia_activa: 0.4, evento_cultural: 0.1}
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_pressure_unique
  ON public_pressure (numero, fecha, turno);

CREATE INDEX IF NOT EXISTS idx_public_pressure_fecha
  ON public_pressure (fecha DESC);

COMMENT ON TABLE public_pressure IS
  'Presión estimada del público sobre cada número. '
  'Alta presión = La Casa lo evita. Baja presión = posible liberación. '
  'El campo fuentes desglosa qué factores contribuyen al score.';

-- ---------------------------------------------------------------------------
-- 5. PATRONES INTRA-DÍA
--    Registra cuándo en el mismo día, en distintos turnos, caen números
--    relacionados (vuelta, relativo, conversión). Estrategias S03 y S10.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intraday_patterns (
  id           BIGSERIAL    PRIMARY KEY,
  turno_a      TEXT         NOT NULL,
  numero_a     SMALLINT     NOT NULL CHECK (numero_a BETWEEN 0 AND 99),
  turno_b      TEXT         NOT NULL,
  numero_b     SMALLINT     NOT NULL CHECK (numero_b BETWEEN 0 AND 99),
  relacion     TEXT         NOT NULL,
  -- 'vuelta' | 'relativo' | 'conv_d0' | 'conv_d1' | 'espejo' | 'equiv' | 'mismo'
  fecha        DATE         NOT NULL,
  confirmado   BOOLEAN      NOT NULL DEFAULT TRUE,
  strategy_id  TEXT         NOT NULL DEFAULT 'S03',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intraday_fecha
  ON intraday_patterns (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_intraday_numero_a
  ON intraday_patterns (numero_a);

CREATE INDEX IF NOT EXISTS idx_intraday_relacion
  ON intraday_patterns (relacion);

COMMENT ON TABLE intraday_patterns IS
  'Instancias en que La Casa jugó dos números relacionados en el mismo día '
  'en turnos diferentes. Permite calcular la frecuencia real de la "vuelta '
  'intra-día" y qué tipo de relación usa más (espejo, conv, relativo, etc.).';

-- ---------------------------------------------------------------------------
-- 6. EVALUACIONES DEL SISTEMA
--    Cada sorteo real se compara contra la predicción que el sistema hizo.
--    Es el corazón del loop de autoevaluación.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_evaluations (
  id                    BIGSERIAL    PRIMARY KEY,
  draw_id               BIGINT       REFERENCES draws(id) ON DELETE SET NULL,
  prediction_log_id     BIGINT       REFERENCES prediction_logs(id) ON DELETE SET NULL,
  fecha                 DATE         NOT NULL,
  turno                 TEXT,

  -- Resultado del contraste
  numero_real           SMALLINT     NOT NULL CHECK (numero_real BETWEEN 0 AND 99),
  posicion_en_lista     SMALLINT,
  -- NULL si el número no estaba en la lista de candidatos
  en_top1               BOOLEAN      NOT NULL DEFAULT FALSE,
  en_top3               BOOLEAN      NOT NULL DEFAULT FALSE,
  en_top5               BOOLEAN      NOT NULL DEFAULT FALSE,
  en_top10              BOOLEAN      NOT NULL DEFAULT FALSE,
  ausente               BOOLEAN      NOT NULL DEFAULT FALSE,
  score_asignado        REAL,

  -- Clasificación del resultado
  tipo_evaluacion       TEXT         NOT NULL DEFAULT 'B',
  -- 'A'=ErrorRanking | 'B'=ErrorAusencia | 'C'=AciertoConfirmado | 'D'=AciertoFalso
  razon_coherente       BOOLEAN,

  -- Contexto del momento de la predicción
  regimen_activo        TEXT,
  estrategia_activa     TEXT,
  motores_correctos     TEXT[]       NOT NULL DEFAULT '{}',
  motores_fallidos      TEXT[]       NOT NULL DEFAULT '{}',

  -- Score acumulado del sistema en ese momento
  score_global_30d      REAL,
  en_modo_crisis        BOOLEAN      NOT NULL DEFAULT FALSE,
  notas_diagnostico     TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syseval_fecha
  ON system_evaluations (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_syseval_tipo
  ON system_evaluations (tipo_evaluacion);

CREATE INDEX IF NOT EXISTS idx_syseval_en_top3
  ON system_evaluations (en_top3);

CREATE INDEX IF NOT EXISTS idx_syseval_crisis
  ON system_evaluations (en_modo_crisis) WHERE en_modo_crisis = TRUE;

COMMENT ON TABLE system_evaluations IS
  'Una fila por sorteo evaluado. Compara candidatos predichos vs número real. '
  'Alimenta el score_global, el weight_optimizer y el diagnostic_engine. '
  'tipo_evaluacion: A=tenía el número pero mal rankeado, B=ausente en la lista, '
  'C=acierto real con razón coherente, D=acierto pero razón incorrecta (peligroso).';

-- ---------------------------------------------------------------------------
-- 7. HISTORIAL DE SCORES DEL SISTEMA
--    Snapshot del rendimiento cada N sorteos. Permite ver la curva de
--    aprendizaje y detectar cuándo el sistema mejoró o degradó.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_score_history (
  id              BIGSERIAL    PRIMARY KEY,
  fecha           DATE         NOT NULL,
  ventana_sorteos SMALLINT     NOT NULL DEFAULT 30,
  hit_rate_top1   REAL         NOT NULL DEFAULT 0,
  hit_rate_top3   REAL         NOT NULL DEFAULT 0,
  hit_rate_top5   REAL         NOT NULL DEFAULT 0,
  coherencia      REAL         NOT NULL DEFAULT 0,
  score_global    REAL         NOT NULL DEFAULT 0,
  regimen         TEXT,
  pesos_activos   JSONB        NOT NULL DEFAULT '{}'::JSONB,
  modo_crisis     BOOLEAN      NOT NULL DEFAULT FALSE,
  sorteos_en_crisis SMALLINT   NOT NULL DEFAULT 0,
  diagnostico     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_history_fecha
  ON system_score_history (fecha DESC);

COMMENT ON TABLE system_score_history IS
  'Snapshot del score global cada 10 sorteos. Permite graficar la curva '
  'de aprendizaje: ¿está mejorando el sistema con el tiempo? '
  'pesos_activos guarda el estado del weight_optimizer en ese momento.';

-- ---------------------------------------------------------------------------
-- 8. CHANGEPOINTS (CAMBIOS DE RÉGIMEN)
--    Cada fila = momento en que el sistema detectó que La Casa cambió
--    su distribución de juego. Alimenta al regime_detector.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regime_changepoints (
  id              BIGSERIAL    PRIMARY KEY,
  fecha           DATE         NOT NULL,
  sorteo_numero   BIGINT       REFERENCES draws(id) ON DELETE SET NULL,
  regimen_anterior TEXT,
  regimen_nuevo   TEXT         NOT NULL,
  kl_divergence   REAL,
  p_valor         REAL,
  confianza       REAL         NOT NULL DEFAULT 0 CHECK (confianza BETWEEN 0 AND 1),
  descripcion     TEXT,
  confirmado      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changepoints_fecha
  ON regime_changepoints (fecha DESC);

COMMENT ON TABLE regime_changepoints IS
  'Detectado por regime_detector.js cuando la distribución estadística de '
  'los últimos 30 sorteos diverge significativamente de los 30 anteriores. '
  'Permite al sistema saber cuándo La Casa cambió su modo de juego.';

-- ---------------------------------------------------------------------------
-- 9. SECUENCIAS ACTIVAS (ESTADO EN TIEMPO REAL)
--    Qué secuencias están actualmente "abiertas" esperando resolución.
--    Se actualiza con cada sorteo nuevo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_sequences (
  id                  BIGSERIAL    PRIMARY KEY,
  numero_origen       SMALLINT     NOT NULL CHECK (numero_origen BETWEEN 0 AND 99),
  numero_destino      SMALLINT     NOT NULL CHECK (numero_destino BETWEEN 0 AND 99),
  tipo_relacion       TEXT         NOT NULL DEFAULT 'relativo',
  -- 'relativo' | 'conversion' | 'dejavu' | 'custom'
  draw_origen_id      BIGINT       REFERENCES draws(id) ON DELETE CASCADE,
  fecha_activacion    DATE         NOT NULL,
  turno_activacion    TEXT,
  sorteos_transcurridos SMALLINT   NOT NULL DEFAULT 0,
  gap_media_historica REAL,
  gap_sigma_historica REAL,
  variante_pagada     SMALLINT     CHECK (variante_pagada BETWEEN 0 AND 99),
  -- si ya cayó una variante del destino
  tipo_variante_pagada TEXT,
  estado              TEXT         NOT NULL DEFAULT 'abierta',
  -- 'abierta' | 'resuelta_directa' | 'resuelta_variante' | 'expirada'
  fecha_cierre        DATE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_seq_estado
  ON active_sequences (estado) WHERE estado = 'abierta';

CREATE INDEX IF NOT EXISTS idx_active_seq_origen
  ON active_sequences (numero_origen);

CREATE INDEX IF NOT EXISTS idx_active_seq_destino
  ON active_sequences (numero_destino);

COMMENT ON TABLE active_sequences IS
  'Estado en tiempo real de qué secuencias están abiertas. '
  'Cuando cae numero_origen, se inserta una fila con estado=abierta. '
  'Cuando cae numero_destino (o variante), se actualiza a resuelta_*. '
  'Si supera gap_media + 2*sigma sin resolución → expirada.';

-- ---------------------------------------------------------------------------
-- 10. TRIGGER: updated_at automático en recovery_episodes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_recovery_episodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recovery_episodes_updated_at
BEFORE UPDATE ON recovery_episodes
FOR EACH ROW
EXECUTE FUNCTION set_recovery_episodes_updated_at();

-- ---------------------------------------------------------------------------
-- 11. TRIGGER: updated_at automático en active_sequences
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_active_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_active_sequences_updated_at
BEFORE UPDATE ON active_sequences
FOR EACH ROW
EXECUTE FUNCTION set_active_sequences_updated_at();

-- ---------------------------------------------------------------------------
-- 12. VISTA: Estadísticas de resolución por par origen→destino
--    Útil para que el sequence-engine consulte rápido los gaps históricos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW sequence_resolution_stats AS
SELECT
  numero_origen,
  numero_resolucion,
  tipo_variante,
  COUNT(*)                                        AS total_instancias,
  AVG(sorteos_gap)                                AS gap_media,
  STDDEV(sorteos_gap)                             AS gap_sigma,
  MIN(sorteos_gap)                                AS gap_min,
  MAX(sorteos_gap)                                AS gap_max,
  percentile_cont(0.5) WITHIN GROUP
    (ORDER BY sorteos_gap)                        AS gap_mediana,
  percentile_cont(0.8) WITHIN GROUP
    (ORDER BY sorteos_gap)                        AS gap_p80,
  COUNT(*) FILTER (WHERE mismo_dia = TRUE)        AS veces_mismo_dia,
  ROUND(
    COUNT(*) FILTER (WHERE mismo_dia = TRUE)::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                               AS pct_mismo_dia
FROM sequence_resolutions
GROUP BY numero_origen, numero_resolucion, tipo_variante;

COMMENT ON VIEW sequence_resolution_stats IS
  'Agregados estadísticos de los gaps reales entre numero_origen y '
  'numero_resolucion. El sequence-engine consulta esta vista para saber '
  'en cuántos sorteos, en promedio, La Casa resuelve cada par.';

-- ---------------------------------------------------------------------------
-- 13. VISTA: Score global del sistema (últimas 30 evaluaciones)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW system_current_score AS
SELECT
  COUNT(*)                                                                        AS evaluaciones_30d,
  ROUND((AVG(CASE WHEN en_top1  THEN 1.0 ELSE 0.0 END) * 100)::NUMERIC, 1)      AS hit_rate_top1_pct,
  ROUND((AVG(CASE WHEN en_top3  THEN 1.0 ELSE 0.0 END) * 100)::NUMERIC, 1)      AS hit_rate_top3_pct,
  ROUND((AVG(CASE WHEN en_top5  THEN 1.0 ELSE 0.0 END) * 100)::NUMERIC, 1)      AS hit_rate_top5_pct,
  ROUND((AVG(CASE WHEN ausente  THEN 1.0 ELSE 0.0 END) * 100)::NUMERIC, 1)      AS ausencia_pct,
  ROUND(AVG(score_global_30d)::NUMERIC, 2)                                        AS score_global_promedio,
  MAX(CASE WHEN en_modo_crisis THEN 1 ELSE 0 END)                                AS en_crisis_ahora,
  MAX(fecha)                                                                      AS ultima_evaluacion
FROM (
  SELECT * FROM system_evaluations
  ORDER BY fecha DESC, id DESC
  LIMIT 30
) ultimas;

COMMENT ON VIEW system_current_score IS
  'Score en tiempo real del sistema basado en las últimas 30 evaluaciones. '
  'Este es el "termómetro" de salud que se muestra en el panel del analista.';

-- ---------------------------------------------------------------------------
-- FIN DEL SCRIPT
-- Tablas creadas: 9
-- Vistas creadas: 2
-- Triggers creados: 2
-- Tablas existentes modificadas: 0
-- ---------------------------------------------------------------------------
