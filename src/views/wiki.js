/**
 * views/wiki.js — Guía del sistema (Wiki)
 *
 * Extraído de app.js: artículos + índice + búsqueda + importador 2014.
 */

import { DB } from "../storage.js";
import { showToast } from "../ui/toast.js";

const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

    // ═══════════════════════════════════════════════════════════
    // WIKI — Guía del sistema
    // ═══════════════════════════════════════════════════════════

    const WIKI_ARTICLES = [
      {
        id: "markov1",
        categoria: "Motor de señales",
        titulo: "Markov Orden 1 — ¿Qué suele seguir a un número?",
        contenido: `
          <h2>Markov Orden 1</h2>
          <p class="wiki-lead">Responde a la pregunta: <em>"Históricamente, después de que cayó el 37, ¿qué número apareció con más frecuencia en el siguiente sorteo?"</em></p>

          <h3>Cómo funciona</h3>
          <p>El sistema recorre todo el historial de sorteos y registra, para cada número, cuál fue el siguiente en caer. Con eso construye una tabla de probabilidades real:</p>
          <div class="wiki-example">
            <strong>Ejemplo:</strong> El 37 cayó 80 veces en el historial.<br>
            De esas 80 veces, el siguiente sorteo fue:<br>
            &nbsp;· 96 en 12 ocasiones → <strong>15%</strong><br>
            &nbsp;· 14 en 8 ocasiones → <strong>10%</strong><br>
            &nbsp;· 55 en 5 ocasiones → <strong>6%</strong>
          </div>
          <p>Esos porcentajes no son inventados — son frecuencias reales del historial de La Diaria.</p>

          <h3>Cómo leerlo en el panel</h3>
          <p>En <strong>Escenarios → "Markov — tras XX"</strong> verás chips con barra de color azul. La barra más larga = mayor probabilidad histórica. El número al pie muestra el porcentaje y cuántas veces ocurrió.</p>

          <h3>Lo que NO significa</h3>
          <p>No predice el próximo número con certeza. Te dice cuál ha salido más veces después del número anterior. Es una tendencia estadística, no una garantía.</p>

          <h3>Cuándo confiar más en él</h3>
          <p>Cuando el porcentaje es alto (>20%) y la cantidad de veces (×) es mayor a 10. Con pocos datos el porcentaje puede ser engañoso.</p>
        `,
      },
      {
        id: "markov2",
        categoria: "Motor de señales",
        titulo: "Markov Orden 2 — Secuencias de dos números",
        contenido: `
          <h2>Markov Orden 2</h2>
          <p class="wiki-lead">Igual que Markov O1 pero considera los <em>dos últimos números</em> para predecir el siguiente. Es más preciso cuando hay suficiente historial.</p>

          <h3>Diferencia con Orden 1</h3>
          <p>Markov O1 pregunta: <em>"¿Qué sigue al 37?"</em><br>
          Markov O2 pregunta: <em>"¿Qué sigue a la secuencia 14 → 37?"</em></p>
          <p>El contexto de dos números reduce las coincidencias aleatorias y detecta patrones más específicos del comportamiento del sorteo.</p>

          <div class="wiki-example">
            <strong>Ejemplo:</strong> La secuencia 14 → 37 ocurrió 15 veces.<br>
            De esas 15, el siguiente fue:<br>
            &nbsp;· 96 en 6 ocasiones → <strong>40%</strong><br>
            Eso ya es una señal fuerte.
          </div>

          <h3>Limitación</h3>
          <p>Necesita más datos que O1. Si la secuencia específica A→B no ocurrió muchas veces en el historial, el porcentaje no es confiable. El sistema solo muestra O2 cuando hay al menos 2 ocurrencias de esa secuencia.</p>
        `,
      },
      {
        id: "rezago",
        categoria: "Motor de señales",
        titulo: "Rezago y ciclo histórico — ¿Cuándo le toca a un número?",
        contenido: `
          <h2>Análisis de Rezago</h2>
          <p class="wiki-lead">Calcula cuántos días lleva cada número sin caer y lo compara contra su ciclo promedio real de los <strong>últimos 180 días</strong>.</p>

          <h3>Por qué 180 días y no todo el historial</h3>
          <p>Usar todo el historial mezcla períodos donde el sistema de La Diaria podía comportarse diferente. Los últimos 180 días reflejan el comportamiento actual y son inmunes a huecos en el historial antiguo.</p>

          <h3>Qué es el ciclo promedio</h3>
          <p>Si el 22 Ataúd apareció 18 veces en los últimos 180 días, su ciclo promedio es 180/18 = <strong>10 días entre aparición y aparición</strong>.</p>

          <h3>Estados de un número</h3>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok">
              <strong>En ventana</strong>
              <span>Lleva más días sin caer de lo normal pero todavía dentro del rango esperado. Es candidato natural.</span>
            </div>
            <div class="wiki-state wiki-state--warn">
              <strong>Vencido</strong>
              <span>Lleva muchísimo más de su ciclo sin caer (más de 2 desviaciones estándar). El jugador lo espera — y si el sistema tiene control, lo evita.</span>
            </div>
            <div class="wiki-state wiki-state--muted">
              <strong>Reciente</strong>
              <span>Cayó hace 3 días o menos. Baja probabilidad de repetición inmediata.</span>
            </div>
            <div class="wiki-state wiki-state--muted">
              <strong>Ausente</strong>
              <span>No apareció en los últimos 180 días. El sistema lo ignora — sin datos recientes no hay ciclo calculable.</span>
            </div>
          </div>
        `,
      },
      {
        id: "eliminacion",
        categoria: "Motor de señales",
        titulo: "Enfoque de eliminación — qué quitar antes de elegir",
        contenido: `
          <h2>Enfoque de eliminación</h2>
          <p class="wiki-lead">En lugar de buscar <em>"el número ganador"</em>, el motor primero descarta los que <strong>no pueden o no deben salir</strong> según el historial. Lo que queda es el universo de candidatos.</p>

          <h3>Por qué eliminar primero</h3>
          <p>De 100 números posibles, el historial permite descartar con argumentos sólidos entre 20 y 40. El jugador elige dentro de un universo reducido con lógica, no de 100 opciones ciegas.</p>

          <h3>Reglas de eliminación actuales</h3>
          <div class="wiki-example">
            <strong>1. Recientes</strong> — cayeron hace 3 días o menos. Repetición inmediata es estadísticamente rara (excepto en diciembre, donde el sistema relaja esta regla).<br><br>
            <strong>2. Sobrecalentados</strong> — llevan más de 3 desviaciones estándar sobre su ciclo sin caer. Tanta gente los espera que si el sistema tiene control, los evita deliberadamente.<br><br>
            <strong>3. Penalización por familia</strong> — si la familia simbólica del último número ya cayó en los últimos 2 turnos, los demás de esa familia reciben un peso reducido (no eliminados, pero bajan en el ranking).
          </div>

          <h3>Lo que aparece en el panel</h3>
          <p>En Escenarios verás <em>"Excluidos"</em> y <em>"Sobrecalentados"</em> con sus cards. Esos números el motor no los considera candidatos.</p>
        `,
      },
      {
        id: "motor-unificado",
        categoria: "Motor de señales",
        titulo: "Motor unificado — cómo se combina todo",
        contenido: `
          <h2>Motor unificado de señales</h2>
          <p class="wiki-lead">Es el cerebro central del sistema. Toma las señales de todos los motores, les asigna un peso, y produce un ranking de candidatos con un score del 0 al 100%.</p>

          <h3>Fuentes que combina</h3>
          <table class="wiki-table">
            <thead><tr><th>Fuente</th><th>Peso</th><th>Qué aporta</th></tr></thead>
            <tbody>
              <tr><td>Markov O1</td><td>28%</td><td>Sucesor directo del último número</td></tr>
              <tr><td>Markov O2</td><td>18%</td><td>Sucesor de la última secuencia de dos</td></tr>
              <tr><td>Modos de juego</td><td>18%</td><td>Transformaciones configuradas por el usuario</td></tr>
              <tr><td>Patrones heurísticos</td><td>12%</td><td>Gaps, repeticiones, transiciones detectadas</td></tr>
              <tr><td>Rezago</td><td>14%</td><td>Números en su ventana de ciclo</td></tr>
              <tr><td>Patrones semanales</td><td>6%</td><td>Ciclos por día de semana y turno</td></tr>
              <tr><td>Patrones mensuales</td><td>4%</td><td>Tendencias del mes actual</td></tr>
            </tbody>
          </table>

          <h3>Cómo interpretar el score</h3>
          <p>Un score de 75% no significa que el número vaya a salir con 75% de probabilidad. Significa que <strong>ese número concentra el 75% de las señales históricas favorables</strong> en este momento. Es un ranking relativo, no una probabilidad absoluta.</p>

          <h3>El tooltip</h3>
          <p>Si pasas el cursor sobre un chip del motor, verás qué señales específicas lo pusieron ahí y por qué.</p>
        `,
      },
      {
        id: "pares-vinculados",
        categoria: "Herramientas",
        titulo: "Pares vinculados — números que se siguen entre sí",
        contenido: `
          <h2>Pares vinculados</h2>
          <p class="wiki-lead">Te permite registrar relaciones simbólicas o históricas entre dos números, con ventanas de tiempo para cada dirección.</p>

          <h3>La idea base</h3>
          <p>En La Diaria, los jugadores conocen relaciones entre números por tradición o por observación propia. Por ejemplo: <em>"Cuando cae 37 Suerte, suele seguirle 96 Dinero en pocos días"</em>. El sistema formaliza esa observación con datos.</p>

          <h3>Cómo registrar un par</h3>
          <p>Hay dos formas:</p>
          <ol>
            <li>Desde <strong>Hipótesis</strong> → formulario de pares: ingresas ambos números y configuras las ventanas</li>
            <li>Desde el <strong>Panel del día</strong> → botón "Vincular par" bajo cada slot: el número A se pre-rellena con el que acaba de caer, solo ingresas el B</li>
          </ol>

          <h3>Ventanas de tiempo</h3>
          <div class="wiki-example">
            <strong>A cae → esperar B en X–Y días:</strong> si cayó A, el sistema vigilará si B aparece dentro de esa ventana.<br><br>
            <strong>B cae → esperar A en X–Y días:</strong> la relación funciona en ambas direcciones, porque cualquiera puede caer primero.
          </div>

          <h3>Dónde lo verás activo</h3>
          <p>En <strong>Escenarios → "Pares vinculados activos"</strong> aparecerán los pares cuyo número A o B cayó recientemente y cuyo compañero todavía está dentro de la ventana de espera.</p>
        `,
      },
      {
        id: "panel-pulso",
        categoria: "Paneles",
        titulo: "Panel Escenarios — qué muestra y en qué orden",
        contenido: `
          <h2>Panel Escenarios</h2>
          <p class="wiki-lead">Es el panel principal de recomendaciones. Muestra todo lo que el sistema sabe sobre el momento actual, organizado de arriba hacia abajo por tipo de señal.</p>

          <h3>Secciones en orden</h3>
          <ol>
            <li><strong>Último sorteo</strong> — el número que cayó más recientemente, su símbolo, turno y fecha</li>
            <li><strong>Candidatos por conversión</strong> — números que se derivan del último por transformaciones matemáticas (espejo, suma de dígitos, etc.)</li>
            <li><strong>Markov — tras XX</strong> — qué suele seguir históricamente al último número (chips azules)</li>
            <li><strong>Motor unificado</strong> — ranking combinado de todas las señales (chips verdes)</li>
            <li><strong>Excluidos y sobrecalentados</strong> — números que el motor descartó y por qué</li>
            <li><strong>Vencidos</strong> — llevan demasiados días sin caer, el sistema los evita</li>
            <li><strong>En ventana</strong> — están dentro de su ciclo histórico reciente, candidatos naturales</li>
            <li><strong>Pares vinculados activos</strong> — pares registrados cuyo contador de días está activo</li>
          </ol>

          <h3>Cuándo se actualiza</h3>
          <p>El panel se calcula una sola vez y queda en caché. Solo se recalcula cuando ingresas nuevos sorteos o modificas pares. Navegar fuera y volver no lo recalcula innecesariamente.</p>
        `,
      },
      {
        id: "modos-juego",
        categoria: "Herramientas",
        titulo: "Modos de juego — transformaciones personalizadas",
        contenido: `
          <h2>Modos de juego</h2>
          <p class="wiki-lead">Te permiten definir reglas matemáticas propias basadas en tu conocimiento del juego. El sistema las evalúa contra el historial para saber si funcionan.</p>

          <h3>Operaciones disponibles</h3>
          <table class="wiki-table">
            <thead><tr><th>Operación</th><th>Ejemplo</th></tr></thead>
            <tbody>
              <tr><td>Espejo</td><td>37 → 73</td></tr>
              <tr><td>Suma de dígitos</td><td>37 → 3+7 = 10 → 0</td></tr>
              <tr><td>Sumar constante</td><td>37 + 10 = 47</td></tr>
              <tr><td>Restar constante</td><td>37 − 5 = 32</td></tr>
              <tr><td>Vecino</td><td>37 → 36 y 38</td></tr>
              <tr><td>Mapa de dígitos</td><td>Sustituye cada dígito según tu tabla</td></tr>
            </tbody>
          </table>

          <h3>Cómo el sistema los califica</h3>
          <p>Por cada modo, el sistema revisa el historial: cada vez que cayó el número base, ¿apareció el número resultado en los siguientes 2 sorteos? La tasa de acierto determina la confianza del modo.</p>

          <h3>Ejemplos propios</h3>
          <p>También puedes agregar ejemplos manuales: <em>"Cuando cayó 14, yo esperaba 69 y cayó"</em>. El sistema los incorpora como evidencia adicional.</p>
        `,
      },
      {
        id: "panel-dia",
        categoria: "Paneles",
        titulo: "Panel del día — registrar sorteos diarios",
        contenido: `
          <h2>Panel del día</h2>
          <p class="wiki-lead">Aquí registras los resultados de cada sorteo del día. Es la fuente principal de datos de todo el sistema.</p>

          <h3>Flujo de trabajo</h3>
          <ol>
            <li>Selecciona la <strong>fecha</strong> y el <strong>país</strong></li>
            <li>Ingresa el número en el slot del turno correspondiente (11AM, 3PM, 9PM)</li>
            <li>Clic en <strong>"Agregar a pendientes"</strong> — el sorteo queda en cola local</li>
            <li>Clic en <strong>"Sincronizar con Supabase"</strong> — confirma y guarda en la base de datos</li>
          </ol>

          <h3>Botón "Vincular par"</h3>
          <p>Aparece bajo cada slot. Al hacer clic con un número ya ingresado, abre un formulario para registrar el número compañero esperado (par vinculado), con ambas ventanas de tiempo configurables.</p>

          <h3>Modo prueba</h3>
          <p>El checkbox "Modo prueba" en cada slot marca el sorteo como test. No se incluye en los análisis reales del motor. Útil para probar el sistema sin contaminar el historial.</p>
        `,
      },
      {
        id: "diciembre",
        categoria: "Comportamiento estacional",
        titulo: "Factor Diciembre — el sistema juega diferente",
        contenido: `
          <h2>Factor Diciembre</h2>
          <p class="wiki-lead">En diciembre, el comportamiento observado de La Diaria cambia: el sistema tiende a <strong>repetir números</strong> en lugar de buscar los que llevan más tiempo sin caer.</p>

          <h3>Por qué es contraintuitivo</h3>
          <p>En condiciones normales, el motor penaliza los números recientes (cayeron hace poco). En diciembre hace lo contrario: prioriza los que salieron recientemente porque el patrón histórico muestra mayor repetición en ese mes.</p>

          <h3>Cómo lo aplica el sistema</h3>
          <p>El motor detecta automáticamente si la fecha actual es diciembre. Si es así, relaja el filtro de eliminación de números recientes — no los descarta aunque hayan caído hace 1-2 días.</p>

          <h3>Hipótesis detrás del patrón</h3>
          <p>En quincenas y fechas especiales (Navidad, fin de año), el volumen de apuestas sube. Si el sistema tiene algún control, puede preferir repetir números para distribuir los premios en lugar de concentrarlos.</p>
        `,
      },
      {
        id: "adv-tesis",
        categoria: "Sistema adversarial",
        titulo: "Tesis adversarial — qué es y por qué",
        contenido: `
          <h2>Sistema adversarial</h2>
          <p class="wiki-lead">El motor del sistema NO intenta predecir el número ganador como si fuera azar puro. Modela el <em>comportamiento estratégico de La Diaria</em> — la operadora que decide qué número paga y cuál no.</p>

          <h3>El supuesto base</h3>
          <p>La Diaria es un negocio. Su objetivo es <strong>cobrar mucho y pagar poco</strong>. Por eso, cuando un número está siendo comprado masivamente por el público, la operadora prefiere tirar otro — uno equivalente, parecido o relacionado — pero NO el que el público espera.</p>
          <div class="wiki-example">
            <strong>Ejemplo:</strong> Si esta semana medio Honduras está comprando el <strong>16 Anillo</strong> porque soñaron con boda, La Diaria probablemente tira el <strong>61</strong> (espejo), el <strong>10</strong> (de la cadena boda), o el <strong>17</strong> (adyacente al día). Paga poco, mantiene el "guiño" para que el público siga jugando.
          </div>

          <h3>Las 6 capas del motor adversarial</h3>
          <p>El sistema aplica seis filtros encadenados al score base de cada número:</p>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok">
              <strong>1. Calendario adversarial</strong>
              <span>Bloquea o boostea según fechas patrias, día del mes y eventos próximos.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>2. Modelo de popularidad</strong>
              <span>Penaliza números calientes (muy comprados), favorece libres.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>3. Modo recuperación post-SP</strong>
              <span>Detecta el ciclo post super premio: repetidos y escondidos pre-evento.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>4. Motor de variantes</strong>
              <span>Genera todas las sustituciones matemáticas de los números calientes.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>5. Detector de clusters</strong>
              <span>Identifica conjuntos pequeños de dígitos que la operadora está minando.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>6. Factor dominical</strong>
              <span>Suaviza penalty a populares los domingos (menor volumen de juego).</span>
            </div>
          </div>

          <h3>Cómo verlo en el panel Escenarios</h3>
          <p>Cada capa aparece como una sección con tarjetas de número. El borde y el badge de color te dicen qué tipo de señal es:</p>
          <ul>
            <li><strong>Rojo</strong> — penalización adversarial (la operadora lo evita)</li>
            <li><strong>Verde</strong> — boost positivo (favorable para que caiga)</li>
            <li><strong>Morado</strong> — variante derivada por sustitución matemática</li>
            <li><strong>Teal/Verde agua</strong> — miembro de cluster activo</li>
            <li><strong>Naranja</strong> — popular caliente o cadena semántica activa</li>
            <li><strong>Azul</strong> — calendario / próximos eventos</li>
          </ul>

          <h3>Lo que NO promete</h3>
          <p>Esto no es predicción mística ni garantía. Es modelado de comportamiento. El sistema dice: <em>"si la operadora se está comportando así, estos números tienen ventaja contextual"</em>. Tú tomas la decisión final con esta información.</p>
        `,
      },
      {
        id: "adv-calendario",
        categoria: "Sistema adversarial",
        titulo: "📆 Calendario adversarial — fechas patrias y día del mes",
        contenido: `
          <h2>Calendario adversarial</h2>
          <p class="wiki-lead">Aplica dos reglas de evasión basadas en el calendario hondureño: bloqueo por fechas patrias y boost por adyacencia de día.</p>

          <h3>Regla 1: Fechas patrias y eventos culturales</h3>
          <p>Cuando se acerca un evento cultural fuerte (Día de la Madre, Independencia, Navidad, etc.), el público compra masivamente los números asociados al evento. La operadora los <strong>bloquea</strong> durante una ventana pre y post evento.</p>
          <div class="wiki-example">
            <strong>Ejemplo Día de la Madre (2do domingo de mayo):</strong><br>
            Números asociados: <strong>2, 5, 19, 42</strong> (cadena mujer/madre).<br>
            Ventana de bloqueo: 10 días antes y 5 días después.<br>
            Durante esa ventana esos números reciben penalty <strong>−45%</strong>.
          </div>
          <p>El sistema cataloga 14 eventos hondureños con su fecha (fija o movible), números asociados, intensidad y forma de la curva de bloqueo (trapezoidal o campana).</p>

          <h3>Regla 2: Adyacencia de día del mes</h3>
          <p>Una observación tuya muy concreta: si hoy es <strong>17</strong>, La Diaria casi nunca tira el <strong>17</strong>. Lo tira el <strong>16 o el 18</strong> (un día antes o después). Es el "guiño" sin pagar el evidente.</p>
          <div class="wiki-example">
            <strong>Hoy 17 de abril:</strong><br>
            · Número 17 → penalty <strong>−45%</strong> (es el día exacto)<br>
            · Números 16 y 18 → boost <strong>+25%</strong> (adyacentes)<br>
            · Resto → sin efecto
          </div>

          <h3>Próximos eventos</h3>
          <p>El panel también muestra los próximos eventos en una ventana de 120 días con sus números asociados, para que sepas qué se viene en el horizonte adversarial.</p>

          <h3>Lo que ves en el panel</h3>
          <p>Tres secciones:</p>
          <ul>
            <li><strong>📆 Bloqueados</strong> (rojo) — números penalizados ahora mismo, con el motivo y % de reducción.</li>
            <li><strong>📆 Boost por adyacencia</strong> (azul claro) — D±1 del día actual.</li>
            <li><strong>📅 Próximos eventos</strong> (azul) — qué viene en los próximos meses.</li>
          </ul>
        `,
      },
      {
        id: "adv-popularidad",
        categoria: "Sistema adversarial",
        titulo: "🎭 Modelo de popularidad — qué compra el público",
        contenido: `
          <h2>Modelo de popularidad del público</h2>
          <p class="wiki-lead">Calcula qué números está comprando masivamente el público hondureño en este momento. Cuanto más popular, más lo evita la operadora.</p>

          <h3>De qué se nutre el modelo</h3>
          <p>Cuatro fuentes de popularidad:</p>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--warn">
              <strong>1. Cadenas semánticas activas</strong>
              <span>15 cadenas culturales (mujer/madre, muerte, boda, animales, fiesta, aves, vejez, dinero, armas, infierno, cocina, naturaleza, joyería, religión, transporte). Si cae un número de la cadena, el público sale a comprar el resto.</span>
            </div>
            <div class="wiki-state wiki-state--warn">
              <strong>2. Saladitos estéticos</strong>
              <span>Dobles populares (11, 22, 33, 55, 66, 77, 88, 99 — el 44 está excluido por ti), redondos (terminan en 0) y múltiplos de 5. El público los adora porque son "bonitos".</span>
            </div>
            <div class="wiki-state wiki-state--warn">
              <strong>3. Piso cultural (terminales bajos + fechas + clásicos)</strong>
              <span>Terminales 00–09 (sueños básicos: agua, dinero, muerto…), días del mes 01–31 (la gente apuesta cumpleaños), y clásicos del jugador (07, 13, 22, 33, 50, 69, 77, 99). Sin este piso el modelo confundía números HIPER-jugados con "fríos libres".</span>
            </div>
            <div class="wiki-state wiki-state--warn">
              <strong>4. Activaciones recientes</strong>
              <span>~60 reglas trigger→targets extraídas de tus respuestas. Ej.: si cae el 03, dispara la cadena muerte; si cae el 37, dispara dinero.</span>
            </div>
            <div class="wiki-state wiki-state--muted">
              <strong>5. Supersticiones evitadas</strong>
              <span>Algunos números (como 22 y 66) son evitados culturalmente — bajan en popularidad.</span>
            </div>
          </div>

          <h3>Cómo se traduce a peso adversarial</h3>
          <p>Cada número recibe un score de popularidad de 0 a 100. Ese score se convierte en factor multiplicativo:</p>
          <div class="wiki-example">
            · <strong>Popularidad 0</strong>   → factor <strong>1.35×</strong> (libre, la operadora puede pagarlo)<br>
            · <strong>Popularidad 50</strong>  → factor <strong>1.00×</strong> (neutral)<br>
            · <strong>Popularidad 100</strong> → factor <strong>0.65×</strong> (caliente, la operadora lo evita)
          </div>

          <h3>Lo que ves en el panel</h3>
          <ul>
            <li><strong>🔗 Cadena X activa</strong> (ámbar) — los disparadores cayeron recientemente, estos son los targets que el público espera.</li>
            <li><strong>🔥 Mercado caliente</strong> (naranja) — top 8 más populares ahora mismo. La operadora los evita.</li>
            <li><strong>🛑 Reprimidos</strong> (naranja oscuro) — populares Y con ausencia anómala (≥14 días sin caer + score ≥55). Estos son los que el público sí compra pero el operador retiene activamente. <em>NO son "más probables" — son candidatos a explosión cuando la represión termine, pero mientras dure es probable que sigan retenidos.</em></li>
            <li><strong>❄️ Zona fría real</strong> (verde) — popularidad baja real (score ≤50). El público no los compra mucho, así que la operadora no tiene motivo para retenerlos. Pero "no retenidos" tampoco significa "más probables" automáticamente — solo significa que no son adversariales.</li>
          </ul>

          <h3>El bug conceptual que se corrigió</h3>
          <p>Antes existía un único panel "💎 Números libres — más probables" que mezclaba dos cosas muy distintas:</p>
          <ul>
            <li><strong>Fríos reales</strong> (popularidad baja) — neutros adversarialmente.</li>
            <li><strong>Reprimidos</strong> (popularidad alta + ausencia anómala) — la operadora los está conteniendo.</li>
          </ul>
          <p>Etiquetar a los reprimidos como "más probables porque nadie los juega" era falso: la gente sí los juega, por eso están reprimidos. Ahora se separan en paneles distintos para que la lectura sea correcta.</p>

          <h3>Por qué es importante</h3>
          <p>Un número con buen score Markov o buen rezago, pero con popularidad alta, no es buen candidato — porque la operadora hará lo posible por evitarlo. El modelo ajusta el ranking final por este factor.</p>
        `,
      },
      {
        id: "adv-variantes",
        categoria: "Sistema adversarial",
        titulo: "🔁 Motor de variantes — sustituciones matemáticas",
        contenido: `
          <h2>Motor de variantes</h2>
          <p class="wiki-lead">Cuando un número está caliente o acaba de caer, La Diaria a menudo no lo paga. En su lugar, tira una <em>variante</em> matemática: conversión, equivalencia o espejo.</p>

          <h3>Las reglas matemáticas oficiales</h3>
          <div class="wiki-example">
            <strong>Conversión:</strong> 0↔1 · 2↔5 · 3↔8 · 4↔7 · 6↔9<br>
            <strong>Equivalencia:</strong> 0↔5 · 1↔6 · 2↔7 · 3↔8 · 4↔9<br>
            <strong>Espejo:</strong> invierte los dos dígitos (23 ↔ 32)
          </div>

          <h3>Las 8 categorías de variantes</h3>
          <p>Para cada número semilla el motor genera todas las variantes posibles, cada una con un peso adversarial calibrado:</p>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok">
              <strong>Conversión simple decena/unidad — peso 0.95</strong>
              <span>Solo se cambia un dígito. Es la sustitución más reconocible.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Conversión compuesta — peso 0.85</strong>
              <span>Ambos dígitos se convierten. Ej.: 23 → 58.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Espejo de compuesta — peso 0.70</strong>
              <span>La conversión compuesta y luego invertir. Ej.: 23 → 85.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Equivalencia directa — peso 0.80</strong>
              <span>Ambos dígitos por equivalencia. Ej.: 23 → 78.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Espejo de equivalencia — peso 0.65</strong>
              <span>Equivalencia y luego invertir. Ej.: 23 → 87.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Espejo simple — peso 0.75</strong>
              <span>Solo invertir dígitos. Ej.: 23 → 32.</span>
            </div>
            <div class="wiki-state wiki-state--muted">
              <strong>Encadenado — peso 0.45</strong>
              <span>Composición: aplicar conversión y luego equivalencia (o viceversa). Más sutil, peso menor.</span>
            </div>
          </div>

          <h3>Las semillas que activan el motor</h3>
          <p>El motor trabaja sobre tres tipos de semillas, con pesos decrecientes:</p>
          <ul>
            <li><strong>Último número</strong> (peso 1.0) — la semilla más fuerte</li>
            <li><strong>Últimos 4 sorteos</strong> (peso 0.4–0.8) — contexto reciente</li>
            <li><strong>Top 4 calientes del mercado</strong> (peso 0.6) — lo que el público espera</li>
          </ul>

          <h3>Cómo se acumula</h3>
          <p>Si una variante aparece desde múltiples semillas (ej.: el 78 es variante simultánea del 23 y del 87), su peso se acumula con saturación suave (cap a 1.0). Cuanto más caminos llevan a un número, más alto su boost.</p>

          <h3>Lo que ves en el panel</h3>
          <ul>
            <li><strong>🔁 Semillas activas</strong> (morado fuerte) — los números que están "irradiando" variantes con sus pesos.</li>
            <li><strong>🔁 Variantes con mayor peso</strong> (morado suave) — top 10 sustituciones probables. El badge muestra el peso acumulado, la línea de motivo dice de qué semilla viene y qué tipo de transformación es.</li>
          </ul>

          <h3>Lectura práctica</h3>
          <p>Si ves <strong>78</strong> con badge <strong>87%</strong> y motivo <strong>"23→compuesta"</strong>, significa: el 23 cayó recientemente, su conversión compuesta es 78, y el sistema te dice que es muy probable que la operadora tire el 78 en lugar del 23 nuevo.</p>
        `,
      },
      {
        id: "adv-clusters",
        categoria: "Sistema adversarial",
        titulo: "🎯 Clusters de dígitos — cuando se mina un set pequeño",
        contenido: `
          <h2>Detector de clusters de dígitos</h2>
          <p class="wiki-lead">A veces La Diaria se "estanca" durante varios sorteos en un conjunto pequeño de dígitos. Si los últimos 12 sorteos solo usan 3-4 dígitos, hay un cluster activo y los próximos sorteos saldrán del mismo universo.</p>

          <h3>Ejemplo real</h3>
          <div class="wiki-example">
            <strong>Sorteos recientes:</strong> 09, 91, 16, 60, 61, 90, 06<br>
            <strong>Cluster detectado:</strong> {0, 1, 6, 9} — solo 4 dígitos cubren todos esos sorteos.<br>
            <strong>Universo combinatorio:</strong> 16 números posibles (00, 01, 06, 09, 10, 11, 16, 19, 60, 61, 66, 69, 90, 91, 96, 99).<br>
            <strong>Lectura:</strong> los siguientes sorteos probablemente saldrán de esos 16.
          </div>

          <h3>Cómo lo detecta el algoritmo</h3>
          <ol>
            <li>Toma los últimos 12 sorteos.</li>
            <li>Identifica qué dígitos aparecen al menos una vez (universo).</li>
            <li>Prueba <strong>todas las combinaciones</strong> de dígitos de tamaño 2 a 5.</li>
            <li>Para cada combinación, mide la <strong>cobertura</strong>: % de sorteos cuyos DOS dígitos están en el set.</li>
            <li>Reporta solo los clusters con cobertura ≥ <strong>65%</strong>.</li>
            <li>Filtra clusters dominados (si {0,1,6,9} captura lo mismo que {0,1,3,6,9}, gana el más pequeño).</li>
          </ol>

          <h3>El score</h3>
          <p>Cada cluster recibe un score que combina dos factores:</p>
          <div class="wiki-example">
            <strong>Score = cobertura × 0.7 + eficiencia × 0.3</strong><br>
            donde <em>eficiencia = 1 − (k/10)</em> (cluster pequeño = más eficiente)
          </div>
          <p>Un cluster con 90% de cobertura y solo 3 dígitos es mejor que uno con 70% de cobertura y 5 dígitos.</p>

          <h3>Cómo se usa en el motor</h3>
          <p>Los miembros del cluster reciben boost <strong>+0% a +40%</strong> sobre su score adversarial, escalado por el rank del cluster (el #1 pesa más que el #2 o #3).</p>

          <h3>Lo que ves en el panel</h3>
          <ul>
            <li><strong>🎯 Cluster #1 {0,1,6,9}</strong> (teal fuerte) — los sorteos recientes que cayeron del cluster.</li>
            <li><strong>Universo combinatorio</strong> (teal suave) — los 16 números que componen el cluster, todos candidatos.</li>
          </ul>
          <p>Se muestran hasta 3 clusters distintos, ordenados por score.</p>

          <h3>Cuándo confiar más</h3>
          <p>Si la cobertura es ≥ 80% con un cluster pequeño (k=2 o k=3), la señal es muy fuerte. Si la cobertura está cerca del umbral (65%) y el cluster es grande (k=5), trátalo como pista débil — puede ser ruido.</p>
        `,
      },
      {
        id: "adv-recuperacion",
        categoria: "Sistema adversarial",
        titulo: "🩹 Modo recuperación — el ciclo post super premio",
        contenido: `
          <h2>Modo recuperación post super premio</h2>
          <p class="wiki-lead">Después de pagar un super premio, La Diaria entra en una fase de "recuperación de caja" donde su comportamiento cambia. El sistema lo detecta y ajusta el motor.</p>

          <h3>Cuándo se activa</h3>
          <p>El modo se activa automáticamente durante <strong>14 días</strong> después de cualquier fecha marcada como super premio en la sección de Super Premios. El banner rojo en el Panel del día te lo indica.</p>

          <h3>Decay temporal — la intensidad se atenúa</h3>
          <p>El boost no es plano durante los 14 días. Decae linealmente:</p>
          <div class="wiki-example">
            · Día 0  → intensidad <strong>100%</strong> (máximo efecto)<br>
            · Día 7  → intensidad <strong>50%</strong><br>
            · Día 14 → intensidad <strong>0%</strong> (modo se apaga solo)
          </div>
          <p>Esto refleja que el efecto del super premio se diluye con el tiempo. Sin decay, los últimos días del modo darían señales falsamente fuertes.</p>

          <h3>Dos señales distintas</h3>

          <h4>🫥 Escondidos pre-SP (verde)</h4>
          <p>Números que cayeron 3-7 días <strong>antes</strong> del super premio y NO han vuelto a caer desde. Hipótesis: la operadora los estaba "guardando" durante la fase de acumulación porque iban a ser parte del super premio.</p>
          <div class="wiki-example">
            <strong>Ejemplo:</strong> El 47 cayó 2 veces entre el día −7 y −3 antes del SP, y desde entonces no ha vuelto. El sistema lo marca como candidato natural a regresar — el operador lo "soltó" después del pago.
          </div>

          <h4>🔁 Repetidos post-SP (rojo)</h4>
          <p>Números que han caído 2 o más veces desde el super premio. La operadora insiste en ellos — probablemente porque tiene poco capital expuesto en esos números.</p>
          <p>El boost se escala por el número de repeticiones: más repeticiones = más boost.</p>

          <h3>Lo que ves en el panel</h3>
          <ul>
            <li><strong>Banner rojo</strong> en Panel del día indicando que el modo está activo, con días transcurridos y restantes.</li>
            <li><strong>🫥 Escondidos pre-SP</strong> (verde) — candidatos que el sistema cree que la operadora "soltará" pronto.</li>
            <li><strong>🔁 Repetidos post-SP</strong> (rojo) — números insistentes de esta fase.</li>
            <li>El header muestra <strong>día X/14 · intensidad Y%</strong>.</li>
          </ul>

          <h3>Cómo marcar un super premio</h3>
          <p>Ve a la sección "Super Premios" en el sidebar y marca con click la fecha del miércoles o sábado donde se pagó un super premio. El modo se activa automáticamente.</p>
        `,
      },
      {
        id: "adv-dominical",
        categoria: "Sistema adversarial",
        titulo: "☀️ Factor dominical — los domingos juegan diferente",
        contenido: `
          <h2>Factor adversarial dominical</h2>
          <p class="wiki-lead">Los domingos el volumen de juego de La Diaria es menor (menos ventanillas activas, menos tiempo, menos público). Eso cambia el cálculo de riesgo de la operadora.</p>

          <h3>La intuición</h3>
          <p>Cuando hay mucho volumen (entre semana), pagar un número popular es caro porque MUCHA gente lo compró. Cuando hay poco volumen (domingos), pagar el mismo número popular cuesta menos. Por eso la operadora se "relaja" un poco con los populares los domingos.</p>

          <h3>Cómo se aplica</h3>
          <p>Solo se activa cuando la fecha objetivo es <strong>domingo</strong> (día de la semana = 0). Para todos los números que recibieron penalty por popularidad caliente:</p>
          <div class="wiki-example">
            · Penalty original: −20% a −35% (popularidad alta)<br>
            · Compensación dominical: <strong>+18%</strong> sobre el score ajustado<br>
            · Resultado: el penalty queda en aprox. −5% a −20%
          </div>
          <p>Es un rebote que NO elimina el penalty — solo lo suaviza.</p>

          <h3>Cuándo ves el banner</h3>
          <p>Cuando el sistema detecta que la próxima fecha objetivo cae en domingo, aparece el banner amarillo <strong>"☀️ Factor dominical activo"</strong> con el número de candidatos afectados.</p>

          <h3>Lo que NO hace</h3>
          <ul>
            <li>No afecta el calendario adversarial.</li>
            <li>No afecta clusters ni variantes.</li>
            <li>No promueve números libres adicionalmente.</li>
            <li>Solo "perdona" parcialmente el penalty a populares calientes.</li>
          </ul>

          <h3>Por qué es importante</h3>
          <p>Sin este factor el motor sería demasiado pesimista los domingos sobre números populares que SÍ pueden caer porque la operadora tiene menor exposición ese día. Con el factor, los rankings dominicales reflejan la realidad de menor volumen.</p>
        `,
      },
      {
        id: "backtest",
        categoria: "Sistema adversarial",
        titulo: "🧪 Backtest — la prueba honesta de si el motor funciona",
        contenido: `
          <h2>Backtest del motor</h2>
          <p class="wiki-lead">Un sistema serio se mide a sí mismo. El backtest simula que el motor se corrió cada día desde el warmup, usando solo los datos disponibles HASTA ESE MOMENTO, y compara la predicción contra lo que realmente cayó al día siguiente.</p>

          <h3>Cómo funciona</h3>
          <ol>
            <li>Se ordenan todos los sorteos cronológicamente.</li>
            <li>Se reserva el "warmup" inicial (por defecto 300 sorteos) para que el modelo tenga base.</li>
            <li>Para cada sorteo posterior, se reconstruye el motor con la historia anterior y se obtiene un ranking 0–99.</li>
            <li>Se busca en qué posición del ranking quedó el número que efectivamente cayó.</li>
            <li>Se cuenta cuántas veces estuvo en top-5, top-10, top-20, top-30.</li>
          </ol>

          <h3>La métrica clave: lift</h3>
          <p>El <strong>lift</strong> compara la tasa de aciertos del motor contra el azar puro:</p>
          <div class="wiki-example">
            · Top-10 al azar: 10/100 = <strong>10%</strong> de hit-rate esperado<br>
            · Si el motor acierta 15 veces de cada 100 → 15% / 10% = <strong>1.5× lift</strong><br>
            · Lift &gt; 1.0 = mejor que azar · Lift = 1.0 = igual al azar · Lift &lt; 1.0 = peor
          </div>

          <h3>Cómo interpretar los resultados</h3>
          <ul>
            <li><strong>Lift ≥ 1.30</strong> en top-10 → ✅ señal real fuerte. El motor te da ventaja medible.</li>
            <li><strong>Lift 1.05–1.30</strong> → señal modesta. Útil como filtro, no como oráculo.</li>
            <li><strong>Lift 0.95–1.05</strong> → ⚠ ruido. El motor está al nivel del azar.</li>
            <li><strong>Lift &lt; 0.95</strong> → ❌ algo está mal calibrado. Las "señales" están metiendo ruido.</li>
          </ul>

          <h3>Limitaciones honestas</h3>
          <p>El backtest mide solo el <strong>núcleo determinista</strong> del motor: Markov O1 + O2, rezago/Poisson y popularidad adversarial. NO simula:</p>
          <ul>
            <li><code>evaluarModos</code> ni <code>detectarPatrones</code> (son async/DB-bound).</li>
            <li>Calendario adversarial completo (depende de fechas patrias).</li>
            <li>Recovery mode (depende de eventos super premio).</li>
            <li>Variantes ni clusters (los podemos añadir en una v2 si el núcleo demuestra ventaja).</li>
          </ul>
          <p>Eso significa que si el backtest da lift bajo, no quiere decir que el motor en producción no funcione, sino que las partes núcleo no rinden. Si esas partes no rinden, las partes adicionales tampoco van a salvarlo.</p>

          <h3>Por año</h3>
          <p>El reporte separa el lift por año. Si el lift es alto en años recientes pero bajo en 2015, significa que el comportamiento del operador cambió y el modelo se adapta mejor a la dinámica actual. Si es alto en 2015 y bajo ahora, el modelo está sobreajustado al pasado.</p>

          <h3>Fuentes que más contribuyen</h3>
          <p>Cuando el actual cae en top-10, se suman las contribuciones de cada fuente de señal (markov1, markov2, rezago…). Esto te dice cuáles componentes del motor están aportando aciertos reales y cuáles solo aportan ruido.</p>

          <h3>Por qué es importante</h3>
          <p>Sin backtesting, ambos estaríamos adivinando si el sistema funciona. Con backtesting, sabemos. El motor cambia constantemente: cada vez que agreguemos una técnica nueva, hay que volver a correr el backtest y verificar que el lift no bajó. Si bajó, esa técnica nueva está metiendo ruido y se descarta.</p>
        `,
      },
      // ── Estadística y verificación ──────────────────────────────────────────
      {
        id: "hipotesis-vs-afirmacion",
        categoria: "Estadística y verificación",
        titulo: "Hipótesis vs. afirmación — por qué el sistema no te cree",
        contenido: `
          <h2>Hipótesis vs. afirmación</h2>
          <p class="wiki-lead">El sistema trata todo lo que el jugador o el analista afirman como una <strong>hipótesis a falsificar</strong>, no como una verdad. Esta es la regla más importante del Verificador estadístico.</p>

          <h3>¿Por qué no creerte?</h3>
          <p>Las observaciones humanas sobre La Diaria llegan de dos fuentes problemáticas:</p>
          <div class="wiki-example">
            <strong>1. Ingreso manual de datos</strong> — quien carga los sorteos uno a uno desarrolla inevitablemente la sensación de ver patrones que el azar normal produciría de todas formas.<br><br>
            <strong>2. Boca a boca entre jugadores</strong> — los "pronosticadores" con años de experiencia comparten observaciones que se viralizan, pero ninguna ha sido verificada estadísticamente con todos los datos.
          </div>
          <p>Ambas fuentes producen <em>sesgo de confirmación</em>: recordamos los casos donde el patrón se cumplió y olvidamos los que no.</p>

          <h3>Lo que hace el sistema</h3>
          <p>Convierte la afirmación en una hipótesis estadística, aplica una prueba objetiva (chi-cuadrado, correlación de Pearson, entropía), y devuelve un veredicto con evidencia:</p>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok"><strong>CONFIRMADO</strong><span>La prueba estadística supera el umbral de significancia. El patrón es real en los datos.</span></div>
            <div class="wiki-state wiki-state--warn"><strong>TENDENCIA</strong><span>Hay una señal pero los datos aún no son suficientes para confirmar con certeza.</span></div>
            <div class="wiki-state wiki-state--muted"><strong>SIN EFECTO</strong><span>Los datos no muestran evidencia del patrón. La percepción es probablemente sesgo.</span></div>
          </div>

          <h3>Principio general</h3>
          <p>Si el sistema devuelve "Sin efecto", no significa que el jugador esté equivocado — significa que los datos actuales no tienen suficiente evidencia. Se necesitan más datos o la afirmación simplemente no es cierta.</p>
        `,
      },
      {
        id: "chi-cuadrado",
        categoria: "Estadística y verificación",
        titulo: "Chi-cuadrado (χ²) — ¿La distribución es uniforme?",
        contenido: `
          <h2>Chi-cuadrado (χ²)</h2>
          <p class="wiki-lead">Prueba si una distribución de frecuencias se aleja significativamente de lo que esperaría el azar puro. Es la herramienta principal del Verificador estadístico.</p>

          <h3>El concepto en simple</h3>
          <p>Si La Diaria fuera completamente aleatoria, cada uno de los 100 números debería aparecer con la misma frecuencia. El χ² mide qué tan lejos está la distribución real de esa uniformidad perfecta.</p>

          <div class="wiki-example">
            <strong>Ejemplo:</strong> En 300 sorteos de diciembre, el número 07 apareció 12 veces y el 54 apareció 0 veces. Lo esperado por azar sería 3 veces cada uno.<br>
            Esas desviaciones se suman (al cuadrado, normalizadas) para todos los 100 números → ese total es el χ².
          </div>

          <h3>Cómo interpretar el valor</h3>
          <p>El χ² tiene 99 grados de libertad (100 números − 1). Los umbrales para este sistema son:</p>
          <div class="wiki-example">
            χ² &gt; 123.2 → <strong>p &lt; 0.05</strong> — resultado improbable por azar (1 en 20)<br>
            χ² &gt; 135.8 → <strong>p &lt; 0.01</strong> — muy improbable por azar (1 en 100)<br>
            χ² &gt; 149.5 → <strong>p &lt; 0.001</strong> — extremadamente improbable (1 en 1000)
          </div>
          <p>Si el χ² está por debajo de estos umbrales, la distribución es estadísticamente compatible con el azar — no hay evidencia de patrón real.</p>

          <h3>Limitación importante</h3>
          <p>El χ² necesita suficientes datos. Con menos de ~50 sorteos en el período analizado, los resultados no son confiables aunque el número parezca alto.</p>
        `,
      },
      {
        id: "p-valor",
        categoria: "Estadística y verificación",
        titulo: "p-valor — ¿Qué tan improbable es esto por azar?",
        contenido: `
          <h2>p-valor (nivel de significancia)</h2>
          <p class="wiki-lead">El p-valor responde: <em>"Si La Diaria fuera completamente aleatoria, ¿qué tan probable sería observar esta distribución tan extrema?"</em></p>

          <h3>Cómo leerlo</h3>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok"><strong>p &lt; 0.05</strong><span>Hay menos de 5% de probabilidad de que sea azar. Resultado significativo. El patrón probablemente es real.</span></div>
            <div class="wiki-state wiki-state--warn"><strong>p &lt; 0.10</strong><span>Hay menos de 10% de probabilidad de que sea azar. Tendencia, pero no conclusiva.</span></div>
            <div class="wiki-state wiki-state--muted"><strong>p &gt; 0.10</strong><span>Más de 10% de probabilidad de que sea azar. No hay evidencia estadística del patrón.</span></div>
          </div>

          <h3>El error común</h3>
          <p>Un p-valor bajo NO dice "el patrón es grande o importante". Solo dice que el patrón es estadísticamente real, no producto del azar. Un patrón puede ser real pero pequeño (inútil para jugar) o puede ser grande pero con pocos datos (no confiable).</p>

          <h3>En el sistema</h3>
          <p>El Verificador estadístico muestra el p-valor calculado a partir del chi-cuadrado con 99 grados de libertad. Los valores críticos están tabulados — no se calculan exactamente sino que se clasifican en categorías (p&lt;0.001, p&lt;0.01, p&lt;0.05, etc.).</p>
        `,
      },
      {
        id: "entropia-shannon",
        categoria: "Estadística y verificación",
        titulo: "Entropía de Shannon — ¿Qué tan predecible es un período?",
        contenido: `
          <h2>Entropía de Shannon normalizada</h2>
          <p class="wiki-lead">Mide el <em>desorden</em> o <em>imprevisibilidad</em> de una distribución. Es la base del <strong>Índice ROBOTELSA</strong> que identifica meses o períodos donde La Diaria se vuelve más adversarial.</p>

          <h3>La intuición</h3>
          <p>Imagina dos casos extremos:</p>
          <div class="wiki-example">
            <strong>Entropía = 0 (mínima):</strong> Un solo número cae en todos los sorteos. Distribución completamente concentrada. Máxima predecibilidad (pero también máxima anomalía).<br><br>
            <strong>Entropía = 1 (máxima):</strong> Todos los 100 números aparecen exactamente con la misma frecuencia. Distribución perfectamente uniforme. Azar puro — imposible predecir.
          </div>
          <p>En la práctica, los valores de La Diaria oscilan entre 0.90 y 0.99. Las diferencias pequeñas entre meses son significativas.</p>

          <h3>Fórmula</h3>
          <p>H = −Σ p·log₂(p) / log₂(100)</p>
          <p>Donde p es la frecuencia relativa de cada número. El resultado se normaliza dividiéndolo por log₂(100) para que quede en el rango [0, 1].</p>

          <h3>Cómo usarlo</h3>
          <p>En el Índice ROBOTELSA, meses con entropía <em>más baja que el promedio</em> son períodos donde pocos números concentran los sorteos — más fácil de analizar. Meses con entropía <em>más alta</em> son caóticos — el sistema parece dispersar los resultados intencionalmente.</p>
        `,
      },
      {
        id: "z-score",
        categoria: "Estadística y verificación",
        titulo: "Z-score — ¿Qué tan anómala es la frecuencia de un número?",
        contenido: `
          <h2>Z-score por número</h2>
          <p class="wiki-lead">Mide en unidades de desviación estándar qué tan lejos está la frecuencia real de un número respecto de lo esperado por azar.</p>

          <h3>Fórmula</h3>
          <p>z = (observado − esperado) / √esperado</p>
          <p>Donde "esperado" es total_sorteos / 100 (distribución uniforme sobre 100 números).</p>

          <div class="wiki-example">
            <strong>Ejemplo:</strong> En 500 sorteos de enero, el número 33 apareció 12 veces.<br>
            Esperado = 500 / 100 = 5<br>
            z = (12 − 5) / √5 = 7 / 2.24 = <strong>+3.1</strong><br>
            Eso significa que el 33 apareció 3.1 desviaciones estándar por encima de lo normal en enero.
          </div>

          <h3>Umbrales de interpretación</h3>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok"><strong>|z| ≥ 2.0</strong><span>Sobre-representado o sub-representado de forma notable. Vale la pena considerar.</span></div>
            <div class="wiki-state wiki-state--warn"><strong>1.3 ≤ |z| &lt; 2.0</strong><span>Anomalía leve. Tendencia a vigilar pero no estadísticamente fuerte.</span></div>
            <div class="wiki-state wiki-state--muted"><strong>|z| &lt; 1.3</strong><span>Dentro del rango normal del azar. Sin señal relevante.</span></div>
          </div>

          <h3>En el sistema</h3>
          <p>El Verificador estacional muestra los números con mayor |z| por mes. En el mapa de calor, chips en rojo son números con z alto (sobre-representados ese mes); chips en azul tienen z bajo (sub-representados).</p>
        `,
      },
      {
        id: "pearson-r",
        categoria: "Estadística y verificación",
        titulo: "Correlación de Pearson (r) — ¿Dos períodos se parecen?",
        contenido: `
          <h2>Correlación de Pearson entre distribuciones</h2>
          <p class="wiki-lead">Mide qué tan similares son las distribuciones de frecuencias de dos períodos distintos. Se usa para detectar si La Diaria "cambia de sistema" de un año a otro.</p>

          <h3>Cómo funciona aquí</h3>
          <p>Para cada número (0–99), se calcula su frecuencia relativa en el período A y en el período B. Pearson mide la correlación entre esos 100 pares de valores.</p>

          <div class="wiki-example">
            <strong>r cercano a 1:</strong> Las distribuciones son casi idénticas. Los mismos números son frecuentes en ambos años.<br><br>
            <strong>r cercano a 0:</strong> Las distribuciones son independientes. Los patrones de un año no se repiten en el otro.<br><br>
            <strong>r negativo:</strong> Lo que era frecuente en un año tiende a ser raro en el otro (inversión de patrones).
          </div>

          <h3>Interpretación en el Verificador</h3>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok"><strong>r promedio &lt; 0.25</strong><span>Baja correlación entre años consecutivos → La Diaria cambia significativamente de año en año. Hipótesis CONFIRMADA.</span></div>
            <div class="wiki-state wiki-state--warn"><strong>0.25 ≤ r &lt; 0.55</strong><span>Correlación moderada → hay cambios pero también continuidad. Hipótesis en TENDENCIA.</span></div>
            <div class="wiki-state wiki-state--muted"><strong>r ≥ 0.55</strong><span>Alta correlación → los patrones son relativamente estables entre años. Hipótesis SIN EFECTO.</span></div>
          </div>
        `,
      },
      {
        id: "robotelsa",
        categoria: "Estadística y verificación",
        titulo: "ROBOTELSA — el sobrenombre de diciembre y recuperaciones",
        contenido: `
          <h2>ROBOTELSA</h2>
          <p class="wiki-lead">Sobrenombre popular que los jugadores de La Diaria le dan a LOTELHSA durante diciembre y los períodos de recuperación post-Super Premio, cuando incluso los pronosticadores con años de experiencia fallan consistentemente.</p>

          <h3>El origen</h3>
          <p>La combinación de "ROBO" + "LOTELHSA" refleja la percepción de que en ciertos períodos el sistema parece actuar de forma mecánica y adversarial: evitando los números más esperados, repitiendo combinaciones inusuales, y comportándose de una forma que "ningún humano predice".</p>

          <h3>¿Es real o sesgo?</h3>
          <p>Aquí entra el Verificador estadístico. La percepción del ROBOTELSA se viraliza por boca a boca y es amplificada por el sesgo de confirmación: recordamos los meses de diciembre malos y olvidamos los normales. El sistema verifica con chi-cuadrado si la distribución de diciembre realmente difiere de los demás meses.</p>

          <h3>Índice ROBOTELSA</h3>
          <p>El sistema calcula una medida objetiva del "efecto ROBOTELSA" usando ventanas deslizantes de 30 sorteos y calculando la entropía de Shannon de cada ventana. Un índice bajo (entropía baja) indica que el período es más predecible; un índice alto indica dispersión caótica — el comportamiento adversarial percibido por los jugadores.</p>

          <h3>Dónde verlo</h3>
          <p>En el panel <strong>Verificador estadístico → Índice ROBOTELSA</strong>. Las barras muestran la entropía promedio por mes. Los meses por encima del promedio global (línea punteada) son los más "robóticos" según los datos.</p>
        `,
      },
      {
        id: "indice-robotelsa",
        categoria: "Estadística y verificación",
        titulo: "Índice ROBOTELSA — entropía mensual por ventana deslizante",
        contenido: `
          <h2>Índice ROBOTELSA (técnico)</h2>
          <p class="wiki-lead">Métrica cuantitativa que calcula la entropía de Shannon en ventanas deslizantes de 30 sorteos y agrupa los resultados por mes del año.</p>

          <h3>Cómo se calcula</h3>
          <ol>
            <li>Se ordenan todos los sorteos cronológicamente.</li>
            <li>Se avanzan ventanas de 30 sorteos en pasos de ~7 sorteos (1/4 de la ventana).</li>
            <li>Para cada ventana se calcula la entropía normalizada de Shannon.</li>
            <li>Cada entropía se asigna al mes del último sorteo de esa ventana.</li>
            <li>Se promedian todas las entropías de cada mes → valor del índice por mes.</li>
          </ol>

          <h3>El índice relativo</h3>
          <p>El valor que se muestra en el panel es la <em>desviación porcentual respecto al promedio global</em>:</p>
          <div class="wiki-example">
            Si el promedio global es 0.9500 y diciembre tiene 0.9617, el índice relativo de diciembre es:<br>
            (0.9617 − 0.9500) / 0.9500 × 100 = <strong>+1.2%</strong><br>
            Diciembre está 1.2% por encima del promedio global → más caótico.
          </div>

          <h3>Interpretación</h3>
          <p>Un índice positivo significa que ese mes tiende a ser más disperso/caótico que el promedio anual. Un índice negativo significa que ese mes tiende a concentrarse en menos números — más predecible, o al menos más estructurado.</p>
        `,
      },
      {
        id: "pool-historico",
        categoria: "Estadística y verificación",
        titulo: "Pool histórico — candidatos de recuperación basados en SP anteriores",
        contenido: `
          <h2>Pool histórico de recuperación</h2>
          <p class="wiki-lead">Conjunto de números que aparecieron en períodos de recuperación de Super Premios anteriores. Sirve como "universo de candidatos" para el ciclo de recuperación actual.</p>

          <h3>Construcción del pool</h3>
          <p>Para cada Super Premio registrado en el historial (excepto el actual):</p>
          <ol>
            <li>Se toman los sorteos de los 14 días siguientes al pago del SP.</li>
            <li>Se extraen todos los números únicos que cayeron en esa ventana.</li>
            <li>La unión de todos esos números forma el pool histórico.</li>
          </ol>
          <p>Típicamente el pool contiene entre 60 y 80 números únicos sobre 100 posibles.</p>

          <h3>Candidatos aún sin caer</h3>
          <p>De ese pool, el panel muestra los números que <em>todavía no han aparecido</em> en el ciclo de recuperación actual. Son candidatos porque el historial sugiere que suelen aparecer en este tipo de períodos.</p>

          <h3>Importante</h3>
          <p>El pool es grande por construcción — no es una lista de 10 números seleccionados. La utilidad está en los <strong>candidatos que no han caído aún</strong> y en el <strong>hit-tracker</strong> que valida si el pool está siendo efectivo en el ciclo actual.</p>
        `,
      },
      {
        id: "hit-tracker",
        categoria: "Estadística y verificación",
        titulo: "Hit-tracker — validación estadística del pool de candidatos",
        contenido: `
          <h2>Hit-tracker</h2>
          <p class="wiki-lead">Mide qué tan efectivo está siendo el pool histórico en el ciclo de recuperación actual, comparándolo contra la <strong>línea base de azar</strong>.</p>

          <h3>Qué mide</h3>
          <p>Para cada día del período de recuperación actual:</p>
          <ul>
            <li>¿El número que cayó ese día estaba en el pool histórico?</li>
            <li>Suma los días con al menos un hit.</li>
            <li>Divide entre el total de días del período → <strong>tasa de acierto actual</strong>.</li>
          </ul>

          <h3>Línea base de azar</h3>
          <p>Si el pool tiene N números, la probabilidad de que al menos uno de los 2 sorteos diarios (sin reposición) sea del pool es:</p>
          <div class="wiki-example">
            P(≥1 hit) = 1 − ((100−N) × (99−N)) / (100 × 99)
          </div>
          <p>Esta es la línea base: lo que conseguiría una estrategia aleatoria con ese pool del mismo tamaño. Si el hit-tracker supera esta línea, el pool tiene valor predictivo real.</p>

          <h3>Ciclos históricos</h3>
          <p>El tracker también calcula retroactivamente la tasa de acierto para cada SP anterior, mostrando la consistencia del pool a través del tiempo. Si la tasa histórica promedio está sistemáticamente por encima de la línea base, el pool tiene evidencia estadística de utilidad.</p>

          <h3>Cómo leerlo en el panel</h3>
          <p>Las barras de cada ciclo muestran la tasa de acierto (azul) vs la línea base de azar (gris punteada). La barra se vuelve verde cuando supera la línea base. El promedio histórico aparece como un badge arriba del tracker.</p>
        `,
      },
      {
        id: "linea-base-azar",
        categoria: "Estadística y verificación",
        titulo: "Línea base de azar — referencia para evaluar el pool",
        contenido: `
          <h2>Línea base de azar</h2>
          <p class="wiki-lead">La probabilidad teórica mínima que tendría cualquier pool del mismo tamaño <em>elegido al azar</em>. Es el umbral que debe superar el pool histórico para tener valor real.</p>

          <h3>La pregunta que responde</h3>
          <p><em>"Si yo eligiera N números al azar entre 100, ¿cuántos días esperaría que alguno de ellos cayera en los 2 sorteos del día?"</em></p>

          <h3>Fórmula</h3>
          <div class="wiki-example">
            P(al menos 1 hit en 2 sorteos sin reposición) = 1 − ((100−N) × (99−N)) / (100 × 99)
          </div>
          <p>Donde N es el tamaño del pool.</p>

          <div class="wiki-example">
            <strong>Ejemplo:</strong> Si el pool tiene 70 números:<br>
            P(hit) = 1 − (30 × 29) / (100 × 99) = 1 − 870/9900 = 1 − 0.088 = <strong>91.2%</strong><br>
            Con 70 números, hasta el azar puro acertaría el 91% de los días. Para que el pool sea útil, su tasa real debe superar notablemente ese umbral.
          </div>

          <h3>Por qué importa</h3>
          <p>Sin esta referencia, un pool de 80 números con 85% de acierto parecería impresionante — pero el azar puro con 80 números aleatorios lograría ~93%. La línea base convierte porcentajes absolutos en información útil.</p>
        `,
      },
      {
        id: "candidatos-estacionales",
        categoria: "Estadística y verificación",
        titulo: "Candidatos estacionales — números recurrentes en el mismo mes",
        contenido: `
          <h2>Candidatos estacionales</h2>
          <p class="wiki-lead">Números que aparecen en el mismo mes calendario en <strong>al menos 2 años distintos</strong> del historial. Son candidatos con señal de estacionalidad.</p>

          <h3>La lógica detrás</h3>
          <p>Si el número 45 aparece todos los meses de marzo sin importar el año, eso podría ser coincidencia o podría ser un patrón real. El Verificador año-vs-año detecta estos números y los separa de los que solo aparecen de forma aislada.</p>

          <h3>Cómo se identifican</h3>
          <ol>
            <li>Se agrupan los sorteos por mes y por año.</li>
            <li>Para el mes seleccionado, se construye la frecuencia de cada número por año.</li>
            <li>Los números presentes en ≥2 años distintos son "recurrentes" (candidatos estacionales).</li>
            <li>Se ordenan por número de años en que aparecieron, luego por frecuencia total.</li>
          </ol>

          <h3>Dónde verlos</h3>
          <p>En <strong>Verificador estadístico → Año vs. Año</strong>. Selecciona el mes que te interesa y verás la tabla comparativa por año más el panel de candidatos estacionales con chips marcados en color.</p>

          <h3>Caveat</h3>
          <p>Un candidato estacional recurrente en 2 de 3 años disponibles puede ser azar puro. Con 5+ años de historial, la señal se vuelve mucho más sólida. El panel muestra cuántos años lo respaldan para que puedas evaluarlo.</p>
        `,
      },
      {
        id: "verificador-estadistico",
        categoria: "Estadística y verificación",
        titulo: "Verificador estadístico — el panel de hipótesis",
        contenido: `
          <h2>Verificador estadístico</h2>
          <p class="wiki-lead">Panel dedicado a verificar con evidencia estadística las afirmaciones más comunes sobre el comportamiento de La Diaria, en lugar de asumir que son verdad.</p>

          <h3>Las 3 hipótesis que verifica</h3>
          <div class="wiki-example">
            <strong>1. "Diciembre es diferente — el mes del ROBOTELSA"</strong><br>
            Prueba: chi-cuadrado de los sorteos de diciembre vs distribución uniforme.<br><br>
            <strong>2. "Los períodos post-SP usan una distribución diferente"</strong><br>
            Prueba: chi-cuadrado de períodos de recuperación + correlación de Pearson entre recuperación y período normal.<br><br>
            <strong>3. "La Diaria cambia su sistema de año en año"</strong><br>
            Prueba: correlación de Pearson promedio entre años consecutivos.
          </div>

          <h3>Los 4 sub-paneles</h3>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--ok"><strong>Verificación de afirmaciones</strong><span>Veredicto (CONFIRMADO / TENDENCIA / SIN EFECTO) con evidencia y números sobre/bajo-representados.</span></div>
            <div class="wiki-state wiki-state--ok"><strong>Mapa estacional</strong><span>Chi-cuadrado y entropía mes a mes. Cada mes coloreado según su nivel de atipicidad.</span></div>
            <div class="wiki-state wiki-state--ok"><strong>Índice ROBOTELSA</strong><span>Entropía de Shannon por mes en ventanas deslizantes de 30 sorteos.</span></div>
            <div class="wiki-state wiki-state--ok"><strong>Año vs. Año</strong><span>Comparación por mes entre diferentes años. Candidatos estacionales recurrentes.</span></div>
          </div>

          <h3>Principio fundamental</h3>
          <p>El Verificador está diseñado para ser escéptico por defecto. Si los datos no son suficientes o no muestran evidencia clara, devuelve "Sin efecto" o "Datos insuficientes" — nunca inventa un patrón para satisfacer una expectativa.</p>
        `,
      },
      // ── Referencia ───────────────────────────────────────────────────────────
      {
        id: "guia-suenos",
        categoria: "Referencia",
        titulo: "Guía de los sueños — símbolos y familias",
        contenido: `
          <h2>Guía de los sueños</h2>
          <p class="wiki-lead">El diccionario de los 100 números de La Diaria. Cada número tiene un símbolo, una familia y una polaridad.</p>

          <h3>Qué es la familia</h3>
          <p>Agrupa números por categoría simbólica: Naturaleza, Personas, Animales, Objetos, etc. El motor usa las familias para penalizar números cuando su familia ya apareció recientemente.</p>

          <h3>Qué es la polaridad</h3>
          <p>Indica si el número se asocia a energía positiva, negativa o neutra según la tradición del juego. El motor la usa como señal de contexto para el análisis de Escenarios.</p>

          <h3>Las imágenes</h3>
          <p>Cada número tiene una imagen ilustrativa guardada en <code>data/img/</code>. Aparecen en las cards del panel Escenarios, en el historial y en la guía visual. Si un número no tiene imagen todavía, simplemente no se muestra.</p>
        `,
      },
      // ── Módulos de inteligencia adversarial (Sprints 1-7) ─────────────────
      {
        id: "conversiones",
        categoria: "Conversiones y variantes",
        titulo: "Conversiones, equivalencias y variantes matemáticas",
        contenido: `
          <h2>Conversiones y variantes matemáticas</h2>
          <p class="wiki-lead">El sistema conoce el "vocabulario" matemático de La Diaria: cuando no quiere pagar un número, tira uno <em>relacionado</em>. Aquí están todas las relaciones que el sistema calcula.</p>

          <h3>Las dos reglas base</h3>
          <div class="wiki-example">
            <strong>CONVERSIÓN:</strong> &nbsp;0↔1 &nbsp; 2↔5 &nbsp; 3↔8 &nbsp; 4↔7 &nbsp; 6↔9<br>
            <strong>EQUIVALENCIA:</strong> 0↔5 &nbsp; 1↔6 &nbsp; 2↔7 &nbsp; 3↔8 &nbsp; 4↔9
          </div>
          <p>Nota: 3↔8 aparece en <em>ambas</em> tablas — es la única relación compartida.</p>

          <h3>Las 8 categorías de variante</h3>
          <table class="wiki-table">
            <thead><tr><th>Tipo</th><th>Operación</th><th>Peso</th><th>Ejemplo desde 80 ☕ Café</th></tr></thead>
            <tbody>
              <tr><td>Conversión simple decena</td><td>Solo convierte el dígito izquierdo</td><td>0.95</td><td>80 → <strong>30</strong> 🎳 Bolo (8→3)</td></tr>
              <tr><td>Conversión simple unidad</td><td>Solo convierte el dígito derecho</td><td>0.95</td><td>80 → <strong>81</strong> 🚂 Rieles (0→1)</td></tr>
              <tr><td>Conversión compuesta</td><td>Convierte ambos dígitos</td><td>0.85</td><td>80 → <strong>31</strong> 🦂 Alacrán (8→3, 0→1)</td></tr>
              <tr><td>Equivalencia directa</td><td>Equivalencia en ambos dígitos</td><td>0.80</td><td>80 → <strong>35</strong> 🕍 Virgen (8↔3, 0↔5)</td></tr>
              <tr><td>Espejo simple</td><td>Invierte los dos dígitos</td><td>0.75</td><td>80 → <strong>08</strong> 🐇 Conejo</td></tr>
              <tr><td>Espejo de compuesta</td><td>Espejo del número convertido compuesto</td><td>0.70</td><td>80 → <strong>13</strong> 🐱 Gato (espejo del 31)</td></tr>
              <tr><td>Espejo de equivalencia</td><td>Espejo del número equivalente</td><td>0.65</td><td>80 → <strong>53</strong> 🛞 Llanta (espejo del 35)</td></tr>
              <tr><td>Encadenado</td><td>Dos transformaciones seguidas</td><td>0.45</td><td>80→31→<strong>86</strong> ⌚ Reloj, 80→35→<strong>82</strong> 🏫 Escuela</td></tr>
            </tbody>
          </table>

          <h3>¿Qué son los encadenados?</h3>
          <p>Son transformaciones de segundo nivel: se aplica una conversión sobre el resultado de otra conversión. Por ejemplo:</p>
          <div class="wiki-example">
            <strong>80</strong> → conversión compuesta → <strong>31</strong> → equivalencia directa → <strong>86</strong> ⌚ Reloj<br>
            <strong>80</strong> → equivalencia directa → <strong>35</strong> → conversión compuesta → <strong>82</strong> 🏫 Escuela
          </div>
          <p>La hipótesis: cuando La Diaria "disfrazó" un número dos veces seguidas, el encadenado es el resultado. Tienen el peso más bajo (0.45) porque son menos frecuentes en la práctica.</p>

          <h3>Los relativos oficiales</h3>
          <p>Además de las variantes matemáticas, el sistema tiene un catálogo de <em>relativos</em> — pares establecidos por la tradición del juego, no por fórmula. Son relaciones semánticas o culturales.</p>
          <div class="wiki-example">
            <strong>80 ☕ Café</strong> tiene como relativos oficiales:<br>
            &nbsp;· <strong>27</strong> 🎮 Juego<br>
            &nbsp;· <strong>61</strong> ⚔️ Guerra
          </div>
          <p>Estos relativos están guardados en <code>data/relativos_diaria.json</code> y tienen el peso más alto (0.95) porque son las relaciones más directas del juego.</p>
        `,
      },
      {
        id: "presion-publica",
        categoria: "Sistema adversarial",
        titulo: "🌡️ Presión pública — lo que el público espera y La Casa evita",
        contenido: `
          <h2>Presión pública</h2>
          <p class="wiki-lead">La presión de un número es una estimación de <em>cuánta gente lo está comprando ahora mismo</em>. Cuanto más alta, más lo evita La Diaria.</p>

          <h3>Por qué no se mide directamente</h3>
          <p>No hay acceso al volumen real de ventas. El sistema <em>infiere</em> la presión pública a partir de señales observables en el historial:</p>
          <div class="wiki-states">
            <div class="wiki-state wiki-state--warn">
              <strong>Gap largo sin caer</strong>
              <span>Si un número lleva más de 2.2× su ciclo promedio sin aparecer, el público lo sigue esperando. Presión alta.</span>
            </div>
            <div class="wiki-state wiki-state--warn">
              <strong>Es saladito</strong>
              <span>Dobles (11, 22…), redondos (10, 20…) y terminales en 5 siempre tienen presión base alta porque el público los adora.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Cayó hace poco</strong>
              <span>Si cayó en los últimos 5 días, la presión baja — el jugador "ya cobró" o dejó de esperarlo.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Se pagó la variante</strong>
              <span>Si La Casa tiró la variante del número, parte del público migró. Presión baja temporalmente.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Rebound de variante</strong>
              <span>Si la variante se pagó hace 3-10 sorteos (no ayer, pero tampoco olvidado), el directo recibe un boost de liberación. La Casa desvió la atención y ahora puede pagarlo sin que cueste tanto.</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Preferencia de turno</strong>
              <span>Si el número históricamente cae el 60%+ de las veces en un turno específico y es ese turno ahora, recibe presión ligeramente menor (señal de que La Casa puede aprovecharlo en ese momento).</span>
            </div>
            <div class="wiki-state wiki-state--ok">
              <strong>Cluster activo</strong>
              <span>Si La Casa está minando un conjunto de dígitos (ej: últimos 12 sorteos con muchos números de {0,1,6,9}), los números de ese cluster reciben presión reducida — son candidatos reales del patrón activo.</span>
            </div>
          </div>

          <h3>Cómo afecta al score</h3>
          <p>La presión se convierte en un <strong>factor multiplicativo adversarial</strong>:</p>
          <div class="wiki-example">
            · Presión 0.0 (libre) → factor <strong>1.50×</strong> — La Casa puede pagarlo tranquilo<br>
            · Presión 0.5 (media) → factor <strong>~0.90×</strong> — reducción moderada<br>
            · Presión 1.0 (máxima) → factor <strong>0.30×</strong> — La Casa lo evita activamente
          </div>

          <h3>Momento de liberación</h3>
          <p>Cuando la presión lleva tanto tiempo alta que el jugador se "cansa" de esperar y deja de comprar el número — ese es el <strong>momento de liberación</strong>. El sistema detecta ese punto (umbral de cansancio: 2.2× el ciclo) como la señal más fuerte para que el número finalmente caiga.</p>
        `,
      },
      {
        id: "secuencias",
        categoria: "Sistema adversarial",
        titulo: "🔗 Secuencias activas — cuando un número 'está corriendo'",
        contenido: `
          <h2>Secuencias activas</h2>
          <p class="wiki-lead">Una secuencia es una relación A→B que se detectó en el historial: después de que cayó A, suele aparecer B en los siguientes sorteos. El sistema las monitorea en tiempo real.</p>

          <h3>Cómo se detecta una secuencia</h3>
          <p>El sistema analiza cada sorteo contra los últimos 45 anteriores buscando si el número nuevo es variante, relativo o equivalente de alguno previo. Si el patrón se repitió suficientes veces históricamente, abre una "secuencia activa".</p>

          <h3>La proyección con distribución normal</h3>
          <p>Para cada secuencia activa, el sistema calcula cuántos sorteos faltan para que se resuelva, usando estadística real:</p>
          <div class="wiki-example">
            Históricamente, la secuencia A→B se resuelve en promedio en <strong>8 sorteos</strong> con desviación de 3.<br>
            Si ya van 6 sorteos desde que cayó A:<br>
            &nbsp;· Probabilidad de que B caiga en el siguiente sorteo: <strong>~24%</strong><br>
            &nbsp;· Probabilidad de que B caiga en los próximos 3: <strong>~52%</strong>
          </div>

          <h3>La barra de progreso</h3>
          <p>Cada secuencia activa se representa con una barra. La longitud de la barra = qué tan cerca está de su ventana histórica de resolución. Una barra llena = el sistema proyecta resolución inminente.</p>

          <h3>Cuándo confiar más</h3>
          <p>Cuando la secuencia tiene al menos 3 instancias históricas con estadística confirmada. Las secuencias con 1 o 2 casos se marcan con baja confianza.</p>
        `,
      },
      {
        id: "regimen",
        categoria: "Sistema adversarial",
        titulo: "🎭 Régimen de juego — cuándo La Casa cambió su estilo",
        contenido: `
          <h2>Régimen de juego</h2>
          <p class="wiki-lead">El régimen describe el <em>estado estratégico actual</em> de La Diaria. Cuando detecta que el patrón de sorteos cambió significativamente, clasifica en qué modo está jugando la operadora.</p>

          <h3>Cómo se detecta el cambio</h3>
          <p>Cada 10 sorteos el sistema compara la distribución de los últimos 30 contra los 30 anteriores usando <strong>divergencia KL</strong> — una medida de qué tan diferente es la nueva distribución. Si el KL ≥ 0.08, hay cambio de régimen.</p>

          <h3>Los 7 regímenes</h3>
          <table class="wiki-table">
            <thead><tr><th>Régimen</th><th>Qué significa</th><th>Señal característica</th></tr></thead>
            <tbody>
              <tr><td><strong>Normal</strong></td><td>Distribución histórica típica</td><td>KL bajo, sin anomalías</td></tr>
              <tr><td><strong>Post superpremio</strong></td><td>Tras pagar premio mayor, La Casa se vuelve impredecible</td><td>Entropía alta, saladitos ↓</td></tr>
              <tr><td><strong>Bloqueo de saladitos</strong></td><td>Período donde evita dobles y redondos</td><td>% saladitos muy por debajo del histórico</td></tr>
              <tr><td><strong>Liberación masiva</strong></td><td>Varios números vencidos caen en ventana corta</td><td>Ratio de números "nuevos" muy alto</td></tr>
              <tr><td><strong>Secuencia activa</strong></td><td>Patrón de variantes/secuencias dominando</td><td>Ratio variante alto + repetición baja</td></tr>
              <tr><td><strong>Modo camuflaje</strong></td><td>La Casa usa variantes matemáticas más de lo normal</td><td>Ratio variante muy por encima del baseline</td></tr>
              <tr><td><strong>Fin de mes</strong></td><td>Cambio en últimos 5 días del mes</td><td>Patrones mensuales dominantes</td></tr>
            </tbody>
          </table>

          <h3>Por qué importa el régimen</h3>
          <p>Cada régimen ajusta automáticamente los pesos del motor. Ejemplo: en <em>post superpremio</em> el peso de Markov baja (porque el historial ya no es fiable) y el de modos/patrones sube. El sistema se adapta sin que tengas que tocarlo.</p>
        `,
      },
      {
        id: "pesos-dinamicos",
        categoria: "Sistema adversarial",
        titulo: "⚖️ Pesos dinámicos — el motor se ajusta solo",
        contenido: `
          <h2>Pesos dinámicos del motor</h2>
          <p class="wiki-lead">Los 7 motores de señal no siempre tienen el mismo peso. El sistema los ajusta automáticamente según qué motores están acertando en los últimos 30 sorteos.</p>

          <h3>Los pesos por defecto</h3>
          <table class="wiki-table">
            <thead><tr><th>Motor</th><th>Peso inicial</th><th>Rango permitido</th></tr></thead>
            <tbody>
              <tr><td>Markov O1</td><td>28%</td><td>3% – 42%</td></tr>
              <tr><td>Markov O2</td><td>18%</td><td>3% – 42%</td></tr>
              <tr><td>Rezago</td><td>14%</td><td>3% – 42%</td></tr>
              <tr><td>Modos</td><td>18%</td><td>3% – 42%</td></tr>
              <tr><td>Patrones</td><td>12%</td><td>3% – 42%</td></tr>
              <tr><td>Semanal</td><td>6%</td><td>3% – 42%</td></tr>
              <tr><td>Mensual</td><td>4%</td><td>3% – 42%</td></tr>
            </tbody>
          </table>

          <h3>Cómo se ajustan (gradient ascent)</h3>
          <p>Después de cada bloque de 30 evaluaciones, el sistema aplica un "paso de gradiente":</p>
          <div class="wiki-example">
            · Si Rezago señaló el número ganador → su peso sube.<br>
            · Si Markov O1 falló consistentemente → su peso baja.<br>
            · Los ajustes son pequeños (1.5% por paso) para no sobrereaccionar a ruido.
          </div>

          <h3>Ajuste adicional por régimen</h3>
          <p>Encima del gradient, el régimen activo aplica multiplicadores. Ejemplo en <em>modo camuflaje</em>: Markov × 0.80, Patrones × 1.30. Los dos ajustes se combinan.</p>

          <h3>Crisis y reset</h3>
          <p>Si el hit rate top-3 cae por debajo del 20%, el sistema entra en modo crisis y ejecuta el optimizador automáticamente. Si nada mejora, puedes hacer reset manual a los pesos por defecto.</p>
        `,
      },
      {
        id: "autoevaluacion",
        categoria: "Sistema adversarial",
        titulo: "📊 Autoevaluación — el sistema se califica a sí mismo",
        contenido: `
          <h2>Loop de autoevaluación</h2>
          <p class="wiki-lead">Cada vez que registras un sorteo real, el sistema compara el número ganador contra las predicciones que hizo antes. Eso le permite saber si está funcionando bien o necesita ajustarse.</p>

          <h3>Los 4 tipos de resultado</h3>
          <table class="wiki-table">
            <thead><tr><th>Tipo</th><th>Qué significa</th><th>Acción del sistema</th></tr></thead>
            <tbody>
              <tr><td><strong>C — Acierto</strong></td><td>El número cayó dentro del top-5 predicho</td><td>Refuerza los motores que lo señalaron</td></tr>
              <tr><td><strong>A — Ranking</strong></td><td>El número estaba en la lista pero fuera del top-5</td><td>Ajusta el peso de ranking de los motores</td></tr>
              <tr><td><strong>B — Ausente</strong></td><td>El número no estaba en ninguna posición de la lista</td><td>Señal de alerta: el motor no está captando esa señal</td></tr>
              <tr><td><strong>D — Falso positivo</strong></td><td>El motor predijo con alta confianza un número que no cayó</td><td>Penaliza los motores que sobreconfiaron</td></tr>
            </tbody>
          </table>

          <h3>Score global</h3>
          <p>La salud del sistema se mide con esta fórmula sobre las últimas 30 evaluaciones:</p>
          <div class="wiki-example">
            Score = (hit top-1 × 40%) + (hit top-3 × 35%) + (hit top-5 × 15%) + (cobertura × 10%)
          </div>

          <h3>Crisis automática</h3>
          <p>Si el hit rate top-3 cae por debajo del 20%, el sistema entra en modo crisis y ejecuta el optimizador de pesos automáticamente. El panel Salud muestra el badge rojo "CRISIS — Ajustando pesos".</p>

          <h3>Diagnóstico de causa raíz</h3>
          <p>Cuando hay muchos errores tipo B (ausente), el sistema intenta diagnosticar por qué:</p>
          <ul>
            <li>¿La distribución cambió de régimen y los pesos están desactualizados?</li>
            <li>¿Un motor específico tiene desempeño sistemáticamente bajo?</li>
            <li>¿Hay concentración de errores en una decena particular (posible bloqueo selectivo)?</li>
            <li>¿El score está en tendencia de caída acelerada?</li>
          </ul>
        `,
      },
      {
        id: "backtest-v4",
        categoria: "Estadística y verificación",
        titulo: "🆚 Backtest V3 vs V4 — prueba honesta de la mejora",
        contenido: `
          <h2>Backtest V3 vs V4</h2>
          <p class="wiki-lead">Una comparación directa entre el motor clásico (solo Markov + rezago) y el motor v4 completo (+ presión adversarial + régimen dinámico + pesos auto-ajustados), corrida sobre el mismo historial real.</p>

          <h3>Por qué existe esta prueba</h3>
          <p>Agregar módulos nuevos no significa mejorar. Este backtest verifica con datos reales si la inteligencia adversarial realmente sube el hit rate o solo agrega ruido.</p>

          <h3>La metodología</h3>
          <p>Para cada punto en el historial, el sistema simula que el motor se corrió <em>el día anterior</em> usando solo datos hasta ese momento (sin mirar el futuro). Luego comprueba si el número que cayó estaba en el top-K predicho.</p>
          <div class="wiki-example">
            <strong>V3:</strong> Markov + Rezago + Popularidad (motor base)<br>
            <strong>V4:</strong> V3 + Presión adversarial + Régimen dinámico + Pesos gradient rolling
          </div>

          <h3>Qué mide el resultado</h3>
          <table class="wiki-table">
            <thead><tr><th>Métrica</th><th>Qué significa</th></tr></thead>
            <tbody>
              <tr><td>Hit rate top-5</td><td>% de veces que el número ganador estaba en los primeros 5</td></tr>
              <tr><td>Lift</td><td>Hit rate ÷ azar puro. Lift 1.5× = 50% mejor que adivinar</td></tr>
              <tr><td>Δ Lift</td><td>Mejora de V4 respecto a V3. Positivo = V4 es mejor</td></tr>
              <tr><td>Rank medio</td><td>Posición promedio del número ganador en el ranking predicho</td></tr>
            </tbody>
          </table>

          <h3>Cómo ejecutarlo</h3>
          <p>En <strong>Mantención → Backtest</strong>, configura el warmup y haz clic en "Ejecutar backtest". Tarda 30–90 segundos. Puedes cancelarlo con el mismo botón.</p>

          <h3>Importante: el backtest no garantiza nada</h3>
          <p>Un lift alto en el historial no promete que el sistema seguirá funcionando igual en el futuro. Lo que sí dice es que <em>en los sorteos pasados</em>, el motor tenía ventaja real sobre el azar. Es la mejor evidencia disponible sin adivinar.</p>
        `,
      },
    ];

    let _wikiIniciada = false;

    function initWiki() {
      if (_wikiIniciada) return; // solo construir el índice una vez
      _wikiIniciada = true;

      const toc     = document.getElementById("wiki-toc");
      const content = document.getElementById("wiki-content");
      const search  = document.getElementById("wiki-search");

      // Agrupar por categoría
      const categorias = [...new Set(WIKI_ARTICLES.map((a) => a.categoria))];

      function buildToc(filter = "") {
        toc.innerHTML = "";
        const q = filter.toLowerCase();
        let totalMatches = 0;
        categorias.forEach((cat) => {
          const arts = WIKI_ARTICLES.filter(
            (a) => a.categoria === cat && (!q || a.titulo.toLowerCase().includes(q) || a.contenido.toLowerCase().includes(q))
          );
          if (!arts.length) return;
          totalMatches += arts.length;

          const li = document.createElement("li");
          li.className = "wiki-toc__cat";
          li.textContent = cat;
          toc.appendChild(li);

          arts.forEach((art) => {
            const item = document.createElement("li");
            item.className = "wiki-toc__item";
            item.textContent = art.titulo;
            item.dataset.id = art.id;
            item.addEventListener("click", () => {
              document.querySelectorAll(".wiki-toc__item").forEach((i) => i.classList.remove("active"));
              item.classList.add("active");
              content.innerHTML = `<div class="wiki-body">${art.contenido}</div>`;
            });
            toc.appendChild(item);
          });
        });
        if (q && !totalMatches) {
          const empty = document.createElement("li");
          empty.className = "hint";
          empty.style.padding = "0.75rem 0.5rem";
          empty.textContent = `Sin resultados para "${filter}".`;
          toc.appendChild(empty);
        }
      }

      buildToc();
      search.addEventListener("input", debounce((e) => buildToc(e.target.value)));

      // Abrir el primer artículo por defecto
      const first = WIKI_ARTICLES[0];
      content.innerHTML = `<div class="wiki-body">${first.contenido}</div>`;
      setTimeout(() => {
        const firstItem = toc.querySelector(".wiki-toc__item");
        if (firstItem) firstItem.classList.add("active");
      }, 0);
    }

  
    // ── Importar histórico 2014 ──────────────────────────────────────────────
    const import2014Btn = document.getElementById("btn-import-2014");
    if (import2014Btn) {
      import2014Btn.addEventListener("click", async () => {
        const out = document.getElementById("import-2014-out");
        import2014Btn.disabled = true;
        import2014Btn.textContent = "Importando…";
        out.innerHTML = "<p>Iniciando importación de 839 sorteos...</p>";

        const draws = [
  {f:"2014-01-01",h:"11AM",n:15},
  {f:"2014-01-01",h:"3PM",n:4},
  {f:"2014-01-01",h:"9PM",n:8},
  {f:"2014-01-02",h:"11AM",n:11},
  {f:"2014-01-02",h:"3PM",n:34},
  {f:"2014-01-02",h:"9PM",n:52},
  {f:"2014-01-03",h:"11AM",n:67},
  {f:"2014-01-03",h:"3PM",n:58},
  {f:"2014-01-03",h:"9PM",n:25},
  {f:"2014-01-04",h:"11AM",n:59},
  {f:"2014-01-04",h:"3PM",n:96},
  {f:"2014-01-04",h:"9PM",n:64},
  {f:"2014-01-05",h:"11AM",n:41},
  {f:"2014-01-05",h:"3PM",n:32},
  {f:"2014-01-05",h:"9PM",n:99},
  {f:"2014-01-06",h:"11AM",n:1},
  {f:"2014-01-06",h:"3PM",n:11},
  {f:"2014-01-06",h:"9PM",n:15},
  {f:"2014-01-07",h:"11AM",n:40},
  {f:"2014-01-07",h:"3PM",n:21},
  {f:"2014-01-07",h:"9PM",n:93},
  {f:"2014-01-08",h:"11AM",n:42},
  {f:"2014-01-08",h:"3PM",n:86},
  {f:"2014-01-08",h:"9PM",n:27},
  {f:"2014-01-09",h:"11AM",n:67},
  {f:"2014-01-09",h:"3PM",n:24},
  {f:"2014-01-09",h:"9PM",n:43},
  {f:"2014-01-10",h:"11AM",n:36},
  {f:"2014-01-10",h:"3PM",n:0},
  {f:"2014-01-10",h:"9PM",n:72},
  {f:"2014-01-11",h:"11AM",n:29},
  {f:"2014-01-11",h:"3PM",n:35},
  {f:"2014-01-11",h:"9PM",n:96},
  {f:"2014-01-12",h:"11AM",n:76},
  {f:"2014-01-12",h:"3PM",n:53},
  {f:"2014-01-12",h:"9PM",n:78},
  {f:"2014-01-13",h:"11AM",n:80},
  {f:"2014-01-13",h:"3PM",n:89},
  {f:"2014-01-13",h:"9PM",n:61},
  {f:"2014-01-14",h:"11AM",n:31},
  {f:"2014-01-14",h:"3PM",n:73},
  {f:"2014-01-14",h:"9PM",n:41},
  {f:"2014-01-15",h:"11AM",n:5},
  {f:"2014-01-15",h:"3PM",n:13},
  {f:"2014-01-15",h:"9PM",n:64},
  {f:"2014-01-16",h:"11AM",n:19},
  {f:"2014-01-16",h:"3PM",n:74},
  {f:"2014-01-16",h:"9PM",n:82},
  {f:"2014-01-17",h:"11AM",n:80},
  {f:"2014-01-17",h:"3PM",n:14},
  {f:"2014-01-17",h:"9PM",n:57},
  {f:"2014-01-18",h:"11AM",n:73},
  {f:"2014-01-18",h:"3PM",n:51},
  {f:"2014-01-18",h:"9PM",n:60},
  {f:"2014-01-19",h:"11AM",n:97},
  {f:"2014-01-19",h:"3PM",n:56},
  {f:"2014-01-19",h:"9PM",n:7},
  {f:"2014-01-20",h:"11AM",n:72},
  {f:"2014-01-20",h:"3PM",n:93},
  {f:"2014-01-20",h:"9PM",n:54},
  {f:"2014-01-21",h:"11AM",n:81},
  {f:"2014-01-21",h:"3PM",n:77},
  {f:"2014-01-21",h:"9PM",n:97},
  {f:"2014-01-22",h:"11AM",n:79},
  {f:"2014-01-22",h:"3PM",n:86},
  {f:"2014-01-22",h:"9PM",n:17},
  {f:"2014-01-23",h:"11AM",n:29},
  {f:"2014-01-23",h:"3PM",n:22},
  {f:"2014-01-23",h:"9PM",n:48},
  {f:"2014-01-24",h:"11AM",n:79},
  {f:"2014-01-24",h:"3PM",n:15},
  {f:"2014-01-24",h:"9PM",n:62},
  {f:"2014-01-25",h:"11AM",n:89},
  {f:"2014-01-25",h:"3PM",n:74},
  {f:"2014-01-25",h:"9PM",n:59},
  {f:"2014-01-26",h:"11AM",n:19},
  {f:"2014-01-26",h:"3PM",n:60},
  {f:"2014-01-26",h:"9PM",n:11},
  {f:"2014-01-27",h:"11AM",n:20},
  {f:"2014-01-27",h:"3PM",n:68},
  {f:"2014-01-27",h:"9PM",n:65},
  {f:"2014-01-28",h:"11AM",n:63},
  {f:"2014-01-28",h:"3PM",n:26},
  {f:"2014-01-28",h:"9PM",n:23},
  {f:"2014-01-29",h:"11AM",n:73},
  {f:"2014-01-29",h:"3PM",n:67},
  {f:"2014-01-29",h:"9PM",n:85},
  {f:"2014-01-30",h:"11AM",n:81},
  {f:"2014-01-30",h:"3PM",n:7},
  {f:"2014-01-30",h:"9PM",n:77},
  {f:"2014-01-31",h:"11AM",n:30},
  {f:"2014-01-31",h:"3PM",n:56},
  {f:"2014-01-31",h:"9PM",n:45},
  {f:"2014-02-01",h:"11AM",n:69},
  {f:"2014-02-01",h:"3PM",n:53},
  {f:"2014-02-01",h:"9PM",n:54},
  {f:"2014-02-02",h:"11AM",n:26},
  {f:"2014-02-02",h:"3PM",n:76},
  {f:"2014-02-02",h:"9PM",n:54},
  {f:"2014-02-03",h:"11AM",n:58},
  {f:"2014-02-03",h:"3PM",n:66},
  {f:"2014-02-03",h:"9PM",n:29},
  {f:"2014-02-04",h:"11AM",n:59},
  {f:"2014-02-04",h:"3PM",n:90},
  {f:"2014-02-04",h:"9PM",n:6},
  {f:"2014-02-05",h:"11AM",n:96},
  {f:"2014-02-05",h:"3PM",n:65},
  {f:"2014-02-05",h:"9PM",n:26},
  {f:"2014-02-06",h:"11AM",n:55},
  {f:"2014-02-06",h:"3PM",n:0},
  {f:"2014-02-06",h:"9PM",n:30},
  {f:"2014-02-07",h:"11AM",n:6},
  {f:"2014-02-07",h:"3PM",n:87},
  {f:"2014-02-07",h:"9PM",n:53},
  {f:"2014-02-08",h:"11AM",n:2},
  {f:"2014-02-08",h:"3PM",n:28},
  {f:"2014-02-08",h:"9PM",n:57},
  {f:"2014-02-09",h:"11AM",n:60},
  {f:"2014-02-09",h:"3PM",n:29},
  {f:"2014-02-09",h:"9PM",n:70},
  {f:"2014-02-10",h:"11AM",n:2},
  {f:"2014-02-10",h:"3PM",n:19},
  {f:"2014-02-10",h:"9PM",n:42},
  {f:"2014-02-11",h:"11AM",n:92},
  {f:"2014-02-11",h:"3PM",n:34},
  {f:"2014-02-11",h:"9PM",n:14},
  {f:"2014-02-12",h:"11AM",n:19},
  {f:"2014-02-12",h:"3PM",n:67},
  {f:"2014-02-12",h:"9PM",n:90},
  {f:"2014-02-13",h:"11AM",n:99},
  {f:"2014-02-13",h:"3PM",n:13},
  {f:"2014-02-13",h:"9PM",n:3},
  {f:"2014-02-14",h:"11AM",n:45},
  {f:"2014-02-14",h:"3PM",n:9},
  {f:"2014-02-14",h:"9PM",n:78},
  {f:"2014-02-15",h:"11AM",n:14},
  {f:"2014-02-15",h:"3PM",n:49},
  {f:"2014-02-15",h:"9PM",n:0},
  {f:"2014-02-16",h:"11AM",n:35},
  {f:"2014-02-16",h:"3PM",n:99},
  {f:"2014-02-16",h:"9PM",n:27},
  {f:"2014-02-17",h:"11AM",n:56},
  {f:"2014-02-17",h:"3PM",n:63},
  {f:"2014-02-17",h:"9PM",n:42},
  {f:"2014-02-18",h:"11AM",n:7},
  {f:"2014-02-18",h:"3PM",n:71},
  {f:"2014-02-18",h:"9PM",n:18},
  {f:"2014-02-19",h:"11AM",n:46},
  {f:"2014-02-19",h:"3PM",n:2},
  {f:"2014-02-19",h:"9PM",n:84},
  {f:"2014-02-20",h:"11AM",n:55},
  {f:"2014-02-20",h:"3PM",n:73},
  {f:"2014-02-20",h:"9PM",n:51},
  {f:"2014-02-21",h:"11AM",n:58},
  {f:"2014-02-21",h:"3PM",n:27},
  {f:"2014-02-21",h:"9PM",n:30},
  {f:"2014-02-22",h:"11AM",n:79},
  {f:"2014-02-22",h:"3PM",n:28},
  {f:"2014-02-22",h:"9PM",n:63},
  {f:"2014-02-23",h:"11AM",n:89},
  {f:"2014-02-23",h:"3PM",n:60},
  {f:"2014-02-23",h:"9PM",n:14},
  {f:"2014-02-24",h:"11AM",n:58},
  {f:"2014-02-24",h:"3PM",n:89},
  {f:"2014-02-24",h:"9PM",n:4},
  {f:"2014-02-25",h:"11AM",n:85},
  {f:"2014-02-25",h:"3PM",n:71},
  {f:"2014-02-25",h:"9PM",n:39},
  {f:"2014-02-26",h:"11AM",n:97},
  {f:"2014-02-26",h:"3PM",n:74},
  {f:"2014-02-26",h:"9PM",n:17},
  {f:"2014-02-27",h:"11AM",n:16},
  {f:"2014-02-27",h:"3PM",n:8},
  {f:"2014-02-27",h:"9PM",n:53},
  {f:"2014-02-28",h:"11AM",n:72},
  {f:"2014-02-28",h:"3PM",n:83},
  {f:"2014-02-28",h:"9PM",n:65},
  {f:"2014-03-01",h:"11AM",n:60},
  {f:"2014-03-01",h:"3PM",n:1},
  {f:"2014-03-01",h:"9PM",n:3},
  {f:"2014-03-02",h:"11AM",n:9},
  {f:"2014-03-02",h:"3PM",n:87},
  {f:"2014-03-02",h:"9PM",n:33},
  {f:"2014-03-03",h:"11AM",n:61},
  {f:"2014-03-03",h:"3PM",n:33},
  {f:"2014-03-03",h:"9PM",n:16},
  {f:"2014-03-04",h:"11AM",n:86},
  {f:"2014-03-04",h:"3PM",n:97},
  {f:"2014-03-04",h:"9PM",n:29},
  {f:"2014-03-05",h:"11AM",n:66},
  {f:"2014-03-05",h:"3PM",n:8},
  {f:"2014-03-05",h:"9PM",n:56},
  {f:"2014-03-06",h:"11AM",n:13},
  {f:"2014-03-06",h:"3PM",n:44},
  {f:"2014-03-06",h:"9PM",n:29},
  {f:"2014-03-07",h:"11AM",n:45},
  {f:"2014-03-07",h:"3PM",n:16},
  {f:"2014-03-07",h:"9PM",n:54},
  {f:"2014-03-08",h:"11AM",n:26},
  {f:"2014-03-08",h:"3PM",n:31},
  {f:"2014-03-08",h:"9PM",n:4},
  {f:"2014-03-09",h:"11AM",n:94},
  {f:"2014-03-09",h:"3PM",n:87},
  {f:"2014-03-09",h:"9PM",n:45},
  {f:"2014-03-10",h:"11AM",n:26},
  {f:"2014-03-10",h:"3PM",n:7},
  {f:"2014-03-10",h:"9PM",n:6},
  {f:"2014-03-11",h:"11AM",n:6},
  {f:"2014-03-11",h:"3PM",n:61},
  {f:"2014-03-11",h:"9PM",n:77},
  {f:"2014-03-12",h:"11AM",n:13},
  {f:"2014-03-12",h:"3PM",n:72},
  {f:"2014-03-12",h:"9PM",n:38},
  {f:"2014-03-13",h:"11AM",n:96},
  {f:"2014-03-13",h:"3PM",n:48},
  {f:"2014-03-13",h:"9PM",n:33},
  {f:"2014-03-14",h:"11AM",n:44},
  {f:"2014-03-14",h:"3PM",n:42},
  {f:"2014-03-14",h:"9PM",n:46},
  {f:"2014-03-15",h:"11AM",n:62},
  {f:"2014-03-15",h:"3PM",n:3},
  {f:"2014-03-15",h:"9PM",n:82},
  {f:"2014-03-16",h:"11AM",n:21},
  {f:"2014-03-16",h:"3PM",n:74},
  {f:"2014-03-16",h:"9PM",n:71},
  {f:"2014-03-17",h:"11AM",n:99},
  {f:"2014-03-17",h:"3PM",n:76},
  {f:"2014-03-17",h:"9PM",n:92},
  {f:"2014-03-18",h:"11AM",n:46},
  {f:"2014-03-18",h:"3PM",n:76},
  {f:"2014-03-18",h:"9PM",n:10},
  {f:"2014-03-19",h:"11AM",n:89},
  {f:"2014-03-19",h:"3PM",n:31},
  {f:"2014-03-19",h:"9PM",n:33},
  {f:"2014-03-20",h:"11AM",n:65},
  {f:"2014-03-20",h:"3PM",n:31},
  {f:"2014-03-20",h:"9PM",n:30},
  {f:"2014-03-21",h:"11AM",n:85},
  {f:"2014-03-21",h:"3PM",n:92},
  {f:"2014-03-21",h:"9PM",n:98},
  {f:"2014-03-22",h:"11AM",n:66},
  {f:"2014-03-22",h:"3PM",n:87},
  {f:"2014-03-22",h:"9PM",n:42},
  {f:"2014-03-23",h:"11AM",n:90},
  {f:"2014-03-23",h:"3PM",n:21},
  {f:"2014-03-23",h:"9PM",n:38},
  {f:"2014-03-24",h:"11AM",n:70},
  {f:"2014-03-24",h:"3PM",n:41},
  {f:"2014-03-24",h:"9PM",n:60},
  {f:"2014-03-25",h:"11AM",n:12},
  {f:"2014-03-25",h:"3PM",n:67},
  {f:"2014-03-25",h:"9PM",n:71},
  {f:"2014-03-26",h:"11AM",n:14},
  {f:"2014-03-26",h:"3PM",n:23},
  {f:"2014-03-26",h:"9PM",n:91},
  {f:"2014-03-27",h:"11AM",n:48},
  {f:"2014-03-27",h:"3PM",n:64},
  {f:"2014-03-27",h:"9PM",n:97},
  {f:"2014-03-28",h:"11AM",n:38},
  {f:"2014-03-28",h:"3PM",n:9},
  {f:"2014-03-28",h:"9PM",n:53},
  {f:"2014-03-29",h:"11AM",n:22},
  {f:"2014-03-29",h:"3PM",n:82},
  {f:"2014-03-29",h:"9PM",n:56},
  {f:"2014-03-30",h:"11AM",n:44},
  {f:"2014-03-30",h:"3PM",n:81},
  {f:"2014-03-30",h:"9PM",n:73},
  {f:"2014-03-31",h:"11AM",n:87},
  {f:"2014-03-31",h:"3PM",n:15},
  {f:"2014-03-31",h:"9PM",n:18},
  {f:"2014-04-01",h:"11AM",n:84},
  {f:"2014-04-01",h:"3PM",n:19},
  {f:"2014-04-01",h:"9PM",n:3},
  {f:"2014-04-02",h:"11AM",n:19},
  {f:"2014-04-02",h:"3PM",n:60},
  {f:"2014-04-02",h:"9PM",n:31},
  {f:"2014-04-03",h:"11AM",n:72},
  {f:"2014-04-03",h:"3PM",n:71},
  {f:"2014-04-03",h:"9PM",n:12},
  {f:"2014-04-04",h:"11AM",n:49},
  {f:"2014-04-04",h:"3PM",n:49},
  {f:"2014-04-04",h:"9PM",n:7},
  {f:"2014-04-05",h:"11AM",n:62},
  {f:"2014-04-05",h:"3PM",n:78},
  {f:"2014-04-05",h:"9PM",n:57},
  {f:"2014-04-06",h:"11AM",n:23},
  {f:"2014-04-06",h:"3PM",n:0},
  {f:"2014-04-06",h:"9PM",n:28},
  {f:"2014-04-07",h:"11AM",n:7},
  {f:"2014-04-07",h:"3PM",n:29},
  {f:"2014-04-07",h:"9PM",n:92},
  {f:"2014-04-08",h:"11AM",n:52},
  {f:"2014-04-08",h:"3PM",n:90},
  {f:"2014-04-08",h:"9PM",n:61},
  {f:"2014-04-09",h:"11AM",n:39},
  {f:"2014-04-09",h:"3PM",n:34},
  {f:"2014-04-09",h:"9PM",n:27},
  {f:"2014-04-10",h:"11AM",n:57},
  {f:"2014-04-10",h:"3PM",n:74},
  {f:"2014-04-10",h:"9PM",n:61},
  {f:"2014-04-11",h:"11AM",n:23},
  {f:"2014-04-11",h:"3PM",n:85},
  {f:"2014-04-11",h:"9PM",n:33},
  {f:"2014-04-12",h:"11AM",n:36},
  {f:"2014-04-12",h:"3PM",n:31},
  {f:"2014-04-12",h:"9PM",n:36},
  {f:"2014-04-13",h:"11AM",n:86},
  {f:"2014-04-13",h:"3PM",n:64},
  {f:"2014-04-13",h:"9PM",n:45},
  {f:"2014-04-14",h:"11AM",n:95},
  {f:"2014-04-14",h:"3PM",n:33},
  {f:"2014-04-14",h:"9PM",n:53},
  {f:"2014-04-15",h:"11AM",n:60},
  {f:"2014-04-15",h:"3PM",n:79},
  {f:"2014-04-15",h:"9PM",n:0},
  {f:"2014-04-16",h:"11AM",n:17},
  {f:"2014-04-16",h:"3PM",n:15},
  {f:"2014-04-16",h:"9PM",n:5},
  {f:"2014-04-17",h:"11AM",n:33},
  {f:"2014-04-17",h:"3PM",n:14},
  {f:"2014-04-17",h:"9PM",n:69},
  {f:"2014-04-18",h:"11AM",n:28},
  {f:"2014-04-18",h:"3PM",n:70},
  {f:"2014-04-18",h:"9PM",n:65},
  {f:"2014-04-19",h:"11AM",n:59},
  {f:"2014-04-19",h:"3PM",n:23},
  {f:"2014-04-19",h:"9PM",n:24},
  {f:"2014-04-20",h:"11AM",n:75},
  {f:"2014-04-20",h:"3PM",n:65},
  {f:"2014-04-20",h:"9PM",n:93},
  {f:"2014-04-21",h:"11AM",n:64},
  {f:"2014-04-21",h:"3PM",n:2},
  {f:"2014-04-21",h:"9PM",n:94},
  {f:"2014-04-22",h:"11AM",n:77},
  {f:"2014-04-22",h:"3PM",n:90},
  {f:"2014-04-22",h:"9PM",n:13},
  {f:"2014-04-23",h:"11AM",n:6},
  {f:"2014-04-23",h:"3PM",n:75},
  {f:"2014-04-23",h:"9PM",n:87},
  {f:"2014-04-24",h:"11AM",n:67},
  {f:"2014-04-24",h:"3PM",n:78},
  {f:"2014-04-24",h:"9PM",n:64},
  {f:"2014-04-25",h:"11AM",n:64},
  {f:"2014-04-25",h:"3PM",n:33},
  {f:"2014-04-25",h:"9PM",n:57},
  {f:"2014-04-26",h:"11AM",n:3},
  {f:"2014-04-26",h:"3PM",n:58},
  {f:"2014-04-26",h:"9PM",n:40},
  {f:"2014-04-27",h:"11AM",n:27},
  {f:"2014-04-27",h:"3PM",n:13},
  {f:"2014-04-27",h:"9PM",n:22},
  {f:"2014-04-28",h:"11AM",n:59},
  {f:"2014-04-28",h:"3PM",n:95},
  {f:"2014-04-28",h:"9PM",n:8},
  {f:"2014-04-29",h:"11AM",n:67},
  {f:"2014-04-29",h:"3PM",n:39},
  {f:"2014-04-29",h:"9PM",n:73},
  {f:"2014-04-30",h:"11AM",n:12},
  {f:"2014-04-30",h:"3PM",n:50},
  {f:"2014-04-30",h:"9PM",n:26},
  {f:"2014-05-01",h:"11AM",n:80},
  {f:"2014-05-01",h:"3PM",n:16},
  {f:"2014-05-01",h:"9PM",n:5},
  {f:"2014-05-02",h:"11AM",n:78},
  {f:"2014-05-02",h:"3PM",n:93},
  {f:"2014-05-02",h:"9PM",n:9},
  {f:"2014-05-03",h:"11AM",n:32},
  {f:"2014-05-03",h:"3PM",n:62},
  {f:"2014-05-03",h:"9PM",n:91},
  {f:"2014-05-04",h:"11AM",n:46},
  {f:"2014-05-04",h:"3PM",n:77},
  {f:"2014-05-04",h:"9PM",n:88},
  {f:"2014-05-05",h:"11AM",n:46},
  {f:"2014-05-05",h:"3PM",n:15},
  {f:"2014-05-05",h:"9PM",n:65},
  {f:"2014-05-06",h:"11AM",n:15},
  {f:"2014-05-06",h:"3PM",n:27},
  {f:"2014-05-06",h:"9PM",n:71},
  {f:"2014-05-07",h:"11AM",n:94},
  {f:"2014-05-07",h:"3PM",n:35},
  {f:"2014-05-07",h:"9PM",n:93},
  {f:"2014-05-08",h:"11AM",n:36},
  {f:"2014-05-08",h:"3PM",n:33},
  {f:"2014-05-08",h:"9PM",n:70},
  {f:"2014-05-09",h:"11AM",n:89},
  {f:"2014-05-09",h:"3PM",n:54},
  {f:"2014-05-09",h:"9PM",n:71},
  {f:"2014-05-10",h:"11AM",n:40},
  {f:"2014-05-10",h:"3PM",n:45},
  {f:"2014-05-10",h:"9PM",n:87},
  {f:"2014-05-11",h:"11AM",n:27},
  {f:"2014-05-11",h:"3PM",n:27},
  {f:"2014-05-11",h:"9PM",n:25},
  {f:"2014-05-12",h:"11AM",n:51},
  {f:"2014-05-12",h:"3PM",n:32},
  {f:"2014-05-12",h:"9PM",n:39},
  {f:"2014-05-13",h:"11AM",n:18},
  {f:"2014-05-13",h:"3PM",n:85},
  {f:"2014-05-13",h:"9PM",n:61},
  {f:"2014-05-14",h:"11AM",n:41},
  {f:"2014-05-14",h:"3PM",n:3},
  {f:"2014-05-14",h:"9PM",n:86},
  {f:"2014-05-15",h:"11AM",n:7},
  {f:"2014-05-15",h:"3PM",n:35},
  {f:"2014-05-15",h:"9PM",n:24},
  {f:"2014-05-16",h:"11AM",n:30},
  {f:"2014-05-16",h:"3PM",n:80},
  {f:"2014-05-16",h:"9PM",n:59},
  {f:"2014-05-17",h:"11AM",n:75},
  {f:"2014-05-17",h:"3PM",n:24},
  {f:"2014-05-17",h:"9PM",n:42},
  {f:"2014-05-18",h:"11AM",n:51},
  {f:"2014-05-18",h:"3PM",n:0},
  {f:"2014-05-18",h:"9PM",n:68},
  {f:"2014-05-19",h:"11AM",n:62},
  {f:"2014-05-19",h:"3PM",n:81},
  {f:"2014-05-19",h:"9PM",n:83},
  {f:"2014-05-20",h:"11AM",n:23},
  {f:"2014-05-20",h:"3PM",n:2},
  {f:"2014-05-20",h:"9PM",n:20},
  {f:"2014-05-21",h:"11AM",n:6},
  {f:"2014-05-21",h:"3PM",n:4},
  {f:"2014-05-21",h:"9PM",n:8},
  {f:"2014-05-22",h:"11AM",n:91},
  {f:"2014-05-22",h:"3PM",n:87},
  {f:"2014-05-22",h:"9PM",n:83},
  {f:"2014-05-23",h:"11AM",n:13},
  {f:"2014-05-23",h:"3PM",n:51},
  {f:"2014-05-23",h:"9PM",n:64},
  {f:"2014-05-24",h:"11AM",n:91},
  {f:"2014-05-24",h:"3PM",n:26},
  {f:"2014-05-24",h:"9PM",n:59},
  {f:"2014-05-25",h:"11AM",n:92},
  {f:"2014-05-25",h:"3PM",n:98},
  {f:"2014-05-25",h:"9PM",n:60},
  {f:"2014-05-26",h:"11AM",n:94},
  {f:"2014-05-26",h:"3PM",n:82},
  {f:"2014-05-26",h:"9PM",n:88},
  {f:"2014-05-27",h:"11AM",n:0},
  {f:"2014-05-27",h:"3PM",n:29},
  {f:"2014-05-27",h:"9PM",n:6},
  {f:"2014-05-28",h:"11AM",n:83},
  {f:"2014-05-28",h:"3PM",n:16},
  {f:"2014-05-28",h:"9PM",n:34},
  {f:"2014-05-29",h:"11AM",n:34},
  {f:"2014-05-29",h:"3PM",n:68},
  {f:"2014-05-29",h:"9PM",n:2},
  {f:"2014-05-30",h:"11AM",n:61},
  {f:"2014-05-30",h:"3PM",n:74},
  {f:"2014-05-30",h:"9PM",n:75},
  {f:"2014-05-31",h:"11AM",n:47},
  {f:"2014-05-31",h:"3PM",n:93},
  {f:"2014-05-31",h:"9PM",n:69},
  {f:"2014-06-01",h:"11AM",n:44},
  {f:"2014-06-01",h:"3PM",n:61},
  {f:"2014-06-01",h:"9PM",n:55},
  {f:"2014-06-02",h:"11AM",n:43},
  {f:"2014-06-02",h:"3PM",n:7},
  {f:"2014-06-02",h:"9PM",n:90},
  {f:"2014-06-03",h:"11AM",n:27},
  {f:"2014-06-03",h:"3PM",n:48},
  {f:"2014-06-03",h:"9PM",n:90},
  {f:"2014-06-04",h:"11AM",n:50},
  {f:"2014-06-04",h:"3PM",n:1},
  {f:"2014-06-04",h:"9PM",n:96},
  {f:"2014-06-05",h:"11AM",n:26},
  {f:"2014-06-05",h:"3PM",n:95},
  {f:"2014-06-05",h:"9PM",n:24},
  {f:"2014-06-06",h:"11AM",n:56},
  {f:"2014-06-06",h:"3PM",n:49},
  {f:"2014-06-06",h:"9PM",n:91},
  {f:"2014-06-07",h:"11AM",n:60},
  {f:"2014-06-07",h:"3PM",n:74},
  {f:"2014-06-07",h:"9PM",n:19},
  {f:"2014-06-08",h:"11AM",n:46},
  {f:"2014-06-08",h:"3PM",n:90},
  {f:"2014-06-08",h:"9PM",n:75},
  {f:"2014-06-09",h:"11AM",n:72},
  {f:"2014-06-09",h:"3PM",n:70},
  {f:"2014-06-09",h:"9PM",n:5},
  {f:"2014-06-10",h:"11AM",n:86},
  {f:"2014-06-10",h:"3PM",n:14},
  {f:"2014-06-10",h:"9PM",n:95},
  {f:"2014-06-11",h:"11AM",n:73},
  {f:"2014-06-11",h:"3PM",n:95},
  {f:"2014-06-11",h:"9PM",n:44},
  {f:"2014-06-12",h:"11AM",n:84},
  {f:"2014-06-12",h:"3PM",n:71},
  {f:"2014-06-12",h:"9PM",n:73},
  {f:"2014-06-13",h:"11AM",n:6},
  {f:"2014-06-13",h:"3PM",n:79},
  {f:"2014-06-13",h:"9PM",n:86},
  {f:"2014-06-14",h:"11AM",n:56},
  {f:"2014-06-14",h:"3PM",n:7},
  {f:"2014-06-14",h:"9PM",n:63},
  {f:"2014-06-15",h:"11AM",n:79},
  {f:"2014-06-15",h:"3PM",n:81},
  {f:"2014-06-15",h:"9PM",n:47},
  {f:"2014-06-16",h:"11AM",n:88},
  {f:"2014-06-16",h:"3PM",n:54},
  {f:"2014-06-16",h:"9PM",n:51},
  {f:"2014-06-17",h:"11AM",n:59},
  {f:"2014-06-17",h:"3PM",n:41},
  {f:"2014-06-17",h:"9PM",n:17},
  {f:"2014-06-18",h:"11AM",n:10},
  {f:"2014-06-18",h:"3PM",n:62},
  {f:"2014-06-18",h:"9PM",n:79},
  {f:"2014-06-19",h:"11AM",n:50},
  {f:"2014-06-19",h:"3PM",n:97},
  {f:"2014-06-19",h:"9PM",n:95},
  {f:"2014-06-20",h:"11AM",n:78},
  {f:"2014-06-20",h:"3PM",n:21},
  {f:"2014-06-20",h:"9PM",n:10},
  {f:"2014-06-21",h:"11AM",n:62},
  {f:"2014-06-21",h:"3PM",n:40},
  {f:"2014-06-21",h:"9PM",n:91},
  {f:"2014-06-22",h:"11AM",n:75},
  {f:"2014-06-22",h:"3PM",n:21},
  {f:"2014-06-22",h:"9PM",n:62},
  {f:"2014-06-23",h:"11AM",n:64},
  {f:"2014-06-23",h:"3PM",n:65},
  {f:"2014-06-23",h:"9PM",n:33},
  {f:"2014-06-24",h:"11AM",n:66},
  {f:"2014-06-24",h:"3PM",n:21},
  {f:"2014-06-24",h:"9PM",n:59},
  {f:"2014-06-25",h:"11AM",n:98},
  {f:"2014-06-25",h:"3PM",n:30},
  {f:"2014-06-25",h:"9PM",n:12},
  {f:"2014-06-26",h:"11AM",n:43},
  {f:"2014-06-26",h:"3PM",n:46},
  {f:"2014-06-26",h:"9PM",n:49},
  {f:"2014-06-27",h:"11AM",n:53},
  {f:"2014-06-27",h:"3PM",n:36},
  {f:"2014-06-27",h:"9PM",n:46},
  {f:"2014-06-28",h:"11AM",n:81},
  {f:"2014-06-28",h:"3PM",n:71},
  {f:"2014-06-28",h:"9PM",n:91},
  {f:"2014-06-29",h:"11AM",n:57},
  {f:"2014-06-29",h:"3PM",n:6},
  {f:"2014-06-29",h:"9PM",n:84},
  {f:"2014-06-30",h:"11AM",n:96},
  {f:"2014-06-30",h:"3PM",n:13},
  {f:"2014-06-30",h:"9PM",n:32},
  {f:"2014-07-01",h:"11AM",n:90},
  {f:"2014-07-01",h:"3PM",n:19},
  {f:"2014-07-01",h:"9PM",n:48},
  {f:"2014-07-02",h:"11AM",n:85},
  {f:"2014-07-02",h:"3PM",n:33},
  {f:"2014-07-02",h:"9PM",n:88},
  {f:"2014-07-03",h:"11AM",n:33},
  {f:"2014-07-03",h:"3PM",n:7},
  {f:"2014-07-03",h:"9PM",n:53},
  {f:"2014-07-04",h:"11AM",n:80},
  {f:"2014-07-04",h:"3PM",n:81},
  {f:"2014-07-04",h:"9PM",n:89},
  {f:"2014-07-05",h:"11AM",n:0},
  {f:"2014-07-05",h:"3PM",n:45},
  {f:"2014-07-05",h:"9PM",n:42},
  {f:"2014-07-06",h:"11AM",n:29},
  {f:"2014-07-06",h:"3PM",n:56},
  {f:"2014-07-06",h:"9PM",n:23},
  {f:"2014-07-07",h:"11AM",n:93},
  {f:"2014-07-07",h:"3PM",n:58},
  {f:"2014-07-07",h:"9PM",n:69},
  {f:"2014-07-08",h:"11AM",n:42},
  {f:"2014-07-08",h:"3PM",n:30},
  {f:"2014-07-08",h:"9PM",n:49},
  {f:"2014-07-09",h:"11AM",n:15},
  {f:"2014-07-09",h:"3PM",n:65},
  {f:"2014-07-09",h:"9PM",n:19},
  {f:"2014-07-10",h:"11AM",n:43},
  {f:"2014-07-10",h:"3PM",n:11},
  {f:"2014-07-10",h:"9PM",n:8},
  {f:"2014-07-11",h:"11AM",n:89},
  {f:"2014-07-11",h:"3PM",n:98},
  {f:"2014-07-11",h:"9PM",n:3},
  {f:"2014-07-12",h:"11AM",n:17},
  {f:"2014-07-12",h:"3PM",n:18},
  {f:"2014-07-12",h:"9PM",n:28},
  {f:"2014-07-13",h:"11AM",n:83},
  {f:"2014-07-13",h:"3PM",n:58},
  {f:"2014-07-13",h:"9PM",n:82},
  {f:"2014-07-14",h:"11AM",n:90},
  {f:"2014-07-14",h:"3PM",n:63},
  {f:"2014-07-14",h:"9PM",n:55},
  {f:"2014-07-15",h:"11AM",n:58},
  {f:"2014-07-15",h:"3PM",n:8},
  {f:"2014-07-15",h:"9PM",n:59},
  {f:"2014-07-16",h:"11AM",n:39},
  {f:"2014-07-16",h:"3PM",n:21},
  {f:"2014-07-16",h:"9PM",n:85},
  {f:"2014-07-17",h:"11AM",n:72},
  {f:"2014-07-17",h:"3PM",n:20},
  {f:"2014-07-17",h:"9PM",n:88},
  {f:"2014-07-18",h:"11AM",n:86},
  {f:"2014-07-18",h:"3PM",n:92},
  {f:"2014-07-18",h:"9PM",n:78},
  {f:"2014-07-19",h:"11AM",n:80},
  {f:"2014-07-19",h:"3PM",n:91},
  {f:"2014-07-19",h:"9PM",n:24},
  {f:"2014-07-20",h:"11AM",n:76},
  {f:"2014-07-20",h:"3PM",n:20},
  {f:"2014-07-20",h:"9PM",n:75},
  {f:"2014-07-21",h:"11AM",n:35},
  {f:"2014-07-21",h:"3PM",n:97},
  {f:"2014-07-21",h:"9PM",n:80},
  {f:"2014-07-22",h:"11AM",n:88},
  {f:"2014-07-22",h:"3PM",n:0},
  {f:"2014-07-22",h:"9PM",n:86},
  {f:"2014-07-23",h:"11AM",n:25},
  {f:"2014-07-23",h:"3PM",n:57},
  {f:"2014-07-23",h:"9PM",n:51},
  {f:"2014-07-24",h:"11AM",n:16},
  {f:"2014-07-24",h:"3PM",n:1},
  {f:"2014-07-24",h:"9PM",n:56},
  {f:"2014-07-25",h:"11AM",n:80},
  {f:"2014-07-25",h:"3PM",n:16},
  {f:"2014-07-25",h:"9PM",n:51},
  {f:"2014-07-26",h:"11AM",n:98},
  {f:"2014-07-26",h:"3PM",n:68},
  {f:"2014-07-26",h:"9PM",n:20},
  {f:"2014-07-27",h:"11AM",n:47},
  {f:"2014-07-27",h:"3PM",n:83},
  {f:"2014-07-27",h:"9PM",n:73},
  {f:"2014-07-28",h:"11AM",n:34},
  {f:"2014-07-28",h:"3PM",n:31},
  {f:"2014-07-28",h:"9PM",n:39},
  {f:"2014-07-29",h:"11AM",n:4},
  {f:"2014-07-29",h:"3PM",n:84},
  {f:"2014-07-29",h:"9PM",n:78},
  {f:"2014-07-30",h:"11AM",n:87},
  {f:"2014-07-30",h:"3PM",n:82},
  {f:"2014-07-30",h:"9PM",n:27},
  {f:"2014-07-31",h:"11AM",n:18},
  {f:"2014-07-31",h:"3PM",n:94},
  {f:"2014-07-31",h:"9PM",n:76},
  {f:"2014-08-01",h:"11AM",n:43},
  {f:"2014-08-01",h:"3PM",n:79},
  {f:"2014-08-01",h:"9PM",n:23},
  {f:"2014-08-02",h:"11AM",n:80},
  {f:"2014-08-02",h:"3PM",n:11},
  {f:"2014-08-02",h:"9PM",n:41},
  {f:"2014-08-03",h:"11AM",n:89},
  {f:"2014-08-03",h:"3PM",n:34},
  {f:"2014-08-03",h:"9PM",n:95},
  {f:"2014-08-04",h:"11AM",n:11},
  {f:"2014-08-04",h:"3PM",n:59},
  {f:"2014-08-04",h:"9PM",n:50},
  {f:"2014-08-05",h:"11AM",n:12},
  {f:"2014-08-05",h:"3PM",n:66},
  {f:"2014-08-05",h:"9PM",n:82},
  {f:"2014-08-06",h:"11AM",n:41},
  {f:"2014-08-06",h:"3PM",n:13},
  {f:"2014-08-06",h:"9PM",n:29},
  {f:"2014-08-07",h:"11AM",n:15},
  {f:"2014-08-07",h:"3PM",n:0},
  {f:"2014-08-07",h:"9PM",n:87},
  {f:"2014-08-08",h:"11AM",n:15},
  {f:"2014-08-08",h:"3PM",n:41},
  {f:"2014-08-08",h:"9PM",n:28},
  {f:"2014-08-09",h:"11AM",n:88},
  {f:"2014-08-09",h:"3PM",n:89},
  {f:"2014-08-09",h:"9PM",n:26},
  {f:"2014-08-10",h:"11AM",n:17},
  {f:"2014-08-10",h:"3PM",n:55},
  {f:"2014-08-10",h:"9PM",n:96},
  {f:"2014-08-11",h:"11AM",n:61},
  {f:"2014-08-11",h:"3PM",n:24},
  {f:"2014-08-11",h:"9PM",n:75},
  {f:"2014-08-12",h:"11AM",n:77},
  {f:"2014-08-12",h:"3PM",n:15},
  {f:"2014-08-12",h:"9PM",n:68},
  {f:"2014-08-13",h:"11AM",n:78},
  {f:"2014-08-13",h:"3PM",n:11},
  {f:"2014-08-13",h:"9PM",n:5},
  {f:"2014-08-14",h:"11AM",n:45},
  {f:"2014-08-14",h:"3PM",n:60},
  {f:"2014-08-14",h:"9PM",n:1},
  {f:"2014-08-15",h:"11AM",n:90},
  {f:"2014-08-15",h:"3PM",n:13},
  {f:"2014-08-15",h:"9PM",n:38},
  {f:"2014-08-16",h:"11AM",n:46},
  {f:"2014-08-16",h:"3PM",n:17},
  {f:"2014-08-16",h:"9PM",n:26},
  {f:"2014-08-17",h:"11AM",n:15},
  {f:"2014-08-17",h:"3PM",n:66},
  {f:"2014-08-17",h:"9PM",n:32},
  {f:"2014-08-18",h:"11AM",n:76},
  {f:"2014-08-18",h:"3PM",n:13},
  {f:"2014-08-18",h:"9PM",n:93},
  {f:"2014-08-19",h:"11AM",n:29},
  {f:"2014-08-19",h:"3PM",n:10},
  {f:"2014-08-19",h:"9PM",n:54},
  {f:"2014-08-20",h:"11AM",n:91},
  {f:"2014-08-20",h:"3PM",n:79},
  {f:"2014-08-20",h:"9PM",n:38},
  {f:"2014-08-21",h:"11AM",n:96},
  {f:"2014-08-21",h:"3PM",n:85},
  {f:"2014-08-21",h:"9PM",n:39},
  {f:"2014-08-22",h:"11AM",n:31},
  {f:"2014-08-22",h:"3PM",n:96},
  {f:"2014-08-22",h:"9PM",n:16},
  {f:"2014-08-23",h:"11AM",n:53},
  {f:"2014-08-23",h:"3PM",n:82},
  {f:"2014-08-23",h:"9PM",n:52},
  {f:"2014-08-24",h:"11AM",n:2},
  {f:"2014-08-24",h:"3PM",n:42},
  {f:"2014-08-24",h:"9PM",n:72},
  {f:"2014-08-25",h:"11AM",n:93},
  {f:"2014-08-25",h:"3PM",n:88},
  {f:"2014-08-25",h:"9PM",n:25},
  {f:"2014-08-26",h:"11AM",n:21},
  {f:"2014-08-26",h:"3PM",n:83},
  {f:"2014-08-26",h:"9PM",n:92},
  {f:"2014-08-27",h:"11AM",n:32},
  {f:"2014-08-27",h:"3PM",n:18},
  {f:"2014-08-27",h:"9PM",n:96},
  {f:"2014-08-28",h:"11AM",n:14},
  {f:"2014-08-28",h:"3PM",n:36},
  {f:"2014-08-28",h:"9PM",n:85},
  {f:"2014-08-29",h:"11AM",n:19},
  {f:"2014-08-29",h:"3PM",n:37},
  {f:"2014-08-29",h:"9PM",n:53},
  {f:"2014-08-30",h:"11AM",n:95},
  {f:"2014-08-30",h:"3PM",n:81},
  {f:"2014-08-30",h:"9PM",n:53},
  {f:"2014-08-31",h:"11AM",n:84},
  {f:"2014-08-31",h:"3PM",n:6},
  {f:"2014-08-31",h:"9PM",n:51},
  {f:"2014-09-01",h:"11AM",n:78},
  {f:"2014-09-01",h:"3PM",n:96},
  {f:"2014-09-01",h:"9PM",n:33},
  {f:"2014-09-02",h:"11AM",n:70},
  {f:"2014-09-02",h:"3PM",n:59},
  {f:"2014-09-02",h:"9PM",n:81},
  {f:"2014-09-03",h:"11AM",n:17},
  {f:"2014-09-03",h:"3PM",n:40},
  {f:"2014-09-03",h:"9PM",n:57},
  {f:"2014-09-04",h:"11AM",n:88},
  {f:"2014-09-04",h:"3PM",n:12},
  {f:"2014-09-04",h:"9PM",n:79},
  {f:"2014-09-05",h:"11AM",n:23},
  {f:"2014-09-05",h:"3PM",n:30},
  {f:"2014-09-05",h:"9PM",n:90},
  {f:"2014-09-06",h:"11AM",n:41},
  {f:"2014-09-06",h:"3PM",n:38},
  {f:"2014-09-06",h:"9PM",n:35},
  {f:"2014-09-07",h:"11AM",n:4},
  {f:"2014-09-07",h:"3PM",n:12},
  {f:"2014-09-07",h:"9PM",n:11},
  {f:"2014-09-08",h:"11AM",n:50},
  {f:"2014-09-08",h:"3PM",n:50},
  {f:"2014-09-08",h:"9PM",n:21},
  {f:"2014-09-09",h:"11AM",n:34},
  {f:"2014-09-09",h:"3PM",n:13},
  {f:"2014-09-09",h:"9PM",n:60},
  {f:"2014-09-10",h:"11AM",n:87},
  {f:"2014-09-10",h:"3PM",n:24},
  {f:"2014-09-10",h:"9PM",n:65},
  {f:"2014-09-11",h:"11AM",n:92},
  {f:"2014-09-11",h:"3PM",n:61},
  {f:"2014-09-11",h:"9PM",n:67},
  {f:"2014-09-12",h:"11AM",n:28},
  {f:"2014-09-12",h:"3PM",n:91},
  {f:"2014-09-12",h:"9PM",n:59},
  {f:"2014-09-13",h:"11AM",n:54},
  {f:"2014-09-13",h:"3PM",n:22},
  {f:"2014-09-13",h:"9PM",n:90},
  {f:"2014-09-14",h:"11AM",n:53},
  {f:"2014-09-14",h:"3PM",n:63},
  {f:"2014-09-14",h:"9PM",n:89},
  {f:"2014-09-15",h:"11AM",n:31},
  {f:"2014-09-15",h:"3PM",n:41},
  {f:"2014-09-15",h:"9PM",n:22},
  {f:"2014-09-16",h:"11AM",n:1},
  {f:"2014-09-16",h:"3PM",n:93},
  {f:"2014-09-16",h:"9PM",n:54},
  {f:"2014-09-17",h:"11AM",n:16},
  {f:"2014-09-17",h:"3PM",n:0},
  {f:"2014-09-17",h:"9PM",n:15},
  {f:"2014-09-18",h:"11AM",n:29},
  {f:"2014-09-18",h:"3PM",n:11},
  {f:"2014-09-18",h:"9PM",n:39},
  {f:"2014-09-19",h:"11AM",n:41},
  {f:"2014-09-19",h:"3PM",n:18},
  {f:"2014-09-19",h:"9PM",n:74},
  {f:"2014-09-20",h:"11AM",n:10},
  {f:"2014-09-20",h:"3PM",n:6},
  {f:"2014-09-20",h:"9PM",n:54},
  {f:"2014-09-21",h:"11AM",n:16},
  {f:"2014-09-21",h:"3PM",n:61},
  {f:"2014-09-21",h:"9PM",n:71},
  {f:"2014-09-22",h:"11AM",n:39},
  {f:"2014-09-22",h:"3PM",n:47},
  {f:"2014-09-22",h:"9PM",n:63},
  {f:"2014-09-23",h:"11AM",n:82},
  {f:"2014-09-23",h:"3PM",n:58},
  {f:"2014-09-23",h:"9PM",n:81},
  {f:"2014-09-24",h:"11AM",n:98},
  {f:"2014-09-24",h:"3PM",n:71},
  {f:"2014-09-24",h:"9PM",n:24},
  {f:"2014-09-25",h:"11AM",n:24},
  {f:"2014-09-25",h:"3PM",n:71},
  {f:"2014-09-25",h:"9PM",n:83},
  {f:"2014-09-26",h:"11AM",n:98},
  {f:"2014-09-26",h:"3PM",n:35},
  {f:"2014-09-26",h:"9PM",n:8},
  {f:"2014-09-27",h:"11AM",n:50},
  {f:"2014-09-27",h:"3PM",n:87},
  {f:"2014-09-27",h:"9PM",n:3},
  {f:"2014-09-28",h:"11AM",n:85},
  {f:"2014-09-28",h:"3PM",n:34},
  {f:"2014-09-28",h:"9PM",n:75},
  {f:"2014-09-29",h:"11AM",n:12},
  {f:"2014-09-29",h:"3PM",n:46},
  {f:"2014-09-29",h:"9PM",n:63},
  {f:"2014-09-30",h:"11AM",n:8},
  {f:"2014-09-30",h:"3PM",n:37},
  {f:"2014-09-30",h:"9PM",n:25},
  {f:"2014-10-01",h:"11AM",n:28},
  {f:"2014-10-01",h:"3PM",n:4},
  {f:"2014-10-01",h:"9PM",n:6},
  {f:"2014-10-02",h:"11AM",n:61},
  {f:"2014-10-02",h:"3PM",n:84},
  {f:"2014-10-02",h:"9PM",n:69},
  {f:"2014-10-03",h:"11AM",n:99},
  {f:"2014-10-03",h:"3PM",n:75},
  {f:"2014-10-03",h:"9PM",n:45},
  {f:"2014-10-04",h:"11AM",n:87},
  {f:"2014-10-04",h:"3PM",n:57},
  {f:"2014-10-04",h:"9PM",n:36},
  {f:"2014-10-05",h:"11AM",n:51},
  {f:"2014-10-05",h:"3PM",n:15},
  {f:"2014-10-05",h:"9PM",n:95},
  {f:"2014-10-06",h:"11AM",n:77},
  {f:"2014-10-06",h:"3PM",n:70},
  {f:"2014-10-06",h:"9PM",n:30},
  {f:"2014-10-07",h:"11AM",n:72},
  {f:"2014-10-07",h:"3PM",n:33}
];

        let inserted = 0, skipped = 0, errors = 0;
        for (let i = 0; i < draws.length; i++) {
          const d = draws[i];
          try {
            const result = await DB.saveDraw({ fecha: d.f, pais: "HN", horario: d.h, numero: d.n });
            if (result && typeof result === "object" && result.duplicate) {
              skipped++;
            } else {
              inserted++;
            }
          } catch (err) {
            errors++;
          }
          if ((i + 1) % 50 === 0 || i === draws.length - 1) {
            out.innerHTML = `<p>Progreso: ${i + 1}/${draws.length} — Insertados: ${inserted} · Duplicados: ${skipped} · Errores: ${errors}</p>`;
          }
        }

        const summary = `✅ Importación completa — ${inserted} insertados, ${skipped} duplicados saltados, ${errors} errores.`;
        out.innerHTML = `<p>${summary}</p>`;
        showToast(summary, { variant: inserted > 0 ? "success" : "info" });
        import2014Btn.disabled = false;
        import2014Btn.textContent = "Importar 839 sorteos de 2014";
      });
    }

export { initWiki };
