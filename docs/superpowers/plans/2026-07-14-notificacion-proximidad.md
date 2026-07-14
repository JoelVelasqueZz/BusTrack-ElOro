# Notificación de proximidad configurable (vista Pasajero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el pasajero configure, desde un ícono ⚙️ en la vista Pasajero, cuántos minutos antes de la llegada del bus quiere recibir el aviso (resaltado visual + notificación), en vez del umbral fijo de 2 minutos actual.

**Arquitectura:** Un hook nuevo (`useNotifyThreshold`) persiste el umbral en `localStorage` y vive en `PassengerView`. Se pasa hacia abajo a `useEta` (que ya lo reenvía a `computeEta`, parametrizado en vez de hardcodeado) y a un componente nuevo `NotifySettings` (botón ⚙️ + panel con input numérico). `EtaPanel` no cambia de comportamiento, solo consume la clave renombrada `withinThreshold` en vez de `within2min`.

**Tech Stack:** React (hooks, `useState`/`useEffect`), `localStorage` — mismo patrón que `RoleContext.jsx`. Sin librerías nuevas.

## Global Constraints

- Este proyecto no tiene framework de pruebas automatizadas configurado (`package.json` no declara `vitest`/`jest`; no hay archivos `*.test.*` bajo `src/`). No se agrega uno para este cambio. La verificación es manual, con `npm run dev` en el navegador y, al final, en el APK real.
- No tocar `src/components/conductor/*` — fuera de alcance según el spec.
- No tocar `src/services/notificationService.js` — ya usa los minutos reales calculados, no el umbral.
- Rango válido del umbral: **1 a 15 minutos**, default **2** (preserva el comportamiento actual si nadie toca el ajuste). Clave de `localStorage`: `bustrack_notify_minutes`. Valores fuera de rango o no numéricos se descartan silenciosamente, sin excepción ni mensaje de error.
- Ícono del botón de ajustes: emoji `⚙️`, mismo patrón que `📍` del `LocateButton` y `🚏`/`🚍` de `EtaPanel` — no se agrega ningún asset nuevo a `public/`.
- Spec de referencia: `docs/superpowers/specs/2026-07-14-notificacion-proximidad-design.md`.

---

### Task 1: Hook `useNotifyThreshold`

**Files:**
- Create: `src/hooks/useNotifyThreshold.js`

**Interfaces:**
- Produces: `useNotifyThreshold()` → `{ thresholdMinutes: number, setThreshold: (value: number|string) => void }`. Consumido por `PassengerView.jsx` en el Task 3.

- [ ] **Step 1: Crear el hook**

Crear `src/hooks/useNotifyThreshold.js`:

```jsx
import { useEffect, useState } from 'react'

const THRESHOLD_KEY = 'bustrack_notify_minutes'
const DEFAULT_THRESHOLD = 2
const MIN_THRESHOLD = 1
const MAX_THRESHOLD = 15

function isValidThreshold(value) {
  return Number.isFinite(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
}

function readStoredThreshold() {
  const raw = Number(localStorage.getItem(THRESHOLD_KEY))
  return isValidThreshold(raw) ? raw : DEFAULT_THRESHOLD
}

export function useNotifyThreshold() {
  const [thresholdMinutes, setThresholdMinutes] = useState(readStoredThreshold)

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEY, String(thresholdMinutes))
  }, [thresholdMinutes])

  const setThreshold = (value) => {
    const parsed = Number(value)
    if (isValidThreshold(parsed)) setThresholdMinutes(parsed)
  }

  return { thresholdMinutes, setThreshold }
}
```

- [ ] **Step 2: Verificación manual en consola del navegador**

Correr:

```bash
npm run dev
```

Abrir la app en el navegador, abrir la consola de DevTools, y pegar:

```js
localStorage.setItem('bustrack_notify_minutes', '7')
```

Recargar la página. Esto confirma que la clave que lee el hook coincide con la que se está probando manualmente (el hook todavía no está conectado a ninguna UI — eso es el Task 3 — pero sirve para confirmar el nombre de clave antes de seguir). No debería haber errores en consola al recargar.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNotifyThreshold.js
git commit -m "feat: agregar hook useNotifyThreshold con persistencia en localStorage"
```

---

### Task 2: Umbral configurable en `computeEta` y `useEta`

**Files:**
- Modify: `src/utils/geo.js:55-77`
- Modify: `src/hooks/useEta.js` (líneas 4, 6, 38-51)
- Modify: `src/components/passenger/EtaPanel.jsx` (líneas 17, 20, 46, 63)

**Interfaces:**
- Consumes: ninguna del Task 1 todavía (este task no usa el hook, solo parametriza el cálculo — se conecta en el Task 3).
- Produces: `computeEta({ busPosition, busSpeedKmh, stopPosition, path, thresholdMinutes })` → objeto con `withinThreshold` (antes `within2min`). `useEta(buses, stop, path, thresholdMinutes)` — cuarto parámetro nuevo. Ambos consumidos por `PassengerView.jsx` en el Task 3.

- [ ] **Step 1: Parametrizar `computeEta` en `geo.js`**

En `src/utils/geo.js`, reemplazar las líneas 55-77:

```js
export function computeEta({ busPosition, busSpeedKmh, stopPosition, path }) {
  const speedKmh = Math.max(busSpeedKmh || 0, MIN_SPEED_KMH)
  const speedMetersPerMin = (speedKmh * 1000) / 60

  let distanceMeters
  if (path && path.length >= 2) {
    const busProjected = nearestPointOnPath(busPosition, path)
    const stopProjected = nearestPointOnPath(stopPosition, path)
    const busDistance = distanceAlongPath(path, busProjected)
    const stopDistance = distanceAlongPath(path, stopProjected)
    distanceMeters = Math.max(stopDistance - busDistance, 0)
  } else {
    distanceMeters = haversine(busPosition, stopPosition)
  }

  const etaMinutes = distanceMeters / speedMetersPerMin

  return {
    etaMinutes,
    distanceMeters,
    within2min: etaMinutes <= 2,
  }
}
```

por:

```js
export function computeEta({ busPosition, busSpeedKmh, stopPosition, path, thresholdMinutes = 2 }) {
  const speedKmh = Math.max(busSpeedKmh || 0, MIN_SPEED_KMH)
  const speedMetersPerMin = (speedKmh * 1000) / 60

  let distanceMeters
  if (path && path.length >= 2) {
    const busProjected = nearestPointOnPath(busPosition, path)
    const stopProjected = nearestPointOnPath(stopPosition, path)
    const busDistance = distanceAlongPath(path, busProjected)
    const stopDistance = distanceAlongPath(path, stopProjected)
    distanceMeters = Math.max(stopDistance - busDistance, 0)
  } else {
    distanceMeters = haversine(busPosition, stopPosition)
  }

  const etaMinutes = distanceMeters / speedMetersPerMin

  return {
    etaMinutes,
    distanceMeters,
    withinThreshold: etaMinutes <= thresholdMinutes,
  }
}
```

- [ ] **Step 2: Pasar el umbral a través de `useEta.js`**

En `src/hooks/useEta.js`, reemplazar el archivo completo:

```jsx
import { useMemo, useRef } from 'react'
import { computeEta, haversine } from '../utils/geo.js'

const EMPTY_ETA = { etaMinutes: null, distanceMeters: null, withinThreshold: false, nearestBus: null }

export function useEta(buses, stop, path, thresholdMinutes) {
  const previousPositionsRef = useRef(new Map())

  return useMemo(() => {
    if (!stop || buses.length === 0) {
      return EMPTY_ETA
    }

    let best = null

    for (const bus of buses) {
      if (bus.lat == null || bus.lng == null) continue

      // La velocidad de Geolocation puede llegar null; si falta, se estima
      // por diferencia de posiciones entre actualizaciones consecutivas.
      let speedKmh = bus.speed != null ? bus.speed * 3.6 : null

      const previous = previousPositionsRef.current.get(bus.busId)
      if (speedKmh == null && previous && bus.updatedAt > previous.updatedAt) {
        const distanceMeters = haversine([previous.lat, previous.lng], [bus.lat, bus.lng])
        const seconds = (bus.updatedAt - previous.updatedAt) / 1000
        if (seconds > 0) {
          speedKmh = (distanceMeters / seconds) * 3.6
        }
      }

      previousPositionsRef.current.set(bus.busId, {
        lat: bus.lat,
        lng: bus.lng,
        updatedAt: bus.updatedAt,
      })

      const result = computeEta({
        busPosition: [bus.lat, bus.lng],
        busSpeedKmh: speedKmh,
        stopPosition: [stop.lat, stop.lng],
        path,
        thresholdMinutes,
      })

      if (!best || result.etaMinutes < best.etaMinutes) {
        best = { ...result, nearestBus: bus }
      }
    }

    return best ?? EMPTY_ETA
  }, [buses, stop, path, thresholdMinutes])
}
```

- [ ] **Step 3: Renombrar `within2min` → `withinThreshold` en `EtaPanel.jsx`**

En `src/components/passenger/EtaPanel.jsx`, reemplazar las líneas 16-21:

```jsx
  useEffect(() => {
    if (eta.within2min && !wasWithin2minRef.current && eta.nearestBus) {
      notifyBusNear(eta.nearestBus.numero, eta.etaMinutes, eta.nearestBus.busId).catch(() => {})
    }
    wasWithin2minRef.current = eta.within2min
  }, [eta.within2min, eta.nearestBus, eta.etaMinutes])
```

por:

```jsx
  useEffect(() => {
    if (eta.withinThreshold && !wasWithin2minRef.current && eta.nearestBus) {
      notifyBusNear(eta.nearestBus.numero, eta.etaMinutes, eta.nearestBus.busId).catch(() => {})
    }
    wasWithin2minRef.current = eta.withinThreshold
  }, [eta.withinThreshold, eta.nearestBus, eta.etaMinutes])
```

Y reemplazar la línea 46:

```jsx
    <div className={`eta-panel ${eta.within2min ? 'eta-panel--near' : ''}`}>
```

por:

```jsx
    <div className={`eta-panel ${eta.withinThreshold ? 'eta-panel--near' : ''}`}>
```

Y reemplazar la línea 63:

```jsx
        {eta.within2min && <span className="eta-panel__alert">¡Bus cerca!</span>}
```

por:

```jsx
        {eta.withinThreshold && <span className="eta-panel__alert">¡Bus cerca!</span>}
```

(La variable local `wasWithin2minRef` conserva su nombre — es un ref interno del componente, no una clave del objeto `eta`; renombrarla no aporta nada y agranda el diff sin necesidad.)

- [ ] **Step 4: Verificación manual — comportamiento sin cambios**

Correr:

```bash
npm run dev
```

Entrar como Pasajero, seleccionar una ruta con bus activo cerca de una parada. Confirmar que el panel de ETA se resalta (`eta-panel--near`) igual que antes cuando el bus está a ≤2 minutos (nadie llamó `useEta` con un `thresholdMinutes` distinto todavía — el default sigue siendo `2`). Esto confirma que el rename no rompió el comportamiento existente.

- [ ] **Step 5: Commit**

```bash
git add src/utils/geo.js src/hooks/useEta.js src/components/passenger/EtaPanel.jsx
git commit -m "refactor: parametrizar el umbral de aviso de proximidad (within2min -> withinThreshold)"
```

---

### Task 3: Componente `NotifySettings` + estilos + integración en `PassengerView`

**Files:**
- Modify: `src/styles/app.css:684` (agregar bloque nuevo antes de la media query de `prefers-reduced-motion`, línea 685 actual)
- Create: `src/components/passenger/NotifySettings.jsx`
- Modify: `src/components/passenger/PassengerView.jsx`

**Interfaces:**
- Consumes: `useNotifyThreshold()` del Task 1, `useEta(buses, stop, path, thresholdMinutes)` del Task 2. Clases CSS producidas en el Step 1 de este task.
- Produces: `<NotifySettings thresholdMinutes={number} onChange={(value) => void}>` — usado únicamente por `PassengerView.jsx`, ningún otro consumidor.

- [ ] **Step 1: Agregar los estilos**

En `src/styles/app.css`, insertar el siguiente bloque inmediatamente antes de la línea 685 (`@media (prefers-reduced-motion: reduce) {`):

```css
.notify-settings {
  position: relative;
}

.notify-settings__toggle {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--white);
  color: var(--navy);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.notify-settings__toggle:active {
  background: var(--bg-light);
}

.notify-settings__panel {
  position: absolute;
  top: 44px;
  left: 0;
  z-index: 1000;
  background: var(--white);
  color: var(--navy);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 220px;
}

.notify-settings__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  flex-wrap: wrap;
}

.notify-settings__input {
  width: 48px;
  padding: 4px 6px;
  border: 1px solid var(--bg-light);
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
}

.notify-settings__close {
  align-self: flex-end;
  background: none;
  border: none;
  color: var(--navy);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
}
```

- [ ] **Step 2: Crear el componente `NotifySettings`**

Crear `src/components/passenger/NotifySettings.jsx`:

```jsx
import { useState } from 'react'

export function NotifySettings({ thresholdMinutes, onChange }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="notify-settings">
      <button
        type="button"
        className="notify-settings__toggle"
        aria-label="Configurar aviso de proximidad"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⚙️</span>
      </button>

      {open && (
        <div className="notify-settings__panel">
          <label className="notify-settings__label">
            Avisarme cuando el bus esté a
            <input
              type="number"
              min={1}
              max={15}
              value={thresholdMinutes}
              onChange={(e) => onChange(e.target.value)}
              className="notify-settings__input"
            />
            minutos
          </label>
          <button
            type="button"
            className="notify-settings__close"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Integrar en `PassengerView.jsx`**

En `src/components/passenger/PassengerView.jsx`, reemplazar el archivo completo:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useBuses } from '../../hooks/useBuses.js'
import { useEta } from '../../hooks/useEta.js'
import { useNotifyThreshold } from '../../hooks/useNotifyThreshold.js'
import { usePassengerLocation } from '../../hooks/usePassengerLocation.js'
import { useRoutes } from '../../hooks/useRoutes.js'
import { BusMap } from './BusMap.jsx'
import { StopSelector } from './StopSelector.jsx'
import { EtaPanel } from './EtaPanel.jsx'
import { NotifySettings } from './NotifySettings.jsx'

export function PassengerView() {
  const { clearRole } = useRole()
  const routes = useRoutes()
  const [routeId, setRouteId] = useState('')
  const [stopId, setStopId] = useState('')
  const { thresholdMinutes, setThreshold } = useNotifyThreshold()

  useEffect(() => {
    if (!routeId && routes.length > 0) setRouteId(routes[0].id)
  }, [routes, routeId])

  const route = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId])
  const stop = useMemo(() => route?.stops.find((s) => s.id === stopId) ?? null, [route, stopId])

  const allBuses = useBuses()
  const routeBuses = useMemo(
    () => allBuses.filter((bus) => bus.routeId === routeId),
    [allBuses, routeId],
  )

  const eta = useEta(routeBuses, stop, route?.path, thresholdMinutes)
  const { position: passengerPosition } = usePassengerLocation()

  const handleRouteChange = (newRouteId) => {
    setRouteId(newRouteId)
    setStopId('')
  }

  return (
    <div className="passenger-view">
      <div className="passenger-view__map">
        <BusMap
          buses={routeBuses}
          stops={route?.stops ?? []}
          routeColor={route?.color}
          path={route?.path}
          passengerPosition={passengerPosition}
          selectedStopId={stopId}
        />

        <div className="passenger-view__topbar">
          <button
            className="role-back-button role-back-button--light"
            onClick={clearRole}
            aria-label="Cambiar rol"
          >
            ←
          </button>

          <label className="route-selector">
            <span className="sr-only">Ruta</span>
            <select value={routeId} onChange={(e) => handleRouteChange(e.target.value)}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <StopSelector stops={route?.stops ?? []} selectedStopId={stopId} onChange={setStopId} />

          <NotifySettings thresholdMinutes={thresholdMinutes} onChange={setThreshold} />
        </div>
      </div>

      <div className="passenger-view__panel">
        <EtaPanel eta={eta} stopId={stopId} stopName={stop?.name} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificación manual completa**

Correr:

```bash
npm run dev
```

En el navegador, entrar como Pasajero, seleccionar una ruta y parada con bus activo:

1. Tocar ⚙️: confirmar que el panel se abre con el valor actual (2, o lo que haya quedado del Task 1 Step 2 si no se limpió `localStorage`).
2. Cambiar el valor a `5`, tocar "Cerrar".
3. Confirmar que el panel de ETA se resalta (`eta-panel--near`) cuando el bus está a ≤5 min, no solo a ≤2 min (usar Chrome DevTools → Sensors para simular una posición cercana si hace falta acelerar la prueba).
4. Confirmar que la notificación local se dispara al mismo umbral (revisar que `notifyBusNear` se llame — puede verificarse con un `console.log` temporal o observando el permiso de notificaciones del navegador).
5. Recargar la página (`F5`): confirmar que el valor `5` persiste en el panel de ⚙️.
6. Probar valores inválidos en el input: `0`, un número mayor a `15`, y borrar el campo. Confirmar que el valor mostrado no cambia a algo fuera de rango y que no aparece ningún error en consola.
7. Confirmar que la vista Conductor no fue tocada (abrir esa vista y verificar que se ve igual que antes).

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css src/components/passenger/NotifySettings.jsx src/components/passenger/PassengerView.jsx
git commit -m "feat: agregar configuración de umbral de aviso de proximidad"
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

- [ ] **Step 2: Instalar y probar en dispositivo real**

Instalar el APK en el celular de prueba. Entrar como Pasajero, con GPS real y un bus activo publicando posición:

1. Tocar ⚙️, cambiar el umbral a un valor distinto de 2 (ej. 5 o 7), cerrar el panel.
2. Confirmar que el resaltado del panel de ETA y la notificación local respetan el nuevo umbral, no el de 2 minutos original.
3. Cerrar y reabrir la app: confirmar que el umbral configurado persiste.
4. Confirmar que no hay errores visibles ni cierres inesperados de la app durante el flujo.

- [ ] **Step 3: Confirmar con el usuario**

Reportar el resultado de la prueba en dispositivo real antes de dar la feature por cerrada — sin este paso, no se marca la Task 4 como completada.
