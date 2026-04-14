# Trigger Engine — Disparadores y Disparados

El módulo de disparadores automatiza las relaciones dirigidas A→B basadas en sorteos guardados en Supabase. Cada relación describe cómo un número **origin** abre expectativas hacia un número **target** dentro de una ventana temporal configurable.

## Flujo funcional

1. **Relaciones (`trigger_relations`)**
   - Definen pares `origin → target`, el `relation_type` (DISPARA, AVISA, REFUERZA) y la ventana `[window_min_days, window_max_days]`.
   - Se almacenan por usuario (`user_id`) y respetan RLS: solo el dueño puede leer/escribir.
   - Disparar un sorteo nuevo del origin crea eventos `OPEN` para cada target activo.

2. **Eventos (`trigger_events`)**
   - Cada sorteo del origin genera un `origin_ts` y un `deadline_ts = origin_ts + window_max_days`.
   - Cuando el target aparece se calcula `lag_days = floor((hit_ts - origin_ts)/1 día)`:
     - `window_min_days ≤ lag_days ≤ window_max_days` ⇒ `HIT`.
     - `lag_days > window_max_days` ⇒ `LATE_HIT` (si el evento seguía `OPEN`).
     - Los eventos pendientes que superan el deadline sin hit se cierran como `MISS` mediante `closeExpiredEvents`.
   - Todos los cambios persistidos quedan auditables en la vista **Eventos** del panel.

3. **Métricas (vista `trigger_relation_stats`)**
   - Calcula para cada relación:
     - `total_events`, `hit_count`, `miss_count`, `late_hit_count`.
     - Tasas (`hit_rate`, `miss_rate`, `late_rate`) como proporciones sobre `total_events`.
     - Estadísticos de tiempo (`avg_lag_days`, `median_lag_days`, `p80_lag_days`) usando `lag_days` de HIT+LATE_HIT.
   - El panel de “Análisis” consulta esta vista para ordenar relaciones por desempeño.

## API del motor (`src/triggers/triggerEngine.js`)

- `createRelation`, `updateRelation`, `deleteRelation`, `listRelations(filters)` → CRUD completo sobre `trigger_relations`.
- `processNewDraw(draw)` → Se llama automáticamente después de guardar un sorteo (ver `DB.saveDraw`). Inserta eventos `OPEN` y evalúa hits/lates si el número recién sorteado coincide con algún target.
- `closeExpiredEvents(nowTs)` → Marca como `MISS` todo evento `OPEN` cuyo `deadline_ts < nowTs`. Se ejecuta en el arranque y desde el panel.
- `listEvents(filters)` → Auditoría de eventos.
- `computeRelationStats(filters)` → Lee la vista agregada para alimentar la UI.
- `seedSampleRelations()` → (optativo) inserta las relaciones de ejemplo 37→47, 37→96 y 44→95 para el usuario actual.

## Estados y criterios

- `OPEN`: evento recién creado, espera la aparición del target.
- `HIT`: el target salió dentro de la ventana `[min, max]`.
- `LATE_HIT`: el target salió después del máximo, pero antes de que `closeExpiredEvents` lo marcara como `MISS`.
- `MISS`: pasó el `deadline_ts` sin que apareciera el target.

Los cálculos de lag siempre se hacen en días naturales, usando `floor((hit_ts - origin_ts)/1 día)` para evitar ruido por horas. El `deadline_ts` se crea con `window_max_days` completos, por lo que un `lag_days` igual al máximo sigue contando como `HIT`.

## UI

El nuevo apartado “Disparadores” agrega tres tarjetas:

1. **Relaciones**: formulario para crear/editar reglas, filtros por origin/target/tipo/estado y listado con acciones rápidas (editar, pausar, eliminar, semillas).
2. **Análisis**: tabla ordenada por `hit_rate` y `total_events` que muestra los promedios, mediana y percentil 80 de `lag_days`.
3. **Eventos**: auditoría con filtros por estado/origin/target, botones para recargar y cerrar eventos vencidos.

Cada creación o modificación refresca automáticamente las métricas y la auditoría. Al guardar sorteos desde cualquier flujo del sistema el motor se ejecuta inmediatamente para mantener la consistencia con Supabase, sin usar Dexie/IndexedDB.
