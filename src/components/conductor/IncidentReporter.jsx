import { useState } from 'react'
import { INCIDENT_TYPES } from '../../config/incidents.js'

export function IncidentReporter({ activeIncident, onReport, onResolve }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (activeIncident) {
    return (
      <div className="incident-reporter incident-reporter--active">
        <span>⚠️ {activeIncident.label}</span>
        <button type="button" onClick={onResolve}>
          ✅ Marcar resuelto
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" className="incident-reporter__toggle" onClick={() => setOpen(true)}>
        ⚠️ Reportar incidente
      </button>
    )
  }

  return (
    <div className="incident-reporter">
      <div className="incident-reporter__types">
        {INCIDENT_TYPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onReport(id, note)
              setOpen(false)
              setNote('')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Nota opcional"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="incident-reporter__cancel" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </div>
  )
}
