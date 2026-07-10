import { useEffect, useState } from 'react'
import { subscribeRoutes } from '../services/routeService.js'

function parseRouteId(id) {
  const match = id.match(/^linea-(\d+)(.*)$/)
  if (!match) return [Number.POSITIVE_INFINITY, id]
  return [Number(match[1]), match[2]]
}

function compareRouteIds(a, b) {
  const [numA, suffixA] = parseRouteId(a.id)
  const [numB, suffixB] = parseRouteId(b.id)
  if (numA !== numB) return numA - numB
  return suffixA.localeCompare(suffixB)
}

export function useRoutes() {
  const [routes, setRoutes] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeRoutes((newRoutes) => {
      setRoutes([...newRoutes].sort(compareRouteIds))
    })
    return unsubscribe
  }, [])

  return routes
}
