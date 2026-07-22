// Herramienta de prueba manual: simula uno o varios buses recorriendo
// tramos reales del trazado de una ruta, con rumbo (heading) calculado
// paso a paso — sirve para grabar el demo en video sin depender de un
// recorrido real, y de paso ejercita el fix de ETA basado en heading.
//
// Uso:
//   node scripts/simulate-bus.mjs start                  -> corre todos los buses de BUSES en paralelo
//   node scripts/simulate-bus.mjs demo [min] [km/h]       -> 3 buses circulando en cada una de las 20
//                                                  rutas, con el nombre real de su línea y numeración
//                                                  01/02/03 (efecto visual Gran Final, default 5 min, 30 km/h)
//   node scripts/simulate-bus.mjs stop         -> marca inactivos los buses de BUSES y los de demo
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

// --- Config de los buses simulados (ajustar antes de grabar) ---
// modo 'to-stop': camina hacia una parada y se queda ahí (para probar ETA/aviso).
// modo 'from-index': camina hacia adelante desde un punto del trazado, sin
//   parada objetivo — solo para que se vea otro bus circulando en el mapa.
// En la app, seleccionar la misma ruta y (si aplica) la misma parada del bus
// 'to-stop' para que el ETA/aviso en pantalla corresponda a este recorrido.
const BUSES = [
  {
    id: 'test-bus-simulado',
    routeId: 'linea-1',
    mode: 'to-stop',
    stopId: 'linea-1-el-cambio', // "El Cambio"
    approachMeters: 900, // ETA inicial ~2.7min (> umbral de 2min)
  },
  {
    id: 'test-bus-simulado-2',
    routeId: 'linea-1',
    mode: 'from-index',
    startIndex: 650, // lejos de "El Cambio" (~6-9km por trazado), no interfiere con el ETA
    travelMeters: 900,
  },
]

const DESIRED_STEPS = 40 // actualizaciones publicadas durante el tramo
const STEP_INTERVAL_MS = 1500 // tiempo real entre cada actualización (~60s de recorrido)
const HOLD_STEPS_AT_STOP = 6 // publicaciones extra quieto al final, al llegar
const SPEED_KMH = 20

const routes = JSON.parse(readFileSync(join(__dirname, 'seed-data', 'routes.json'), 'utf-8'))

const DEMO_BUSES_PER_ROUTE = 3

const command = process.argv[2]

if (command === 'stop') {
  const demoIds = Object.keys(routes).flatMap((routeId) =>
    Array.from({ length: DEMO_BUSES_PER_ROUTE }, (_, n) => `demo-${routeId}-${n + 1}`),
  )
  const allIds = [...BUSES.map((bus) => bus.id), ...demoIds]
  await Promise.all(allIds.map((id) => set(ref(db, `buses/${id}/active`), false)))
  console.log(`Buses de prueba y demo desactivados (${allIds.length} en total).`)
  process.exit(0)
}

function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingBetween([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function lerp([lat1, lng1], [lat2, lng2], t) {
  return [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function interpolateSegment(rawSegment, desiredSteps) {
  let segmentDistance = 0
  for (let i = 0; i < rawSegment.length - 1; i++) {
    segmentDistance += haversine(rawSegment[i], rawSegment[i + 1])
  }
  const stepDistance = segmentDistance / desiredSteps

  const points = [rawSegment[0]]
  for (let i = 0; i < rawSegment.length - 1; i++) {
    const segLen = haversine(rawSegment[i], rawSegment[i + 1])
    const stepsInSeg = Math.max(1, Math.round(segLen / stepDistance))
    for (let s = 1; s <= stepsInSeg; s++) {
      points.push(lerp(rawSegment[i], rawSegment[i + 1], s / stepsInSeg))
    }
  }
  return { points, segmentDistance }
}

function buildToStopWalk(bus) {
  const route = routes[bus.routeId]
  const stop = route.stops.find((s) => s.id === bus.stopId)
  if (!stop) {
    throw new Error(`Parada ${bus.stopId} no encontrada en ${bus.routeId}`)
  }

  let nearestIdx = 0
  let nearestDist = Infinity
  route.path.forEach((p, i) => {
    const d = haversine([stop.lat, stop.lng], p)
    if (d < nearestDist) {
      nearestDist = d
      nearestIdx = i
    }
  })

  let acc = 0
  let startIdx = nearestIdx
  for (let i = nearestIdx; i > 0; i--) {
    acc += haversine(route.path[i], route.path[i - 1])
    startIdx = i - 1
    if (acc >= bus.approachMeters) break
  }

  const rawSegment = route.path.slice(startIdx, nearestIdx + 2)
  const { points, segmentDistance } = interpolateSegment(rawSegment, DESIRED_STEPS)
  return { points, label: `${route.name} -> "${stop.name}"`, segmentDistance }
}

function buildFromIndexWalk(bus) {
  const route = routes[bus.routeId]
  const path = route.path
  let acc = 0
  let endIdx = bus.startIndex
  for (let i = bus.startIndex; i < path.length - 1; i++) {
    acc += haversine(path[i], path[i + 1])
    endIdx = i + 1
    if (acc >= bus.travelMeters) break
  }

  const rawSegment = path.slice(bus.startIndex, endIdx + 1)
  const { points, segmentDistance } = interpolateSegment(rawSegment, DESIRED_STEPS)
  return { points, label: `${route.name} (circulando, sin parada objetivo)`, segmentDistance }
}

async function publishAt(busId, routeId, point, heading, opts = {}) {
  const { empresa = 'PRUEBA', numero = '00', unitLabel = 'PRUEBA 00', speedKmh = SPEED_KMH } = opts
  await set(ref(db, `buses/${busId}`), {
    busId,
    driverId: `test-driver-${busId}`,
    routeId,
    empresa,
    numero,
    unitLabel,
    lat: point[0],
    lng: point[1],
    speed: speedKmh / 3.6,
    heading,
    updatedAt: Date.now(),
    active: true,
  })
}

async function runBus(bus) {
  const { points, label, segmentDistance } = bus.mode === 'to-stop' ? buildToStopWalk(bus) : buildFromIndexWalk(bus)

  console.log(
    `[${bus.id}] ${label} (${points.length} pasos, ~${Math.round(segmentDistance)}m, ~${Math.round((points.length * STEP_INTERVAL_MS) / 1000)}s)`,
  )

  for (let i = 0; i < points.length; i++) {
    const next = points[i + 1] ?? points[i]
    const heading = bearingBetween(points[i], next)
    await publishAt(bus.id, bus.routeId, points[i], heading)
    await sleep(STEP_INTERVAL_MS)
  }

  const lastHeading = bearingBetween(points[points.length - 2] ?? points[0], points[points.length - 1])
  for (let i = 0; i < HOLD_STEPS_AT_STOP; i++) {
    await publishAt(bus.id, bus.routeId, points[points.length - 1], lastHeading)
    await sleep(STEP_INTERVAL_MS)
  }

  console.log(`[${bus.id}] recorrido terminado.`)
}

// --- Modo demo: 3 buses por ruta circulando en loop, para la Gran Final ---
const DEMO_DEFAULT_SPEED_KMH = 30 // más realista que el bus de prueba (20 km/h), se nota el movimiento en el mapa
const DEMO_STEP_INTERVAL_MS = 1500
const DEMO_LOOP_GAP_METERS = 200 // inicio/fin del trazado a menos de esto -> se trata como loop cerrado

function buildDemoRoute(routeId, speedKmh) {
  const route = routes[routeId]
  const totalMeters = route.path.reduce(
    (acc, p, i) => (i === 0 ? 0 : acc + haversine(route.path[i - 1], p)),
    0,
  )
  const metersPerStep = (speedKmh / 3.6) * (DEMO_STEP_INTERVAL_MS / 1000)
  const desiredSteps = Math.max(1, Math.round(totalMeters / metersPerStep))
  const { points } = interpolateSegment(route.path, desiredSteps)
  const isLoop = haversine(route.path[0], route.path[route.path.length - 1]) < DEMO_LOOP_GAP_METERS
  return { points, isLoop }
}

async function runDemoBus(id, routeId, points, isLoop, startIdx, totalSteps, opts) {
  let idx = startIdx
  let dir = 1
  for (let step = 0; step < totalSteps; step++) {
    const nextIdx = isLoop
      ? (idx + 1) % points.length
      : Math.min(points.length - 1, Math.max(0, idx + dir))
    const heading = bearingBetween(points[idx], points[nextIdx])
    await publishAt(id, routeId, points[idx], heading, opts)
    await sleep(DEMO_STEP_INTERVAL_MS)
    idx = nextIdx
    if (!isLoop && (idx === 0 || idx === points.length - 1)) dir *= -1
  }
}

async function runDemo(durationMinutes, speedKmh) {
  const totalSteps = Math.max(1, Math.round((durationMinutes * 60000) / DEMO_STEP_INTERVAL_MS))
  const routeIds = Object.keys(routes)
  console.log(
    `Demo: ${routeIds.length} rutas x ${DEMO_BUSES_PER_ROUTE} buses = ${routeIds.length * DEMO_BUSES_PER_ROUTE} buses, ~${durationMinutes} min, ${speedKmh} km/h.`,
  )

  const jobs = routeIds.flatMap((routeId) => {
    const { points, isLoop } = buildDemoRoute(routeId, speedKmh)
    const empresa = routes[routeId].name
    return Array.from({ length: DEMO_BUSES_PER_ROUTE }, (_, n) => {
      const startIdx = Math.floor((n / DEMO_BUSES_PER_ROUTE) * points.length)
      const id = `demo-${routeId}-${n + 1}`
      const numero = String(n + 1).padStart(2, '0')
      return runDemoBus(id, routeId, points, isLoop, startIdx, totalSteps, {
        empresa,
        numero,
        unitLabel: numero,
        speedKmh,
      })
    })
  })

  await Promise.all(jobs)
  console.log('Demo terminada. Los buses quedan quietos en su ultima posicion hasta correr "stop".')
}

if (command === 'demo') {
  const minutesArg = Number(process.argv[3])
  const speedArg = Number(process.argv[4])
  const durationMinutes = Number.isFinite(minutesArg) && minutesArg > 0 ? minutesArg : 5
  const speedKmh = Number.isFinite(speedArg) && speedArg > 0 ? speedArg : DEMO_DEFAULT_SPEED_KMH
  await runDemo(durationMinutes, speedKmh)
  process.exit(0)
}

await Promise.all(BUSES.map(runBus))
console.log('Todos los recorridos terminados. Ctrl+C para salir (luego: node scripts/simulate-bus.mjs stop).')
