# Trazado de ruta siguiendo calles reales (OSRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El `path` de cada ruta sembrada se genera siguiendo las calles reales de Machala (vía OSRM), en vez de líneas rectas entre paradas, con fallback automático y una salida manual por ruta si el resultado no convence.

**Architecture:** Único cambio en `scripts/seed-data/build-routes.mjs`. Por cada ruta se llama una vez a la API pública de OSRM (`router.project-osrm.org/route/v1/driving`) con las coordenadas de todas sus paradas en orden; la geometría de calles que devuelve se usa como `path`. Si la ruta trae un campo `path` manual en `routes-raw.json`, se usa directo y no se llama a OSRM. Si OSRM falla para una ruta puntual, se cae a la línea recta actual sin romper el build. Un flag `--only=id1,id2` permite limitar la llamada a OSRM a rutas específicas (piloto), dejando el resto en línea recta.

**Tech Stack:** Node.js 22 (fetch nativo, sin dependencias nuevas), ESM (`"type": "module"` en package.json, soporta top-level `await`).

## Global Constraints

- No hay framework de pruebas automatizadas en este repo (no `vitest`/`jest` en `package.json`, no archivos `*.test.*` bajo `src/`). No se agrega uno — la verificación es manual, corriendo el script y revisando `routes.json` / el navegador.
- No tocar `src/components/passenger/BusMap.jsx`, `src/components/passenger/PassengerView.jsx`, ni `saveRecordedPath` en `src/services/routeService.js` — fuera de alcance según el spec.
- `scripts/seed-data/routes.json` es un artefacto generado, no está trackeado en git (`git status` lo muestra como `??`) — no se commitea.
- Ser cortés con el servidor público de OSRM: delay de ~300ms entre llamadas, y no se agregan reintentos automáticos (un fallo cae directo a línea recta).

---

### Task 1: Generar `path` vía OSRM en `build-routes.mjs`, con fallback, override manual y flag `--only`

**Files:**
- Modify: `scripts/seed-data/build-routes.mjs` (reemplaza todo el archivo)

**Interfaces:**
- Consumes: `scripts/seed-data/routes-raw.json` (cada entrada `{ name, color, stops: string[] }`, ahora opcionalmente con `path: [number, number][]`), `scripts/seed-data/pois.json` (`{ [stopName]: { lat, lng } }`).
- Produces: `scripts/seed-data/routes.json` con cada ruta `{ name, color, stops: [{id, name, lat, lng, order}], path: [number, number][] }` — mismo shape que antes, solo cambia cómo se calcula `path`. No hay otros consumidores de este script en este plan (es el único task).

Este es el contenido actual completo de `scripts/seed-data/build-routes.mjs` (referencia, para ver exactamente qué cambia):

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

- [ ] **Step 1: Reemplazar el archivo completo con la nueva lógica**

Reemplazar todo el contenido de `scripts/seed-data/build-routes.mjs` por:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOsrmPath(stops) {
  const coords = stops.map((stop) => `${stop.lng},${stop.lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
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

  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    try {
      path = await fetchOsrmPath(stops)
      await sleep(OSRM_DELAY_MS)
    } catch (error) {
      console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
      path = straightPath
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 2: Verificar que el script sigue corriendo sin el flag `--only` sobre una sola línea usando un archivo temporal de prueba**

No correr todavía sobre las 19 líneas reales (eso es Task 2). Primero confirmar que la sintaxis y la lógica funcionan de punta a punta con datos mínimos.

Ejecutar desde la raíz del proyecto:

```bash
node -e "
const raw = require('./scripts/seed-data/routes-raw.json');
console.log('linea-1 stops:', raw['linea-1'].stops.length);
"
```

Expected output: `linea-1 stops: 17` (confirma que routes-raw.json sigue teniendo la forma esperada, sin `path`, antes de correr el build real).

- [ ] **Step 3: Correr el build limitado a `linea-1` con `--only` y revisar el resultado**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output (dos líneas al final, puede variar el orden de los warnings si los hay):
```
Generado routes.json con 20 líneas.
```

Luego inspeccionar el `path` generado para `linea-1`:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
const p = routes['linea-1'].path;
console.log('puntos:', p.length);
console.log('primeros 3:', p.slice(0, 3));
console.log('stops:', routes['linea-1'].stops.length);
"
```

Expected: `puntos` debe ser muchísimo mayor que `stops` (OSRM devuelve decenas/cientos de puntos siguiendo calles, no solo las paradas). Si `puntos` es igual a `stops`, algo falló y cayó al fallback de línea recta — revisar warnings impresos por el script en el Step 3.

- [ ] **Step 4: Confirmar que las líneas fuera de `--only` siguen en línea recta (fallback esperado, no un bug)**

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
const p = routes['linea-2'].path;
const stops = routes['linea-2'].stops;
console.log('puntos == stops:', p.length === stops.length);
"
```

Expected: `puntos == stops: true` — confirma que `linea-2` (no incluida en `--only=linea-1`) se quedó con la línea recta de siempre, tal como espera el diseño (no se llamó a OSRM para ella).

- [ ] **Step 5: Probar el fallback ante un fallo real de OSRM**

Editar temporalmente la constante `OSRM_BASE_URL` en `scripts/seed-data/build-routes.mjs` para forzar un error de red:

```js
const OSRM_BASE_URL = 'https://router.project-osrm-typo-invalido.org/route/v1/driving'
```

Correr:

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output: debe imprimir un warning como `linea-1: fallo OSRM (...), usando línea recta` y terminar con `Generado routes.json con 20 líneas.` (el script no debe crashear).

Revertir el cambio (volver a `https://router.project-osrm.org/route/v1/driving`) antes de continuar.

- [ ] **Step 6: Probar el override manual de `path` en `routes-raw.json`**

Esto es solo una prueba temporal para confirmar que la ruta de código del override funciona — no se deja permanente en `routes-raw.json` a menos que una línea real lo necesite (eso se decide en Task 2 si el piloto no convence para alguna línea).

Editar temporalmente `scripts/seed-data/routes-raw.json` agregando un campo `path` a `linea-1` (usar solo 2 puntos de prueba, cualquier coordenada dentro de Machala):

```json
"linea-1": {
  "name": "Línea 1",
  "color": "#e63946",
  "path": [[-3.2876518, -79.9010685], [-3.2682378, -79.9993667]],
  "stops": [ ... deja el array de stops existente sin cambios ... ]
}
```

Correr:

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output: debe imprimir `linea-1: usando path manual de routes-raw.json` y **no** debe imprimir ningún warning de OSRM para `linea-1` (no se llamó a la API).

Verificar:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
console.log(routes['linea-1'].path);
"
```

Expected: exactamente los 2 puntos de prueba que se puso en el override.

Revertir el cambio en `routes-raw.json` (quitar el campo `path` de prueba de `linea-1`) antes de continuar — este archivo vuelve a su estado original sin overrides, listos para Task 2.

- [ ] **Step 7: Confirmar que `routes-raw.json` quedó revertido y `build-routes.mjs` quedó con la URL correcta**

```bash
git diff scripts/seed-data/routes-raw.json
```

Expected: sin diferencias (output vacío) — si hay diferencias, revertirlas antes de seguir.

```bash
grep OSRM_BASE_URL scripts/seed-data/build-routes.mjs
```

Expected: `const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'` (la URL real, no el typo del Step 5).

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-data/build-routes.mjs
git commit -m "feat: generar path de rutas siguiendo calles reales via OSRM"
```

---

### Task 2: Piloto con Línea 1 y Línea 6, y rollout a las 20 líneas

> **Superseded (2026-07-09, mismo día):** el piloto real de este task reveló que OSRM-entre-paradas produce rutas que se meten a caminos internos (ej. campus universitario) en vez de seguir la avenida real — ver spec, sección "Revisión post-piloto". No se completó el rollout de este task. Ver **Task 3** (nuevo método: relaciones de bus reales de OpenStreetMap, con OSRM entre paradas como respaldo) y **Task 4** (piloto v2 sobre el nuevo método), que reemplazan el resto de este task. Los pasos de abajo quedan como registro histórico, no se ejecutan.

**Files:**
- Modify (posible, solo si algún piloto no convence): `scripts/seed-data/routes-raw.json` — agregar `path` manual a una ruta puntual.
- No se modifica código en este task — es ejecución del script de Task 1 y verificación visual.

**Interfaces:**
- Consumes: `scripts/seed-data/build-routes.mjs` (Task 1, ya soporta `--only`, override manual y fallback), `npm run seed:routes` (ya existente, sube `routes.json` completo a Firebase con `set()` por ruta).
- Produces: `scripts/seed-data/routes.json` regenerado (no se commitea, es artefacto), datos en Firebase actualizados.

- [ ] **Step 1: Generar el piloto para Línea 1 y Línea 6**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6
```

Expected: sin warnings de fallback para `linea-1` ni `linea-6` (si aparece un warning, algo falló con OSRM para esa línea — revisar el mensaje de error antes de seguir).

- [ ] **Step 2: Subir el piloto a Firebase**

```bash
npm run seed:routes
```

Expected: imprime `Sembrado: linea-1 (Línea 1)`, ..., `Sembrado: linea-20 (Línea 20)` y termina con `Listo.` (sube las 20 rutas — las que no están en `--only` se suben con su línea recta de siempre, sin cambios respecto a lo que ya había).

- [ ] **Step 3: Verificar visualmente en el navegador**

```bash
npm run dev
```

En el navegador, entrar como Pasajero:
1. Elegir "Línea 1": la línea dibujada en el mapa debe seguir las calles (Av. Ferroviaria, Av. Panamericana, etc., según `docs/rutas-gad-machala/Linea-1.pdf`), no cortar en diagonal por manzanas.
2. Elegir "Línea 6": mismo chequeo, comparando contra `docs/rutas-gad-machala/Linea-6.pdf`.
3. Elegir cualquier otra línea (ej. "Línea 2"): debe seguir viéndose como antes (línea recta entre paradas) — es esperado, todavía no se regeneró con OSRM.

- [ ] **Step 4: Decidir rollout completo o ajuste puntual**

Si Línea 1 y Línea 6 se ven bien: continuar al Step 5 (rollout completo).

Si alguna de las dos NO convence: agregar un `path` manual a esa ruta en `scripts/seed-data/routes-raw.json` (mismo formato que el Step 6 de Task 1, pero con puntos reales trazados a mano viendo el PDF de esa línea), y volver a correr `node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6` antes de seguir.

- [ ] **Step 5: Generar las 20 líneas completas**

```bash
node scripts/seed-data/build-routes.mjs
```

Expected: sin el flag `--only`, todas las líneas llaman a OSRM (excepto las que tengan `path` manual en `routes-raw.json`). Revisar la salida por warnings de fallback — si alguna línea cae a línea recta por un fallo puntual de red, se puede volver a correr solo esa línea después (`--only=<esa-linea>`) para reintentar.

- [ ] **Step 6: Subir el resultado completo a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 7: Verificación final en el navegador**

```bash
npm run dev
```

Como Pasajero, revisar al menos 3 líneas más (además de Línea 1 y Línea 6) contra sus PDFs correspondientes en `docs/rutas-gad-machala/`, confirmando que las líneas siguen calles reales y no hay líneas rectas atravesando manzanas.

- [ ] **Step 8: Commit (solo si Step 4 requirió un override manual)**

Si en el Step 4 se agregó algún `path` manual a `routes-raw.json`, commitear ese cambio (si no se tocó nada, este step no aplica):

```bash
git add scripts/seed-data/routes-raw.json
git commit -m "fix: path manual para linea-N (resultado de OSRM no seguía la ruta oficial)"
```

---

### Task 3: Usar las relaciones de bus reales de OpenStreetMap como fuente primaria del `path`, con OSRM-entre-paradas (Task 1) como respaldo

**Contexto:** el piloto de Task 2 mostró que enrutar con OSRM directo entre las paradas geocodificadas mete la ruta por caminos internos (ej. campus universitario) en vez de la avenida real. Se descubrió que OpenStreetMap ya tiene las 20 líneas de Machala mapeadas como relaciones `route=bus` reales (nombradas `Linea {N} {primera parada} - {última parada}`), verificado con Overpass API: para Línea 1 (relación OSM 16761813, `Linea 1 El Cambio - Mercado 25 de Junio`), se extrajeron 52 segmentos de vía (excluyendo miembros con `role=platform/stop`, que son las paradas, no la calle) encadenados en el orden correcto con solo un hueco de 445m en toda la ruta. Ver spec: `docs/superpowers/specs/2026-07-09-trazado-calles-reales-osrm-design.md`, sección "Revisión post-piloto".

**Files:**
- Modify: `scripts/seed-data/build-routes.mjs` (reemplaza todo el archivo)

**Interfaces:**
- Consumes: mismo `routes-raw.json`/`pois.json` que Task 1. Además consume la API pública de Overpass (`overpass-api.de/api/interpreter`) para buscar y traer relaciones `route=bus` de OpenStreetMap en el área de Machala, y sigue usando OSRM (de Task 1) como nivel 2 de respaldo.
- Produces: mismo shape de `routes.json` que antes (`{ name, color, stops, path }`). Orden de prioridad para calcular `path`: (1) `path` manual en `routes-raw.json` (sin cambios de Task 1); (2) si `--only` excluye la ruta, línea recta (sin cambios de Task 1); (3) **nuevo:** relación de bus de OpenStreetMap que coincida con esa línea, con huecos internos rellenados vía OSRM; (4) si no hay relación coincidente o falla el procesamiento, OSRM entre paradas (comportamiento de Task 1, sin cambios); (5) si eso también falla, línea recta (sin cambios de Task 1).

Este es el contenido actual completo de `scripts/seed-data/build-routes.mjs` (después de Task 1), como referencia de lo que existe hoy:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOsrmPath(stops) {
  const coords = stops.map((stop) => `${stop.lng},${stop.lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
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

  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    try {
      path = await fetchOsrmPath(stops)
    } catch (error) {
      console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
      path = straightPath
    } finally {
      await sleep(OSRM_DELAY_MS)
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 1: Reemplazar el archivo completo con la nueva lógica (OSM primero, OSRM como respaldo)**

Reemplazar todo el contenido de `scripts/seed-data/build-routes.mjs` por:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MACHALA_BBOX = '-3.35,-80.05,-3.20,-79.85'
const GAP_PATCH_THRESHOLD_DEG = 300 / 111000

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

async function fetchOsrmPath(coordsLatLng) {
  const coords = coordsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function overpassQuery(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
  })
  if (!response.ok) {
    throw new Error(`Overpass respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!data.elements) {
    throw new Error('respuesta de Overpass sin "elements"')
  }
  return data.elements
}

async function fetchBusRelationsIndex() {
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["name"~"Linea",i](${MACHALA_BBOX});out tags;`
  const elements = await overpassQuery(query)
  return elements
    .filter((el) => el.type === 'relation' && el.tags && el.tags.name)
    .map((el) => ({ id: el.id, name: el.tags.name }))
}

function lineLabelFromRouteId(routeId) {
  const suffix = routeId.replace(/^linea-/, '')
  return suffix.replace(/[a-z]+$/i, (letters) => letters.toUpperCase())
}

function findMatchingRelation(relationsIndex, routeId, stops) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  const candidates = relationsIndex.filter((rel) => prefixPattern.test(rel.name))

  const firstStop = normalizeName(stops[0].name)
  const lastStop = normalizeName(stops[stops.length - 1].name)

  for (const candidate of candidates) {
    const rest = candidate.name.replace(prefixPattern, '')
    const parts = rest.split(' - ')
    if (parts.length !== 2) continue
    const [nameA, nameB] = parts.map(normalizeName)

    if (nameA === firstStop && nameB === lastStop) {
      return { id: candidate.id, reversed: false }
    }
    if (nameB === firstStop && nameA === lastStop) {
      return { id: candidate.id, reversed: true }
    }
  }
  return null
}

async function fetchRelationsGeometry(relationIds) {
  if (relationIds.length === 0) return new Map()
  const query = `[out:json][timeout:60];relation(id:${relationIds.join(',')});out geom;`
  const elements = await overpassQuery(query)
  const map = new Map()
  for (const el of elements) {
    if (el.type === 'relation') map.set(el.id, el)
  }
  return map
}

async function stitchRelationPath(relation) {
  const ways = relation.members.filter(
    (m) =>
      m.type === 'way' &&
      m.geometry &&
      m.geometry.length > 0 &&
      !['platform', 'stop', 'stop_entry_only', 'stop_exit_only'].includes(m.role)
  )
  if (ways.length === 0) {
    throw new Error('la relación no tiene segmentos de vía utilizables')
  }

  const path = ways[0].geometry.map((p) => [p.lat, p.lon])

  for (let i = 1; i < ways.length; i++) {
    const prevEnd = path[path.length - 1]
    const geom = ways[i].geometry
    const startPt = [geom[0].lat, geom[0].lon]
    const endPt = [geom[geom.length - 1].lat, geom[geom.length - 1].lon]
    const distToStart = dist(prevEnd, startPt)
    const distToEnd = dist(prevEnd, endPt)
    const seg = distToEnd < distToStart ? geom.map((p) => [p.lat, p.lon]).reverse() : geom.map((p) => [p.lat, p.lon])
    const gap = Math.min(distToStart, distToEnd)

    if (gap > GAP_PATCH_THRESHOLD_DEG) {
      try {
        const patch = await fetchOsrmPath([prevEnd, seg[0]])
        path.push(...patch.slice(1, -1))
        await sleep(OSRM_DELAY_MS)
      } catch (error) {
        console.warn(`  hueco de ~${Math.round(gap * 111000)}m sin poder rellenar (${error.message})`)
      }
    }

    path.push(...seg)
  }

  return path
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

let relationsIndex = []
try {
  relationsIndex = await fetchBusRelationsIndex()
  console.log(`Índice de relaciones de bus de OSM: ${relationsIndex.length} encontradas.`)
} catch (error) {
  console.warn(
    `No se pudo obtener el índice de relaciones de OSM (${error.message}); todas las líneas usarán el respaldo OSRM entre paradas.`
  )
}

const stopsByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  stopsByRoute[routeId] = route.stops.map((stopName, index) => {
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
}

const matches = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  if (Array.isArray(route.path)) continue
  if (onlyIds && !onlyIds.includes(routeId)) continue
  const match = findMatchingRelation(relationsIndex, routeId, stopsByRoute[routeId])
  if (match) matches[routeId] = match
}

const relationIdsToFetch = Object.values(matches).map((m) => m.id)
let relationsGeometry = new Map()
try {
  relationsGeometry = await fetchRelationsGeometry(relationIdsToFetch)
} catch (error) {
  console.warn(
    `No se pudo obtener la geometría de las relaciones de OSM (${error.message}); esas líneas caerán al respaldo OSRM entre paradas.`
  )
}

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = stopsByRoute[routeId]
  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    const match = matches[routeId]
    const relation = match ? relationsGeometry.get(match.id) : null

    path = null
    if (relation) {
      try {
        let stitched = await stitchRelationPath(relation)
        if (match.reversed) stitched = stitched.reverse()
        path = stitched
        console.log(`${routeId}: usando trazado real de OSM (relación ${match.id}, ${stitched.length} puntos)`)
      } catch (error) {
        console.warn(`${routeId}: fallo al procesar relación de OSM (${error.message}), usando respaldo OSRM entre paradas`)
      }
    } else {
      console.warn(`${routeId}: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`)
    }

    if (!path) {
      try {
        path = await fetchOsrmPath(stops.map((stop) => [stop.lat, stop.lng]))
      } catch (error) {
        console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
        path = straightPath
      } finally {
        await sleep(OSRM_DELAY_MS)
      }
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 2: Verificar que `linea-1` ahora usa la relación de OSM (no el respaldo OSRM)**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output: debe incluir una línea `Índice de relaciones de bus de OSM: 40 encontradas.` (u otro número cercano) y una línea `linea-1: usando trazado real de OSM (relación 16761813, N puntos)` donde N es varios cientos (no debe imprimir ningún warning de fallo ni caer al respaldo OSRM para `linea-1`).

Verificar el resultado:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
const p = routes['linea-1'].path;
console.log('puntos:', p.length);
console.log('primer punto:', p[0]);
console.log('último punto:', p[p.length - 1]);
"
```

Expected: `puntos` en el orden de 300-400 (la relación de OSM tiene ~349 puntos tras rellenar huecos), y el primer/último punto deben caer dentro del área de Machala (latitud entre -3.35 y -3.20, longitud entre -80.05 y -79.85).

- [ ] **Step 3: Verificar el caso de una línea sin relación de OSM coincidente (respaldo a OSRM entre paradas)**

`linea-10` es un caso conocido donde el nombre de la relación de OSM no coincide con la primera/última parada de `routes-raw.json` (la relación usa "C.C. La Piazza"/"Cdla. Las Brisas" como extremos, pero `routes-raw.json` empieza en "Torre Medica La Carolina") — debe caer al respaldo sin romper el script.

```bash
node scripts/seed-data/build-routes.mjs --only=linea-10
```

Expected output: una línea `linea-10: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`, sin errores ni crash, y el script termina con `Generado routes.json con 20 líneas.`.

Verificar:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
const p = routes['linea-10'].path;
const stops = routes['linea-10'].stops;
console.log('puntos:', p.length, '| stops:', stops.length);
"
```

Expected: `puntos` mucho mayor que `stops` (el respaldo OSRM-entre-paradas de Task 1 sigue funcionando y generando un trazado por calles, aunque no sea la ruta exacta de OSM).

- [ ] **Step 4: Verificar que el índice de relaciones se reutiliza y no se hacen llamadas de más a Overpass**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6,linea-6t,linea-7c
```

Expected: la línea `Índice de relaciones de bus de OSM: N encontradas.` debe aparecer **una sola vez** al inicio (no una vez por línea) — confirma que el índice se pide una sola vez y se reutiliza para las 4 líneas. Cada una de las 4 líneas debe loguear su propio resultado (relación de OSM encontrada o respaldo).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-data/build-routes.mjs
git commit -m "feat: usar relaciones de bus reales de OpenStreetMap para el trazado de rutas"
```

---

### Task 4: Piloto v2 con Línea 1 y Línea 6, y rollout a las 20 líneas

> **Superseded parcialmente (2026-07-09, mismo día):** el piloto v2 (Steps 1-3) sí se ejecutó y mostró que el trazado sigue las calles reales, pero el usuario notó que falta la mitad de "vuelta" del recorrido — cada línea tiene dos relaciones de OSM (ida/vuelta) que hay que combinar, no usar una sola. Ver spec, sección "Revisión post-piloto v2: falta la vuelta". Steps 4-8 de este task no se ejecutan — ver **Task 5** (combinar las dos relaciones de OSM cuando encajen) y **Task 6** (piloto v3), que los reemplazan.

**Files:**
- No se modifica código en este task — es ejecución del script de Task 3 y verificación visual.

**Interfaces:**
- Consumes: `scripts/seed-data/build-routes.mjs` (Task 3), `npm run seed:routes` (ya existente).
- Produces: `scripts/seed-data/routes.json` regenerado (no se commitea), datos en Firebase actualizados.

- [ ] **Step 1: Generar el piloto v2 para Línea 1 y Línea 6**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6
```

Expected: ambas líneas deben loguear `usando trazado real de OSM (relación ..., N puntos)` (Línea 6 también tiene relación de OSM mapeada, confirmado al listar el índice de relaciones en la investigación de Task 3).

- [ ] **Step 2: Subir el piloto v2 a Firebase**

```bash
npm run seed:routes
```

Expected: imprime `Sembrado: linea-1 (Línea 1)`, ..., `Sembrado: linea-20 (Línea 20)`, termina con `Listo.`.

- [ ] **Step 3: Verificar visualmente en el navegador**

```bash
npm run dev
```

En el navegador, entrar como Pasajero:
1. Elegir "Línea 1": la línea debe seguir las calles reales, entrando por Av. 25 de Junio (no Ferroviaria) y sin desviarse hacia dentro del campus universitario — comparar contra `docs/rutas-gad-machala/Linea-1.pdf`.
2. Elegir "Línea 6": mismo chequeo contra `docs/rutas-gad-machala/Linea-6.pdf`.
3. Confirmar que las paradas y buses siguen visibles sobre la línea.

- [ ] **Step 4: Decidir rollout completo**

Si Línea 1 y Línea 6 se ven bien: continuar al Step 5.

Si alguna no convence: no hay relación de OSM alternativa que probar (ya es la mejor fuente disponible) — la opción en ese caso es un `path` manual en `routes-raw.json` para esa línea puntual (mismo mecanismo del Step 6 de Task 1), decidido junto con el usuario antes de escribir el código de esa excepción.

- [ ] **Step 5: Generar las 20 líneas completas**

```bash
node scripts/seed-data/build-routes.mjs
```

Expected: cada línea logea si usó relación de OSM o el respaldo OSRM entre paradas. Revisar cuántas líneas cayeron al respaldo (esperado: al menos `linea-10`, ver Task 3 Step 3) — no es un error, es el comportamiento diseñado.

- [ ] **Step 6: Subir el resultado completo a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 7: Verificación final en el navegador**

```bash
npm run dev
```

Como Pasajero, revisar Línea 10 (caso de respaldo OSRM) y al menos 2 líneas más que usaron la relación de OSM, contra sus PDFs correspondientes en `docs/rutas-gad-machala/`.

- [ ] **Step 8: Commit (solo si Step 4 requirió un `path` manual)**

```bash
git add scripts/seed-data/routes-raw.json
git commit -m "fix: path manual para linea-N (sin relación de OSM ni resultado OSRM aceptable)"
```

---

### Task 5: Combinar las dos relaciones de OSM (ida/vuelta) de una línea cuando encajen en un punto de unión

**Contexto:** el piloto v2 de Task 4 (Steps 1-3) mostró que usar solo UNA relación de OSM por línea deja el trazado incompleto — le falta la mitad del recorrido. Se investigó: cada línea tiene dos relaciones (`Linea N A - B` y `Linea N B - A`), pero la comunidad de OSM las mapeó como dos MITADES de un mismo circuito que se unen en un punto compartido, no como dos recorridos independientes completos. Verificado con Overpass en Línea 1 (unión a 6m) y Línea 6 (unión a 0m). Ver spec, sección "Revisión post-piloto v2: falta la vuelta".

**Files:**
- Modify: `scripts/seed-data/build-routes.mjs` (reemplaza todo el archivo)

**Interfaces:**
- Consumes: mismo `routes-raw.json`/`pois.json`/Overpass/OSRM que Task 3.
- Produces: mismo shape de `routes.json`. Nuevo orden de prioridad para `path`: (1) `path` manual; (2) `--only` excluye -> línea recta; (3) **nuevo:** las dos relaciones de OSM de esa línea combinadas, si sus extremos encajan a menos de 50m; (4) si no hay 2 relaciones que encajen, una sola relación de OSM por coincidencia de nombre (comportamiento de Task 3, sin cambios); (5) OSRM entre paradas (Task 1, sin cambios); (6) línea recta (sin cambios).

Este es el contenido actual completo de `scripts/seed-data/build-routes.mjs` (después de Task 3), como referencia:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MACHALA_BBOX = '-3.35,-80.05,-3.20,-79.85'
const GAP_PATCH_THRESHOLD_DEG = 300 / 111000

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

async function fetchOsrmPath(coordsLatLng) {
  const coords = coordsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function overpassQuery(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'BusTrack-BuildScript/1.0'
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(`Overpass respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!data.elements) {
    throw new Error('respuesta de Overpass sin "elements"')
  }
  return data.elements
}

async function fetchBusRelationsIndex() {
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["name"~"Linea",i](${MACHALA_BBOX});out tags;`
  const elements = await overpassQuery(query)
  return elements
    .filter((el) => el.type === 'relation' && el.tags && el.tags.name)
    .map((el) => ({ id: el.id, name: el.tags.name }))
}

function lineLabelFromRouteId(routeId) {
  const suffix = routeId.replace(/^linea-/, '')
  return suffix.replace(/[a-z]+$/i, (letters) => letters.toUpperCase())
}

function findMatchingRelation(relationsIndex, routeId, stops) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  const candidates = relationsIndex.filter((rel) => prefixPattern.test(rel.name))

  const firstStop = normalizeName(stops[0].name)
  const lastStop = normalizeName(stops[stops.length - 1].name)

  for (const candidate of candidates) {
    const rest = candidate.name.replace(prefixPattern, '')
    const parts = rest.split(' - ')
    if (parts.length !== 2) continue
    const [nameA, nameB] = parts.map(normalizeName)

    if (nameA === firstStop && nameB === lastStop) {
      return { id: candidate.id, reversed: false }
    }
    if (nameB === firstStop && nameA === lastStop) {
      return { id: candidate.id, reversed: true }
    }
  }
  return null
}

async function fetchRelationsGeometry(relationIds) {
  if (relationIds.length === 0) return new Map()
  const query = `[out:json][timeout:60];relation(id:${relationIds.join(',')});out geom;`
  const elements = await overpassQuery(query)
  const map = new Map()
  for (const el of elements) {
    if (el.type === 'relation') map.set(el.id, el)
  }
  return map
}

async function stitchRelationPath(relation) {
  const ways = relation.members.filter(
    (m) =>
      m.type === 'way' &&
      m.geometry &&
      m.geometry.length > 0 &&
      !['platform', 'stop', 'stop_entry_only', 'stop_exit_only'].includes(m.role)
  )
  if (ways.length === 0) {
    throw new Error('la relación no tiene segmentos de vía utilizables')
  }

  const path = ways[0].geometry.map((p) => [p.lat, p.lon])

  for (let i = 1; i < ways.length; i++) {
    const prevEnd = path[path.length - 1]
    const geom = ways[i].geometry
    const startPt = [geom[0].lat, geom[0].lon]
    const endPt = [geom[geom.length - 1].lat, geom[geom.length - 1].lon]
    const distToStart = dist(prevEnd, startPt)
    const distToEnd = dist(prevEnd, endPt)
    const seg = distToEnd < distToStart ? geom.map((p) => [p.lat, p.lon]).reverse() : geom.map((p) => [p.lat, p.lon])
    const gap = Math.min(distToStart, distToEnd)

    if (gap > GAP_PATCH_THRESHOLD_DEG) {
      try {
        const patch = await fetchOsrmPath([prevEnd, seg[0]])
        path.push(...patch.slice(1, -1))
        await sleep(OSRM_DELAY_MS)
      } catch (error) {
        console.warn(`  hueco de ~${Math.round(gap * 111000)}m sin poder rellenar (${error.message})`)
      }
    }

    path.push(...seg)
  }

  return path
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

let relationsIndex = []
try {
  relationsIndex = await fetchBusRelationsIndex()
  console.log(`Índice de relaciones de bus de OSM: ${relationsIndex.length} encontradas.`)
} catch (error) {
  console.warn(
    `No se pudo obtener el índice de relaciones de OSM (${error.message}); todas las líneas usarán el respaldo OSRM entre paradas.`
  )
}

const stopsByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  stopsByRoute[routeId] = route.stops.map((stopName, index) => {
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
}

const matches = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  if (Array.isArray(route.path)) continue
  if (onlyIds && !onlyIds.includes(routeId)) continue
  const match = findMatchingRelation(relationsIndex, routeId, stopsByRoute[routeId])
  if (match) matches[routeId] = match
}

const relationIdsToFetch = Object.values(matches).map((m) => m.id)
let relationsGeometry = new Map()
if (relationIdsToFetch.length > 0) {
  await sleep(1000)
}
try {
  relationsGeometry = await fetchRelationsGeometry(relationIdsToFetch)
} catch (error) {
  console.warn(
    `No se pudo obtener la geometría de las relaciones de OSM (${error.message}); esas líneas caerán al respaldo OSRM entre paradas.`
  )
}

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = stopsByRoute[routeId]
  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    const match = matches[routeId]
    const relation = match ? relationsGeometry.get(match.id) : null

    path = null
    if (relation) {
      try {
        let stitched = await stitchRelationPath(relation)
        if (match.reversed) stitched = stitched.reverse()
        path = stitched
        console.log(`${routeId}: usando trazado real de OSM (relación ${match.id}, ${stitched.length} puntos)`)
      } catch (error) {
        console.warn(`${routeId}: fallo al procesar relación de OSM (${error.message}), usando respaldo OSRM entre paradas`)
      }
    } else {
      console.warn(`${routeId}: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`)
    }

    if (!path) {
      try {
        path = await fetchOsrmPath(stops.map((stop) => [stop.lat, stop.lng]))
      } catch (error) {
        console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
        path = straightPath
      } finally {
        await sleep(OSRM_DELAY_MS)
      }
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 1: Reemplazar el archivo completo con la lógica de combinación de relaciones**

Reemplazar todo el contenido de `scripts/seed-data/build-routes.mjs` por:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MACHALA_BBOX = '-3.35,-80.05,-3.20,-79.85'
const GAP_PATCH_THRESHOLD_DEG = 300 / 111000
const JUNCTION_MAX_DEG = 50 / 111000

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

async function fetchOsrmPath(coordsLatLng) {
  const coords = coordsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function overpassQuery(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'BusTrack-BuildScript/1.0',
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(`Overpass respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!data.elements) {
    throw new Error('respuesta de Overpass sin "elements"')
  }
  return data.elements
}

async function fetchBusRelationsIndex() {
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["name"~"Linea",i](${MACHALA_BBOX});out tags;`
  const elements = await overpassQuery(query)
  return elements
    .filter((el) => el.type === 'relation' && el.tags && el.tags.name)
    .map((el) => ({ id: el.id, name: el.tags.name }))
}

function lineLabelFromRouteId(routeId) {
  const suffix = routeId.replace(/^linea-/, '')
  return suffix.replace(/[a-z]+$/i, (letters) => letters.toUpperCase())
}

function findCandidateRelations(relationsIndex, routeId) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  return relationsIndex.filter((rel) => prefixPattern.test(rel.name))
}

function matchSingleRelationByName(relationsIndex, routeId, stops) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  const candidates = relationsIndex.filter((rel) => prefixPattern.test(rel.name))

  const firstStop = normalizeName(stops[0].name)
  const lastStop = normalizeName(stops[stops.length - 1].name)

  for (const candidate of candidates) {
    const rest = candidate.name.replace(prefixPattern, '')
    const parts = rest.split(' - ')
    if (parts.length !== 2) continue
    const [nameA, nameB] = parts.map(normalizeName)

    if (nameA === firstStop && nameB === lastStop) {
      return { id: candidate.id, reversed: false }
    }
    if (nameB === firstStop && nameA === lastStop) {
      return { id: candidate.id, reversed: true }
    }
  }
  return null
}

async function fetchRelationsGeometry(relationIds) {
  if (relationIds.length === 0) return new Map()
  const query = `[out:json][timeout:60];relation(id:${relationIds.join(',')});out geom;`
  const elements = await overpassQuery(query)
  const map = new Map()
  for (const el of elements) {
    if (el.type === 'relation') map.set(el.id, el)
  }
  return map
}

async function bridgeGapIfNeeded(path, nextPoint) {
  const prevEnd = path[path.length - 1]
  const gap = dist(prevEnd, nextPoint)
  if (gap > GAP_PATCH_THRESHOLD_DEG) {
    try {
      const patch = await fetchOsrmPath([prevEnd, nextPoint])
      path.push(...patch.slice(1, -1))
      await sleep(OSRM_DELAY_MS)
    } catch (error) {
      console.warn(`  hueco de ~${Math.round(gap * 111000)}m sin poder rellenar (${error.message})`)
    }
  }
}

async function stitchRelationPath(relation) {
  const ways = relation.members.filter(
    (m) =>
      m.type === 'way' &&
      m.geometry &&
      m.geometry.length > 0 &&
      !['platform', 'stop', 'stop_entry_only', 'stop_exit_only'].includes(m.role)
  )
  if (ways.length === 0) {
    throw new Error('la relación no tiene segmentos de vía utilizables')
  }

  const path = ways[0].geometry.map((p) => [p.lat, p.lon])

  for (let i = 1; i < ways.length; i++) {
    const geom = ways[i].geometry
    const startPt = [geom[0].lat, geom[0].lon]
    const endPt = [geom[geom.length - 1].lat, geom[geom.length - 1].lon]
    const prevEnd = path[path.length - 1]
    const seg =
      dist(prevEnd, endPt) < dist(prevEnd, startPt)
        ? geom.map((p) => [p.lat, p.lon]).reverse()
        : geom.map((p) => [p.lat, p.lon])

    await bridgeGapIfNeeded(path, seg[0])
    path.push(...seg)
  }

  return path
}

async function combineTwoRelations(relA, relB) {
  const pathA = await stitchRelationPath(relA)
  const pathB = await stitchRelationPath(relB)

  const endsA = [pathA[0], pathA[pathA.length - 1]]
  const endsB = [pathB[0], pathB[pathB.length - 1]]

  let best = null
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const gap = dist(endsA[i], endsB[j])
      if (!best || gap < best.gap) best = { gap, i, j }
    }
  }

  if (best.gap > JUNCTION_MAX_DEG) {
    return null
  }

  const orientedA = best.i === 1 ? pathA : [...pathA].reverse()
  const orientedB = best.j === 0 ? pathB : [...pathB].reverse()

  const combined = [...orientedA]
  await bridgeGapIfNeeded(combined, orientedB[0])
  combined.push(...orientedB)
  return combined
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

let relationsIndex = []
try {
  relationsIndex = await fetchBusRelationsIndex()
  console.log(`Índice de relaciones de bus de OSM: ${relationsIndex.length} encontradas.`)
} catch (error) {
  console.warn(
    `No se pudo obtener el índice de relaciones de OSM (${error.message}); todas las líneas usarán el respaldo OSRM entre paradas.`
  )
}

const stopsByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  stopsByRoute[routeId] = route.stops.map((stopName, index) => {
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
}

const candidatesByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  if (Array.isArray(route.path)) continue
  if (onlyIds && !onlyIds.includes(routeId)) continue
  const candidates = findCandidateRelations(relationsIndex, routeId)
  if (candidates.length > 0) candidatesByRoute[routeId] = candidates
}

const relationIdsToFetch = [...new Set(Object.values(candidatesByRoute).flat().map((c) => c.id))]
let relationsGeometry = new Map()
if (relationIdsToFetch.length > 0) {
  await sleep(1000)
}
try {
  relationsGeometry = await fetchRelationsGeometry(relationIdsToFetch)
} catch (error) {
  console.warn(
    `No se pudo obtener la geometría de las relaciones de OSM (${error.message}); esas líneas caerán al respaldo OSRM entre paradas.`
  )
}

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = stopsByRoute[routeId]
  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    const candidates = candidatesByRoute[routeId] || []
    const geometries = candidates.map((c) => relationsGeometry.get(c.id)).filter(Boolean)

    path = null

    if (geometries.length >= 2) {
      try {
        const combined = await combineTwoRelations(geometries[0], geometries[1])
        if (combined) {
          path = combined
          console.log(
            `${routeId}: usando trazado real de OSM combinando 2 relaciones (${geometries[0].id}+${geometries[1].id}, ${combined.length} puntos)`
          )
        }
      } catch (error) {
        console.warn(`${routeId}: fallo al combinar relaciones de OSM (${error.message})`)
      }
    }

    if (!path && geometries.length >= 1) {
      const singleMatch = matchSingleRelationByName(relationsIndex, routeId, stops)
      const relation = singleMatch ? relationsGeometry.get(singleMatch.id) : null
      if (relation) {
        try {
          let stitched = await stitchRelationPath(relation)
          if (singleMatch.reversed) stitched = stitched.reverse()
          path = stitched
          console.log(`${routeId}: usando trazado real de OSM (relación ${singleMatch.id}, ${stitched.length} puntos)`)
        } catch (error) {
          console.warn(`${routeId}: fallo al procesar relación de OSM (${error.message})`)
        }
      }
    }

    if (!path) {
      console.warn(`${routeId}: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`)
      try {
        path = await fetchOsrmPath(stops.map((stop) => [stop.lat, stop.lng]))
      } catch (error) {
        console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
        path = straightPath
      } finally {
        await sleep(OSRM_DELAY_MS)
      }
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 2: Verificar que Línea 1 ahora combina las 2 relaciones**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output: una línea `linea-1: usando trazado real de OSM combinando 2 relaciones (16761813+16761814, N puntos)` donde N está en el orden de 700-800 (suma aproximada de los ~349 puntos de una relación más los ~418 de la otra, menos algún ajuste de empalme) — **no** debe imprimir `usando trazado real de OSM (relación ...)` (esa es la rama de una sola relación, no debe activarse si la combinación tuvo éxito).

Verificar:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
console.log('puntos linea-1:', routes['linea-1'].path.length);
"
```

Expected: significativamente más de 349 (el resultado de Task 3/4 con una sola relación) — confirma que ahora se está usando el recorrido completo, no solo la mitad.

- [ ] **Step 3: Verificar que Línea 6 también combina**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-6
```

Expected: `linea-6: usando trazado real de OSM combinando 2 relaciones (16761916+16761917, N puntos)`, con N mayor a los 308 puntos que daba antes con una sola relación.

- [ ] **Step 4: Verificar que `linea-10` sigue funcionando igual (caso de respaldo, sin relaciones que combinen)**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-10
```

Expected: debe seguir cayendo al respaldo OSRM entre paradas (mismo comportamiento que Task 3/4) — revisar que imprime `sin trazado de OSM disponible, usando respaldo OSRM entre paradas` para `linea-10`, sin errores.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-data/build-routes.mjs
git commit -m "feat: combinar las dos relaciones de OSM (ida/vuelta) cuando encajen en un punto de unión"
```

---

### Task 6: Piloto v3 con Línea 1 y Línea 6, y rollout a las 20 líneas

> **Superseded parcialmente (2026-07-09, mismo día):** el piloto v3 (Steps 1-3) mostró que Línea 6 combina correctamente, pero Línea 1 tiene un desvío por Av. Ferroviaria en el tramo de regreso que no corresponde al PDF. Causa encontrada: los segmentos de vía dentro de la relación de OSM de regreso no están en orden de recorrido; el algoritmo de encadenado secuencial (`stitchRelationPath`) asumía que sí lo estaban. Ver spec, sección "Revisión post-piloto v3: desvío por Av. Ferroviaria en el regreso de Línea 1". Steps 4-8 no se ejecutan — ver **Task 7** (reemplazar el encadenado secuencial por fusión de fragmentos por vecino más cercano) y **Task 8** (piloto v4), que los reemplazan.

**Files:**
- No se modifica código en este task — es ejecución del script de Task 5 y verificación visual.

**Interfaces:**
- Consumes: `scripts/seed-data/build-routes.mjs` (Task 5), `npm run seed:routes` (ya existente).
- Produces: `scripts/seed-data/routes.json` regenerado (no se commitea), datos en Firebase actualizados.

- [ ] **Step 1: Generar el piloto v3 para Línea 1 y Línea 6**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6
```

Expected: ambas deben loguear `usando trazado real de OSM combinando 2 relaciones (...)`.

- [ ] **Step 2: Subir el piloto v3 a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 3: Verificar visualmente en el navegador**

```bash
npm run dev
```

En el navegador, entrar como Pasajero:
1. Elegir "Línea 1": el trazado debe mostrar el circuito completo (ida y vuelta cerrando el recorrido, no solo una mitad) — comparar contra `docs/rutas-gad-machala/Linea-1.pdf`.
2. Elegir "Línea 6": mismo chequeo contra `docs/rutas-gad-machala/Linea-6.pdf`.

- [ ] **Step 4: Decidir rollout completo**

Si Línea 1 y Línea 6 se ven completas y correctas: continuar al Step 5.

Si alguna todavía no convence: el usuario indicó que en ese caso prefiere pasar a trazar manualmente esa línea desde el PDF (un `path` manual en `routes-raw.json`, mismo mecanismo del Step 6 de Task 1) en vez de seguir iterando con métodos automáticos — coordinar con el usuario cuál línea y cómo antes de escribir esa excepción.

- [ ] **Step 5: Generar las 20 líneas completas**

```bash
node scripts/seed-data/build-routes.mjs
```

- [ ] **Step 6: Subir el resultado completo a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 7: Verificación final en el navegador**

Revisar con el usuario varias líneas más (combinadas y de respaldo) contra sus PDFs en `docs/rutas-gad-machala/`.

- [ ] **Step 8: Commit (solo si Step 4 requirió un `path` manual)**

```bash
git add scripts/seed-data/routes-raw.json
git commit -m "fix: path manual para linea-N (ni la combinación de relaciones ni OSRM dieron un resultado aceptable)"
```

---

### Task 7: Reemplazar el encadenado secuencial de `stitchRelationPath` por fusión de fragmentos por vecino más cercano

**Contexto:** el piloto v3 de Task 6 mostró un desvío por Av. Ferroviaria en el regreso de Línea 1. Causa raíz confirmada con datos reales de Overpass: dentro de la relación de OSM de regreso (16761814), los 69 segmentos de vía NO están en orden de recorrido — hay un grupo de ~27 segmentos insertado fuera de secuencia, generando un salto de 5.6km que el algoritmo de gap-patch (Task 3) rellenaba con OSRM. Al no tener ningún punto intermedio que seguir dentro de ese salto, OSRM calculaba su propia ruta "más corta" entre los dos extremos, que resultó ser el desvío detectado por el usuario. El defecto es del algoritmo (asumir que el orden de miembros de una relación de OSM refleja el orden de recorrido), no de los datos. Ver spec, sección "Revisión post-piloto v3".

Se validó con datos reales de Overpass (misma relación 16761814) un algoritmo de **fusión de fragmentos por vecino más cercano** (greedy fragment-merging): cada segmento de vía es un fragmento independiente; en cada paso se buscan los dos fragmentos (y su orientación) cuyos extremos queden más cerca entre sí, y se fusionan en uno; se repite hasta quedar con un solo fragmento — sin asumir ningún orden previo. Resultado validado: el hueco máximo bajó de 5657m a 19m para esa relación; el resultado combinado de las dos relaciones de Línea 1 con este algoritmo forma un loop cerrado de 767 puntos (empieza y termina en el mismo punto), con un único hueco residual de 445m.

**Files:**
- Modify: `scripts/seed-data/build-routes.mjs` (reemplaza todo el archivo)

**Interfaces:**
- Consumes: mismo `routes-raw.json`/`pois.json`/Overpass/OSRM que Task 5.
- Produces: mismo shape de `routes.json`. **Cambio interno únicamente en `stitchRelationPath`** — su firma (`async function stitchRelationPath(relation)`, recibe una relación de Overpass con `.members`, devuelve `Array<[number, number]>`) no cambia, así que `combineTwoRelations` y el resto del pipeline (prioridad de tiers, `matchSingleRelationByName`, fallback a OSRM, fallback a línea recta) siguen exactamente igual — no se modifican.

Este es el contenido actual completo de `scripts/seed-data/build-routes.mjs` (después de Task 5), como referencia:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MACHALA_BBOX = '-3.35,-80.05,-3.20,-79.85'
const GAP_PATCH_THRESHOLD_DEG = 300 / 111000
const JUNCTION_MAX_DEG = 50 / 111000

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

async function fetchOsrmPath(coordsLatLng) {
  const coords = coordsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function overpassQuery(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'BusTrack-BuildScript/1.0',
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(`Overpass respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!data.elements) {
    throw new Error('respuesta de Overpass sin "elements"')
  }
  return data.elements
}

async function fetchBusRelationsIndex() {
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["name"~"Linea",i](${MACHALA_BBOX});out tags;`
  const elements = await overpassQuery(query)
  return elements
    .filter((el) => el.type === 'relation' && el.tags && el.tags.name)
    .map((el) => ({ id: el.id, name: el.tags.name }))
}

function lineLabelFromRouteId(routeId) {
  const suffix = routeId.replace(/^linea-/, '')
  return suffix.replace(/[a-z]+$/i, (letters) => letters.toUpperCase())
}

function findCandidateRelations(relationsIndex, routeId) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  return relationsIndex.filter((rel) => prefixPattern.test(rel.name))
}

function matchSingleRelationByName(relationsIndex, routeId, stops) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  const candidates = relationsIndex.filter((rel) => prefixPattern.test(rel.name))

  const firstStop = normalizeName(stops[0].name)
  const lastStop = normalizeName(stops[stops.length - 1].name)

  for (const candidate of candidates) {
    const rest = candidate.name.replace(prefixPattern, '')
    const parts = rest.split(' - ')
    if (parts.length !== 2) continue
    const [nameA, nameB] = parts.map(normalizeName)

    if (nameA === firstStop && nameB === lastStop) {
      return { id: candidate.id, reversed: false }
    }
    if (nameB === firstStop && nameA === lastStop) {
      return { id: candidate.id, reversed: true }
    }
  }
  return null
}

async function fetchRelationsGeometry(relationIds) {
  if (relationIds.length === 0) return new Map()
  const query = `[out:json][timeout:60];relation(id:${relationIds.join(',')});out geom;`
  const elements = await overpassQuery(query)
  const map = new Map()
  for (const el of elements) {
    if (el.type === 'relation') map.set(el.id, el)
  }
  return map
}

async function bridgeGapIfNeeded(path, nextPoint) {
  const prevEnd = path[path.length - 1]
  const gap = dist(prevEnd, nextPoint)
  if (gap > GAP_PATCH_THRESHOLD_DEG) {
    try {
      const patch = await fetchOsrmPath([prevEnd, nextPoint])
      path.push(...patch.slice(1, -1))
      await sleep(OSRM_DELAY_MS)
    } catch (error) {
      console.warn(`  hueco de ~${Math.round(gap * 111000)}m sin poder rellenar (${error.message})`)
    }
  }
}

async function stitchRelationPath(relation) {
  const ways = relation.members.filter(
    (m) =>
      m.type === 'way' &&
      m.geometry &&
      m.geometry.length > 0 &&
      !['platform', 'stop', 'stop_entry_only', 'stop_exit_only'].includes(m.role)
  )
  if (ways.length === 0) {
    throw new Error('la relación no tiene segmentos de vía utilizables')
  }

  const path = ways[0].geometry.map((p) => [p.lat, p.lon])

  for (let i = 1; i < ways.length; i++) {
    const geom = ways[i].geometry
    const startPt = [geom[0].lat, geom[0].lon]
    const endPt = [geom[geom.length - 1].lat, geom[geom.length - 1].lon]
    const prevEnd = path[path.length - 1]
    const seg =
      dist(prevEnd, endPt) < dist(prevEnd, startPt)
        ? geom.map((p) => [p.lat, p.lon]).reverse()
        : geom.map((p) => [p.lat, p.lon])

    await bridgeGapIfNeeded(path, seg[0])
    path.push(...seg)
  }

  return path
}

async function combineTwoRelations(relA, relB) {
  const pathA = await stitchRelationPath(relA)
  const pathB = await stitchRelationPath(relB)

  const endsA = [pathA[0], pathA[pathA.length - 1]]
  const endsB = [pathB[0], pathB[pathB.length - 1]]

  let best = null
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const gap = dist(endsA[i], endsB[j])
      if (!best || gap < best.gap) best = { gap, i, j }
    }
  }

  if (best.gap > JUNCTION_MAX_DEG) {
    return null
  }

  const orientedA = best.i === 1 ? pathA : [...pathA].reverse()
  const orientedB = best.j === 0 ? pathB : [...pathB].reverse()

  const combined = [...orientedA]
  await bridgeGapIfNeeded(combined, orientedB[0])
  combined.push(...orientedB)
  return combined
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

let relationsIndex = []
try {
  relationsIndex = await fetchBusRelationsIndex()
  console.log(`Índice de relaciones de bus de OSM: ${relationsIndex.length} encontradas.`)
} catch (error) {
  console.warn(
    `No se pudo obtener el índice de relaciones de OSM (${error.message}); todas las líneas usarán el respaldo OSRM entre paradas.`
  )
}

const stopsByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  stopsByRoute[routeId] = route.stops.map((stopName, index) => {
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
}

const candidatesByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  if (Array.isArray(route.path)) continue
  if (onlyIds && !onlyIds.includes(routeId)) continue
  const candidates = findCandidateRelations(relationsIndex, routeId)
  if (candidates.length > 0) candidatesByRoute[routeId] = candidates
}

const relationIdsToFetch = [...new Set(Object.values(candidatesByRoute).flat().map((c) => c.id))]
let relationsGeometry = new Map()
if (relationIdsToFetch.length > 0) {
  await sleep(1000)
}
try {
  relationsGeometry = await fetchRelationsGeometry(relationIdsToFetch)
} catch (error) {
  console.warn(
    `No se pudo obtener la geometría de las relaciones de OSM (${error.message}); esas líneas caerán al respaldo OSRM entre paradas.`
  )
}

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = stopsByRoute[routeId]
  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    const candidates = candidatesByRoute[routeId] || []
    const geometries = candidates.map((c) => relationsGeometry.get(c.id)).filter(Boolean)

    path = null

    if (geometries.length >= 2) {
      try {
        const combined = await combineTwoRelations(geometries[0], geometries[1])
        if (combined) {
          path = combined
          console.log(
            `${routeId}: usando trazado real de OSM combinando 2 relaciones (${geometries[0].id}+${geometries[1].id}, ${combined.length} puntos)`
          )
        }
      } catch (error) {
        console.warn(`${routeId}: fallo al combinar relaciones de OSM (${error.message})`)
      }
    }

    if (!path && geometries.length >= 1) {
      const singleMatch = matchSingleRelationByName(relationsIndex, routeId, stops)
      const relation = singleMatch ? relationsGeometry.get(singleMatch.id) : null
      if (relation) {
        try {
          let stitched = await stitchRelationPath(relation)
          if (singleMatch.reversed) stitched = stitched.reverse()
          path = stitched
          console.log(`${routeId}: usando trazado real de OSM (relación ${singleMatch.id}, ${stitched.length} puntos)`)
        } catch (error) {
          console.warn(`${routeId}: fallo al procesar relación de OSM (${error.message})`)
        }
      }
    }

    if (!path) {
      console.warn(`${routeId}: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`)
      try {
        path = await fetchOsrmPath(stops.map((stop) => [stop.lat, stop.lng]))
      } catch (error) {
        console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
        path = straightPath
      } finally {
        await sleep(OSRM_DELAY_MS)
      }
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 1: Reemplazar `stitchRelationPath` (y agregar sus dos funciones auxiliares) con fusión de fragmentos**

Reemplazar todo el contenido de `scripts/seed-data/build-routes.mjs` por (el único cambio real está en las funciones `greedyMergeFragments`, `patchResidualGaps` (nuevas) y `stitchRelationPath` (reescrita) — todo lo demás es idéntico a la versión de Task 5):

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_DELAY_MS = 300
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MACHALA_BBOX = '-3.35,-80.05,-3.20,-79.85'
const GAP_PATCH_THRESHOLD_DEG = 300 / 111000
const JUNCTION_MAX_DEG = 50 / 111000

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

async function fetchOsrmPath(coordsLatLng) {
  const coords = coordsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`OSRM respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 'Ok') {
    throw new Error(`OSRM code=${data.code}`)
  }
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function overpassQuery(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'BusTrack-BuildScript/1.0',
    },
    body: query,
  })
  if (!response.ok) {
    throw new Error(`Overpass respondió HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!data.elements) {
    throw new Error('respuesta de Overpass sin "elements"')
  }
  return data.elements
}

async function fetchBusRelationsIndex() {
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["name"~"Linea",i](${MACHALA_BBOX});out tags;`
  const elements = await overpassQuery(query)
  return elements
    .filter((el) => el.type === 'relation' && el.tags && el.tags.name)
    .map((el) => ({ id: el.id, name: el.tags.name }))
}

function lineLabelFromRouteId(routeId) {
  const suffix = routeId.replace(/^linea-/, '')
  return suffix.replace(/[a-z]+$/i, (letters) => letters.toUpperCase())
}

function findCandidateRelations(relationsIndex, routeId) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  return relationsIndex.filter((rel) => prefixPattern.test(rel.name))
}

function matchSingleRelationByName(relationsIndex, routeId, stops) {
  const lineLabel = lineLabelFromRouteId(routeId)
  const prefixPattern = new RegExp(`^linea\\s+${lineLabel}\\s`, 'i')
  const candidates = relationsIndex.filter((rel) => prefixPattern.test(rel.name))

  const firstStop = normalizeName(stops[0].name)
  const lastStop = normalizeName(stops[stops.length - 1].name)

  for (const candidate of candidates) {
    const rest = candidate.name.replace(prefixPattern, '')
    const parts = rest.split(' - ')
    if (parts.length !== 2) continue
    const [nameA, nameB] = parts.map(normalizeName)

    if (nameA === firstStop && nameB === lastStop) {
      return { id: candidate.id, reversed: false }
    }
    if (nameB === firstStop && nameA === lastStop) {
      return { id: candidate.id, reversed: true }
    }
  }
  return null
}

async function fetchRelationsGeometry(relationIds) {
  if (relationIds.length === 0) return new Map()
  const query = `[out:json][timeout:60];relation(id:${relationIds.join(',')});out geom;`
  const elements = await overpassQuery(query)
  const map = new Map()
  for (const el of elements) {
    if (el.type === 'relation') map.set(el.id, el)
  }
  return map
}

async function bridgeGapIfNeeded(path, nextPoint) {
  const prevEnd = path[path.length - 1]
  const gap = dist(prevEnd, nextPoint)
  if (gap > GAP_PATCH_THRESHOLD_DEG) {
    try {
      const patch = await fetchOsrmPath([prevEnd, nextPoint])
      path.push(...patch.slice(1, -1))
      await sleep(OSRM_DELAY_MS)
    } catch (error) {
      console.warn(`  hueco de ~${Math.round(gap * 111000)}m sin poder rellenar (${error.message})`)
    }
  }
}

function greedyMergeFragments(fragments) {
  let frags = fragments.map((fragment) => fragment.slice())

  while (frags.length > 1) {
    let best = null
    for (let i = 0; i < frags.length; i++) {
      for (let j = 0; j < frags.length; j++) {
        if (i === j) continue
        const a = frags[i]
        const b = frags[j]
        const options = [
          { gap: dist(a[a.length - 1], b[0]), mode: 'append' },
          { gap: dist(a[a.length - 1], b[b.length - 1]), mode: 'append-reversed' },
        ]
        for (const option of options) {
          if (!best || option.gap < best.gap) best = { ...option, i, j }
        }
      }
    }

    const a = frags[best.i]
    const b = frags[best.j]
    const merged = best.mode === 'append' ? [...a, ...b] : [...a, ...b.slice().reverse()]
    frags = frags.filter((_, k) => k !== best.i && k !== best.j)
    frags.push(merged)
  }

  return frags[0]
}

async function patchResidualGaps(path) {
  const result = [path[0]]
  for (let i = 1; i < path.length; i++) {
    await bridgeGapIfNeeded(result, path[i])
    result.push(path[i])
  }
  return result
}

async function stitchRelationPath(relation) {
  const ways = relation.members.filter(
    (m) =>
      m.type === 'way' &&
      m.geometry &&
      m.geometry.length > 0 &&
      !['platform', 'stop', 'stop_entry_only', 'stop_exit_only'].includes(m.role)
  )
  if (ways.length === 0) {
    throw new Error('la relación no tiene segmentos de vía utilizables')
  }

  const fragments = ways.map((way) => way.geometry.map((p) => [p.lat, p.lon]))
  const merged = greedyMergeFragments(fragments)
  return await patchResidualGaps(merged)
}

async function combineTwoRelations(relA, relB) {
  const pathA = await stitchRelationPath(relA)
  const pathB = await stitchRelationPath(relB)

  const endsA = [pathA[0], pathA[pathA.length - 1]]
  const endsB = [pathB[0], pathB[pathB.length - 1]]

  let best = null
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const gap = dist(endsA[i], endsB[j])
      if (!best || gap < best.gap) best = { gap, i, j }
    }
  }

  if (best.gap > JUNCTION_MAX_DEG) {
    return null
  }

  const orientedA = best.i === 1 ? pathA : [...pathA].reverse()
  const orientedB = best.j === 0 ? pathB : [...pathB].reverse()

  const combined = [...orientedA]
  await bridgeGapIfNeeded(combined, orientedB[0])
  combined.push(...orientedB)
  return combined
}

const rawRoutes = JSON.parse(readFileSync(join(__dirname, 'routes-raw.json'), 'utf-8'))
const pois = JSON.parse(readFileSync(join(__dirname, 'pois.json'), 'utf-8'))

let relationsIndex = []
try {
  relationsIndex = await fetchBusRelationsIndex()
  console.log(`Índice de relaciones de bus de OSM: ${relationsIndex.length} encontradas.`)
} catch (error) {
  console.warn(
    `No se pudo obtener el índice de relaciones de OSM (${error.message}); todas las líneas usarán el respaldo OSRM entre paradas.`
  )
}

const stopsByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  stopsByRoute[routeId] = route.stops.map((stopName, index) => {
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
}

const candidatesByRoute = {}
for (const [routeId, route] of Object.entries(rawRoutes)) {
  if (Array.isArray(route.path)) continue
  if (onlyIds && !onlyIds.includes(routeId)) continue
  const candidates = findCandidateRelations(relationsIndex, routeId)
  if (candidates.length > 0) candidatesByRoute[routeId] = candidates
}

const relationIdsToFetch = [...new Set(Object.values(candidatesByRoute).flat().map((c) => c.id))]
let relationsGeometry = new Map()
if (relationIdsToFetch.length > 0) {
  await sleep(1000)
}
try {
  relationsGeometry = await fetchRelationsGeometry(relationIdsToFetch)
} catch (error) {
  console.warn(
    `No se pudo obtener la geometría de las relaciones de OSM (${error.message}); esas líneas caerán al respaldo OSRM entre paradas.`
  )
}

const routes = {}

for (const [routeId, route] of Object.entries(rawRoutes)) {
  const stops = stopsByRoute[routeId]
  const straightPath = stops.map((stop) => [stop.lat, stop.lng])

  let path
  if (Array.isArray(route.path)) {
    console.log(`${routeId}: usando path manual de routes-raw.json`)
    path = route.path
  } else if (onlyIds && !onlyIds.includes(routeId)) {
    path = straightPath
  } else {
    const candidates = candidatesByRoute[routeId] || []
    const geometries = candidates.map((c) => relationsGeometry.get(c.id)).filter(Boolean)

    path = null

    if (geometries.length >= 2) {
      try {
        const combined = await combineTwoRelations(geometries[0], geometries[1])
        if (combined) {
          path = combined
          console.log(
            `${routeId}: usando trazado real de OSM combinando 2 relaciones (${geometries[0].id}+${geometries[1].id}, ${combined.length} puntos)`
          )
        }
      } catch (error) {
        console.warn(`${routeId}: fallo al combinar relaciones de OSM (${error.message})`)
      }
    }

    if (!path && geometries.length >= 1) {
      const singleMatch = matchSingleRelationByName(relationsIndex, routeId, stops)
      const relation = singleMatch ? relationsGeometry.get(singleMatch.id) : null
      if (relation) {
        try {
          let stitched = await stitchRelationPath(relation)
          if (singleMatch.reversed) stitched = stitched.reverse()
          path = stitched
          console.log(`${routeId}: usando trazado real de OSM (relación ${singleMatch.id}, ${stitched.length} puntos)`)
        } catch (error) {
          console.warn(`${routeId}: fallo al procesar relación de OSM (${error.message})`)
        }
      }
    }

    if (!path) {
      console.warn(`${routeId}: sin trazado de OSM disponible, usando respaldo OSRM entre paradas`)
      try {
        path = await fetchOsrmPath(stops.map((stop) => [stop.lat, stop.lng]))
      } catch (error) {
        console.warn(`${routeId}: fallo OSRM (${error.message}), usando línea recta`)
        path = straightPath
      } finally {
        await sleep(OSRM_DELAY_MS)
      }
    }
  }

  routes[routeId] = {
    name: route.name,
    color: route.color,
    stops,
    path,
  }
}

writeFileSync(join(__dirname, 'routes.json'), JSON.stringify(routes, null, 2))
console.log(`Generado routes.json con ${Object.keys(routes).length} líneas.`)
```

- [ ] **Step 2: Verificar Línea 1 con el nuevo algoritmo**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1
```

Expected output: `linea-1: usando trazado real de OSM combinando 2 relaciones (16761813+16761814, N puntos)`, sin ningún warning de "hueco sin poder rellenar" (o, si aparece alguno, debe ser de una magnitud pequeña — cientos de metros, no varios kilómetros).

Verificar:

```bash
node -e "
const routes = require('./scripts/seed-data/routes.json');
const p = routes['linea-1'].path;
function dist(a,b){const dx=a[0]-b[0],dy=a[1]-b[1];return Math.sqrt(dx*dx+dy*dy)*111000;}
console.log('puntos:', p.length);
console.log('inicio == fin (loop cerrado)?', dist(p[0], p[p.length-1]) < 50, '| distancia:', Math.round(dist(p[0], p[p.length-1])), 'm');
let maxGap=0;
for (let i=1;i<p.length;i++){ const d=dist(p[i-1],p[i]); if(d>maxGap) maxGap=d; }
console.log('hueco máximo interno:', Math.round(maxGap), 'm');
"
```

Expected: `puntos` en el orden de 750-800, `inicio == fin (loop cerrado)?` debe ser `true` (o muy cerca), y `hueco máximo interno` debe ser menor a 500m (no varios kilómetros como antes de este fix).

- [ ] **Step 3: Verificar que Línea 6 sigue funcionando igual o mejor**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-6
```

Expected: `linea-6: usando trazado real de OSM combinando 2 relaciones (16761916+16761917, N puntos)`, sin warnings de huecos grandes — el usuario ya confirmó que Línea 6 se veía bien con el algoritmo anterior, así que este cambio no debe empeorarla.

- [ ] **Step 4: Verificar que `linea-10` no se rompe**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-10
```

Expected: el script no debe fallar ni lanzar excepciones — revisar qué tier terminó usando (`combinando 2 relaciones`, relación única, o respaldo OSRM) e imprimirlo, sin necesidad de que coincida con un resultado anterior específico (este comportamiento puede variar según los datos de OSM, como ya se documentó en el reporte de Task 5).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-data/build-routes.mjs
git commit -m "fix: reemplazar encadenado secuencial por fusión de fragmentos por vecino más cercano en stitchRelationPath"
```

---

### Task 8: Piloto v4 con Línea 1 y Línea 6, y rollout a las 20 líneas

**Files:**
- No se modifica código en este task — es ejecución del script de Task 7 y verificación visual.

**Interfaces:**
- Consumes: `scripts/seed-data/build-routes.mjs` (Task 7), `npm run seed:routes` (ya existente).
- Produces: `scripts/seed-data/routes.json` regenerado (no se commitea), datos en Firebase actualizados.

- [ ] **Step 1: Generar el piloto v4 para Línea 1 y Línea 6**

```bash
node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6
```

- [ ] **Step 2: Subir el piloto v4 a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 3: Verificar visualmente en el navegador**

```bash
npm run dev
```

En el navegador, entrar como Pasajero:
1. Elegir "Línea 1": confirmar que el desvío por Av. Ferroviaria ya no aparece, y que en el redondel de Av. Dr. José Arízaga Vega / Av. Edgar Córdova Polo la línea sigue por Av. 25 de Junio, según `docs/rutas-gad-machala/Linea-1.pdf`.
2. Elegir "Línea 6": confirmar que sigue viéndose igual de bien que en el piloto v3.

- [ ] **Step 4: Decidir rollout completo**

Si Línea 1 y Línea 6 se ven completas y correctas: continuar al Step 5.

Si Línea 1 todavía no convence tras este fix: el usuario indicó que en ese caso prefiere pasar a trazar manualmente esa línea desde el PDF (un `path` manual en `routes-raw.json`, mismo mecanismo del Step 6 de Task 1) en vez de seguir iterando con métodos automáticos.

- [ ] **Step 5: Generar las 20 líneas completas**

```bash
node scripts/seed-data/build-routes.mjs
```

- [ ] **Step 6: Subir el resultado completo a Firebase**

```bash
npm run seed:routes
```

- [ ] **Step 7: Verificación final en el navegador**

Revisar con el usuario varias líneas más contra sus PDFs en `docs/rutas-gad-machala/`.

- [ ] **Step 8: Commit (solo si Step 4 requirió un `path` manual)**

```bash
git add scripts/seed-data/routes-raw.json
git commit -m "fix: path manual para linea-N (desvío persistente tras el fix de fusión de fragmentos)"
```
