import { useEffect, useMemo, useState } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useBuses } from '../../hooks/useBuses.js'
import { useDestinations } from '../../hooks/useDestinations.js'
import { useEta } from '../../hooks/useEta.js'
import { useNotifyThreshold } from '../../hooks/useNotifyThreshold.js'
import { usePassengerLocation } from '../../hooks/usePassengerLocation.js'
import { useRoutes } from '../../hooks/useRoutes.js'
import { BusMap } from './BusMap.jsx'
import { StopSelector } from './StopSelector.jsx'
import { EtaPanel } from './EtaPanel.jsx'
import { NotifySettings } from './NotifySettings.jsx'
import { DestinationFinder } from './DestinationFinder.jsx'
import { CitySelector } from './CitySelector.jsx'

export function PassengerView() {
  const { clearRole } = useRole()
  const routes = useRoutes()
  const [routeId, setRouteId] = useState('')
  const [stopId, setStopId] = useState('')
  const { thresholdMinutes, setThreshold } = useNotifyThreshold()
  const destinations = useDestinations(routes)

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

  const eta = useEta(routeBuses, stop, route?.path, thresholdMinutes)
  const { position: passengerPosition } = usePassengerLocation()

  const handleRouteChange = (newRouteId) => {
    setRouteId(newRouteId)
    setStopId('')
  }

  const handleDestinationSelect = ({ routeId: newRouteId, stopId: newStopId }) => {
    setRouteId(newRouteId)
    setStopId(newStopId)
  }

  return (
    <div className="passenger-view">
      <div className="passenger-view__map">
        <BusMap
          buses={routeBuses}
          stops={route?.stops ?? []}
          routeColor={route?.color}
          path={route?.path}
          passengerPosition={passengerPosition}
          selectedStopId={stopId}
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

        <div className="passenger-view__toolbar">
          <DestinationFinder destinations={destinations} onSelect={handleDestinationSelect} />
          <CitySelector />
          <NotifySettings thresholdMinutes={thresholdMinutes} onChange={setThreshold} />
        </div>
      </div>

      <div className="passenger-view__panel">
        <EtaPanel eta={eta} stopId={stopId} stopName={stop?.name} />
      </div>
    </div>
  )
}
