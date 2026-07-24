import { useMemo } from 'react'

export function useDestinations(routes) {
  return useMemo(() => {
    const byName = new Map()

    for (const route of routes) {
      for (const stop of route.stops) {
        if (!byName.has(stop.name)) byName.set(stop.name, [])
        byName.get(stop.name).push({ routeId: route.id, routeName: route.name, stopId: stop.id })
      }
    }

    return [...byName.entries()]
      .map(([name, matches]) => ({ name, matches }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [routes])
}
