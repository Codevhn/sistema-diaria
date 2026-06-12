# Sprint 1 — Despliegue en Supabase

## Orden de ejecución

Entrar a: **Supabase Dashboard → Project → SQL Editor → New query**

### Paso 1 — Tablas y vistas
Copiar y ejecutar el contenido completo de:
```
migrations/sprint1_intelligence_schema.sql
```

Resultado esperado: 9 tablas nuevas, 2 vistas, 2 triggers. Sin errores.

### Paso 2 — Funciones
Copiar y ejecutar el contenido completo de:
```
migrations/sprint1_functions.sql
```

Resultado esperado: 4 funciones creadas. Sin errores.

---

## Verificación post-despliegue

Ejecutar en SQL Editor para confirmar que todo está creado:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'strategy_events',
    'sequence_resolutions',
    'recovery_episodes',
    'public_pressure',
    'intraday_patterns',
    'system_evaluations',
    'system_score_history',
    'regime_changepoints',
    'active_sequences'
  )
ORDER BY table_name;
-- Debe devolver 9 filas

SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('sequence_resolution_stats', 'system_current_score');
-- Debe devolver 2 filas
```

---

## Tablas creadas — resumen

| Tabla | Propósito |
|-------|-----------|
| `strategy_events` | Registro de estrategias de La Casa detectadas por sorteo |
| `sequence_resolutions` | Historial de cómo se resolvió cada par A→B (gap, variante, mismo día) |
| `recovery_episodes` | Episodios especiales: post-superpremio, bloqueo, cambio de régimen |
| `public_pressure` | Presión pública estimada por número/fecha/turno |
| `intraday_patterns` | Vueltas intra-día: mismo día, turno distinto |
| `system_evaluations` | Autoevaluación: predicho vs real, tipo A/B/C/D |
| `system_score_history` | Historial de score global del sistema |
| `regime_changepoints` | Cambios de régimen detectados estadísticamente |
| `active_sequences` | Estado en tiempo real de secuencias abiertas |

---

## Tablas existentes — NO modificadas

Todas las tablas originales permanecen intactas:
`draws`, `hypotheses`, `prediction_logs`, `game_modes`, `knowledge`,
`trigger_relations`, `trigger_events`, `hypothesis_logs`, etc.

---

## Siguiente paso

Una vez confirmado el despliegue, continuar con **Sprint 2**:
construcción de `strategy-classifier.js` y `variant-resolver.js`.
