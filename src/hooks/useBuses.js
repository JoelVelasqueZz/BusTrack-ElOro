import { useEffect, useState } from 'react'
import { subscribeBuses } from '../services/busService.js'

// Se publica cada 3 s (locationService.js); 4 ciclos perdidos = señal caída,
// no solo jitter de red normal.
const STALE_AFTER_MS = 12000
const TICK_MS = 2000

export function useBuses() {
  const [buses, setBuses] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsubscribe = subscribeBuses(setBuses)
    return unsubscribe
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  return buses.map((bus) => ({
    ...bus,
    isStale: bus.updatedAt != null && now - bus.updatedAt > STALE_AFTER_MS,
    lastUpdateMs: bus.updatedAt != null ? now - bus.updatedAt : null,
  }))
}
