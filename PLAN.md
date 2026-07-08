# BusTrack El Oro — Plan de Implementación

> Estado actual: **Listo para empezar Fase 0, Tarea 1.** Aún no existe código del proyecto (carpeta vacía salvo `.claude/`).

## Contexto

Webapp React + Vite, empaquetada con Capacitor, que produce un **APK Android** y funciona como sistema de rastreo de buses urbanos en Machala (El Oro, Ecuador), **sin hardware externo**: el celular del conductor es el dispositivo GPS.

Una sola app, **dos vistas según el rol** elegido al abrir:

- **Conductor:** activa el GPS nativo, escribe su ubicación en Firebase Realtime Database cada 3 s, y detecta baches con el acelerómetro (DeviceMotion).
- **Pasajero:** mapa Leaflet de Machala con los buses en tiempo real, cálculo de ETA a una parada elegida y notificación local cuando el bus está a ≤2 minutos.

## Decisiones confirmadas

1. **Alerta de proximidad** = `@capacitor/local-notifications` con ETA calculado en el cliente (sin backend, sin Cloud Functions).
2. **Identidad** = sin login; selector de rol + `deviceId` en `localStorage`. El conductor elige ruta y número de bus. Reglas RTDB simples.
3. **Rutas** = scaffold con 1-2 rutas de ejemplo de Machala en `src/config/machala.js`, editables; ETA sobre la polilínea de la ruta cuando existe.
4. **GPS** = primer plano + Wake Lock (pantalla encendida). `@capacitor/geolocation watchPosition`, sin plugins de background.

FCM y background-geolocation quedan como **fase opcional futura (Fase 7)**, fuera del MVP.

---

## Arquitectura

```
┌────────────────────┐      cada 3 s        ┌─────────────────────────┐
│  Vista Conductor   │  ── escribe loc ──▶  │  Firebase Realtime DB   │
│  (celular con GPS) │  ── baches ───────▶  │  /buses  /potholes      │
│  Geolocation +     │                      │  /routes (semilla)      │
│  DeviceMotion +    │                      └───────────┬─────────────┘
│  Wake Lock         │                                  │ onValue (tiempo real)
└────────────────────┘                                  ▼
                                              ┌─────────────────────────┐
                                              │   Vista Pasajero        │
                                              │   Leaflet + marcadores   │
                                              │   ETA en cliente ──▶     │
                                              │   Local Notification 2min│
                                              └─────────────────────────┘
```

### Modelo de datos (Realtime Database)

```
/buses/{busId}
  busId, driverId(deviceId), routeId, busNumber
  lat, lng, speed, heading
  updatedAt (serverTimestamp), active (bool)
/potholes/{pushId}
  lat, lng, magnitude, busId, reportedAt
/routes/{routeId}          ← sembrado desde machala.js (config local es la fuente de verdad para el MVP)
  name, color
  stops: [{ id, name, lat, lng, order }]
  path:  [[lat,lng], ...]  ← polilínea para ETA
```

Regla de diseño: la **config local** (`src/config/machala.js`) es la fuente de rutas/paradas; `/routes` en RTDB es opcional. El MVP lee rutas desde config y solo usa RTDB para `/buses` y `/potholes`.

**ETA:** distancia restante del bus a la parada a lo largo de la polilínea de la ruta (proyectando el bus al punto más cercano del `path`) ÷ velocidad suavizada (media móvil, piso mínimo ~5 km/h). Fallback a haversine en línea recta si la ruta no tiene `path`.

---

## Estructura de carpetas

```
bustrack-eloro/
├── android/                       (generado por Capacitor)
├── public/
│   └── marker-bus.svg
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── firebase.js
│   ├── config/
│   │   └── machala.js             (centro Machala + rutas/paradas ejemplo)
│   ├── context/
│   │   └── RoleContext.jsx
│   ├── hooks/
│   │   ├── useGeolocation.js
│   │   ├── useMotionDetector.js
│   │   ├── useWakeLock.js
│   │   ├── useBuses.js
│   │   └── useEta.js
│   ├── services/
│   │   ├── locationService.js     (escribe /buses cada 3 s)
│   │   ├── potholeService.js      (escribe /potholes)
│   │   ├── busService.js          (subscribe onValue /buses)
│   │   └── notificationService.js (local notifications)
│   ├── utils/
│   │   └── geo.js                 (haversine, proyección a polilínea, ETA)
│   ├── components/
│   │   ├── RoleSelector.jsx
│   │   ├── conductor/
│   │   │   ├── ConductorView.jsx
│   │   │   └── TripControls.jsx
│   │   └── passenger/
│   │       ├── PassengerView.jsx
│   │       ├── BusMap.jsx
│   │       ├── StopSelector.jsx
│   │       └── EtaPanel.jsx
│   └── styles/
│       └── app.css
├── .env                           (claves Firebase)
├── database.rules.json            (reglas RTDB)
├── capacitor.config.ts
├── vite.config.js
├── index.html
└── package.json
```

---

## Prerrequisitos

- Node 22 / npm 10 → ✅ ya instalados.
- **Java JDK 17** y **Android Studio** (SDK + platform-tools) → necesarios para compilar el APK (Fase 6). Verificar/instalar antes de esa fase.
- Un **proyecto Firebase** creado en consola con **Realtime Database** activada (modo de prueba) → claves van en `.env` (Fase 1).

---

## Orden de tareas (2-5 min c/u, con archivo exacto)

### Fase 0 — Scaffolding
- [ ] 1. **Crear proyecto Vite React** en la carpeta INNOVA → genera `package.json`, `index.html`, `src/main.jsx`, `src/App.jsx`. `npm create vite@latest . -- --template react`. *(en progreso — primer intento cancelado, sin cambios en disco)*
- [ ] 2. **Instalar dependencias runtime** → `package.json`: `firebase leaflet react-leaflet`.
- [ ] 3. **Instalar Capacitor + plugins** → `package.json`: `@capacitor/core @capacitor/cli @capacitor/android @capacitor/geolocation @capacitor/motion @capacitor/local-notifications`.
- [ ] 4. **Inicializar Capacitor** → genera `capacitor.config.ts` (appId `com.bustrack.eloro`, appName `BusTrack El Oro`, webDir `dist`).

### Fase 1 — Firebase
- [ ] 5. **Crear `.env`** con las 6 claves `VITE_FIREBASE_*` del proyecto Firebase.
- [ ] 6. **Crear `src/firebase.js`**: init de la app + export de `getDatabase()`. Lee de `import.meta.env`.
- [ ] 7. **Crear `database.rules.json`**: reglas simples (lectura pública de `/buses` y `/potholes`; escritura permitida al MVP; índice `.indexOn` por `active`).

### Fase 2 — Config de datos
- [ ] 8. **Crear `src/config/machala.js`**: centro `[-3.2586, -79.9606]`, zoom, y 1-2 rutas ejemplo con `stops[]` y `path[]` (coordenadas de Machala, editables).
- [ ] 9. **Crear `src/utils/geo.js`**: `haversine()`, `nearestPointOnPath()`, `distanceAlongPath()`, `computeEta()`.

### Fase 3 — Rol y navegación
- [ ] 10. **Crear `src/context/RoleContext.jsx`**: rol (`null|conductor|pasajero`) + `deviceId` persistido en `localStorage`.
- [ ] 11. **Crear `src/components/RoleSelector.jsx`**: dos botones grandes "Soy Conductor" / "Soy Pasajero".
- [ ] 12. **Editar `src/App.jsx`**: envolver en `RoleProvider`, renderizar `RoleSelector` o la vista según rol.
- [ ] 13. **Crear `src/styles/app.css`** + importar en `main.jsx`: estilos base móviles e import de `leaflet/dist/leaflet.css`.

### Fase 4 — Vista Conductor
- [ ] 14. **Crear `src/hooks/useWakeLock.js`**: solicita/renueva Screen Wake Lock mientras el viaje está activo.
- [ ] 15. **Crear `src/hooks/useGeolocation.js`**: `Geolocation.watchPosition` de Capacitor → devuelve `{lat,lng,speed,heading}`.
- [ ] 16. **Crear `src/services/locationService.js`**: `startPublishing(busInfo)` con `set(ref /buses/{busId})` throttled a 3 s con `serverTimestamp`; `stopPublishing()` marca `active:false`.
- [ ] 17. **Crear `src/hooks/useMotionDetector.js`**: `Motion.addListener('accel')`, filtra magnitud vertical, detecta pico > umbral (con debounce) → callback de bache.
- [ ] 18. **Crear `src/services/potholeService.js`**: `reportPothole({lat,lng,magnitude,busId})` → `push(ref /potholes)`.
- [ ] 19. **Crear `src/components/conductor/TripControls.jsx`**: selector de ruta + input de número de bus + botón Iniciar/Detener viaje.
- [ ] 20. **Crear `src/components/conductor/ConductorView.jsx`**: orquesta wakeLock + geolocation + motion + services; muestra estado.

### Fase 5 — Vista Pasajero
- [ ] 21. **Crear `src/services/busService.js`**: `subscribeBuses(cb)` con `onValue(ref /buses)` filtrando `active`.
- [ ] 22. **Crear `src/hooks/useBuses.js`**: envuelve el subscribe en estado React con cleanup.
- [ ] 23. **Crear `public/marker-bus.svg`** (ícono de bus para Leaflet).
- [ ] 24. **Crear `src/components/passenger/BusMap.jsx`**: `MapContainer` centrado en Machala, `TileLayer` OSM, marcadores de buses y paradas.
- [ ] 25. **Crear `src/components/passenger/StopSelector.jsx`**: dropdown de paradas de la ruta elegida.
- [ ] 26. **Crear `src/hooks/useEta.js`**: dado bus(es) + parada, usa `geo.js` para calcular ETA en minutos; expone `eta` y flag `within2min`.
- [ ] 27. **Crear `src/services/notificationService.js`**: `requestPermission()` + `notifyBusNear(busNumber, min)` con `@capacitor/local-notifications`; guard anti-repetición.
- [ ] 28. **Crear `src/components/passenger/EtaPanel.jsx`**: muestra ETA, distancia y estado; dispara `notifyBusNear` cuando `within2min` cruza a true.
- [ ] 29. **Crear `src/components/passenger/PassengerView.jsx`**: compone `BusMap` + `StopSelector` + `EtaPanel` usando `useBuses`/`useEta`.

### Fase 6 — Android / APK
- [ ] 30. **Añadir plataforma Android** → `npx cap add android` (genera `android/`).
- [ ] 31. **Editar `android/app/src/main/AndroidManifest.xml`**: permisos `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `INTERNET`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `HIGH_SAMPLING_RATE_SENSORS`.
- [ ] 32. **Build web + sync** → `npm run build && npx cap sync android`.
- [ ] 33. **Generar APK debug** → `npx cap open android` y Build APK (o `./gradlew assembleDebug` en `android/`) → `app-debug.apk`.

### Fase 7 — (Opcional, futuro) FCM push con app cerrada
- Añadir `google-services.json`, `@capacitor/push-notifications`, Cloud Function que vigila `/buses` y empuja por FCM. Fuera del MVP.

---

## Verificación (end-to-end)

1. **Web dev primero:** `npm run dev`, abrir en Chrome (móvil emulado con DevTools). Elegir Conductor → permitir ubicación → verificar en consola Firebase que `/buses/{busId}` se actualiza ~cada 3 s. Simular `devicemotion` → aparece nodo en `/potholes`.
2. **Pasajero en otra pestaña:** ver el marcador del bus moverse en tiempo real; elegir parada → ver ETA decreciente; al bajar de 2 min, aparece la notificación local.
3. **APK real:** instalar `app-debug.apk` en un Android físico; confirmar que otro dispositivo en modo Pasajero ve el bus moverse y recibe la alerta de 2 min. Confirmar que la pantalla no se apaga durante el viaje (Wake Lock).
4. **Reglas:** revisar que `database.rules.json` publicado permite solo las lecturas/escrituras usadas.

## Riesgos / notas

- **Precisión del bache:** el umbral de DeviceMotion se calibra en dispositivo real (tarea 17).
- **`speed` de Geolocation** puede llegar `null` en algunos equipos → `useEta` debe estimar velocidad por diferencia de posiciones como respaldo.
- **Background:** con app minimizada Android puede pausar el JS; el MVP asume conductor con la app abierta + Wake Lock.
- **Fuente de rutas:** `machala.js` es la fuente de verdad; reemplazar coordenadas de ejemplo por las reales de Machala cuando se tengan.
