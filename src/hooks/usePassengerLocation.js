import { useEffect, useState } from 'react'
import { Geolocation } from '@capacitor/geolocation'

// Ubicación del pasajero solo para pintar su punto en el mapa mientras tiene
// la vista abierta: sin background, sin publicar a Firebase.
export function usePassengerLocation() {
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let watchId = null
    let cancelled = false

    async function start() {
      try {
        // requestPermissions() no está implementado en web (Capacitor lanza
        // "unimplemented" ahí); watchPosition ya dispara el prompt nativo del
        // navegador, así que no bloqueamos el flujo si esto falla.
        await Geolocation.requestPermissions().catch(() => {})
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (data, err) => {
            if (cancelled) return
            if (err) {
              setError(err)
              return
            }
            if (data) {
              setPosition({ lat: data.coords.latitude, lng: data.coords.longitude })
            }
          },
        )
      } catch (err) {
        if (!cancelled) setError(err)
      }
    }

    start()

    return () => {
      cancelled = true
      if (watchId != null) Geolocation.clearWatch({ id: watchId })
    }
  }, [])

  return { position, error }
}
