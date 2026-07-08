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
