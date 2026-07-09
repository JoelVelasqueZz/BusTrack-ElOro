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
