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

- 207 pruebas de Vitest aprobadas.
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

Se retiró el panel Verificador estadístico, su acceso desde Herramientas, su ruta y su renderizado. Sus módulos exclusivos de análisis temporal y presentación de honestidad ya no forman parte de la aplicación. La ayuda no ofrece acceso a las funciones retiradas. Los enlaces antiguos a `#temporal` abren la pantalla de inicio al entrar.

## Símbolos en Jornada

Las tarjetas de cada turno muestran la imagen del símbolo junto al número grande. La imagen se actualiza al cambiar la fecha, el país o el resultado, incluidos los pendientes. Se oculta cuando el turno no tiene resultado o no se puede cargar su archivo, conservando el número y su nombre.

## Selectores de Jornada

Fecha y país usan desplegables propios con los tokens del sistema en ambos temas. El calendario está en español, comienza el lunes y permite elegir mes y año directamente, volver a hoy y navegar con flechas, Inicio/Fin y AvPág/RePág. Escape cierra y devuelve el foco. Se mantienen `day-fecha`, `day-pais` y sus eventos para actualizar resultados y pendientes; los controles nativos permanecen ocultos. El selector de país ofrece únicamente las opciones existentes.

## Herramientas por número en móvil

Transformaciones usa tarjetas y clases propias en `src/theme/number-tools.css`; se retiraron sus reglas anteriores de `style.css` y `base.css` y los estilos forzados desde JavaScript. Se conservan los cálculos, el orden de los resultados, cada número, imagen y símbolo. El número base se destaca y las demás tarjetas se organizan en columnas con un acento por categoría, sin sombra ni elevación de hover.

Consulta usa una descripción breve, un campo con contraste en ambos temas y un historial que presenta cada aparición como ficha en móvil. Conserva fecha, turno y sorteos anterior/siguiente, así como las tablas de escritorio. Se comprobaron 320, 384, 412 y 1440 px en Chromium, con emulación móvil y cliente de Supabase simulado. Las transformaciones de 00, 11, 27 y 99 se compararon con las funciones del motor y los símbolos de la guía; se verificaron ambas paletas, ausencia de desbordamiento horizontal y conservación de las filas y columnas del historial. Las 202 pruebas existentes pasaron. La validación no se realizó en un S24 Ultra físico.

## Tiempo sin salir

El menú Por número incluye un panel con los 100 números, sus imágenes y símbolos, búsqueda exacta por número o por texto, y orden por número o por mayor tiempo sin aparecer. El cálculo usa la última fecha y el turno registrado de Honduras, con horas de referencia 11:00, 15:00 y 21:00 en UTC−6; no usa la fecha de inserción en la base. Las pruebas, pendientes, registros inválidos y horas futuras se excluyen. La ausencia de historial se muestra expresamente, sin fabricar una duración.

Un único temporizador actualiza los valores visibles cada segundo. El tiempo se recalcula con `Date.now()` para evitar deriva y recuperar el tiempo transcurrido al volver al panel o a la pestaña. Se suspende fuera de la vista y cuando la pestaña está oculta. Las mutaciones de sorteos actualizan las últimas apariciones; Actualizar datos permite una lectura forzada. Los contadores tienen anuncios automáticos desactivados para los lectores de pantalla y el parpadeo respeta reducir movimiento.


Se verificaron 207 pruebas de Vitest y el panel en Chromium a 320, 384 y 1440 px con autenticación y datos simulados. Se comprobó el avance de segundos y minutos con un reloj controlado, el reinicio al incorporar un sorteo, búsqueda y orden, ausencia de registros, suspensión fuera de la vista y recuperación al regresar. Un contexto con zona Asia/Tokyo obtuvo los mismos instantes de Honduras.

## Escenarios y secciones secundarias de Transformaciones

Escenarios presenta los números con la misma jerarquía de Transformaciones: número grande, imagen del símbolo, nombre y datos auxiliares en tarjetas planas con acentos por categoría. Incluye las líneas por decenas, resultados recientes, recuperaciones y candidatos. Se mantienen los cálculos, porcentajes, motivos y orden del motor.

La consulta antes/después tiene etiquetas explícitas y campos alineados; sus resultados usan tarjetas legibles. El mapa de compañeros organiza semilla, compañero y justificación, separa los contadores de estado y presenta cada relación como ficha en móvil. El selector de semillas permite buscar por número o símbolo. Ambos selectores conservan sus valores y eventos originales, permiten teclado y cierran con Escape devolviendo el foco. La edición, eliminación, importación y exportación del mapa se mantienen.

Se compararon exactamente los textos, imágenes y títulos de 228 tarjetas de Escenarios con la versión anterior, usando el mismo historial y reloj. Se verificaron 320, 384 y 1440 px en Chromium, ambos temas, ausencia de desbordamiento horizontal, consulta por turno, navegación de selectores y operaciones del mapa con persistencia simulada. Las 207 pruebas de Vitest pasaron. No se realizaron escrituras reales en Supabase ni pruebas en un S24 Ultra físico.

## Pestañas de consultas por número

Tiempo sin salir, Horario favorito y Consulta histórica comparten una barra de pestañas tipo navegador encima del contenido. La selección se sincroniza con las rutas existentes y los accesos del menú; la barra se oculta en las demás vistas. Los campos, filtros y resultados permanecen al alternar. Los relojes conservan su suspensión fuera de la vista.

La barra usa roles tablist/tab/tabpanel, indica la pestaña seleccionada y admite flechas, Inicio y Fin con foco en la pestaña activa. En móvil las tres etiquetas se distribuyen en el ancho disponible; los cambios de color respetan reducir movimiento. Se verificaron navegación, enlaces directos, persistencia de consultas y filtros, teclado, ambos temas y ausencia de desbordamiento en Chromium a 320, 384 y 1440 px, con Supabase simulado. Las 207 pruebas existentes pasaron.


## Inicio en las consultas por número

La entrada sin ruta, incluido el retorno desde el login y Continuar con una sesión existente, abre Tiempo sin salir después de la pantalla de carga. Las rutas desconocidas también vuelven a este inicio; los enlaces directos a vistas válidas se conservan. Jornada permanece disponible para consultar y registrar resultados.

Se retiró el desplegable Por número y sus tres accesos duplicados. Inicio permite volver al conjunto de pestañas y permanece seleccionado al usar Horario favorito o Consulta histórica; el logotipo también vuelve a Tiempo sin salir. Memoria está en Herramientas, dentro de Biblioteca. Todas las vistas permanecen ocultas en el HTML inicial hasta que el enrutador seleccione la correspondiente.

Se verificaron las 207 pruebas existentes y el flujo en Chromium a 320, 384 y 1440 px con autenticación simulada: cargador antes del contenido, primera vista Tiempo sin salir sin destello de Jornada, pestañas, accesos Inicio/logotipo, registro de resultados, Memoria y rutas directas. También se comprobó la entrada desde credenciales y desde una sesión disponible. No se realizaron escrituras reales en Supabase.

## Arranque sin descargas repetidas

El documento y la aplicación comparten una única promesa de validación de sesión, comprobación de bloqueo y aplicación de permisos (`startup-session.js`). El cargador distingue sesión, permisos, guía e historial. La interfaz sigue bloqueada hasta completar autenticación y datos iniciales; no se omite la comprobación del usuario.

Memoria ya no descarga sorteos mediante `await` al importar su módulo: se prepara al navegar a ella y comparte el historial de la aplicación. Las lecturas concurrentes del caché comparten su petición en curso y las invalidaciones impiden que una lectura anterior reemplace el caché nuevo. El panel inicial espera su historial y sus relojes antes de levantar el cargador. Se elimina la sincronización completa redundante programada durante el propio arranque.

La corrección automática de fechas, cierre de eventos, preparación del selector de superpremio, historial secundario, perfiles y modos se ejecutan después de mostrar la vista inicial. Si se corrige un sorteo, se invalidan y actualizan los datos y relojes. Los perfiles reutilizan el historial cargado; los demás llamadores de `rebuildKnowledge()` conservan su funcionamiento.

Medición controlada en Chromium con el respaldo de 12.921 sorteos y 80 ms simulados por consulta: antes, 12,1 s y 213 consultas de sorteos al llegar al panel; después, 3,1 s y 28 consultas observadas (incluyen la consulta de pendientes y el comienzo del mantenimiento secundario). Equivale a aproximadamente un 74% menos de espera en ese escenario. No es una medición de latencia real del Supabase del usuario ni una garantía de ese tiempo en producción.

Pasaron 213 pruebas en 26 archivos: se añadieron comprobaciones de validación compartida, permisos pendientes, sesión ausente, usuario bloqueado y equivalencia de perfiles con el historial reutilizado. Se verificó en Chromium a 320, 384 y 1440 px la secuencia cargador → Tiempo sin salir, sin destello de Jornada, así como pestañas, registro, rutas directas y entrada desde el login con autenticación simulada. Memoria y su monitor se comprobaron al abrirlos. No se realizaron escrituras reales en Supabase.
