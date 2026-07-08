import { ref, set, remove, push } from 'firebase/database'
import { CapacitorHttp } from '@capacitor/core'
import { db } from '../firebase.js'

const PUBLISH_INTERVAL_MS = 3000
const MAX_TRACK_POINTS = 100
const DATABASE_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL

let intervalId = null
let latestBusInfo = null
let trackKeys = []

function addTrackPoint(busId, lat, lng) {
  const pointsRef = ref(db, `tracks/${busId}/points`)
  const newRef = push(pointsRef, { lat, lng, timestamp: Date.now() })
  newRef.catch(() => {})
  trackKeys.push(newRef.key)

  if (trackKeys.length > MAX_TRACK_POINTS) {
    const oldestKey = trackKeys.shift()
    remove(ref(db, `tracks/${busId}/points/${oldestKey}`)).catch(() => {})
  }
}

function publishBusPosition(busId, data) {
  // CapacitorHttp corre en el proceso nativo (no en el WebView), evitando el
  // throttling de red que Android aplica al WebView tras ~5 min en segundo plano.
  CapacitorHttp.patch({
    url: `${DATABASE_URL}/buses/${busId}.json`,
    headers: { 'Content-Type': 'application/json' },
    data,
  }).catch(() => {})
}

function publish() {
  if (!latestBusInfo) return
  const { busId, driverId, routeId, empresa, numero, destino, lat, lng, speed, heading } = latestBusInfo
  if (lat == null || lng == null) return

  publishBusPosition(busId, {
    busId,
    driverId,
    routeId,
    empresa,
    numero,
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

export function startPublishing(busInfo) {
  latestBusInfo = busInfo
  trackKeys = []
  if (intervalId) return
  intervalId = setInterval(publish, PUBLISH_INTERVAL_MS)
}

export function updateBusInfo(partialInfo) {
  if (!latestBusInfo) return
  latestBusInfo = { ...latestBusInfo, ...partialInfo }
}

export function stopPublishing() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (latestBusInfo?.busId) {
    set(ref(db, `buses/${latestBusInfo.busId}/active`), false)
    remove(ref(db, `tracks/${latestBusInfo.busId}`)).catch(() => {})
  }
  latestBusInfo = null
  trackKeys = []
}
