import { useState } from 'react'
import { createPortal } from 'react-dom'

export function DestinationFinder({ destinations, onSelect }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)

  const close = () => {
    setOpen(false)
    setQuery('')
    setPicked(null)
  }

  const filtered = destinations.filter((d) =>
    d.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const handlePickDestination = (destination) => {
    if (destination.matches.length === 1) {
      onSelect(destination.matches[0])
      close()
      return
    }
    setPicked(destination)
  }

  const handlePickRoute = (match) => {
    onSelect(match)
    close()
  }

  return (
    <div className="destination-finder">
      <button
        type="button"
        className="destination-finder__toggle"
        aria-label="¿A dónde vas?"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🔍</span>
        <span className="destination-finder__toggle-label">¿A dónde vas?</span>
      </button>

      {open &&
        createPortal(
          <div className="destination-finder__backdrop" onClick={close}>
            <div className="destination-finder__panel" onClick={(e) => e.stopPropagation()}>
              {!picked ? (
                <>
                  <h2 className="destination-finder__title">¿A dónde vas?</h2>
                  <input
                    type="text"
                    className="destination-finder__search"
                    placeholder="Ej: Terminal Terrestre, UTMACH..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                  <ul className="destination-finder__list">
                    {filtered.length === 0 && (
                      <li className="destination-finder__empty">No encontramos ese destino</li>
                    )}
                    {filtered.map((destination) => (
                      <li key={destination.name}>
                        <button
                          type="button"
                          className="destination-finder__item"
                          onClick={() => handlePickDestination(destination)}
                        >
                          {destination.name}
                          <span className="destination-finder__item-count">
                            {destination.matches.length}{' '}
                            {destination.matches.length === 1 ? 'ruta' : 'rutas'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="destination-finder__back"
                    onClick={() => setPicked(null)}
                  >
                    ← Volver
                  </button>
                  <h2 className="destination-finder__title">Rutas hacia {picked.name}</h2>
                  <ul className="destination-finder__list">
                    {picked.matches.map((match) => (
                      <li key={`${match.routeId}-${match.stopId}`}>
                        <button
                          type="button"
                          className="destination-finder__item"
                          onClick={() => handlePickRoute(match)}
                        >
                          {match.routeName}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button type="button" className="destination-finder__close" onClick={close}>
                Cerrar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
