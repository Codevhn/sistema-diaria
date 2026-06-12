-- =============================================================================
-- SPRINT 1 — Funciones y procedimientos almacenados
-- Ejecutar DESPUÉS de sprint1_intelligence_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Incrementa sorteos_transcurridos en active_sequences de forma atómica.
-- Se llama cada vez que se registra un sorteo nuevo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_sequence_counters(ids BIGINT[])
RETURNS VOID AS $$
BEGIN
  UPDATE active_sequences
  SET sorteos_transcurridos = sorteos_transcurridos + 1,
      updated_at = NOW()
  WHERE id = ANY(ids)
    AND estado = 'abierta';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Calcula el score global del sistema sobre las últimas N evaluaciones.
-- Devuelve un JSON con todos los indicadores.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_system_score(ventana INT DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'evaluaciones',       COUNT(*),
    'hit_rate_top1',      ROUND(AVG(CASE WHEN en_top1 THEN 1.0 ELSE 0.0 END)::NUMERIC, 4),
    'hit_rate_top3',      ROUND(AVG(CASE WHEN en_top3 THEN 1.0 ELSE 0.0 END)::NUMERIC, 4),
    'hit_rate_top5',      ROUND(AVG(CASE WHEN en_top5 THEN 1.0 ELSE 0.0 END)::NUMERIC, 4),
    'ausencia_rate',      ROUND(AVG(CASE WHEN ausente THEN 1.0 ELSE 0.0 END)::NUMERIC, 4),
    'score_global',       ROUND((
        AVG(CASE WHEN en_top1 THEN 1.0 ELSE 0.0 END) * 0.40 +
        AVG(CASE WHEN en_top3 THEN 1.0 ELSE 0.0 END) * 0.35 +
        AVG(CASE WHEN en_top5 THEN 1.0 ELSE 0.0 END) * 0.15 +
        AVG(CASE WHEN razon_coherente THEN 1.0 ELSE 0.0 END) * 0.10
    )::NUMERIC, 4),
    'en_crisis',          (AVG(CASE WHEN en_top3 THEN 1.0 ELSE 0.0 END) < 0.30),
    'ultima_evaluacion',  MAX(fecha)
  )
  INTO result
  FROM (
    SELECT * FROM system_evaluations
    ORDER BY fecha DESC, id DESC
    LIMIT ventana
  ) sub;
  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Devuelve distribución estadística de los gaps para un par origen→destino.
-- Útil para que sequence-engine calcule la probabilidad de resolución.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_gap_distribution(
  p_origen      SMALLINT,
  p_destino     SMALLINT,
  p_variante    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total',     COUNT(*),
    'media',     ROUND(AVG(sorteos_gap)::NUMERIC, 2),
    'sigma',     ROUND(STDDEV(sorteos_gap)::NUMERIC, 2),
    'mediana',   percentile_cont(0.5) WITHIN GROUP (ORDER BY sorteos_gap),
    'p80',       percentile_cont(0.8) WITHIN GROUP (ORDER BY sorteos_gap),
    'min',       MIN(sorteos_gap),
    'max',       MAX(sorteos_gap),
    'mismo_dia', COUNT(*) FILTER (WHERE mismo_dia = TRUE),
    'tipos',     jsonb_object_agg(tipo_variante, cnt)
  )
  INTO result
  FROM (
    SELECT
      sorteos_gap,
      mismo_dia,
      tipo_variante,
      COUNT(*) OVER (PARTITION BY tipo_variante) AS cnt
    FROM sequence_resolutions
    WHERE numero_origen = p_origen
      AND numero_resolucion = p_destino
      AND (p_variante IS NULL OR tipo_variante = p_variante)
  ) sub;
  RETURN COALESCE(result, '{"total": 0}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Devuelve los pares intra-día más frecuentes (para S03/S10 analysis).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_intraday_top_pairs(p_limit INT DEFAULT 20)
RETURNS TABLE (
  numero_a     SMALLINT,
  numero_b     SMALLINT,
  relacion     TEXT,
  turno_a      TEXT,
  turno_b      TEXT,
  frecuencia   BIGINT,
  ultimo_fecha DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ip.numero_a,
    ip.numero_b,
    ip.relacion,
    ip.turno_a,
    ip.turno_b,
    COUNT(*)::BIGINT        AS frecuencia,
    MAX(ip.fecha)           AS ultimo_fecha
  FROM intraday_patterns ip
  GROUP BY ip.numero_a, ip.numero_b, ip.relacion, ip.turno_a, ip.turno_b
  ORDER BY frecuencia DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
