import { useState } from 'react'

export function NotifySettings({ thresholdMinutes, onChange }) {
  const [open, setOpen] = useState(false)

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

      {open && (
        <div className="notify-settings__panel">
          <label className="notify-settings__label">
            Avisarme cuando el bus esté a
            <input
              type="number"
              min={1}
              max={15}
              value={thresholdMinutes}
              onChange={(e) => onChange(e.target.value)}
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
      )}
    </div>
  )
}
