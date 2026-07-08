import { useMemo, useRef } from 'react'
import { computeEta, haversine } from '../utils/geo.js'

const EMPTY_ETA = { etaMinutes: null, distanceMeters: null, within2min: false, nearestBus: null }

export function useEta(buses, stop, path) {
  const previousPositionsRef = useRef(new Map())

  return useMemo(() => {
    if (!stop || buses.length === 0) {
      return EMPTY_ETA
    }

    let best = null

    for (const bus of buses) {
      if (bus.lat == null || bus.lng == null) continue

      // La velocidad de Geolocation puede llegar null; si falta, se estima
      // por diferencia de posiciones entre actualizaciones consecutivas.
      let speedKmh = bus.speed != null ? bus.speed * 3.6 : null

      const previous = previousPositionsRef.current.get(bus.busId)
      if (speedKmh == null && previous && bus.updatedAt > previous.updatedAt) {
        const distanceMeters = haversine([previous.lat, previous.lng], [bus.lat, bus.lng])
        const seconds = (bus.updatedAt - previous.updatedAt) / 1000
        if (seconds > 0) {
          speedKmh = (distanceMeters / seconds) * 3.6
        }
      }

      previousPositionsRef.current.set(bus.busId, {
        lat: bus.lat,
        lng: bus.lng,
        updatedAt: bus.updatedAt,
      })

      const result = computeEta({
        busPosition: [bus.lat, bus.lng],
        busSpeedKmh: speedKmh,
        stopPosition: [stop.lat, stop.lng],
        path,
      })

      if (!best || result.etaMinutes < best.etaMinutes) {
        best = { ...result, nearestBus: bus }
      }
    }

    return best ?? EMPTY_ETA
  }, [buses, stop, path])
}
