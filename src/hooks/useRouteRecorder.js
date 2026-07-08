import { useEffect, useRef, useState } from 'react'

export function useRouteRecorder(active, position) {
  const [pointCount, setPointCount] = useState(0)
  const pointsRef = useRef([])

  useEffect(() => {
    if (!active) {
      pointsRef.current = []
      setPointCount(0)
    }
  }, [active])

  useEffect(() => {
    if (!active || !position) return
    pointsRef.current.push([position.lat, position.lng])
    setPointCount(pointsRef.current.length)
  }, [active, position])

  return { getPoints: () => pointsRef.current, pointCount }
}
