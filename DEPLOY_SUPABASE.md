# Guía de despliegue en Supabase

Esta guía cubre el proceso completo para levantar el backend (Supabase/PostgreSQL) y servir el frontend estático de **La Diaria**.

## 1. Crear el proyecto en Supabase
1. Inicia sesión en [https://supabase.com](https://supabase.com) y crea un nuevo proyecto.
2. Elige la organización (o crea una) y especifica el nombre del proyecto.
3. Selecciona la región más cercana a tus usuarios para reducir latencia.
4. Define una contraseña fuerte para el usuario `postgres` (te servirá para ejecutar SQL y depurar).
5. Espera a que Supabase aprovisione la instancia.

## 2. Ejecutar el SQL inicial
1. Desde el panel del proyecto, abre la sección **SQL Editor**.
2. Crea una nueva consulta y pega el contenido de `schema.sql` (en la raíz del repositorio).
3. Ejecuta la consulta para crear todas las tablas e índices equivalentes a los que usaba Dexie.
4. Verifica que no haya errores; Supabase mostrará un resumen con el resultado.

> Si deseas poblar datos iniciales, puedes escribir sentencias `INSERT` adicionales después de la creación de tablas.

## 3. Obtener las llaves y URL del proyecto
1. Ve a **Project Settings → API** dentro de Supabase.
2. Copia la `Project URL` (por ejemplo, `https://xxxx.supabase.co`).
3. Copia la `anon public key` (JWT) para usarla en el frontend.
4. Opcional: guarda también la `service_role key` si necesitas scripts administrativos (no la expongas en el frontend).

## 4. Configurar las claves en el cliente
1. Duplica `config.example.env` como `config.env` (o `.env.local` según tu flujo).
2. Reemplaza los valores:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
   ```
3. Asegúrate de que la herramienta que uses para servir el frontend (por ejemplo, `live-server` o un hosting estático) exponga estas variables al navegador. Si tu host no soporta `.env`, puedes generar un archivo `src/supabaseClient.js` con las credenciales embebidas (solo para entornos privados). Para producción, considera un paso de build que reemplace estos placeholders.

## 5. Desplegar el frontend estático
1. Ejecuta `npm install` para instalar dependencias (solo necesitas las devDependencies para el servidor local).
2. Usa `npm run dev` para revisar localmente que todo funciona con las variables reales.
3. Para hosting, puedes subir la carpeta completa al proveedor de tu preferencia (Netlify, Vercel, GitHub Pages, etc.). Asegúrate de:
   - Servir `index.html` como entrada principal.
   - Habilitar encabezados `cache-control` razonables para `src/`.
   - Inyectar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en tiempo de despliegue (mediante variables del proveedor o archivos generados).

## 6. Verificar el funcionamiento
1. Abre la aplicación en el hosting final con el navegador.
2. Inicia sesión en el sistema (usa las credenciales definidas en `login.html`).
3. Prueba las operaciones críticas:
   - Registrar un sorteo manual (usa el panel del día).
   - Listar hipótesis y guardar una nueva.
   - Revisar la sección de “Mantenimiento” para detectar duplicados.
   - Registrar una entrada en el cuaderno o modo de juego.
4. Confirma en el panel de Supabase (sección **Table Editor**) que los registros aparecen en las tablas correspondientes.
5. Si algo falla, abre la consola del navegador para verificar errores de red o autenticación.

Con estos pasos deberías tener la aplicación corriendo en Supabase con hosting estático. Mantén tus claves en entornos seguros y rota la `anon key` si sospechas exposición.
