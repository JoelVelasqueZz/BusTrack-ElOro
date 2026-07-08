# Rutas reales, identificador de bus y grabación de recorrido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las 2 rutas de ejemplo por las 20 líneas reales de Machala (GAD Machala), mover las rutas a Firebase como fuente de verdad, asignar automáticamente un identificador a buses duplicados (ej. `20-1`, `20-2`), y permitir que el conductor grabe su recorrido GPS como el `path` oficial de su línea.

**Architecture:** Firebase Realtime Database gana un nodo `/routes` (reemplaza el arreglo `ROUTES` de `src/config/machala.js`) y un nodo interno `/unitCounters` para asignar sufijos de forma atómica. Los datos reales de las 20 líneas se siembran una sola vez con un script Node (`scripts/seedRoutes.mjs`), construido a partir de datos extraídos de los PDFs oficiales (`docs/rutas-gad-machala/`) y coordenadas geocodificadas de los puntos de interés que se repiten entre líneas.

**Tech Stack:** React 18 + Vite, Firebase Realtime Database (SDK modular v9, `firebase/database`), Capacitor (`@capacitor/geolocation`), Node.js (scripts de siembra, ESM).

## Global Constraints

- El repo **no tiene ningún framework de tests instalado** (ni vitest ni jest). Siguiendo el patrón ya establecido en el proyecto, la verificación de cada tarea es **manual** (`npm run dev` + inspección en el navegador/consola de Firebase), no automatizada. No instalar un framework de tests como parte de este plan — eso sería un cambio de alcance no pedido.
- Estilo del código existente: ES modules, sin TypeScript, hooks en `src/hooks/`, acceso a Firebase encapsulado en `src/services/`, componentes en `src/components/<rol>/`. Seguir ese mismo patrón para todo archivo nuevo.
- El proyecto no tiene `firebase-tools` configurado — los cambios a `database.rules.json` no se despliegan solos. Cada vez que se edite ese archivo, el paso de verificación incluye copiar su contenido al editor de reglas en la consola de Firebase (Realtime Database → Reglas) y publicarlo manualmente.
- Las coordenadas de las paradas son aproximaciones (geocodificación de puntos de interés, no un levantamiento GPS real) — igual de precisas que las rutas de ejemplo actuales, y se espera que se vayan reemplazando con datos reales a medida que los conductores usan la grabación de recorrido (Tarea 6).
- `docs/superpowers/specs/2026-07-07-rutas-reales-identificador-grabacion-design.md` es la fuente de verdad de las decisiones de diseño — ante cualquier duda durante la implementación, ese documento manda.

---

### Task 1: Extraer las paradas oficiales de las 20 líneas desde los PDFs

**Files:**
- Create: `scripts/seed-data/routes-raw.json`

**Interfaces:**
- Produces: `routes-raw.json` con forma `{ [routeId]: { name: string, color: string, stops: string[] } }` — `stops` es la lista de nombres de parada **en el orden que aparecen en la leyenda de esa línea**. Este archivo lo consume la Tarea 2 (para saber qué nombres geocodificar) y la Tarea 3 (`build-routes.mjs`).

Cada uno de los 20 PDFs en `docs/rutas-gad-machala/` trae la leyenda completa de las 20 líneas, pero resalta con su propio color la caja de **su** línea en el mapa — esa caja (mismo nombre que el archivo) es la fuente confiable para esa línea; no uses el texto plano combinado de todas las líneas para no mezclar paradas entre archivos.

- [ ] **Paso 1: Crear el esqueleto del archivo con nombre/color por línea**

Crea `scripts/seed-data/routes-raw.json` con este contenido exacto (paradas de `linea-1` y `linea-20` ya transcritas de los PDFs revisados durante el diseño; las demás quedan vacías para el paso 2):

```json
{
  "linea-1": {
    "name": "Línea 1",
    "color": "#e63946",
    "stops": [
      "El Cambio", "Universidad", "RTV Movilidad Machala EP", "Terminal Terrestre",
      "C.C. Paseo Shopping", "C.C. La Piazza", "Campus UTMACH", "Cementerio General",
      "Parque Colón", "Movilidad Machala EP", "Aguas Machala EP", "Estadio 9 de Mayo",
      "Mercado Buenos Aire", "Puerto Bolívar", "ECU 911", "Comando de Policía",
      "Mercado 25 de Junio"
    ]
  },
  "linea-2": { "name": "Línea 2", "color": "#2a9d8f", "stops": [] },
  "linea-3": { "name": "Línea 3", "color": "#f4a261", "stops": [] },
  "linea-4": { "name": "Línea 4", "color": "#264653", "stops": [] },
  "linea-5": { "name": "Línea 5", "color": "#8ac926", "stops": [] },
  "linea-6": { "name": "Línea 6", "color": "#6a4c93", "stops": [] },
  "linea-6t": { "name": "Línea 6T", "color": "#1982c4", "stops": [] },
  "linea-7": { "name": "Línea 7", "color": "#ff595e", "stops": [] },
  "linea-7c": { "name": "Línea 7C", "color": "#ffca3a", "stops": [] },
  "linea-8": { "name": "Línea 8", "color": "#6a994e", "stops": [] },
  "linea-10": { "name": "Línea 10", "color": "#b5179e", "stops": [] },
  "linea-11": { "name": "Línea 11", "color": "#4361ee", "stops": [] },
  "linea-12": { "name": "Línea 12", "color": "#f72585", "stops": [] },
  "linea-13": { "name": "Línea 13", "color": "#43aa8b", "stops": [] },
  "linea-14": { "name": "Línea 14", "color": "#f9844a", "stops": [] },
  "linea-14c": { "name": "Línea 14C", "color": "#277da1", "stops": [] },
  "linea-15": { "name": "Línea 15", "color": "#90be6d", "stops": [] },
  "linea-16": { "name": "Línea 16", "color": "#f94144", "stops": [] },
  "linea-18": { "name": "Línea 18", "color": "#577590", "stops": [] },
  "linea-20": {
    "name": "Línea 20",
    "color": "#9b5de5",
    "stops": [
      "El Retiro", "Universidad", "C.C. Paseo Shopping", "C.C. La Piazza",
      "Campus UTMACH", "Cementerio General", "Hospital Teófilo Dávila", "SOLCA",
      "Estadio 9 de Mayo", "Movilidad Machala EP", "Mercado 25 de Junio"
    ]
  }
}
```

- [ ] **Paso 2: Completar `stops` de las 18 líneas restantes**

Para cada una de estas 18 rutas, abre su PDF correspondiente con la herramienta de lectura, localiza la caja de leyenda cuyo título coincide con el nombre del archivo (esa caja está resaltada/es la que corresponde a la ruta dibujada en rojo/magenta en el mapa de ese PDF específico), y reemplaza el arreglo `stops: []` vacío por la lista de paradas en el mismo orden en que aparecen en esa caja:

| routeId | Archivo PDF |
|---|---|
| `linea-2` | `docs/rutas-gad-machala/Linea-2.pdf` |
| `linea-3` | `docs/rutas-gad-machala/Linea-3.pdf` |
| `linea-4` | `docs/rutas-gad-machala/Linea-4.pdf` |
| `linea-5` | `docs/rutas-gad-machala/Linea-5.pdf` |
| `linea-6` | `docs/rutas-gad-machala/Linea-6.pdf` |
| `linea-6t` | `docs/rutas-gad-machala/Linea-6T.pdf` |
| `linea-7` | `docs/rutas-gad-machala/Linea-7.pdf` |
| `linea-7c` | `docs/rutas-gad-machala/Linea-7C.pdf` |
| `linea-8` | `docs/rutas-gad-machala/Linea-8.pdf` |
| `linea-10` | `docs/rutas-gad-machala/Linea-10.pdf` |
| `linea-11` | `docs/rutas-gad-machala/Linea-11.pdf` |
| `linea-12` | `docs/rutas-gad-machala/Linea-12.pdf` |
| `linea-13` | `docs/rutas-gad-machala/Linea-13.pdf` |
| `linea-14` | `docs/rutas-gad-machala/Linea-14.pdf` |
| `linea-14c` | `docs/rutas-gad-machala/Linea-14C.pdf` |
| `linea-15` | `docs/rutas-gad-machala/Linea-15.pdf` |
| `linea-16` | `docs/rutas-gad-machala/Linea-16.pdf` |
| `linea-18` | `docs/rutas-gad-machala/Linea-18.pdf` |

- [ ] **Paso 3: Verificar manualmente**

Ejecuta `node -e "const r = require('./scripts/seed-data/routes-raw.json'); console.log(Object.entries(r).map(([id, v]) => [id, v.stops.length]))"` (o abre el archivo directamente) y confirma que las 20 líneas tienen un arreglo `stops` con al menos 3 elementos cada una (ninguna quedó vacía).

- [ ] **Paso 4: Commit**

```bash
git add scripts/seed-data/routes-raw.json
git commit -m "data: extraer paradas oficiales de las 20 líneas del GAD Machala"
```

---

### Task 2: Geocodificar los puntos de interés únicos

**Files:**
- Create: `scripts/seed-data/pois.json`

**Interfaces:**
- Consumes: `scripts/seed-data/routes-raw.json` (Tarea 1) — los nombres de parada a geocodificar.
- Produces: `pois.json` con forma `{ [stopName]: { lat: number, lng: number } }`. Lo consume `build-routes.mjs` (Tarea 3).

- [ ] **Paso 1: Listar los nombres únicos de parada**

A partir de `scripts/seed-data/routes-raw.json`, arma la lista de todos los nombres de `stops` sin duplicados (varios lugares como "Hospital Teófilo Dávila", "SOLCA", "Estadio 9 de Mayo", "C.C. La Piazza", "Terminal Terrestre" se repiten en varias líneas — geocodifica cada nombre una sola vez).

- [ ] **Paso 2: Geocodificar cada nombre único**

Para cada nombre único, haz una petición a Nominatim (OpenStreetMap) con esta plantilla de URL (usando la herramienta de fetch web), reemplazando `{query}` por el nombre del lugar + ", Machala, El Oro, Ecuador" (URL-encoded):

```
https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1&countrycodes=ec
```

Ejemplo: para "Hospital Teófilo Dávila" → `q=Hospital+Teófilo+Dávila,+Machala,+El+Oro,+Ecuador`.

Del primer resultado, toma `lat` y `lon` (conviértelos a número). Si la respuesta viene vacía, reintenta con una consulta más simple (solo el nombre + "Machala, Ecuador"). Si sigue vacía después del reintento, usa como coordenada de emergencia el centro de Machala `{ "lat": -3.2586, "lng": -79.9606 }` y anota ese nombre en un comentario al final de esta tarea para revisión manual posterior — no dejes ningún nombre sin entrada en el archivo.

- [ ] **Paso 3: Escribir `scripts/seed-data/pois.json`**

Formato exacto:

```json
{
  "Hospital Teófilo Dávila": { "lat": -3.2601, "lng": -79.9580 },
  "SOLCA": { "lat": -3.2615, "lng": -79.9575 }
}
```

(valores de ejemplo — usa los resultados reales del paso 2 para cada uno de los nombres únicos recopilados en el paso 1).

- [ ] **Paso 4: Verificar manualmente**

Confirma que **todas** las coordenadas caen dentro de un rectángulo razonable para El Oro/Machala: `lat` entre -3.10 y -3.40, `lng` entre -80.10 y -79.80. Cualquier valor fuera de ese rango indica un resultado de geocoding equivocado (Nominatim devolvió un lugar con el mismo nombre en otro país) — corrígelo manualmente antes de continuar.

- [ ] **Paso 5: Commit**

```bash
git add scripts/seed-data/pois.json
git commit -m "data: geocodificar puntos de interés de las paradas de buses"
```

---

### Task 3: Ensamblar `routes.json` y sembrarlo en Firebase

**Files:**
- Create: `scripts/seed-data/build-routes.mjs`
- Create: `scripts/seedRoutes.mjs`
- Modify: `database.rules.json`
- Modify: `package.json:6-10` (bloque `scripts`)

**Interfaces:**
- Consumes: `scripts/seed-data/routes-raw.json` (Tarea 1), `scripts/seed-data/pois.json` (Tarea 2).
- Produces: `/routes/{routeId}` en Firebase con forma `{ name, color, stops: [{id,name,lat,lng,order}], path: [[lat,lng],...] }` — esta es la forma que consumen las Tareas 4, 5 y 6 y los componentes `BusMap.jsx`/`useEta.js` ya existentes.

- [ ] **Paso 1: Escribir `scripts/seed-data/build-routes.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = route.stops.map((stopName, index) => {
    const poi = pois[stopName]
    if (!poi) {
      throw new Error(`Falta geocodificar "${stopName}" (usado en ${routeId}) en pois.json`)
    }
    return {
      id: `${routeId}-${slugify(stopName)}`,
      name: stopName,
      lat: poi.lat,
      lng: poi.lng,
      order: index,
    }
  })

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path: stops.map((stop) => [stop.lat, stop.lng]),
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Paso 2: Ejecutar y verificar la generación**

Run: `node scripts/seed-data/build-routes.mjs`
Expected: imprime `Generado routes.json con 20 líneas.` y crea `scripts/seed-data/routes.json`. Si en cambio lanza `Falta geocodificar "..."`, faltó ese nombre en `pois.json` de la Tarea 2 — complétalo y vuelve a correr.

- [ ] **Paso 3: Escribir `scripts/seedRoutes.mjs`**

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set } from 'firebase/database'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const env = loadEnv()

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const db = getDatabase(app)

const routes = JSON.parse(readFileSync(join(__dirname, 'seed-data', 'routes.json'), 'utf-8'))

for (const [routeId, route] of Object.entries(routes)) {
  await set(ref(db, `routes/${routeId}`), route)
  console.log(`Sembrado: ${routeId} (${route.name})`)
}

console.log('Listo.')
process.exit(0)
```

- [ ] **Paso 4: Agregar scripts de npm**

En `package.json`, dentro del bloque `"scripts"`, agrega:

```json
    "seed:build-routes": "node scripts/seed-data/build-routes.mjs",
    "seed:routes": "node scripts/seedRoutes.mjs"
```

- [ ] **Paso 5: Actualizar `database.rules.json`**

```json
{
  "rules": {
    "buses": {
      ".read": true,
      ".write": true,
      ".indexOn": ["active"]
    },
    "potholes": {
      ".read": true,
      ".write": true
    },
    "tracks": {
      ".read": true,
      ".write": true
    },
    "routes": {
      ".read": true,
      ".write": true
    },
    "unitCounters": {
      ".read": true,
      ".write": true
    }
  }
}
```

Copia este contenido al editor de reglas en la consola de Firebase (Realtime Database → Reglas) y publícalo — el archivo local no se despliega solo.

- [ ] **Paso 6: Sembrar y verificar en Firebase**

Run: `npm run seed:routes`
Expected: 20 líneas impresas como `Sembrado: linea-X (Línea X)`, seguido de `Listo.`. Abre la consola de Firebase → Realtime Database y confirma que `/routes` tiene 20 hijos, cada uno con `name`, `color`, `stops` (arreglo de objetos) y `path` (arreglo de pares `[lat,lng]`).

- [ ] **Paso 7: Commit**

```bash
git add scripts/seed-data/build-routes.mjs scripts/seedRoutes.mjs database.rules.json package.json
git commit -m "feat: script de siembra de las 20 líneas reales a Firebase"
```

---

### Task 4: Hook `useRoutes` — Firebase reemplaza `ROUTES` de `machala.js`

**Files:**
- Create: `src/services/routeService.js`
- Create: `src/hooks/useRoutes.js`
- Modify: `src/config/machala.js`
- Modify: `src/components/passenger/PassengerView.jsx`
- Modify: `src/components/conductor/TripControls.jsx`

**Interfaces:**
- Produces: `useRoutes()` → `Array<{id, name, color, stops, path}>`, mismo shape que el `ROUTES` estático que reemplaza. `subscribeRoutes(callback)` en `routeService.js`, mismo patrón que `subscribeBuses` en `busService.js`.
- Produces también: `saveRecordedPath(routeId, points)` en `routeService.js` (no se usa hasta la Tarea 6, pero vive en este archivo por responsabilidad compartida sobre `/routes`).

- [ ] **Paso 1: Crear `src/services/routeService.js`**

```js
import { ref, onValue, off, set } from 'firebase/database'
import { db } from '../firebase.js'

export function subscribeRoutes(callback) {
  const routesRef = ref(db, 'routes')

  const handler = (snapshot) => {
    const value = snapshot.val() || {}
    const routes = Object.entries(value).map(([id, route]) => ({ id, ...route }))
    callback(routes)
  }

  onValue(routesRef, handler)

  return () => off(routesRef, 'value', handler)
}

export function saveRecordedPath(routeId, points) {
  return set(ref(db, `routes/${routeId}/path`), points)
}
```

- [ ] **Paso 2: Crear `src/hooks/useRoutes.js`**

```js
import { useEffect, useState } from 'react'
import { subscribeRoutes } from '../services/routeService.js'

export function useRoutes() {
  const [routes, setRoutes] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeRoutes(setRoutes)
    return unsubscribe
  }, [])

  return routes
}
```

- [ ] **Paso 3: Quitar `ROUTES` de `src/config/machala.js`**

Deja el archivo solo con:

```js
export const MACHALA_CENTER = [-3.2586, -79.9606]
export const DEFAULT_ZOOM = 14
```

- [ ] **Paso 4: Actualizar `src/components/passenger/PassengerView.jsx`**

Reemplaza el import y el estado inicial de `routeId`:

```js
import { useEffect, useMemo, useState } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useBuses } from '../../hooks/useBuses.js'
import { useEta } from '../../hooks/useEta.js'
import { usePassengerLocation } from '../../hooks/usePassengerLocation.js'
import { useRoutes } from '../../hooks/useRoutes.js'
import { BusMap } from './BusMap.jsx'
import { StopSelector } from './StopSelector.jsx'
import { EtaPanel } from './EtaPanel.jsx'

export function PassengerView() {
  const { clearRole } = useRole()
  const routes = useRoutes()
  const [routeId, setRouteId] = useState('')
  const [stopId, setStopId] = useState('')

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

  const eta = useEta(routeBuses, stop, route?.path)
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
          passengerPosition={passengerPosition}
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
        </div>
      </div>

      <div className="passenger-view__panel">
        <EtaPanel eta={eta} stopId={stopId} stopName={stop?.name} />
      </div>
    </div>
  )
}
```

- [ ] **Paso 5: Actualizar el selector de ruta en `src/components/conductor/TripControls.jsx`**

Reemplaza `import { ROUTES } from '../../config/machala.js'` por `import { useRoutes } from '../../hooks/useRoutes.js'`, y dentro del componente:

```js
const routes = useRoutes()
const [routeId, setRouteId] = useState('')
```

con un efecto para fijar la primera ruta cuando cargan (agrega `useEffect` al import de React):

```js
useEffect(() => {
  if (!routeId && routes.length > 0) setRouteId(routes[0].id)
}, [routes, routeId])
```

y cambia el `.map` del `<select>` de `ROUTES.map(...)` a `routes.map(...)`. (El resto de este archivo se termina de escribir en la Tarea 6, que agrega el checkbox de grabación — no dupliques el archivo completo aquí.)

- [ ] **Paso 6: Verificar manualmente**

Run: `npm run dev`, abre la vista Pasajero. Expected: el selector de ruta lista las 20 líneas reales sembradas en la Tarea 3 (no "Ruta 1 · Terminal - Centro - Unioro" de ejemplo), el mapa centra en Machala y no hay errores en la consola del navegador.

- [ ] **Paso 7: Commit**

```bash
git add src/services/routeService.js src/hooks/useRoutes.js src/config/machala.js src/components/passenger/PassengerView.jsx src/components/conductor/TripControls.jsx
git commit -m "feat: leer rutas desde Firebase en vez de config estático"
```

---

### Task 5: Identificador automático de bus (`unitLabel`)

**Files:**
- Create: `src/services/busUnitService.js`
- Modify: `src/components/conductor/ConductorView.jsx`
- Modify: `src/services/locationService.js`
- Modify: `src/components/passenger/BusMap.jsx`

**Interfaces:**
- Consumes: nada nuevo de tareas anteriores.
- Produces: `assignBusUnit(routeId, numero) → Promise<{busId, unitLabel}>`. `busInfo.unitLabel` (string, ej. `"20-2"`) pasa a viajar junto al resto de `busInfo` por `startPublishing`/`updateBusInfo` (Tarea existente, sin cambios de forma) y se publica en `/buses/{busId}`.

- [ ] **Paso 1: Crear `src/services/busUnitService.js`**

```js
import { ref, runTransaction } from 'firebase/database'
import { db } from '../firebase.js'

export async function assignBusUnit(routeId, numero) {
  const counterRef = ref(db, `unitCounters/${routeId}_${numero}`)
  const result = await runTransaction(counterRef, (current) => (current || 0) + 1)
  const suffix = result.snapshot.val()
  return {
    busId: `${routeId}-${numero}-${suffix}`,
    unitLabel: `${numero}-${suffix}`,
  }
}
```

- [ ] **Paso 2: Actualizar `handleStart` en `src/components/conductor/ConductorView.jsx`**

Import nuevo: `import { assignBusUnit } from '../../services/busUnitService.js'`. Cambia `handleStart` para que sea async y use el identificador asignado:

```js
const handleStart = async ({ routeId, empresa, numero, destino }) => {
  const { busId, unitLabel } = await assignBusUnit(routeId, numero)
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
  setTripActive(true)
  startPublishing(info)
}
```

(El parámetro `recordRoute` y la lógica de grabación se agregan en la Tarea 6 — no los incluyas todavía en este paso.)

Actualiza también la línea del encabezado de `trip-status` que muestra el número, de `#{busInfo?.numero}` a `#{busInfo?.unitLabel}`.

- [ ] **Paso 3: Publicar `unitLabel` en `src/services/locationService.js`**

En la función `publish()`, agrega `unitLabel` a la desestructuración y al objeto publicado:

```js
function publish() {
  if (!latestBusInfo) return
  const { busId, driverId, routeId, empresa, numero, unitLabel, destino, lat, lng, speed, heading } =
    latestBusInfo
  if (lat == null || lng == null) return

  publishBusPosition(busId, {
    busId,
    driverId,
    routeId,
    empresa,
    numero,
    unitLabel,
    destino,
    lat,
    lng,
    speed: speed ?? null,
    heading: heading ?? null,
    updatedAt: { '.sv': 'timestamp' },
    active: true,
  })

  addTrackPoint(busId, lat, lng)
}
```

- [ ] **Paso 4: Mostrar `unitLabel` en el popup del bus en `src/components/passenger/BusMap.jsx`**

Cambia la línea del `Popup` del marcador de bus:

```jsx
<Popup>
  {bus.empresa} #{bus.unitLabel ?? bus.numero} → {bus.destino}
  {bus.isStale && (
    <div className="bus-popup__stale">
      ⚠️ Señal perdida hace {formatElapsed(bus.lastUpdateMs)}
    </div>
  )}
</Popup>
```

- [ ] **Paso 5: Verificar manualmente la asignación de sufijos**

Run: `npm run dev`, abre dos pestañas en modo Conductor. En ambas, elige la misma línea y escribe el mismo número de unidad (ej. "20"), presiona "Iniciar viaje" en las dos. Expected: en la consola de Firebase, `/unitCounters/{routeId}_20` vale `2`, y hay dos entradas distintas en `/buses` con `unitLabel` `"20-1"` y `"20-2"` — no se pisan entre sí. En la vista Pasajero, el popup de cada bus muestra el `unitLabel` correspondiente.

- [ ] **Paso 6: Commit**

```bash
git add src/services/busUnitService.js src/components/conductor/ConductorView.jsx src/services/locationService.js src/components/passenger/BusMap.jsx
git commit -m "feat: asignar identificador automático a buses duplicados por número"
```

---

### Task 6: Grabación de recorrido por el conductor

**Files:**
- Create: `src/hooks/useRouteRecorder.js`
- Modify: `src/components/conductor/TripControls.jsx`
- Modify: `src/components/conductor/ConductorView.jsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `saveRecordedPath(routeId, points)` de `src/services/routeService.js` (Tarea 4).
- Produces: `useRouteRecorder(active, position) → { getPoints: () => Array<[number,number]>, pointCount: number }`.

- [ ] **Paso 1: Crear `src/hooks/useRouteRecorder.js`**

```js
import { useEffect, useRef, useState } from 'react'

export function useRouteRecorder(active, position) {
  const [pointCount, setPointCount] = useState(0)
  const pointsRef = useRef([])

  useEffect(() => {
    if (!active) {
      pointsRef.current = []
      setPointCount(0)
    }
  }, [active])

  useEffect(() => {
    if (!active || !position) return
    pointsRef.current.push([position.lat, position.lng])
    setPointCount(pointsRef.current.length)
  }, [active, position])

  return { getPoints: () => pointsRef.current, pointCount }
}
```

- [ ] **Paso 2: Terminar `src/components/conductor/TripControls.jsx`** (checkbox de grabación)

Contenido completo del archivo (incluye los cambios de la Tarea 4, paso 5, más el checkbox nuevo):

```jsx
import { useEffect, useState } from 'react'
import { useRoutes } from '../../hooks/useRoutes.js'

export function TripControls({ tripActive, onStart, onStop }) {
  const routes = useRoutes()
  const [routeId, setRouteId] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [numero, setNumero] = useState('')
  const [destino, setDestino] = useState('')
  const [recordRoute, setRecordRoute] = useState(false)

  useEffect(() => {
    if (!routeId && routes.length > 0) setRouteId(routes[0].id)
  }, [routes, routeId])

  const canStart =
    routeId && empresa.trim().length > 0 && numero.trim().length > 0 && destino.trim().length > 0

  return (
    <div className="trip-controls">
      <label className="trip-controls__field">
        Ruta
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={tripActive}>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>
      </label>

      <label className="trip-controls__field">
        Empresa/Cooperativa
        <input
          type="text"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: CIFA"
        />
      </label>

      <label className="trip-controls__field">
        Número de unidad
        <input
          type="text"
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: 12"
        />
      </label>

      <label className="trip-controls__field">
        Destino
        <input
          type="text"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: Huaquillas"
        />
      </label>

      <label className="trip-controls__field trip-controls__field--checkbox">
        <input
          type="checkbox"
          checked={recordRoute}
          onChange={(e) => setRecordRoute(e.target.checked)}
          disabled={tripActive}
        />
        Grabar este recorrido como ruta oficial
      </label>

      {tripActive ? (
        <button className="trip-button trip-button--stop" onClick={onStop}>
          Detener viaje
        </button>
      ) : (
        <button
          className="trip-button trip-button--start"
          disabled={!canStart}
          onClick={() =>
            onStart({
              routeId,
              empresa: empresa.trim(),
              numero: numero.trim(),
              destino: destino.trim(),
              recordRoute,
            })
          }
        >
          Iniciar viaje
        </button>
      )}
    </div>
  )
}
```

- [ ] **Paso 3: Terminar `src/components/conductor/ConductorView.jsx`** (grabación end-to-end)

Contenido completo del archivo (incluye los cambios de la Tarea 5, paso 2, más la grabación):

```jsx
import { useState, useCallback, useEffect } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useWakeLock } from '../../hooks/useWakeLock.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useMotionDetector } from '../../hooks/useMotionDetector.js'
import { useRouteRecorder } from '../../hooks/useRouteRecorder.js'
import { startPublishing, updateBusInfo, stopPublishing } from '../../services/locationService.js'
import { reportPothole } from '../../services/potholeService.js'
import { saveRecordedPath } from '../../services/routeService.js'
import { assignBusUnit } from '../../services/busUnitService.js'
import { TripControls } from './TripControls.jsx'

export function ConductorView() {
  const { deviceId, clearRole } = useRole()
  const [tripActive, setTripActive] = useState(false)
  const [busInfo, setBusInfo] = useState(null)
  const [potholeCount, setPotholeCount] = useState(0)
  const [recordingRoute, setRecordingRoute] = useState(false)

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
    const { busId, unitLabel } = await assignBusUnit(routeId, numero)
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

      {tripActive && (
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
      )}
    </div>
  )
}
```

- [ ] **Paso 4: Estilos del checkbox en `src/styles/app.css`**

Agrega, después de la regla `.trip-controls__field select:disabled, .trip-controls__field input:disabled`:

```css
.trip-controls__field--checkbox {
  flex-direction: row;
  align-items: center;
  gap: var(--sp-1);
  text-transform: none;
  letter-spacing: normal;
  font-size: 0.95rem;
}

.trip-controls__field--checkbox input[type='checkbox'] {
  width: 20px;
  height: 20px;
  min-height: 0;
  flex: none;
}
```

- [ ] **Paso 5: Verificar manualmente**

Run: `npm run dev`, entra como Conductor, marca "Grabar este recorrido como ruta oficial", inicia el viaje, espera a que se acumulen más de 10 posiciones (moviéndote o con ubicación simulada en DevTools) y presiona "Detener viaje". Expected: en la consola de Firebase, `/routes/{routeId}/path` cambió a los puntos grabados durante ese viaje. Repite un viaje muy corto (deteniendo antes de 10 puntos) y confirma que el `path` de esa línea **no** cambió.

- [ ] **Paso 6: Commit**

```bash
git add src/hooks/useRouteRecorder.js src/components/conductor/TripControls.jsx src/components/conductor/ConductorView.jsx src/styles/app.css
git commit -m "feat: grabar recorrido del conductor como path oficial de la ruta"
```
