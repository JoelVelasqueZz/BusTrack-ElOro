import { useRole } from '../context/RoleContext.jsx'

export function RoleSelector() {
  const { setRole } = useRole()

  return (
    <div className="role-selector">
      <div className="role-selector__brand">
        <div className="role-selector__logo" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 16V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect x="4" y="6" width="16" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
            <path d="M4 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="8" cy="19" r="1.6" fill="currentColor" />
            <circle cx="16" cy="19" r="1.6" fill="currentColor" />
          </svg>
        </div>
        <h1 className="role-selector__title">BusTrack</h1>
        <p className="role-selector__subtitle">El Oro</p>
        <p className="role-selector__prompt">¿Cuál es tu rol?</p>
      </div>

      <div className="role-selector__actions">
        <button className="role-button role-button--conductor" onClick={() => setRole('conductor')}>
          Soy Conductor
        </button>
        <button className="role-button role-button--pasajero" onClick={() => setRole('pasajero')}>
          Soy Pasajero
        </button>
      </div>
    </div>
  )
}
