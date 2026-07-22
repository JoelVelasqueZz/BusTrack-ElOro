# Funcionalidades — BusTrack El Oro

Detalle técnico de lo que hace la app hoy, vista por vista. Para instalación y stack general ver el [README](../README.md).

## Selección de rol (sin login)

- Al abrir la app por primera vez se genera un `deviceId` (UUID) y se guarda en `localStorage` — no hay cuentas ni contraseñas.
- El usuario elige "Conductor" o "Pasajero"; la elección se recuerda entre sesiones (`RoleContext.jsx`) y puede cambiarse en cualquier momento con el botón "← Cambiar rol".

## Vista Conductor

**Iniciar/terminar viaje** (`TripControls.jsx`, `ConductorView.jsx`)
- El conductor elige su ruta (las 20 líneas se cargan dinámicamente desde Firebase), escribe la empresa/cooperativa y el número de unidad.
- Al iniciar, `assignBusUnit` reserva un ID único por transacción atómica en Firebase (`unitCounters/{routeId}_{numero}`): si dos conductores arrancan a la vez con el mismo número en la misma ruta, cada uno recibe un sufijo distinto (`12-1`, `12-2`) en vez de pisarse mutuamente.

**Transmisión de posición**
- Mientras el viaje está activo, `useGeolocation` transmite `lat/lng/speed/heading` cada pocos segundos a `buses/{busId}` en Firebase (`locationService.js`).
- `useWakeLock` mantiene la pantalla encendida durante el viaje para que el GPS en primer plano no se corte.

**Reporte de incidentes** (`IncidentReporter.jsx`, `incidentService.js`, `src/config/incidents.js`)
- Categorías: Accidente, Avería mecánica, Desvío de ruta, Tráfico/bloqueo, Otro (+ nota de texto libre).
- El incidente activo se guarda en el nodo del bus y se puede marcar como resuelto; se refleja en tiempo real en el mapa del pasajero (ver abajo).

**Detección de baches** (`useMotionDetector.js`, `potholeService.js`)
- Usa el acelerómetro del celular (`@capacitor/motion`) durante el viaje: si la aceleración se desvía más de un umbral sobre la gravedad, se cuenta como bache (con antirrebote de 1s para no duplicar el mismo bache).
- Cada bache detectado se guarda con coordenadas y magnitud en el nodo `potholes` de Firebase y se cuenta en pantalla ("Baches detectados"). *(Registro únicamente — todavía no se visualiza en el mapa del pasajero.)*

**Grabación de recorrido** (`useRouteRecorder.js`, checkbox "Grabar recorrido" en `TripControls.jsx`)
- Opcional al iniciar el viaje: va guardando los puntos GPS reales recorridos.
- Al terminar el viaje, si se grabaron 10 puntos o más, se guarda como `path` alternativo de esa ruta (`saveRecordedPath`) — permite corregir/actualizar el trazado con el recorrido real de un conductor.

## Vista Pasajero

**Selector de ruta y parada** (`PassengerView.jsx`, `StopSelector.jsx`)
- Dropdown de las 20 líneas (ordenadas numéricamente por `useRoutes`, incluso con sufijos como `6T`/`7C`/`14C`) y de las paradas de la ruta elegida.

**Mapa en vivo** (`BusMap.jsx`, Leaflet)
- Trazado real de la ruta sobre el mapa (calles reales vía OSRM/OSM, no línea recta).
- Marcador de cada bus activo de la ruta, con su recorrido reciente dibujado como polilínea (`tracks/{busId}/points`).
- Ícono de bus atenuado + aviso "Señal perdida hace N" si no ha actualizado su posición en los últimos 12s (`useBuses` → `isStale`).
- Badge ⚠️ sobre el bus si el conductor reportó un incidente activo, con el detalle en el popup.
- Parada seleccionada resaltada con un marcador pulsante.
- Punto de ubicación del propio pasajero (si da permiso de GPS) y botón 📍 "Centrar en mi ubicación".

**ETA y aviso de proximidad** (`useEta.js`, `src/utils/geo.js`, `EtaPanel.jsx`, `NotifySettings.jsx`)
- El ETA se calcula proyectando el bus y la parada sobre el trazado real de la ruta y midiendo la distancia a lo largo de ese trazado (no en línea recta), usando el heading del bus para no confundir el tramo de ida con el de vuelta cuando van por calles paralelas.
- El panel de ETA se resalta cuando el bus está a N minutos o menos de la parada.
- Ese umbral N es configurable por el pasajero (ícono ⚙️, 1 a 15 minutos, default 2) y se guarda por dispositivo en `localStorage` — dispara también la notificación local ("Bus cerca") una sola vez por bus mientras esté dentro del umbral.

## Datos y herramientas de soporte

| Pieza | Rol |
|---|---|
| `src/config/machala.js` | Centro/zoom inicial del mapa |
| `src/config/incidents.js` | Catálogo de tipos de incidente |
| `scripts/seed-data/build-routes.mjs` | Traza las 20 rutas sobre calles reales (OSRM + relaciones de OpenStreetMap) a partir de los PDFs oficiales del GAD |
| `scripts/seedRoutes.mjs` | Sube el `routes.json` generado a Firebase |
| `scripts/simulate-bus.mjs` | `start`/`stop` para pruebas manuales de ETA; `demo` publica 3 buses simulados en cada una de las 20 rutas (usado en la presentación en vivo) |

## Pendiente / no implementado aún

- Los baches reportados se guardan en Firebase pero no se muestran todavía en el mapa del pasajero.
- El centro inicial del mapa (`MACHALA_CENTER`) está fijo a Machala; escalar a otro cantón de El Oro requiere trazar sus rutas con `build-routes.mjs` (la app en sí no necesita cambios de código).
