import { useState } from 'react'
import { ROUTES } from '../../config/machala.js'

export function TripControls({ tripActive, onStart, onStop }) {
  const [routeId, setRouteId] = useState(ROUTES[0]?.id ?? '')
  const [empresa, setEmpresa] = useState('')
  const [numero, setNumero] = useState('')
  const [destino, setDestino] = useState('')

  const canStart =
    routeId && empresa.trim().length > 0 && numero.trim().length > 0 && destino.trim().length > 0

  return (
    <div className="trip-controls">
      <label className="trip-controls__field">
        Ruta
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={tripActive}>
          {ROUTES.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>
      </label>

      <label className="trip-controls__field">
        Empresa/Cooperativa
        <input
          type="text"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: CIFA"
        />
      </label>

      <label className="trip-controls__field">
        Número de unidad
        <input
          type="text"
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: 12"
        />
      </label>

      <label className="trip-controls__field">
        Destino
        <input
          type="text"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          disabled={tripActive}
          placeholder="Ej: Huaquillas"
        />
      </label>

      {tripActive ? (
        <button className="trip-button trip-button--stop" onClick={onStop}>
          Detener viaje
        </button>
      ) : (
        <button
          className="trip-button trip-button--start"
          disabled={!canStart}
          onClick={() =>
            onStart({
              routeId,
              empresa: empresa.trim(),
              numero: numero.trim(),
              destino: destino.trim(),
            })
          }
        >
          Iniciar viaje
        </button>
      )}
    </div>
  )
}
