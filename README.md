# BusTrack El Oro

Rastreo de buses urbanos en tiempo real para Machala, El Oro — sin instalar ningún hardware en las unidades. El celular del propio conductor es el GPS.

Proyecto desarrollado para **INNOVA UTMACH 2026**.

## El problema

En una encuesta propia a 24 usuarios de transporte urbano en Machala, el **79.2%** dijo que nunca o solo a veces sabe cuánto falta para que llegue su bus, y el **75%** reportó esperar entre 5 y 15 minutos en la parada sin saber si el bus viene. El **91.7%** calificó con la nota máxima la importancia de una app que muestre la ubicación del bus en tiempo real.

BusTrack resuelve esto con una sola app con dos vistas: el conductor transmite su posición mientras maneja, y el pasajero ve el bus acercarse en un mapa en vivo, con ETA calculado sobre el trazado real de la ruta.

## Características

**Vista Pasajero**
- Mapa en vivo (Leaflet) con la posición del bus sobre el trazado real de la ruta
- ETA calculado siguiendo las calles de la ruta, no en línea recta
- Notificación local configurable cuando el bus está a N minutos de la parada
- Badge de incidente en tiempo real si el conductor reporta algo (accidente, avería, desvío, tráfico)
- Selección de ruta y parada sin necesidad de login (deviceId en `localStorage`)

**Vista Conductor**
- Transmisión de GPS en primer plano con Wake Lock
- Inicio/fin de viaje por ruta, con datos de la unidad (empresa, número)
- Reporte de incidentes en un tap
- Grabación opcional del trazado recorrido

**Rutas**
- Las 20 líneas urbanas oficiales del GAD Machala, trazadas sobre calles reales vía OSRM + relaciones de OpenStreetMap
- Las rutas se leen dinámicamente desde Firebase — agregar/editar una ruta no requiere cambios en el código de la app

## Stack

- React + Vite
- Firebase Realtime Database (posiciones de buses y rutas)
- Leaflet / react-leaflet
- Capacitor (empaquetado a Android)

## Estructura del proyecto

```
src/
  components/
    conductor/     Vista y controles del conductor
    passenger/      Mapa, panel de ETA, selector de ruta/parada
  config/          Categorías de incidentes, centro del mapa
  context/         Selector de rol (Conductor/Pasajero)
  hooks/           useRoutes, useEta, useNotifyThreshold, etc.
  services/        Firebase: buses, rutas, incidentes, notificaciones
  utils/           Cálculos geográficos (ETA, proyección sobre trazado)
scripts/
  seed-data/       build-routes.mjs (trazado OSRM/OSM) + routes.json generado
  seedRoutes.mjs   Sube routes.json a Firebase
  simulate-bus.mjs Simulación de buses para pruebas y demo
docs/
  rutas-gad-machala/  PDFs oficiales de cada línea (fuente del trazado)
```

## Instalación

```bash
npm install
```

Crea un archivo `.env` en la raíz con las credenciales de tu proyecto de Firebase:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

```bash
npm run dev
```

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (`dist/`) |
| `npm run seed:build-routes` | Genera `scripts/seed-data/routes.json` trazando las rutas sobre calles reales (OSRM + OSM) |
| `npm run seed:routes` | Sube `routes.json` a Firebase |
| `node scripts/simulate-bus.mjs start` | Publica buses de prueba para probar ETA/notificaciones sin conductor real |
| `node scripts/simulate-bus.mjs demo` | Simula 3 buses en cada una de las 20 rutas — usado para demos en vivo |
| `node scripts/simulate-bus.mjs stop` | Desactiva los buses simulados |

## Build Android (APK)

El proyecto usa Capacitor. Tras `npm run build`, sincroniza y abre el proyecto Android con Android Studio (JDK 21) para compilar el APK.

## Escalar a otros cantones

La app (React/APK) no necesita cambios de código para sumar rutas nuevas — las carga dinámicamente desde Firebase. Lo que sí requiere trabajo por cada cantón nuevo es correr `build-routes.mjs` sobre los datos de calles y paradas de ese cantón para generar su trazado.
