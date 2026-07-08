import { useState, useCallback, useEffect } from 'react'
import { useRole } from '../../context/RoleContext.jsx'
import { useWakeLock } from '../../hooks/useWakeLock.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useMotionDetector } from '../../hooks/useMotionDetector.js'
import { useRouteRecorder } from '../../hooks/useRouteRecorder.js'
import { startPublishing, updateBusInfo, stopPublishing } from '../../services/locationService.js'
import { reportPothole } from '../../services/potholeService.js'
import { saveRecordedPath } from '../../services/routeService.js'
import { assignBusUnit } from '../../services/busUnitService.js'
import { TripControls } from './TripControls.jsx'

export function ConductorView() {
  const { deviceId, clearRole } = useRole()
  const [tripActive, setTripActive] = useState(false)
  const [busInfo, setBusInfo] = useState(null)
  const [potholeCount, setPotholeCount] = useState(0)
  const [recordingRoute, setRecordingRoute] = useState(false)
  const [startError, setStartError] = useState(null)

  useWakeLock(tripActive)
  const { position, error: geoError } = useGeolocation(tripActive)
  const { getPoints, pointCount } = useRouteRecorder(tripActive && recordingRoute, position)

  const handlePothole = useCallback(
    (magnitude) => {
      if (!busInfo || !position) return
      reportPothole({ lat: position.lat, lng: position.lng, magnitude, busId: busInfo.busId })
      setPotholeCount((count) => count + 1)
    },
    [busInfo, position],
  )

  useMotionDetector(tripActive, handlePothole)

  useEffect(() => {
    if (!tripActive || !position || !busInfo) return
    updateBusInfo({
      lat: position.lat,
      lng: position.lng,
      speed: position.speed,
      heading: position.heading,
    })
  }, [tripActive, position, busInfo])

  const handleStart = async ({ routeId, empresa, numero, destino, recordRoute }) => {
    setStartError(null)
    let assignment
    try {
      assignment = await assignBusUnit(routeId, numero)
    } catch (err) {
      setStartError(err)
      return
    }
    const { busId, unitLabel } = assignment
    const info = {
      busId,
      driverId: deviceId,
      routeId,
      empresa,
      numero,
      unitLabel,
      destino,
      lat: null,
      lng: null,
      speed: null,
      heading: null,
    }
    setBusInfo(info)
    setPotholeCount(0)
    setRecordingRoute(recordRoute)
    setTripActive(true)
    startPublishing(info)
  }

  const handleStop = () => {
    if (recordingRoute && busInfo?.routeId) {
      const points = getPoints()
      if (points.length >= 10) {
        saveRecordedPath(busInfo.routeId, points).catch(() => {})
      }
    }
    setTripActive(false)
    setRecordingRoute(false)
    stopPublishing()
    setBusInfo(null)
  }

  return (
    <div className="conductor-view">
      <header className="conductor-view__header">
        <button className="role-back-button role-back-button--dark" onClick={clearRole}>
          ← Cambiar rol
        </button>
        <span className="conductor-view__eyebrow">Panel del conductor</span>
        <h1 className="conductor-view__title">BusTrack</h1>
      </header>

      <TripControls tripActive={tripActive} onStart={handleStart} onStop={handleStop} />

      {startError && (
        <p className="trip-status__error">
          No se pudo iniciar el viaje: {startError.message}
        </p>
      )}

      {tripActive && (
        <div className="trip-status">
          <div className="trip-status__row trip-status__row--headline">
            <span className="trip-status__label">Viaje activo</span>
            <span className="trip-status__value">
              {busInfo?.empresa} #{busInfo?.unitLabel} → {busInfo?.destino}
            </span>
          </div>
          <div className="trip-status__row">
            <span className="trip-status__label">Ubicación</span>
            <span className="trip-status__value">
              {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'Obteniendo...'}
            </span>
          </div>
          <div className="trip-status__row">
            <span className="trip-status__label">Baches detectados</span>
            <span className="trip-status__value trip-status__value--amber">{potholeCount}</span>
          </div>
          {recordingRoute && (
            <div className="trip-status__row">
              <span className="trip-status__label">Grabando recorrido</span>
              <span className="trip-status__value">{pointCount} puntos</span>
            </div>
          )}
          {geoError && <p className="trip-status__error">Error de GPS: {geoError.message}</p>}
        </div>
      )}
    </div>
  )
}
