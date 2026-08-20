# Auditoría Completa: La Diaria v3.2
**Fecha:** 2026-08-19
**Alcance:** Optimización, rendimiento, buenas prácticas, UX/UI, seguridad
**Regla:** Sin modificar lógica del sistema

---

## ✅ ESTADO DE EJECUCIÓN (actualizado 2026-08-20)

| Fase | Estado | Commits | Notas |
|------|--------|---------|-------|
| FASE 1 — Higiene y Seguridad | ✅ Completada | `c9adf25` | Credenciales fuera del código, .gitignore, package.json corregido |
| FASE 2 — CSS Specificity War | ✅ Completada | `5b37f87` | ~1,950 `!important` eliminados vía prefijo `.mac-theme` |
| FASE 3 — Split index.html / circular deps | ✅ Completada | `faf4db5` | Dependencia circular storage↔auth rota |
| FASE 4 — Split módulos grandes | ✅ Completada (parcial) | `cf52397`, `f002ce8` | storage.js → src/storage/, signal-engine.js → src/signal/. pattern-detector.js NO se dividió: funciones demasiado acopladas (riesgo > beneficio) |
| FASE 5 — DB Índices | ✅ Completada | `c4a0db9` | migrations/008_core_indexes.sql — 8 índices ejecutados en Supabase |
| FASE 6 — Performance | ✅ Completada | `ac053ba` | Debounce, lazy rendering, memoización |
| FASE 7 — Testing | ✅ Completada | `cb5793c`, `a094e08`, `4a12aa9` | Vitest — 125 tests en 9 archivos, todos verdes |
| FASE 8 — UX/UI | ✅ Completada | `844096b`, `e48cae1` | Auditoría propia: 14 issues resueltos (2 críticos, 6 altos, 6 medios) |
| FASE 9 — CI/CD | ✅ Completada | `6b2a15c`, `07dab69` | GitHub Actions corre los tests en cada push a main |

**Resultado:** 125 tests pasando · CI verde · deploy automático por GitHub Pages · repo limpio en `main`.

---

## RESUMEN EJECUTIVO

| Aspecto | Estado | Nota |
|---------|--------|------|
| Arquitectura JS | Buena | 68 módulos ES bien separados por dominio |
| CSS | Crítico | 1,794 `!important` en mac-theme.css, guerra de especificidad |
| Base de datos | Buena | Schema sólido, pero faltan índices y migración 001 |
| Seguridad | Regular | Credenciales hardcodeadas, RLS incompleto |
| Rendimiento | Regular | Sin bundler, sin lazy loading, archivos monolíticos |
| Testing | Inexistente | 0 tests unitarios, 0 tests de integración |
| UX/UI | Regular | Sin accesibilidad, breakpoints caóticos, sin feedback states |
| Deploy | Frágil | Manual, sin CI/CD, sin rollback |

---

## PARTE 1: LO QUE CUMPLE BIEN

### Arquitectura de JavaScript
- **68 módulos ES** bien organizados por dominio (engines, utilidades, storage, auth)
- Patrón de `*-engine.js` consistente: signal-engine, pressure-engine, regime-detector, etc.
- Separación clara: `storage.js` (capa de datos) → engines (lógica) → HTML rendering
- `supabaseClient.js` es un singleton limpio con 21 líneas
- `conversion-engine.js` usa objetos congelados (`Object.freeze`) para constantes
- `stats-utils.js` tiene implementaciones matemáticas correctas (chi-cuadrado, bootstrap, Benjamini-Hochberg)

### Base de datos
- Sprint 1 intelligence schema es **ejemplar**: constraints, índices, comentarios, vistas
- RLS aplicado con patrón consistente: SELECT público, escritura admin/editor, DELETE admin
- Migraciones 003-006 son idempotentes (`IF NOT EXISTS`, `IF EXISTS`)
- Tabla `profiles` con trigger auto-creación es diseño correcto
- `trigger_relations` y `trigger_events` tienen RLS + índices bien diseñados

### Autenticación
- Timer de inactividad (1h) con detección de actividad
- Retry logic en `getSession` (5 intentos con backoff)
- Cache de roles (5 min TTL) evita queries redundantes
- Logout limpio: limpia cache + storage + timers

### Lógica de Negocio
- Motor de presión adversarial con 8+ factores ponderados
- Detección de régimen con KL-divergencia (metodología correcta)
- Backtesting honesto: solo evalúa predicciones que existían antes del sorteo
- Panel de Honestidad que admite "sin ventaja demostrada" cuando el IC contiene 1.0
- Corrección Benjamini-Hochberg para tests múltiples

### Supabase Integration
- RLS patterns consistentes en las tablas intelligence
- RPC para operaciones atómicas (`incrementSequenceCounters`)
- Fallback a localStorage cuando Supabase no está disponible

---

## PARTE 2: LO QUE NO CUMPLE

### CRÍTICO

| # | Problema | Archivo | Impacto |
|---|----------|---------|---------|
| C1 | **Credenciales hardcodeadas** en `supabaseClient.js` | `src/supabaseClient.js:4-5` | Cualquier persona con acceso al repo puede usar la API. Si RLS falla, datos expuestos |
| C2 | **mac-theme.css: 1,794 `!important`** | `src/mac-theme.css` | Imposible mantener. Cualquier cambio de estilo requiere añadir más `!important` |
| C3 | **index.html: 600KB, 13,000+ líneas** | `index.html` | Archivo monolítico con TODO el HTML de todas las vistas + CSS inline + JS inline |
| C4 | **0 tests** | Todo el proyecto | Sin tests, cada cambio es un riesgo de regresión |
| C5 | **Migración 001 nunca creada** | `migrations/` | Nomenclatura empieza en 002, la migración base nunca se versionó |

### ALTO

| # | Problema | Detalle |
|---|----------|---------|
| A1 | **Sin bundler/build system** | Sin Vite/Webpack. 68 módulos se cargan como ES modules separados. Cada import = HTTP request |
| A2 | **CSS: 430KB total** | `style.css` (276KB) + `mac-theme.css` (155KB). Sin minificación |
| A3 | **JS cargado desde CDN** | `supabase-js@2` se importa desde `esm.sh`. Si CDN cae, app no funciona |
| A4 | **`storage.js` monolítico** | 977 líneas, 60+ métodos. Mezcla paginación, normalización, lógica de negocio y trigger processing |
| A5 | **`pattern-detector.js`** | 1,062 líneas — el archivo más largo. Mezcla detección de patrones de repetición, transición, semanal y estacional |
| A6 | **`signal-engine.js`** | 1,045 líneas. Orquestador central que importa 15+ engines. Sin timeout ni cancellation |
| A7 | **Sin lazy loading de vistas** | Todas las vistas se cargan en el HTML inicial. La sección de Mesa, Geometría, Guía se renderizan aunque no se vean |
| A8 | **`config.example.env` es decorativo** | El archivo existe pero nada lo lee. Las credenciales están en `supabaseClient.js` |
| A9 | **Sin `DOWN` migrations** | No hay scripts de rollback para ninguna migración |

### MEDIO

| # | Problema | Detalle |
|---|----------|---------|
| M1 | **27 breakpoints CSS** | Valores: 480, 540, 560, 600, 640, 700, 720, 768, 900, 960, 980, 1024, 1200... Caótico |
| M2 | **Google Fonts cargado 2 veces** | `Inter` se carga en ambos CSS files |
| M3 | **Variables CSS legacy** | Mezcla de `--gold`, `--clr-gold`, `--text`, `--border` con el nuevo sistema de tokens |
| M4 | **`reasoning.js` usa `DB._getAll()`** | Expone un método marcado como privado |
| M5 | **`maintenance.js` sin auth check** | Funciones destructivas accesibles desde cualquier módulo |
| M6 | **`game_mode_examples` FK sin ON DELETE** | `edges` y `hypothesis_logs` tienen FKs sin cascade rules |
| M7 | **`reasons` usa polimórfica** | `owner_type TEXT` + `owner_id BIGINT` impide constraints FK |
| M8 | **Sin índice en `hypotheses.fecha`** | Queries por fecha son frecuentes |
| M9 | **Sin `.env` en `.gitignore`** | Si alguien crea `.env` siguiendo `DEPLOY_SUPABASE.md`, quedará tracked |

### BAJO

| # | Problema | Detalle |
|---|----------|---------|
| B1 | **`package.json` `"type": "commonjs"`** | Irrelevante pero engañoso. El proyecto usa ES modules |
| B2 | **`main: "index.js"`** | Apunta a un archivo inexistente |
| B3 | **Comentario engañoso** en `supabaseClient.js:3` | Dice "Placeholder credentials" pero son las credenciales reales |

---

## PARTE 3: ANÁLISIS DE RENDIMIENTO

### Carga Inicial
```
index.html          → 600 KB (HTML + CSS inline + JS inline)
style.css           → 276 KB (sin minificar)
mac-theme.css       → 155 KB (sin minificar)
Font Awesome CDN    → ~80 KB
Google Fonts        → ~30 KB
68 módulos JS       → ~21 KB total de código, pero cada import = 1 request HTTP
supabase-js CDN     → ~120 KB (esm.sh)
guia_suenos.json    → ~15 KB
guía imágenes       → 99 PNG × ~4 KB = ~400 KB
───────────────────────────────
TOTAL estimado:     ~1.7 MB (sin cache), ~400 KB (con cache del browser)
```

### Problemas de Rendimiento

1. **68+ HTTP requests para JS modules** — Sin bundler, cada `import` es un request separado
2. **CSS sin minificar** — 430KB se transfieren sin compresión
3. **Font Awesome cargado completo** — Solo se usan ~20 iconos de los 2,000+ disponibles
4. **Guía renderiza 100+ cards DOM** — Sin virtualización, primer carga lenta
5. **`signal-engine` hace 15+ queries DB en secuencia** — Sin paralelización
6. **`learning.js` `rebuildKnowledge`** fetch ALL draws + hypotheses + logs — Operación pesada
7. **`backtest-v4.js`** puede tardar 30-90 segundos — Sin Web Worker
8. **`strategy-classifier.js` `procesarHistoricoCompleto`** — O(n*m*v) con inserts individuales

### Lo que SÍ optimiza bien
- Cache de roles (5 min TTL)
- Cache de perfiles de números (6h TTL)
- `variantesSet` usa `Set` para O(1) lookup
- `backtest.js` usa `setImmediate`/`setTimeout` para no bloquear UI
- `local-draw-cache.js` permite funcionar offline

---

## PARTE 4: ANÁLISIS UX/UI

### LO QUE FUNCIONA
- **Tema oscuro consistente** — El sistema de tokens CSS crea coherencia visual
- **Countdown banner** — Feedback de tiempo real para próximo sorteo
- **Sidebar con indicador de presencia** — Muestra usuarios conectados
- **Tooltips persistentes** (Sistema Sims) — Mejor que tooltips nativos del browser
- **Panel de Honestidad** — Transparencia sobre la calidad real del sistema
- **Feedback visual por estado** — Hit/miss/pending con colores claros

### LO QUE NO FUNCIONA

#### Accesibilidad (WCAG)
| Problema | Severidad |
|----------|-----------|
| Sin ARIA labels en botones interactivos | Alta |
| Sin roles ARIA en secciones | Alta |
| Sin skip-navigation link | Media |
| Sin focus indicators visibles | Media |
| Contraste potencialmente insuficiente en tema oscuro | Media |
| `<button data-view="login">` usa `<i>` en vez de texto accesible | Alta |
| Sin `alt` text en imágenes de la guía de sueños | Baja |

#### Responsive Design
| Problema | Severidad |
|----------|-----------|
| 27 breakpoints diferentes — imposible mantener | Alta |
| Media queries inconsistentes entre `style.css` y `mac-theme.css` | Alta |
| Sin modo landscape para móviles | Baja |
| Tabla de historial sin scroll horizontal en móvil | Media |
| Sidebar sin patrón consistente de colapso | Media |

#### Estados de UI
| Problema | Severidad |
|----------|-----------|
| Sin skeleton loading states | Media |
| Sin empty states descriptivos (solo "Cargando…") | Baja |
| Sin confirmación visual post-acción (toast/notification) | Media |
| Botones sin loading state durante operaciones async | Media |
| Sin error boundary — un error JS puede romper toda la app | Alta |

#### Formularios
| Problema | Severidad |
|----------|-----------|
| Inputs sin labels visibles (solo placeholders) | Media |
| Sin validación client-side antes de enviar | Media |
| Sin feedback inline de errores | Baja |
| Select de país solo tiene "HN" — hardcodeado | Baja |

#### Navegación
| Problema | Severidad |
|----------|-----------|
| Sin breadcrumb ni indicador de vista actual | Baja |
| Sin atajos de teclado | Baja |
| `data-view="suerte"` tiene `style="display:none"` hardcodeado | Media |
| Vista Mesa de Análisis sin refresh automático | Baja |

---

## PARTE 5: PLAN DE ACCIÓN POR FASES

### Filosofía
Cada fase es **autosuficiente y desplegable**. No se rompe nada entre fases. Cada fase mejora el sistema de forma incremental e invisible al usuario final.

---

### FASE 1: Higiene y Seguridad (1-2 días)
**Riesgo: Mínimo** | **Impacto: Alto** | **Visible al usuario: No**

```
Acciones:
1. Mover credenciales de supabaseClient.js a variables de entorno
   → Crear config.js que lea de window.__ENV__ o fallback a defaults
   → index.html inyecta las vars antes de cargar módulos
   → supabaseClient.js importa de config.js

2. Agregar .env y .claude/ a .gitignore

3. Corregir package.json:
   → Quitar "main: index.js" o apuntar a algo real
   → Quitar "type: commonjs"
   → Agregar script "lint" si se instala ESLint después

4. Renombrar fix_user_rls.sql → 007_fix_user_rls.sql (consistencia)

5. Comentar la migración 001 como "consolidada en schema.sql"

6. Eliminar comment engañoso en supabaseClient.js línea 3
```

**Verificación:** Login funciona igual. Credenciales ya no están en el código fuente.

---

### FASE 2: CSS — Eliminar Guerra de Especificidad (3-5 días)
**Riesgo: Bajo** | **Impacto: Crítico** | **Visible al usuario: No**

```
Acciones (orden estricto):

2a. Auditar los 1,794 !important en mac-theme.css
    → Clasificar: necesarios vs heredados del conflicto
    → Los heredados se eliminan después de 2b

2b. Renombrar selects en mac-theme.css para aumentar especificidad
    sin !important:
    ANTES: .card { background: var(--card-bg) !important; }
    DESPUÉS: .mac-theme .card { background: var(--card-bg); }

2c. Eliminar !important resueltos (estimar: 60-70% de los 1,794)

2d. Estandarizar breakpoints a 4:
    → mobile: 480px
    → tablet: 768px
    → desktop: 1024px
    → wide: 1200px
    → Reemplazar los 27 breakpoints intermedios

2e. Cargar Google Fonts UNA sola vez (en index.html)

2f. Consolidar variables legacy:
    → --gold → --accent (ya existe)
    → --clr-gold → --accent
    → --text → --text (mantener, es el token principal)
    → --border → --border (mantener)
```

**Verificación:** Inspeccionar cada vista con DevTools. Confirmar que estilos no cambiaron.

---

### FASE 3: Split de index.html (2-3 días)
**Riesgo: Bajo** | **Impacto: Alto** | **Visible al usuario: No**

```
Acciones:

3a. Extraer CSS inline de index.html a views/*.css
    → views/panel-dia.css
    → views/pega3.css
    → views/verificador.css
    → views/superpremio.css
    → views/mesa.css
    → etc.

3b. Extraer JS inline de index.html a src/app.js
    → Mover el <script type="module"> a src/app.js
    → index.html solo queda con el HTML structural

3c. Lazy loading de vistas (opcional, fase avanzada):
    → Cargar módulos de vista solo cuando se navega a ella
    → import() dinámico en el router

Resultado: index.html baja de 13,000 a ~4,000 líneas
```

**Verificación:** Todas las vistas funcionan igual. Navegación entre vistas sin issues.

---

### FASE 4: Split de Módulos Grandes (3-4 días)
**Riesgo: Bajo** | **Impacto: Medio** | **Visible al usuario: No**

```
Acciones:

4a. signal-engine.js (1,045 líneas) → extraer:
    → src/signal-aggregator.js (normalización de scores)
    → src/signal-markov.js (cadenas de Markov)
    → src/signal-render.js (helpers de UI)

4b. pattern-detector.js (1,062 líneas) → extraer:
    → src/pattern-transitions.js
    → src/pattern-repeats.js
    → src/pattern-weekly.js
    → src/pattern-seasonal.js

4c. storage.js (977 líneas) → extraer:
    → src/storage-draws.js (operaciones de draws)
    → src/storage-hypotheses.js
    → src/storage-intelligence.js
    → src/storage-utils.js (normalización, paginación)

4d. relativos-engine.js (972 líneas) → extraer sub-análisis
```

**Verificación:** Todos los imports en signal-engine apuntan a los nuevos archivos.

---

### FASE 5: Base de Datos — Índices y Migraciones (1 día)
**Riesgo: Bajo** | **Impacto: Alto** | **Visible al usuario: Sí (más rápido)**

```
Acciones (ejecutar en SQL Editor):

5a. Índices faltantes:
    CREATE INDEX idx_hypotheses_fecha ON hypotheses(fecha);
    CREATE INDEX idx_hypotheses_estado ON hypotheses(estado);
    CREATE INDEX idx_reasons_owner ON reasons(owner_type, owner_id);
    CREATE INDEX idx_notebook_fecha ON notebook_entries(fecha);
    CREATE INDEX idx_draws_fecha ON draws(fecha DESC);
    CREATE INDEX idx_draws_horario ON draws(horario);

5b. ON DELETE CASCADE donde falta:
    ALTER TABLE hypothesis_logs DROP CONSTRAINT IF EXISTS hypothesis_logs_hypothesis_id_fkey;
    ALTER TABLE hypothesis_logs ADD FOREIGN KEY (hypothesis_id) REFERENCES hypotheses(id) ON DELETE CASCADE;

5c. Consolidar migraciones:
    → Crear 008_indexes.sql con todos los índices nuevos
    → Mantener las migraciones anteriores intactas
```

**Verificación:** Queries de draws por fecha son notablemente más rápidas.

---

### FASE 6: Lazy Loading y Performance (2-3 días)
**Riesgo: Medio** | **Impacto: Alto** | **Visible al usuario: Sí (más rápido)**

```
Acciones:

6a. Lazy load de vistas:
    → Cada vista se importa solo cuando se navega a ella
    → import() dinámico con retry

6b. Web Workers para cálculos pesados:
    → backtest.js / backtest-v4.js → worker
    → signal-engine → worker (parcial)
    → pattern-detector → worker

6c. Cache de Supabase responses:
    → Cache en memoria con TTL para queries frecuentes
    → Local-first: mostrar cache, actualizar en background

6d. Font Awesome:
    → Cambiar de CDN completo a import solo de iconos usados
    → O usar SVG inline para los ~20 iconos necesarios
```

**Verificación:** Tiempo de carga inicial reduce ~40%. Vista del día carga en <2s.

---

### FASE 7: Testing (3-5 días)
**Riesgo: Cero** | **Impacto: Crítico** | **Visible al usuario: No**

```
Acciones:

7a. Instalar Vitest (compatible con ES modules):
    → npm install -D vitest

7b. Tests unitarios para engines puros (sin DB):
    → conversion-engine.test.js (variantes, mirror, conversiones)
    → stats-utils.test.js (chi-cuadrado, bootstrap, intervalos)
    → date-utils.test.js
    → prediction-integrity.test.js (sellado de predicciones)

7c. Tests de integración para storage (con Supabase test instance):
    → storage-draws.test.js
    → auth.test.js

7d. Snapshot tests para rendering:
    → backtest-reporter.test.js
    → honesty-panel.test.js

7e. CI básico (GitHub Actions):
    → .github/workflows/test.yml
    → Ejecuta vitest en cada push a main
```

**Verificación:** `npm test` pasa. Cualquier regresión se detecta automáticamente.

---

### FASE 8: UX/UI Mejoras (2-3 días)
**Riesgo: Bajo** | **Impacto: Medio** | **Visible al usuario: Sí**

```
Acciones:

8a. Skeleton loading states:
    → Componente <skeleton> que muestra placeholders animados
    → Aplicar en: Panel del día, Mesa, Guía, Historial

8b. Toast notifications:
    → Sistema de notificaciones inline (no alert())
    → Tipos: éxito, error, warning, info
    → Auto-dismiss después de 3s

8c. Loading states en botones:
    → Spinner + texto "Guardando..." durante operaciones async
    → Deshabilitar botón mientras procesa

8d. Empty states descriptivos:
    → "No hay sorteos registrados para esta fecha"
    → "Agrega tu primer par vinculado para comenzar"

8e. Formularios:
    → Labels visibles (no solo placeholder)
    → Validación inline antes de enviar
    → Mensajes de error contextuales

8f. Básica accesibilidad:
    → aria-label en todos los botones
    → roles ARIA en secciones principales
    → Focus visible en todos los interactive elements
    → skip-nav link al contenido principal
```

**Verificación:** Tab navigation funciona. Screen reader lee labels. Loaders visibles.

---

### FASE 9: Archivo — Deploy y CI/CD (1 día)
**Riesgo: Bajo** | **Impacto: Medio** | **Visible al usuario: No**

```
Acciones:

9a. GitHub Actions para deploy:
    → .github/workflows/deploy.yml
    → Push a main → deploy a hosting (Netlify/Vercel/GitHub Pages)

9b. Environment variables:
    → En hosting: configurar SUPABASE_URL y SUPABASE_ANON_KEY
    → En Supabase Dashboard: whitelist del dominio de hosting

9c. Rollback strategy:
    → Cada migración tiene archivo .down.sql
    → Documentar proceso de rollback en README
```

---

## PRIORIZACIÓN FINAL

```
FASE 1 ─── Seguridad (credenciales)         ─── 1-2 días  ← EMPEZAR AQUÍ
FASE 2 ─── CSS specificity war               ─── 3-5 días
FASE 3 ─── Split index.html                  ─── 2-3 días
FASE 4 ─── Split módulos grandes             ─── 3-4 días
FASE 5 ─── DB indexes                        ─── 1 día
FASE 6 ─── Performance (lazy loading)        ─── 2-3 días
FASE 7 ─── Testing                           ─── 3-5 días  ← CRÍTICO A LARGO PLAZO
FASE 8 ─── UX/UI                             ─── 2-3 días
FASE 9 ─── CI/CD                             ─── 1 día

TOTAL ESTIMADO: 18-28 días de trabajo
```

### Reglas por Fase
1. **Cada fase se puede desplegar sin romper la anterior**
2. **Cada fase tiene verificación explícita antes de continuar**
3. **Ninguna fase toca lógica de predicción/analytic engines**
4. **Los tests (Fase 7) protegen contra regresiones en fases futuras**
5. **Si una fase introduce un bug, se revierte esa fase sin afectar las demás**
