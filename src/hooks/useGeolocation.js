import { useEffect, useRef, useState } from 'react'
import { registerPlugin } from '@capacitor/core'

// El plugin no tiene implementación web (solo Android/iOS nativo);
// registerPlugin() es la forma en que expone su API, tal como documenta su README.
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

export function useGeolocation(active) {
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const watchIdRef = useRef(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    async function startWatch() {
      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'BusTrack está compartiendo tu ubicación en segundo plano.',
            backgroundTitle: 'Viaje en curso',
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          },
          (location, err) => {
            if (cancelled) return
            if (err) {
              setError(err)
              return
            }
            if (location) {
              setPosition({
                lat: location.latitude,
                lng: location.longitude,
                speed: location.speed,
                heading: location.bearing,
              })
            }
          },
        )
        if (cancelled) {
          BackgroundGeolocation.removeWatcher({ id })
        } else {
          watchIdRef.current = id
        }
      } catch (err) {
        // No implementado en web: el plugin solo corre en Android/iOS nativo.
        if (!cancelled) setError(err)
      }
    }

    startWatch()

    return () => {
      cancelled = true
      if (watchIdRef.current) {
        BackgroundGeolocation.removeWatcher({ id: watchIdRef.current })
        watchIdRef.current = null
      }
    }
  }, [active])

  return { position, error }
}
