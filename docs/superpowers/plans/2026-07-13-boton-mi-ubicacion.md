# Botón "centrar en mi ubicación" (vista Pasajero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón flotante en el mapa de la vista Pasajero que centra el mapa en la ubicación actual del usuario al tocarlo, con feedback visual si la ubicación todavía no está disponible.

**Arquitectura:** Cambio contenido en `BusMap.jsx`: un nuevo sub-componente `LocateButton`, renderizado como hijo de `<MapContainer>`, que usa el hook `useMap()` de react-leaflet para llamar `map.flyTo(...)` sobre la posición que `BusMap` ya recibe como prop (`passengerPosition`). No se toca `PassengerView.jsx` ni ningún hook existente.

**Tech Stack:** React + react-leaflet (`useMap`), `@capacitor/geolocation` (`Geolocation.requestPermissions`, ya usado en `usePassengerLocation.js`).

## Global Constraints

- Este proyecto no tiene framework de pruebas automatizadas configurado (`package.json` no declara `vitest`/`jest`; no hay archivos `*.test.*` bajo `src/`). No se agrega uno para este cambio. La verificación es manual, corriendo `npm run dev` y probando en el navegador con el panel de Sensors de Chrome DevTools, igual que la sección "Verificación" del spec.
- No tocar `src/components/conductor/*` — fuera de alcance según el spec.
- El mapa **nunca** se centra solo — solo al tocar el botón (confirmado en brainstorming, spec `docs/superpowers/specs/2026-07-13-boton-mi-ubicacion-design.md`).
- Zoom fijo en `17` al centrar (nivel calle), timeout de `6000ms` esperando posición antes de mostrar error, el mensaje de error se limpia a los `4000ms`. Valores exactos del spec, no ajustar sin volver a preguntar.
- Ícono del botón: emoji (`📍`), no SVG — sigue el patrón ya usado en `EtaPanel.jsx` (`🚏`, `🚍` con `aria-hidden="true"`), no se agrega ningún asset nuevo a `public/`.

---

### Task 1: Estilos del botón y del mensaje de estado

**Files:**
- Modify: `src/styles/app.css:616-643` (agregar bloque nuevo antes de la media query de `prefers-reduced-motion`, y una regla dentro de ella)

**Interfaces:**
- Produces: clases CSS `.locate-button-wrap`, `.locate-button`, `.locate-button__msg`, `.locate-button__msg--error` — consumidas por el JSX de `LocateButton` en el Task 2.

- [ ] **Step 1: Agregar el bloque de estilos**

En `src/styles/app.css`, insertar el siguiente bloque inmediatamente después de `.stop-marker-selected__pulse` (después de la línea 626, antes de la línea 628 `@media (prefers-reduced-motion: reduce) {`):

```css
.locate-button-wrap {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.locate-button {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--white);
  color: var(--navy);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.locate-button:active {
  background: var(--bg-light);
}

.locate-button__msg {
  background: var(--navy);
  color: var(--white);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  animation: locate-msg-fade-in 0.2s ease-out;
}

.locate-button__msg--error {
  background: var(--red-dark);
}

@keyframes locate-msg-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Dentro del bloque `@media (prefers-reduced-motion: reduce)` existente (línea 628-643), agregar esta regla junto a las otras dos:

```css
  .locate-button__msg {
    animation: none;
  }
```

El bloque completo de la media query debe quedar:

```css
@media (prefers-reduced-motion: reduce) {
  .role-button,
  .trip-button {
    transition: none;
  }

  .passenger-marker__pulse {
    animation: none;
    display: none;
  }

  .stop-marker-selected__pulse {
    animation: none;
    display: none;
  }

  .locate-button__msg {
    animation: none;
  }
}
```

- [ ] **Step 2: Verificación visual rápida**

No hay nada que renderice estas clases todavía (eso es el Task 2) — este paso solo confirma que el archivo no quedó con errores de sintaxis CSS. Correr:

```bash
npx vite build --mode development 2>&1 | head -20
```

Expected: el build no reporta errores de parseo CSS (si falla por algo no relacionado a `app.css`, igual sirve como señal de que el CSS en sí no rompió nada).

- [ ] **Step 3: Commit**

```bash
git add src/styles/app.css
git commit -m "feat: agregar estilos del botón de centrar ubicación"
```

---

### Task 2: Componente `LocateButton` e integración en `BusMap`

**Files:**
- Modify: `src/components/passenger/BusMap.jsx:1-6` (imports)
- Modify: `src/components/passenger/BusMap.jsx:64-70` (nuevo componente, insertado entre `BusTrack` y `BusMap`)
- Modify: `src/components/passenger/BusMap.jsx:130-138` (render dentro de `<MapContainer>`)

**Interfaces:**
- Consumes: prop `passengerPosition` (`{ lat: number, lng: number } | null`), que `BusMap` ya recibe (línea 70 actual) — sin cambios en `PassengerView.jsx`. Clases CSS del Task 1 (`.locate-button-wrap`, `.locate-button`, `.locate-button__msg`, `.locate-button__msg--error`).
- Produces: ningún consumidor nuevo fuera de este archivo — es el último eslabón.

- [ ] **Step 1: Actualizar los imports**

En `src/components/passenger/BusMap.jsx`, reemplazar las líneas 1-6:

```jsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { ref, onValue, off } from 'firebase/database'
import { db } from '../../firebase.js'
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'
```

por:

```jsx
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ref, onValue, off } from 'firebase/database'
import { db } from '../../firebase.js'
import { Geolocation } from '@capacitor/geolocation'
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'
```

- [ ] **Step 2: Agregar el componente `LocateButton`**

Insertar la siguiente función entre el cierre de `BusTrack` (línea 68, `}`) y `export function BusMap` (línea 70):

```jsx
function LocateButton({ passengerPosition }) {
  const map = useMap()
  const [status, setStatus] = useState('idle') // 'idle' | 'locating' | 'error'
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (status === 'locating' && passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      setStatus('idle')
      clearTimeout(timeoutRef.current)
    }
  }, [passengerPosition, status, map])

  useEffect(() => {
    if (status !== 'error') return
    const timer = setTimeout(() => setStatus('idle'), 4000)
    return () => clearTimeout(timer)
  }, [status])

  // Evita "setState tras unmount" si la vista se cierra mientras el timeout
  // de 6s de `locating` sigue pendiente (ej. el pasajero cambia de rol).
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleClick = async () => {
    if (passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      return
    }
    setStatus('locating')
    try {
      await Geolocation.requestPermissions()
      timeoutRef.current = setTimeout(() => setStatus('error'), 6000)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="locate-button-wrap">
      {status === 'locating' && (
        <span className="locate-button__msg">Buscando tu ubicación…</span>
      )}
      {status === 'error' && (
        <span className="locate-button__msg locate-button__msg--error">
          No se pudo obtener tu ubicación
        </span>
      )}
      <button
        type="button"
        className="locate-button"
        aria-label="Centrar en mi ubicación"
        onClick={handleClick}
      >
        <span aria-hidden="true">📍</span>
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Renderizar `LocateButton` dentro del mapa**

En el JSX de `BusMap`, agregar `<LocateButton passengerPosition={passengerPosition} />` inmediatamente después del bloque del marcador de `passengerPosition` (líneas 130-137) y antes del cierre `</MapContainer>` (línea 138):

```jsx
      {passengerPosition && (
        <Marker
          position={[passengerPosition.lat, passengerPosition.lng]}
          icon={passengerIcon}
          zIndexOffset={1000}
          interactive={false}
        />
      )}

      <LocateButton passengerPosition={passengerPosition} />
    </MapContainer>
```

- [ ] **Step 4: Verificación manual en el navegador**

Correr:

```bash
npm run dev
```

En el navegador (Chrome), entrar como Pasajero y:

1. Abrir DevTools → pestaña "Sensors" (Ctrl+Shift+P → "Show Sensors") → en "Location", elegir "Other..." y poner unas coordenadas dentro de Machala (ej. lat `-3.2581`, lng `-79.9554`).
2. Confirmar que aparece el punto azul pulsante del pasajero en el mapa (ya funciona hoy, sirve para confirmar que la posición está llegando).
3. Alejar/mover el mapa manualmente (arrastrar o hacer zoom out) y tocar el botón 📍 (esquina inferior derecha): confirmar que el mapa anima de vuelta hacia la posición simulada, con zoom cercano (nivel calle).
4. En "Sensors", cambiar Location a "No override" (sin posición) y recargar la página para simular no tener ubicación todavía. Tocar el botón antes de que llegue cualquier posición: confirmar que aparece el mensaje "Buscando tu ubicación…" sobre el botón.
5. Sin volver a poner una ubicación, esperar ~6 segundos: confirmar que el mensaje cambia a "No se pudo obtener tu ubicación" y que, unos segundos después, desaparece y el botón vuelve a estar disponible para reintentar.
6. Confirmar que el mapa **no se mueve solo** en ningún momento del flujo anterior salvo cuando se toca el botón explícitamente (ni al cargar la vista, ni al recibir la primera posición).
7. Confirmar que las paradas, los buses y el punto del pasajero se siguen viendo con normalidad — el botón no tapa ni interfiere con el resto de la UI del mapa.

Si el mensaje de "Buscando…" no llega a mostrarse porque la posición simulada ya estaba activa desde el paso 1, repetir desde una recarga limpia con Sensors en "No override" antes de abrir la vista Pasajero.

- [ ] **Step 5: Commit**

```bash
git add src/components/passenger/BusMap.jsx
git commit -m "feat: agregar botón para centrar el mapa en la ubicación del pasajero"
```

---

### Task 3: Verificación final en APK real

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

Instalar el APK en el celular de prueba (vía WhatsApp o cable USB, como se ha hecho en features anteriores). Entrar como Pasajero, con GPS real:

1. Tocar el botón 📍 con el GPS ya activo: confirmar que el mapa centra en la ubicación real del dispositivo.
2. Desactivar la ubicación del dispositivo (o negar el permiso si se pide de nuevo) y tocar el botón: confirmar que aparece el mensaje de "Buscando…" y luego el de error, igual que en la verificación del navegador.
3. Confirmar que no hay errores visibles ni cierres inesperados de la app durante el flujo.

- [ ] **Step 3: Confirmar con el usuario**

Reportar el resultado de la prueba en dispositivo real antes de dar la feature por cerrada — sin este paso, no se marca la Task 3 como completada.
