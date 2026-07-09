import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { ref, onValue, off } from 'firebase/database'
import { db } from '../../firebase.js'
import { MACHALA_CENTER, DEFAULT_ZOOM } from '../../config/machala.js'

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

export function BusMap({ buses, stops, routeColor, path, passengerPosition }) {
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
            {bus.empresa} #{bus.unitLabel ?? bus.numero} → {bus.destino}
            {bus.isStale && (
              <div className="bus-popup__stale">
                ⚠️ Señal perdida hace {formatElapsed(bus.lastUpdateMs)}
              </div>
            )}
          </Popup>
        </Marker>
      ))}

      {passengerPosition && (
        <Marker
          position={[passengerPosition.lat, passengerPosition.lng]}
          icon={passengerIcon}
          zIndexOffset={1000}
          interactive={false}
        />
      )}
    </MapContainer>
  )
}
