import { useEffect, useRef, useCallback } from 'react'

export function useWakeLock(active) {
  const wakeLockRef = useRef(null)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  const requestWakeLock = useCallback(async () => {
    if (!supported) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch (err) {
      console.warn('No se pudo activar Wake Lock:', err)
    }
  }, [supported])

  useEffect(() => {
    if (!active) return

    requestWakeLock()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [active, requestWakeLock])

  return { supported, requestWakeLock }
}
