import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function NotifySettings({ thresholdMinutes, onChange }) {
  const [open, setOpen] = useState(false)
  // Buffer local: el input muestra esto, no `thresholdMinutes` directamente.
  // PassengerView se re-renderiza cada 2s (tick de useBuses para detectar
  // buses "stale"), y un input controlado por un valor externo se resetea
  // en cada re-render — borrando lo que el usuario está escribiendo.
  const [draft, setDraft] = useState(String(thresholdMinutes))

  useEffect(() => {
    if (open) setDraft(String(thresholdMinutes))
  }, [open])

  const handleInputChange = (e) => {
    setDraft(e.target.value)
    onChange(e.target.value)
  }

  return (
    <div className="notify-settings">
      <button
        type="button"
        className="notify-settings__toggle"
        aria-label="Configurar aviso de proximidad"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⚙️</span>
      </button>

      {open &&
        createPortal(
          <div className="notify-settings__backdrop" onClick={() => setOpen(false)}>
            <div className="notify-settings__panel" onClick={(e) => e.stopPropagation()}>
              <label className="notify-settings__label">
                Avisarme cuando el bus esté a
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={draft}
                  onChange={handleInputChange}
                  className="notify-settings__input"
                />
                minutos
              </label>
              <button
                type="button"
                className="notify-settings__close"
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
