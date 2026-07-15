export const INCIDENT_TYPES = [
  { id: 'accidente', label: 'Accidente' },
  { id: 'averia', label: 'Avería mecánica' },
  { id: 'desvio', label: 'Desvío de ruta' },
  { id: 'trafico', label: 'Tráfico/bloqueo' },
  { id: 'otro', label: 'Otro' },
]

export const INCIDENT_LABELS = Object.fromEntries(
  INCIDENT_TYPES.map(({ id, label }) => [id, label]),
)
