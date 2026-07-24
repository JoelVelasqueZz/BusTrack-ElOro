import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CANTONES } from '../../config/cantones.js'

export function CitySelector() {
  const [open, setOpen] = useState(false)

  return (
    <div className="city-selector">
      <button
        type="button"
        className="city-selector__toggle"
        aria-label="Cambiar ciudad"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🏙️</span>
      </button>

      {open &&
        createPortal(
          <div className="city-selector__backdrop" onClick={() => setOpen(false)}>
            <div className="city-selector__panel" onClick={(e) => e.stopPropagation()}>
              <h2 className="city-selector__title">Ciudades</h2>
              <ul className="city-selector__list">
                {CANTONES.map((canton) => (
                  <li key={canton.id} className="city-selector__row">
                    <span>{canton.name}</span>
                    {canton.available ? (
                      <span className="city-selector__badge city-selector__badge--active">
                        Activo
                      </span>
                    ) : (
                      <span className="city-selector__badge">Próximamente</span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="city-selector__close"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
