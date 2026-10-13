# Interfaz de producto v2

El diseño usa navegación superior por tareas, fondo claro, superficies blancas, azul intenso y cifras grandes. El modo oscuro se conserva. Los valores iniciales se migran una sola vez mediante `ld-design-version=2`; después se conserva la elección de tema del usuario.

## Navegación

- **Jornada**: tablero de resultados, estados, registro en diálogo y últimos registros.
- **Ranking mensual**: conteos y porcentajes en filas con barras comparables; primeros diez números y detalles para los restantes.
- **Por número**: Horario favorito, Consulta histórica y Memoria.
- **Historial**: filtros por fecha, turno y país, y búsqueda por número o símbolo.
- **Herramientas**: Hipótesis, Escenarios, Verificador, Super Premio, Pega3, Transformaciones, Modos de juego y Guía de los Sueños.
- **Cuenta**: Configuración y Mantenimiento para administradores, actualización de datos, tema, ayuda y sesión.

Se mantienen los motores, autenticación y persistencia existentes. El registro conserva el flujo de pendientes: guardar primero, revisar y publicar después. Las funciones retiradas anteriormente no se reintroducen.

## Archivos

`src/theme/tokens.css` define colores y tipografía. `src/theme/redesign.css` aplica el diseño de producto y adapta los componentes de las herramientas conservadas. `src/ui/product-shell.js` controla menús, estados de navegación, diálogo de registro y acceso rápido a la consulta.

## Validación realizada

- 193 pruebas de Vitest aprobadas.
- Comprobación de las 17 vistas a 1440 y 390 px, sin desbordamiento horizontal.
- Navegación mediante los menús reales, cierre con Escape y cambio de tema.
- Selectores de mes y año; consulta de enero de 2025 contra los 93 sorteos del respaldo.
- Consulta por número, búsqueda exacta en historial y acceso desde Jornada.
- Flujo de guardar pendientes con el cliente de Supabase sustituido únicamente en el navegador de pruebas por un backend en memoria.
- Restricción de Configuración y Mantenimiento para editor/lector y bloqueo del registro para lector.
- Sin IDs duplicados. Se conservaron los IDs de filtros, controles, registro y herramientas; los IDs retirados corresponden al antiguo menú lateral y selector de acento del encabezado.

La validación de integración usa registros del respaldo y autenticación simulada; no escribe datos en el backend compartido ni demuestra un despliegue de producción.
