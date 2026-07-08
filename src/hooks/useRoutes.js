import { useEffect, useState } from 'react'
import { subscribeRoutes } from '../services/routeService.js'

export function useRoutes() {
  const [routes, setRoutes] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeRoutes(setRoutes)
    return unsubscribe
  }, [])

  return routes
}
