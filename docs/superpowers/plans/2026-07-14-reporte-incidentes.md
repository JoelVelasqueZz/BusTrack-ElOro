# Reporte de incidentes del conductor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el conductor reporte un incidente (accidente, avería, desvío, tráfico, otro) desde su panel de viaje activo, y que el pasajero lo vea en tiempo real como un badge de alerta sobre el bus específico en el mapa.

**Arquitectura:** El incidente vive como campo (`incident`) dentro del mismo registro `/buses/{busId}` que ya se publica cada 3s, para reutilizar la suscripción `useBuses`/`subscribeBuses` que el pasajero ya tiene abierta — sin nodo de Firebase ni listener nuevos. Un servicio nuevo (`incidentService.js`) escribe/borra ese campo con `set()`. El conductor lo reporta desde un componente nuevo (`IncidentReporter`); el pasajero lo ve como un `DivIcon` badge en `BusMap.jsx` sobre el marcador del bus, más una línea en su popup existente.

**Tech Stack:** React (hooks, `useState`), Firebase Realtime Database (`set`), Leaflet/`react-leaflet` (`Marker`, `DivIcon`) — mismos patrones ya usados en el proyecto. Sin librerías nuevas.

## Global Constraints

- Este proyecto no tiene framework de pruebas automatizadas configurado. No se agrega uno para este cambio. La verificación es manual, con `npm run dev` en el navegador (dos pestañas: Conductor y Pasajero) y, al final, en el APK real.
- Categorías de incidente fijas, exactamente estas 5, con estos `id` exactos: `accidente` ("Accidente"), `averia` ("Avería mecánica"), `desvio` ("Desvío de ruta"), `trafico` ("Tráfico/bloqueo"), `otro` ("Otro"). No agregar texto libre sin categoría.
- El incidente se resuelve solo manualmente por el conductor (botón "✅ Marcar resuelto"). No se agrega expiración automática por tiempo.
- Sin historial — solo existe el incidente activo actual de cada bus (`incident: null | {...}`), no un log de incidentes pasados.
- Sin notificación push por incidente — el aviso es solo visual (badge en el mapa + línea en el popup), a diferencia del aviso de proximidad que sí notifica.
- No tocar `src/services/potholeService.js`, `src/hooks/useMotionDetector.js` ni el flujo de baches existente — feature independiente, sin relación.
- No tocar `database.rules.json` — `/buses` ya tiene `.read: true, .write: true`, e `incident` es solo un campo más de ese nodo.
- Spec de referencia: `docs/superpowers/specs/2026-07-14-reporte-incidentes-design.md`.

---

### Task 1: Categorías compartidas + servicio de incidentes

**Files:**
- Create: `src/config/incidents.js`
- Create: `src/services/incidentService.js`

**Interfaces:**
- Produces: `INCIDENT_TYPES` (array de `{ id, label }`), `INCIDENT_LABELS` (objeto `{ [id]: label }`) desde `incidents.js`. `reportIncident(busId, { type, note })` → Promise, `resolveIncident(busId)` → Promise, desde `incidentService.js`. Consumidos por `IncidentReporter.jsx` y `ConductorView.jsx` (Task 2) y por `BusMap.jsx` (Task 3, solo `INCIDENT_LABELS`).

- [ ] **Step 1: Crear las categorías compartidas**

Crear `src/config/incidents.js`:

```js
export const INCIDENT_TYPES = [
  { id: 'accidente', label: 'Accidente' },
  { id: 'averia', label: 'Avería mecánica' },
  { id: 'desvio', label: 'Desvío de ruta' },
  { id: 'trafico', label: 'Tráfico/bloqueo' },
  { id: 'otro', label: 'Otro' },
]

export const INCIDENT_LABELS = Object.fromEntries(
  INCIDENT_TYPES.map(({ id, label }) => [id, label]),
)
```

- [ ] **Step 2: Crear el servicio de incidentes**

Crear `src/services/incidentService.js`:

```js
import { ref, set, serverTimestamp } from 'firebase/database'
import { db } from '../firebase.js'

export function reportIncident(busId, { type, note }) {
  return set(ref(db, `buses/${busId}/incident`), {
    type,
    note: note?.trim() || null,
    reportedAt: serverTimestamp(),
  })
}

export function resolveIncident(busId) {
  return set(ref(db, `buses/${busId}/incident`), null)
}
```

- [ ] **Step 3: Verificar sintaxis**

Run:

```bash
node --check src/config/incidents.js
node --check src/services/incidentService.js
```

Expected: sin salida (ambos comandos terminan sin error). `node --check` solo valida sintaxis, no ejecuta los imports de Firebase — la verificación funcional real ocurre en el Task 2 (conductor) y Task 3 (pasajero), cuando estas funciones se llaman desde la UI con `npm run dev`.

- [ ] **Step 4: Commit**

```bash
git add src/config/incidents.js src/services/incidentService.js
git commit -m "feat: agregar config de categorías y servicio de incidentes"
```

---

### Task 2: Lado conductor — reportar y resolver incidentes

**Files:**
- Create: `src/components/conductor/IncidentReporter.jsx`
- Modify: `src/components/conductor/ConductorView.jsx` (archivo completo)
- Modify: `src/styles/app.css:373-374` (insertar bloque nuevo)

**Interfaces:**
- Consumes: `INCIDENT_TYPES`, `INCIDENT_LABELS` de `config/incidents.js`, `reportIncident`, `resolveIncident` de `services/incidentService.js` (ambos del Task 1).
- Produces: `<IncidentReporter activeIncident={{type, label}|null} onReport={(type, note) => void} onResolve={() => void}>` — usado únicamente dentro de `ConductorView.jsx`.

- [ ] **Step 1: Crear `IncidentReporter.jsx`**

Crear `src/components/conductor/IncidentReporter.jsx`:

```jsx
import { useState } from 'react'
import { INCIDENT_TYPES } from '../../config/incidents.js'

export function IncidentReporter({ activeIncident, onReport, onResolve }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (activeIncident) {
    return (
      <div className="incident-reporter incident-reporter--active">
        <span>⚠️ {activeIncident.label}</span>
        <button type="button" onClick={onResolve}>
          ✅ Marcar resuelto
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" className="incident-reporter__toggle" onClick={() => setOpen(true)}>
        ⚠️ Reportar incidente
      </button>
    )
  }

  return (
    <div className="incident-reporter">
      <div className="incident-reporter__types">
        {INCIDENT_TYPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onReport(id, note)
              setOpen(false)
              setNote('')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Nota opcional"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="incident-reporter__cancel" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Integrar en `ConductorView.jsx`**

Reemplazar el archivo completo `src/components/conductor/ConductorView.jsx`:

```jsx
import { useState, useCallback, useEffect } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useWakeLock } from '../../hooks/useWakeLock.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useMotionDetector } from '../../hooks/useMotionDetector.js'
import { useRouteRecorder } from '../../hooks/useRouteRecorder.js'
import { startPublishing, updateBusInfo, stopPublishing } from '../../services/locationService.js'
import { reportPothole } from '../../services/potholeService.js'
import { reportIncident, resolveIncident } from '../../services/incidentService.js'
import { INCIDENT_LABELS } from '../../config/incidents.js'
import { saveRecordedPath } from '../../services/routeService.js'
import { assignBusUnit } from '../../services/busUnitService.js'
import { TripControls } from './TripControls.jsx'
import { IncidentReporter } from './IncidentReporter.jsx'

export function ConductorView() {
  const { deviceId, clearRole } = useRole()
  const [tripActive, setTripActive] = useState(false)
  const [busInfo, setBusInfo] = useState(null)
  const [potholeCount, setPotholeCount] = useState(0)
  const [activeIncident, setActiveIncident] = useState(null)
  const [recordingRoute, setRecordingRoute] = useState(false)
  const [startError, setStartError] = useState(null)

  useWakeLock(tripActive)
  const { position, error: geoError } = useGeolocation(tripActive)
  const { getPoints, pointCount } = useRouteRecorder(tripActive && recordingRoute, position)

  const handlePothole = useCallback(
    (magnitude) => {
      if (!busInfo || !position) return
      reportPothole({ lat: position.lat, lng: position.lng, magnitude, busId: busInfo.busId })
      setPotholeCount((count) => count + 1)
    },
    [busInfo, position],
  )

  useMotionDetector(tripActive, handlePothole)

  useEffect(() => {
    if (!tripActive || !position || !busInfo) return
    updateBusInfo({
      lat: position.lat,
      lng: position.lng,
      speed: position.speed,
      heading: position.heading,
    })
  }, [tripActive, position, busInfo])

  const handleStart = async ({ routeId, empresa, numero, destino, recordRoute }) => {
    setStartError(null)
    let assignment
    try {
      assignment = await assignBusUnit(routeId, numero)
    } catch (err) {
      setStartError(err)
      return
    }
    const { busId, unitLabel } = assignment
    const info = {
      busId,
      driverId: deviceId,
      routeId,
      empresa,
      numero,
      unitLabel,
      destino,
      lat: null,
      lng: null,
      speed: null,
      heading: null,
    }
    setBusInfo(info)
    setPotholeCount(0)
    setActiveIncident(null)
    setRecordingRoute(recordRoute)
    setTripActive(true)
    startPublishing(info)
  }

  const handleStop = () => {
    if (recordingRoute && busInfo?.routeId) {
      const points = getPoints()
      if (points.length >= 10) {
        saveRecordedPath(busInfo.routeId, points).catch(() => {})
      }
    }
    setTripActive(false)
    setRecordingRoute(false)
    stopPublishing()
    setBusInfo(null)
  }

  const handleReportIncident = (type, note) => {
    if (!busInfo) return
    reportIncident(busInfo.busId, { type, note }).catch(() => {})
    setActiveIncident({ type, label: INCIDENT_LABELS[type] })
  }

  const handleResolveIncident = () => {
    if (!busInfo) return
    resolveIncident(busInfo.busId).catch(() => {})
    setActiveIncident(null)
  }

  return (
    <div className="conductor-view">
      <header className="conductor-view__header">
        <button className="role-back-button role-back-button--dark" onClick={clearRole}>
          ← Cambiar rol
        </button>
        <span className="conductor-view__eyebrow">Panel del conductor</span>
        <h1 className="conductor-view__title">BusTrack</h1>
      </header>

      <TripControls tripActive={tripActive} onStart={handleStart} onStop={handleStop} />

      {startError && (
        <p className="trip-status__error">
          No se pudo iniciar el viaje: {startError.message}
        </p>
      )}

      {tripActive && (
        <>
          <div className="trip-status">
            <div className="trip-status__row trip-status__row--headline">
              <span className="trip-status__label">Viaje activo</span>
              <span className="trip-status__value">
                {busInfo?.empresa} #{busInfo?.unitLabel} → {busInfo?.destino}
              </span>
            </div>
            <div className="trip-status__row">
              <span className="trip-status__label">Ubicación</span>
              <span className="trip-status__value">
                {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'Obteniendo...'}
              </span>
            </div>
            <div className="trip-status__row">
              <span className="trip-status__label">Baches detectados</span>
              <span className="trip-status__value trip-status__value--amber">{potholeCount}</span>
            </div>
            {recordingRoute && (
              <div className="trip-status__row">
                <span className="trip-status__label">Grabando recorrido</span>
                <span className="trip-status__value">{pointCount} puntos</span>
              </div>
            )}
            {geoError && <p className="trip-status__error">Error de GPS: {geoError.message}</p>}
          </div>

          <IncidentReporter
            activeIncident={activeIncident}
            onReport={handleReportIncident}
            onResolve={handleResolveIncident}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Agregar los estilos**

En `src/styles/app.css`, insertar el siguiente bloque inmediatamente antes de la línea 375 (`/* ---------- Passenger view ---------- */`), es decir justo después de `.trip-status__error` (línea 373):

```css
.incident-reporter {
  padding: var(--sp-2);
  background: var(--navy-2);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.incident-reporter__toggle {
  padding: var(--sp-2);
  border: none;
  border-radius: var(--radius-md);
  background: var(--red);
  color: var(--white);
  font-weight: 700;
  cursor: pointer;
}

.incident-reporter__types {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.incident-reporter__types button {
  padding: var(--sp-1) var(--sp-2);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--navy);
  color: var(--white);
  cursor: pointer;
}

.incident-reporter input[type='text'] {
  padding: var(--sp-1);
  border-radius: var(--radius-sm);
  border: 1px solid var(--bg-light);
}

.incident-reporter__cancel {
  align-self: flex-end;
  background: none;
  border: none;
  color: var(--slate);
  font-size: 0.85rem;
  cursor: pointer;
}

.incident-reporter--active {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  color: var(--white);
  font-weight: 600;
}

.incident-reporter--active button {
  padding: var(--sp-1) var(--sp-2);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  cursor: pointer;
}
```

- [ ] **Step 4: Verificación manual — lado conductor**

Run:

```bash
npm run dev
```

En el navegador, entrar como Conductor, iniciar un viaje:

1. Confirmar que aparece el botón "⚠️ Reportar incidente" debajo del panel de estado del viaje.
2. Tocarlo, confirmar que se abren las 5 categorías + input de nota.
3. Elegir "Avería mecánica", escribir una nota, confirmar que el panel se cierra y aparece "⚠️ Avería mecánica" con el botón "✅ Marcar resuelto".
4. Tocar "✅ Marcar resuelto", confirmar que vuelve a mostrarse el botón "⚠️ Reportar incidente".
5. En la consola de Firebase (o DevTools → Network), confirmar que `/buses/{busId}/incident` se escribió y luego volvió a `null`.
6. Confirmar que el contador de baches sigue funcionando sin cambios.

- [ ] **Step 5: Commit**

```bash
git add src/components/conductor/IncidentReporter.jsx src/components/conductor/ConductorView.jsx src/styles/app.css
git commit -m "feat: agregar reporte de incidentes en la vista Conductor"
```

---

### Task 3: Lado pasajero — badge de incidente en el mapa

**Files:**
- Modify: `src/components/passenger/BusMap.jsx:7` (import)
- Modify: `src/components/passenger/BusMap.jsx:31-36` (agregar ícono)
- Modify: `src/components/passenger/BusMap.jsx:172-187` (popup + badge)
- Modify: `src/styles/app.css:557` (insertar bloque nuevo)

**Interfaces:**
- Consumes: `INCIDENT_LABELS` de `config/incidents.js` (Task 1). `bus.incident` — campo que ya llega en cada objeto `bus` de `useBuses()` sin cambios adicionales, porque `subscribeBuses` (`busService.js`) hace `Object.values(value)` sobre el snapshot completo de `/buses`, que ya incluye cualquier campo que tenga cada bus, `incident` incluido.
- Produces: nada consumido por otros tasks — es el último punto de la cadena de datos.

- [ ] **Step 1: Importar las etiquetas de incidente**

En `src/components/passenger/BusMap.jsx`, reemplazar la línea 7:

```js
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'
```

por:

```js
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'
import { INCIDENT_LABELS } from '../../config/incidents.js'
```

- [ ] **Step 2: Agregar el ícono del badge**

Reemplazar las líneas 31-36:

```jsx
const selectedStopIcon = new L.DivIcon({
  className: 'stop-marker-selected',
  html: '<span class="stop-marker-selected__pulse"></span><span class="stop-marker-selected__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})
```

por:

```jsx
const selectedStopIcon = new L.DivIcon({
  className: 'stop-marker-selected',
  html: '<span class="stop-marker-selected__pulse"></span><span class="stop-marker-selected__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const incidentBadgeIcon = new L.DivIcon({
  className: 'incident-badge',
  html: '<span aria-hidden="true">⚠️</span>',
  iconSize: [18, 18],
  iconAnchor: [9, 26],
})
```

- [ ] **Step 3: Agregar la línea del popup y los marcadores de badge**

Reemplazar las líneas 172-187:

```jsx
      {buses.map((bus) => (
        <Marker
          key={bus.busId}
          position={[bus.lat, bus.lng]}
          icon={bus.isStale ? busIconStale : busIcon}
        >
          <Popup>
            {bus.empresa} #{bus.unitLabel ?? bus.numero} → {bus.destino}
            {bus.isStale && (
              <div className="bus-popup__stale">
                ⚠️ Señal perdida hace {formatElapsed(bus.lastUpdateMs)}
              </div>
            )}
          </Popup>
        </Marker>
      ))}
```

por:

```jsx
      {buses.map((bus) => (
        <Marker
          key={bus.busId}
          position={[bus.lat, bus.lng]}
          icon={bus.isStale ? busIconStale : busIcon}
        >
          <Popup>
            {bus.empresa} #{bus.unitLabel ?? bus.numero} → {bus.destino}
            {bus.isStale && (
              <div className="bus-popup__stale">
                ⚠️ Señal perdida hace {formatElapsed(bus.lastUpdateMs)}
              </div>
            )}
            {bus.incident && (
              <div className="bus-popup__incident">
                ⚠️ {INCIDENT_LABELS[bus.incident.type]}
                {bus.incident.note && `: ${bus.incident.note}`}
              </div>
            )}
          </Popup>
        </Marker>
      ))}

      {buses.map((bus) =>
        bus.incident ? (
          <Marker
            key={`incident-${bus.busId}`}
            position={[bus.lat, bus.lng]}
            icon={incidentBadgeIcon}
            zIndexOffset={950}
            interactive={false}
          />
        ) : null,
      )}
```

- [ ] **Step 4: Agregar los estilos del badge**

En `src/styles/app.css`, insertar el siguiente bloque inmediatamente después de la línea 557 (`.bus-popup__stale { ... }`, que termina en la línea 557), antes de `.passenger-marker` (línea 559):

```css
.incident-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}

.bus-popup__incident {
  margin-top: 4px;
  color: var(--red-dark);
  font-weight: 700;
  font-size: 0.85rem;
}
```

- [ ] **Step 5: Verificación manual — extremo a extremo**

Run:

```bash
npm run dev
```

Abrir dos pestañas: una en modo Conductor (iniciar viaje), otra en modo Pasajero (misma ruta que el conductor eligió):

1. En el Conductor, reportar un incidente ("Desvío de ruta", con nota "por obra en la calle X").
2. En el Pasajero, confirmar que aparece el badge ⚠️ sobre el marcador de ese bus en el mapa, sin recargar la página.
3. Tocar el marcador del bus: confirmar que el popup muestra "⚠️ Desvío de ruta: por obra en la calle X".
4. En el Conductor, tocar "✅ Marcar resuelto".
5. En el Pasajero, confirmar que el badge y la línea del popup desaparecen en tiempo real.
6. En el Conductor, reportar un incidente de nuevo y luego tocar "Detener viaje" sin resolverlo. En el Pasajero, confirmar que el bus entero (badge incluido) desaparece del mapa, porque `active` pasa a `false`.
7. Confirmar que el botón de centrar ubicación (📍) y el resto del mapa siguen funcionando sin cambios.

- [ ] **Step 6: Commit**

```bash
git add src/components/passenger/BusMap.jsx src/styles/app.css
git commit -m "feat: mostrar badge de incidente del bus en el mapa del pasajero"
```

---

### Task 4: Verificación final en APK real

**Files:** ninguno (solo build y prueba manual, sin cambios de código).

**Interfaces:** N/A — task de verificación, no de código.

- [ ] **Step 1: Compilar el APK**

Seguir el procedimiento ya establecido para este proyecto (JDK 21 de Android Studio, no el del sistema):

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
cd ..
```

Expected: `BUILD SUCCESSFUL`, APK generado en `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 2: Instalar y probar en dos dispositivos (o dispositivo + `scripts/simulate-bus.mjs`)**

Instalar el APK en el celular de conductor. En un segundo dispositivo (o navegador) entrar como Pasajero en la misma ruta. Si no hay dos personas disponibles para probar, usar `node scripts/simulate-bus.mjs start` como bus de prueba y reportar el incidente manualmente escribiendo en la consola de Firebase (o extender temporalmente el script — no forma parte de este plan) en lugar de un conductor real.

1. Reportar un incidente desde el conductor real. Confirmar que el badge aparece en el pasajero en tiempo real.
2. Marcarlo resuelto. Confirmar que desaparece en el pasajero.
3. Confirmar que no hay errores visibles ni cierres inesperados de la app durante el flujo.
4. Confirmar que el reporte de baches y la notificación de proximidad (features previas) siguen funcionando sin cambios.

- [ ] **Step 3: Confirmar con el usuario**

Reportar el resultado de la prueba en dispositivo real antes de dar la feature por cerrada — sin este paso, no se marca la Task 4 como completada.
