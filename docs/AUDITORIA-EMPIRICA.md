# Auditoría empírica del sistema — agosto 2026

## Pregunta

¿Tiene el motor predictivo del sistema ventaja real sobre el azar? ¿Juega LOTEHLSA
con algún patrón explotable?

## Datos

- `docs/draws-respaldo.json`: 12,921 sorteos reales de La Diaria (HN)
- Rango: 2014-01-01 → 2026-08-21 · exportados de producción (sin datos de prueba)

## Experimento 1 — Backtest del motor central + ranker logístico

Walk-forward honesto sobre toda la historia (`src/backtest.js` +
`evaluarWalkForward`, ejecutado en producción con sesión autenticada):

| Métrica | Resultado | Azar | Veredicto |
|---|---|---|---|
| Lift top-5 | 1.065 [0.987–1.143] | 1.0 | ❌ IC incluye 1.0 |
| **Lift top-10** | **1.017 [0.965–1.070]** | 1.0 | ❌ Sin ventaja |
| Lift top-20 | 1.008 | 1.0 | ❌ |
| Lift top-30 | 1.006 | 1.0 | ❌ |
| meanRank | **49.54** | ~50 | Azar exacto |
| Ranker log-loss | 4.637 | 4.605 | ❌ Peor que azar |
| Ranker lift top-10 | 0.925 (n=3,850) | 1.0 | ❌ Peor que azar |

**Regla pre-comprometida aplicada**: lift top-10 con IC95 < 1.05 y log-loss ≥ ln(100)
→ sin ventaja real.

### Veredicto 1: el motor central NO supera al azar en 12,621 evaluaciones.

## Experimento 2 — Escaneo global de patrones (12 años de datos)

Script reproducible: `scripts/auditoria-empirica.py`
(requiere scipy: `pip3 install --user scipy`)

| Dimensión | Prueba | Resultado |
|---|---|---|
| Frecuencias globales | χ² 100 números | Uniforme (p=0.22); máx desvío #26 (+2.7σ) = máximo esperado por azar entre 100 celdas |
| Estabilidad anual | χ² × 13 años + FDR BH | 0/13 significativos |
| Repetición ventana corta k=1..10 | vs 1−0.99^k | Todo dentro de ±1.7σ |
| Memoria secuencial | Autocorrelación lags 1–30 | Máx \|z\|=2.08 (azar produce ~2.7 escaneando 30 lags) |
| Transiciones número→número | 10,000 pares + Bonferroni | 0 significativos; el mejor par (93→58, ×8 vs esperado 1.3) es exactamente el máximo que el azar garantiza al escanear 10,000 combinaciones |
| Transiciones familia→familia | 435 pruebas + FDR | 0 significativas |
| Gap entre aves (21,28,76,89,92) | 650 episodios | Medido 19.8 sorteos vs teórico 20.0 |
| Estacionalidad por número | 200 pruebas + FDR | 0 significativos |
| Decenas / terminaciones | χ² | Uniformes |

### Veredicto 2: LOTEHLSA es estadísticamente indistinguible de un generador
uniforme i.i.d. en las nueve dimensiones probadas.

## Consecuencias adoptadas

1. Los motores "predictivos" (markov, popularidad, rezago, ranker, presión,
   secuencias) se reclasifican como **simulación narrativa**, no predicción.
   El sistema no los presenta como recomendación de juego.
2. Los motores que mostraban "señales" sin contrastar contra azar se silencian o
   se etiquetan como descriptivos (ver auditoría de código en historial git).
3. Se conserva y fortalece la infraestructura honesta: sellado temporal de
   hipótesis, hit-tracker con baseline por tamaño de pool, panel de honestidad,
   backtest walk-forward — como **vigilancia continua**: si la casa cambia su
   comportamiento algún día, esto lo detectará.
4. La gestión del jugador (memoria, huecos, guía, registro) sigue siendo el valor
   real del sistema.

## Nota metodológica

Todas las pruebas múltiples usan corrección Benjamini-Hochberg (q=0.05) o
Bonferroni según el caso. El script completo es reproducible:

```bash
python3 scripts/auditoria-empirica.py
```
