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
