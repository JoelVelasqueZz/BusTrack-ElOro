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
