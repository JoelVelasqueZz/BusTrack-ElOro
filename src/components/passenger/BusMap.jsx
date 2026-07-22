import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ref, onValue, off } from 'firebase/database'
import { db } from '../../firebase.js'
import { Geolocation } from '@capacitor/geolocation'
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'
import { INCIDENT_LABELS } from '../../config/incidents.js'

const busIcon = new L.Icon({
  iconUrl: '/marker-bus.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const busIconStale = new L.Icon({
  iconUrl: '/marker-bus.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
  className: 'bus-marker-icon--stale',
})

const passengerIcon = new L.DivIcon({
  className: 'passenger-marker',
  html: '<span class="passenger-marker__pulse"></span><span class="passenger-marker__dot"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

const selectedStopIcon = new L.DivIcon({
  className: 'stop-marker-selected',
  html: '<span class="stop-marker-selected__pulse"></span><span class="stop-marker-selected__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const incidentBadgeIcon = new L.DivIcon({
  className: 'incident-badge',
  html: '<span aria-hidden="true">⚠️</span>',
  iconSize: [18, 18],
  iconAnchor: [9, 26],
})

function formatElapsed(ms) {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  return `${Math.round(seconds / 60)} min`
}

function useTrackPoints(busId) {
  const [points, setPoints] = useState([])

  useEffect(() => {
    const pointsRef = ref(db, `tracks/${busId}/points`)

    const handler = (snapshot) => {
      const value = snapshot.val() || {}
      const ordered = Object.keys(value)
        .sort()
        .map((key) => [value[key].lat, value[key].lng])
      setPoints(ordered)
    }

    onValue(pointsRef, handler)
    return () => off(pointsRef, 'value', handler)
  }, [busId])

  return points
}

function BusTrack({ busId, color }) {
  const points = useTrackPoints(busId)
  if (points.length < 2) return null
  return <Polyline positions={points} pathOptions={{ color, weight: 4, opacity: 0.7 }} />
}

function LocateButton({ passengerPosition }) {
  const map = useMap()
  const [status, setStatus] = useState('idle') // 'idle' | 'locating' | 'error'
  const timeoutRef = useRef(null)
  const statusRef = useRef('idle')

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    if (status === 'locating' && passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      setStatus('idle')
      clearTimeout(timeoutRef.current)
    }
  }, [passengerPosition, status, map])

  useEffect(() => {
    if (status !== 'error') return
    const timer = setTimeout(() => setStatus('idle'), 4000)
    return () => clearTimeout(timer)
  }, [status])

  // Evita "setState tras unmount" si la vista se cierra mientras el timeout
  // de 6s de `locating` sigue pendiente (ej. el pasajero cambia de rol).
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleClick = async () => {
    if (passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      return
    }
    if (status === 'locating') return
    setStatus('locating')
    timeoutRef.current = setTimeout(() => setStatus('error'), 6000)
    try {
      await Geolocation.requestPermissions()
    } catch {
      if (statusRef.current !== 'locating') return
      clearTimeout(timeoutRef.current)
      setStatus('error')
    }
  }

  return (
    <div className="locate-button-wrap">
      {status === 'locating' && (
        <span className="locate-button__msg">Buscando tu ubicación…</span>
      )}
      {status === 'error' && (
        <span className="locate-button__msg locate-button__msg--error">
          No se pudo obtener tu ubicación
        </span>
      )}
      <button
        type="button"
        className="locate-button"
        aria-label="Centrar en mi ubicación"
        onClick={handleClick}
      >
        <span aria-hidden="true">📍</span>
      </button>
    </div>
  )
}

export function BusMap({ buses, stops, routeColor, path, passengerPosition, selectedStopId }) {
  const selectedStop = stops.find((stop) => stop.id === selectedStopId)

  return (
    <MapContainer
      center={MACHALA_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {path && path.length >= 2 && (
        <Polyline positions={path} pathOptions={{ color: routeColor ?? '#1a2b4a', weight: 3 }} />
      )}

      {stops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lng]}
          radius={6}
          pathOptions={{ color: '#1a2b4a', weight: 2, fillColor: '#f5a623', fillOpacity: 0.95 }}
        >
          <Popup>{stop.name}</Popup>
        </CircleMarker>
      ))}

      {buses.map((bus) => (
        <BusTrack key={`track-${bus.busId}`} busId={bus.busId} color={routeColor ?? '#1a2b4a'} />
      ))}

      {buses.map((bus) => (
        <Marker
          key={bus.busId}
          position={[bus.lat, bus.lng]}
          icon={bus.isStale ? busIconStale : busIcon}
        >
          <Popup>
            {bus.empresa} #{bus.unitLabel ?? bus.numero}
            {bus.isStale && (
              <div className="bus-popup__stale">
                ⚠️ Señal perdida hace {formatElapsed(bus.lastUpdateMs)}
              </div>
            )}
            {bus.incident && (
              <div className="bus-popup__incident">
                ⚠️ {INCIDENT_LABELS[bus.incident.type]}
                {bus.incident.note && `: ${bus.incident.note}`}
              </div>
            )}
          </Popup>
        </Marker>
      ))}

      {buses.map((bus) =>
        bus.incident ? (
          <Marker
            key={`incident-${bus.busId}`}
            position={[bus.lat, bus.lng]}
            icon={incidentBadgeIcon}
            zIndexOffset={950}
            interactive={false}
          />
        ) : null,
      )}

      {selectedStop && (
        <Marker
          position={[selectedStop.lat, selectedStop.lng]}
          icon={selectedStopIcon}
          zIndexOffset={900}
          interactive={false}
        />
      )}

      {passengerPosition && (
        <Marker
          position={[passengerPosition.lat, passengerPosition.lng]}
          icon={passengerIcon}
          zIndexOffset={1000}
          interactive={false}
        />
      )}

      <LocateButton passengerPosition={passengerPosition} />
    </MapContainer>
  )
}
