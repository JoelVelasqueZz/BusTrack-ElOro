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
          { gap: dist(a[0], b[0]), mode: 'prepend-a-reversed' },
        ]
        for (const option of options) {
          if (!best || option.gap < best.gap) best = { ...option, i, j }
        }
      }
    }

    const a = frags[best.i]
    const b = frags[best.j]
    const merged =
      best.mode === 'append'
        ? [...a, ...b]
        : best.mode === 'append-reversed'
          ? [...a, ...b.slice().reverse()]
          : [...a.slice().reverse(), ...b]
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
