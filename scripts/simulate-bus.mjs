// Herramienta de prueba manual: publica un bus falso quieto, muy cerca de
// una parada, para poder probar el aviso de proximidad sin necesitar un
// conductor real transmitiendo. No es parte de ninguna feature — solo para
// verificación.
//
// Uso:
//   node scripts/simulate-bus.mjs start   -> publica el bus, actualiza cada 3s
//   node scripts/simulate-bus.mjs stop    -> lo marca inactivo y termina
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

const BUS_ID = 'test-bus-simulado'

// Línea 1, muy cerca de la parada "El Cambio" (punto del trazado real,
// ~58m de la parada), quieto — no avanza.
const ROUTE_ID = 'linea-1'
const LAT = -3.2879003
const LNG = -79.9118397

const command = process.argv[2]

if (command === 'stop') {
  await set(ref(db, `buses/${BUS_ID}/active`), false)
  console.log('Bus de prueba desactivado.')
  process.exit(0)
}

async function publish() {
  await set(ref(db, `buses/${BUS_ID}`), {
    busId: BUS_ID,
    driverId: 'test-driver',
    routeId: ROUTE_ID,
    empresa: 'PRUEBA',
    numero: '00',
    unitLabel: 'PRUEBA 00',
    destino: 'Simulación',
    lat: LAT,
    lng: LNG,
    speed: 0,
    heading: 0,
    updatedAt: Date.now(),
    active: true,
  })
  console.log(`Bus de prueba publicado en ${ROUTE_ID} cerca de "El Cambio" (${new Date().toLocaleTimeString()})`)
}

await publish()
console.log('Publicando cada 3s, quieto. Ctrl+C para detener (luego correr: node scripts/simulate-bus.mjs stop).')
setInterval(publish, 3000)
