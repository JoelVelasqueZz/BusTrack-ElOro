import { useEffect, useRef } from 'react'
import { notifyBusNear, requestPermission, resetNotificationGuard } from '../../services/notificationService.js'

export function EtaPanel({ eta, stopId, stopName }) {
  const wasWithin2minRef = useRef(false)

  useEffect(() => {
    requestPermission().catch(() => {})
  }, [])

  useEffect(() => {
    resetNotificationGuard()
    wasWithin2minRef.current = false
  }, [stopId])

  useEffect(() => {
    if (eta.withinThreshold && !wasWithin2minRef.current && eta.nearestBus) {
      notifyBusNear(eta.nearestBus.numero, eta.etaMinutes, eta.nearestBus.busId).catch(() => {})
    }
    wasWithin2minRef.current = eta.withinThreshold
  }, [eta.withinThreshold, eta.nearestBus, eta.etaMinutes])

  if (!stopId) {
    return (
      <div className="eta-panel eta-panel--empty">
        <span className="eta-panel__icon" aria-hidden="true">
          🚏
        </span>
        <p>Selecciona una parada para ver el ETA</p>
      </div>
    )
  }

  if (!eta.nearestBus) {
    return (
      <div className="eta-panel eta-panel--empty">
        <span className="eta-panel__icon" aria-hidden="true">
          🚍
        </span>
        <p>Ningún bus activo en esta ruta todavía</p>
      </div>
    )
  }

  return (
    <div className={`eta-panel ${eta.withinThreshold ? 'eta-panel--near' : ''}`}>
      <div className="eta-panel__header">
        <span className="eta-panel__stop">{stopName}</span>
        <span className="eta-panel__bus">
          {eta.nearestBus.empresa} #{eta.nearestBus.numero} → {eta.nearestBus.destino}
        </span>
      </div>

      <div className="eta-panel__sign">
        <span className="eta-panel__eta-number">
          {eta.etaMinutes != null ? Math.max(Math.round(eta.etaMinutes), 0) : '—'}
        </span>
        <span className="eta-panel__eta-unit">min</span>
      </div>

      <div className="eta-panel__footer">
        <span>{eta.distanceMeters != null ? `${Math.round(eta.distanceMeters)} m` : '—'}</span>
        {eta.withinThreshold && <span className="eta-panel__alert">¡Bus cerca!</span>}
      </div>
    </div>
  )
}
