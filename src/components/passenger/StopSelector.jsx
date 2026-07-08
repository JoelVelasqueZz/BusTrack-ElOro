export function StopSelector({ stops, selectedStopId, onChange }) {
  return (
    <label className="stop-selector">
      <span className="sr-only">Parada</span>
      <select value={selectedStopId ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Elige una parada
        </option>
        {stops.map((stop) => (
          <option key={stop.id} value={stop.id}>
            {stop.name}
          </option>
        ))}
      </select>
    </label>
  )
}
