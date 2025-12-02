# La Diaria v3.2

Aplicación web estática para gestionar y visualizar hipótesis de sorteos diarios (11 AM, 3 PM y 9 PM), estadísticas de diciembre y herramientas auxiliares como transformaciones, estrategias y cuaderno.

## Requisitos
- Node.js 18+
- npm

## Instalación
```
npm install
```

## Ejecutar en desarrollo
Inicia un servidor local con autorecarga en `http://localhost:3000`:
```
npm run dev
```

## Estructura rápida
- `index.html`: interfaz principal con vistas de panel del día, hipótesis, escenarios, modos, etc.
- `login.html`: formulario de autenticación previa.
- `style.css`: estilos globales.
- `src/`: utilidades JS para autenticación, manejo de datos y vistas.

## Notas
El proyecto no define pruebas automatizadas. Usa la vista "Acceso" para autenticar antes de navegar el resto de la aplicación.
