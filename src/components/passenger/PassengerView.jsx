import { useEffect, useMemo, useState } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useBuses } from '../../hooks/useBuses.js'
import { useEta } from '../../hooks/useEta.js'
import { usePassengerLocation } from '../../hooks/usePassengerLocation.js'
import { useRoutes } from '../../hooks/useRoutes.js'
import { BusMap } from './BusMap.jsx'
import { StopSelector } from './StopSelector.jsx'
import { EtaPanel } from './EtaPanel.jsx'

export function PassengerView() {
  const { clearRole } = useRole()
  const routes = useRoutes()
  const [routeId, setRouteId] = useState('')
  const [stopId, setStopId] = useState('')

  useEffect(() => {
    if (!routeId && routes.length > 0) setRouteId(routes[0].id)
  }, [routes, routeId])

  const route = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId])
  const stop = useMemo(() => route?.stops.find((s) => s.id === stopId) ?? null, [route, stopId])

  const allBuses = useBuses()
  const routeBuses = useMemo(
    () => allBuses.filter((bus) => bus.routeId === routeId),
    [allBuses, routeId],
  )

  const eta = useEta(routeBuses, stop, route?.path)
  const { position: passengerPosition } = usePassengerLocation()

  const handleRouteChange = (newRouteId) => {
    setRouteId(newRouteId)
    setStopId('')
  }

  return (
    <div className="passenger-view">
      <div className="passenger-view__map">
        <BusMap
          buses={routeBuses}
          stops={route?.stops ?? []}
          routeColor={route?.color}
          passengerPosition={passengerPosition}
        />

        <div className="passenger-view__topbar">
          <button
            className="role-back-button role-back-button--light"
            onClick={clearRole}
            aria-label="Cambiar rol"
          >
            ←
          </button>

          <label className="route-selector">
            <span className="sr-only">Ruta</span>
            <select value={routeId} onChange={(e) => handleRouteChange(e.target.value)}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <StopSelector stops={route?.stops ?? []} selectedStopId={stopId} onChange={setStopId} />
        </div>
      </div>

      <div className="passenger-view__panel">
        <EtaPanel eta={eta} stopId={stopId} stopName={stop?.name} />
      </div>
    </div>
  )
}
