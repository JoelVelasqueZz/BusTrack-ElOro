# Línea de ruta coloreada en el mapa (vista Pasajero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al elegir una ruta en la vista Pasajero, dibujar en el mapa la polyline del trazado oficial de esa ruta (`route.path`), con el color propio de la ruta (`route.color`).

**Arquitectura:** Cambio de renderizado únicamente. `PassengerView.jsx` ya calcula `route` (con `.path` y `.color`); solo falta pasar `route.path` como prop nueva a `BusMap`, y agregar un `<Polyline>` en `BusMap.jsx` que lo dibuje. Sin cambios en Firebase, servicios, ni hooks.

**Tech Stack:** React + react-leaflet (`Polyline`, ya usado en el mismo archivo para el track en vivo del bus).

## Global Constraints

- Este proyecto no tiene framework de pruebas automatizadas configurado (`package.json` no declara `vitest`/`jest`; no hay archivos `*.test.*` bajo `src/`). No se agrega uno para este cambio — sería scope creep para un cambio de una polyline. La verificación es manual, corriendo `npm run dev` y probando en el navegador, igual que la sección "Verificación" del spec.
- No tocar `src/components/conductor/*` — fuera de alcance según el spec.
- No agregar props ni lógica no usadas — solo lo que consume el `<Polyline>` nuevo.

---

### Task 1: Dibujar la polyline del trazado oficial de la ruta en `BusMap`

**Files:**
- Modify: `src/components/passenger/BusMap.jsx:57-63,76-89`
- Modify: `src/components/passenger/PassengerView.jsx:41-46`

**Interfaces:**
- Consumes: `route.path` (`Array<[number, number]>`, ya existe en el objeto que devuelve `useRoutes()` — ver `src/services/routeService.js`) y `route.color` (`string`, ya consumido hoy como prop `routeColor`).
- Produces: nueva prop `path` en `BusMap` (`Array<[number, number]> | undefined`). Ningún otro archivo depende de esto todavía — es el último eslabón de la cadena de datos.

- [ ] **Step 1: Agregar la prop `path` a `BusMap` y renderizar la polyline oficial**

En `src/components/passenger/BusMap.jsx`, cambiar la firma de `BusMap` (línea 63) para aceptar `path`:

```jsx
export function BusMap({ buses, stops, routeColor, path, passengerPosition }) {
```

Agregar el render de la polyline oficial de la ruta justo después de `<TileLayer ... />` (línea 74) y antes de las paradas (línea 76), para que quede visualmente debajo de paradas y buses:

```jsx
      {path && path.length >= 2 && (
        <Polyline positions={path} pathOptions={{ color: routeColor ?? '#1a2b4a', weight: 3 }} />
      )}

```

`Polyline` ya está importado en la línea 2 (`import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline } from 'react-leaflet'`) — no se necesita ningún import nuevo.

El resultado del bloque `MapContainer` debe quedar así (líneas 65-90 aproximadamente):

```jsx
    <MapContainer
      center={MACHALA_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {path && path.length >= 2 && (
        <Polyline positions={path} pathOptions={{ color: routeColor ?? '#1a2b4a', weight: 3 }} />
      )}

      {stops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lng]}
          radius={6}
          pathOptions={{ color: '#1a2b4a', weight: 2, fillColor: '#f5a623', fillOpacity: 0.95 }}
        >
          <Popup>{stop.name}</Popup>
        </CircleMarker>
      ))}
```

El resto del componente (`BusTrack`, marcadores de buses, marcador de pasajero) no cambia.

- [ ] **Step 2: Pasar `route.path` desde `PassengerView`**

En `src/components/passenger/PassengerView.jsx`, agregar la prop `path` al `<BusMap>` (línea 41-46):

```jsx
        <BusMap
          buses={routeBuses}
          stops={route?.stops ?? []}
          routeColor={route?.color}
          path={route?.path}
          passengerPosition={passengerPosition}
        />
```

- [ ] **Step 3: Verificación manual**

Correr:

```bash
npm run dev
```

En el navegador, entrar como Pasajero y confirmar, en orden:

1. Al elegir una línea con `path` sembrado (ej. "Línea 1"), aparece una línea en el mapa con el color de esa ruta (`route.color` de `scripts/seed-data/routes.json`), siguiendo la secuencia de sus paradas.
2. Las paradas (círculos naranjas) y los buses activos (íconos) siguen visibles, no quedan tapados por la polyline.
3. Al cambiar a otra línea en el selector, la línea anterior desaparece y aparece la nueva con su propio color.
4. Si alguna ruta sembrada no tiene `path` o tiene un solo punto, el mapa no se rompe: no se dibuja ninguna línea, el resto de la UI (paradas, buses, ETA) sigue funcionando igual que antes del cambio.

Si algún punto falla, revisar `route.path` en la consola del navegador (`routes` en Firebase) antes de tocar el código de `BusMap`.

- [ ] **Step 4: Commit**

```bash
git add src/components/passenger/BusMap.jsx src/components/passenger/PassengerView.jsx
git commit -m "feat: dibujar trazado oficial de la ruta en el mapa de pasajero"
```
