# Interfaz de producto v2

El diseño usa navegación superior por tareas, fondo claro, superficies blancas, azul intenso y cifras grandes. El modo oscuro se conserva. Los valores iniciales se migran una sola vez mediante `ld-design-version=2`; después se conserva la elección de tema del usuario.

## Navegación

- **Jornada**: tablero de resultados, estados, registro en diálogo y últimos registros.
- **Ranking mensual**: conteos y porcentajes en filas con barras comparables; primeros diez números y detalles para los restantes.
- **Por número**: Horario favorito, Consulta histórica y Memoria.
- **Historial**: filtros por fecha, turno y país, y búsqueda por número o símbolo.
- **Herramientas**: Hipótesis, Escenarios, Super Premio, Pega3, Transformaciones, Modos de juego y Guía de los Sueños.
- **Cuenta**: Configuración y Mantenimiento para administradores, actualización de datos, tema, ayuda y sesión.

Se mantienen los motores, autenticación y persistencia existentes. El registro conserva el flujo de pendientes: guardar primero, revisar y publicar después. Las funciones retiradas anteriormente no se reintroducen.

## Archivos

`src/theme/tokens.css` define colores y tipografía. `src/theme/redesign.css` aplica el diseño de producto y adapta los componentes de las herramientas conservadas. `src/ui/product-shell.js` controla menús, estados de navegación, diálogo de registro y acceso rápido a la consulta.

## Validación realizada

- 199 pruebas de Vitest aprobadas.
- Comprobación de las 17 vistas a 1440 y 390 px, sin desbordamiento horizontal.
- Navegación mediante los menús reales, cierre con Escape y cambio de tema.
- Selectores de mes y año; consulta de enero de 2025 contra los 93 sorteos del respaldo.
- Consulta por número, búsqueda exacta en historial y acceso desde Jornada.
- Flujo de guardar pendientes con el cliente de Supabase sustituido únicamente en el navegador de pruebas por un backend en memoria.
- Restricción de Configuración y Mantenimiento para editor/lector y bloqueo del registro para lector.
- Sin IDs duplicados. Se conservaron los IDs de filtros, controles, registro y herramientas; los IDs retirados corresponden al antiguo menú lateral y selector de acento del encabezado.

La validación de integración usa registros del respaldo y autenticación simulada; no escribe datos en el backend compartido ni demuestra un despliegue de producción.

## Historial compacto e interacciones planas

El historial usa una cabecera única, búsqueda visible, filtros desplegables y paginación real. Se evita el sombreado alterno de filas. Los efectos de elevación y sombra de hover se retiraron; el menú usa cambios de texto y una marca lateral. Los submenús se revelan con una transición de recorte y opciones escalonadas, desactivada con reducir movimiento. Se verificaron la ausencia de desplazamiento/sombra al hacer hover, los filtros, el cambio de página y el reinicio de página al buscar.

## Acceso independiente

El login se reconstruyó con una composición de marca y formulario. Carga únicamente `src/theme/login.css` y conserva los módulos de autenticación existentes; no hereda tarjetas ni efectos de las hojas antiguas. Incluye autocompletado, mostrar/ocultar contraseña, mensajes de error y una vista propia para la sesión existente. Se comprobaron tamaños de 1440, 390 y 320 px, envío por teclado, errores de credenciales, redirección tras verificar la sesión y cambio de cuenta con autenticación simulada.

## Entrada sin destello de la interfaz

La pantalla de carga está visible desde el HTML inicial. El contenido permanece oculto y sus controles inactivos hasta que finalicen tanto la verificación de sesión y permisos como la preparación inicial de datos. Ambos procesos pueden terminar en cualquier orden sin revelar una jornada vacía. Se verificaron ambos órdenes con pruebas de regresión y, en Chromium a 1440 y 390 px, se observaron los fotogramas de entrada mientras se retrasaba deliberadamente la carga de datos con autenticación simulada: la primera vista fue la pantalla de carga y no apareció contenido del sistema antes de completar la preparación.

## Verificador retirado

Se retiró el panel Verificador estadístico, su acceso desde Herramientas, su ruta y su renderizado. Sus módulos exclusivos de análisis temporal y presentación de honestidad ya no forman parte de la aplicación. La ayuda no ofrece acceso a las funciones retiradas. Los enlaces antiguos a `#temporal` abren Jornada al entrar.
