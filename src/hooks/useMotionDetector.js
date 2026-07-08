import { useEffect, useRef } from 'react'
import { Motion } from '@capacitor/motion'

const GRAVITY_MS2 = 9.81
// Desviación sobre la gravedad que se considera un bache; calibrar en dispositivo real.
const THRESHOLD_MS2 = 4
const DEBOUNCE_MS = 1000

export function useMotionDetector(active, onPothole) {
  const lastTriggerRef = useRef(0)
  const handleRef = useRef(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    async function start() {
      const handle = await Motion.addListener('accel', (event) => {
        const { x, y, z } = event.accelerationIncludingGravity
        if (x == null || y == null || z == null) return

        const magnitude = Math.sqrt(x * x + y * y + z * z)
        const delta = Math.abs(magnitude - GRAVITY_MS2)
        const now = Date.now()

        if (delta > THRESHOLD_MS2 && now - lastTriggerRef.current > DEBOUNCE_MS) {
          lastTriggerRef.current = now
          onPothole(delta)
        }
      })

      if (cancelled) {
        handle.remove()
      } else {
        handleRef.current = handle
      }
    }

    start()

    return () => {
      cancelled = true
      handleRef.current?.remove()
      handleRef.current = null
    }
  }, [active, onPothole])
}
