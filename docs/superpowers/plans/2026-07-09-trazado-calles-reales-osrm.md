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
