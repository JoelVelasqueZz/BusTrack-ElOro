# Reporte de incidentes del conductor

**Fecha:** 2026-07-14
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

El conductor ya reporta baches automáticamente (`potholeService.js`, vía `useMotionDetector.js`), pero eso es un log silencioso: se escribe en `/potholes` y nunca se lee de vuelta, ni el pasajero lo ve. Se pidió una forma de que el conductor reporte incidentes manualmente (accidente, avería, desvío, tráfico) y que el pasajero lo vea en tiempo real sobre el mapa, en el bus específico que lo reportó.

Queda **fuera de alcance**:
- Historial de incidentes pasados — solo existe el incidente activo actual de cada bus, no un log consultable.
- Notificación push por incidente (a diferencia del aviso de proximidad) — el aviso es solo visual, en el mapa.
- Cambios al reporte de baches existente — sigue funcionando igual, sin relación con esta feature.
- Panel de administración — nadie más que el propio conductor puede resolver su incidente.

## Diseño

### Modelo de datos

En vez de un nodo separado (como `/potholes`), el incidente vive como un campo más dentro del registro que ya existe por bus, para reutilizar la suscripción de `useBuses`/`subscribeBuses` que el pasajero ya tiene abierta — sin segundo listener de Firebase ni merge manual de dos fuentes:

```
/buses/{busId}
  ...campos existentes (lat, lng, speed, heading, active, updatedAt, etc.)...
  incident: null | { type: 'accidente'|'averia'|'desvio'|'trafico'|'otro', note: string|null, reportedAt }
```

Esto es seguro respecto al loop de publicación de posición: `locationService.js:publish()` (línea ~34) escribe con `CapacitorHttp.patch`, que **fusiona** campos en vez de reemplazar el nodo completo — como `incident` no está en la lista de campos que ese `data` envía, el ciclo de 3s nunca lo pisa ni lo borra.

`busService.js:subscribeBuses` (línea 7) ya filtra a `bus.active` — cuando el conductor detiene el viaje (`stopPublishing()` pone `active: false`), el bus entero desaparece del mapa del pasajero, badge de incidente incluido. No hace falta limpiar `incident` aparte al terminar el viaje.

### Categorías compartidas — `src/config/incidents.js` (nuevo)

Un solo lugar con las 5 categorías fijas y sus etiquetas en español, para que conductor y pasajero no dupliquen la lista:

```js
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
```

### `src/services/incidentService.js` (nuevo)

Mismo estilo que `potholeService.js`, pero con `set` (estado actual único) en vez de `push` (log histórico):

```js
import { ref, set, serverTimestamp } from 'firebase/database'
import { db } from '../firebase.js'

export function reportIncident(busId, { type, note }) {
  return set(ref(db, `buses/${busId}/incident`), {
    type,
    note: note?.trim() || null,
    reportedAt: serverTimestamp(),
  })
}

export function resolveIncident(busId) {
  return set(ref(db, `buses/${busId}/incident`), null)
}
```

### Lado conductor

**`src/components/conductor/IncidentReporter.jsx`** (nuevo) — vive en el panel de viaje activo de `ConductorView.jsx`, junto al contador de baches. Dos estados:

- Sin incidente activo: botón "⚠️ Reportar incidente" → abre panel con las 5 categorías de `INCIDENT_TYPES` como botones + `<input>` de nota opcional + botón "Reportar".
- Con incidente activo: en vez del botón de abrir, muestra el tipo reportado y un botón "✅ Marcar resuelto".

```jsx
import { useState } from 'react'
import { INCIDENT_TYPES } from '../../config/incidents.js'

export function IncidentReporter({ activeIncident, onReport, onResolve }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (activeIncident) {
    return (
      <div className="incident-reporter incident-reporter--active">
        <span>⚠️ {activeIncident.label}</span>
        <button type="button" onClick={onResolve}>✅ Marcar resuelto</button>
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
```

**`ConductorView.jsx`** — agrega estado `activeIncident` (mismo patrón que `potholeCount`), reseteado en `handleStart` junto con `potholeCount`:

```jsx
const [activeIncident, setActiveIncident] = useState(null)

const handleReportIncident = (type, note) => {
  if (!busInfo) return
  reportIncident(busInfo.busId, { type, note })
  setActiveIncident({ type, label: INCIDENT_LABELS[type] })
}

const handleResolveIncident = () => {
  if (!busInfo) return
  resolveIncident(busInfo.busId)
  setActiveIncident(null)
}
```

Y renderiza `<IncidentReporter activeIncident={activeIncident} onReport={handleReportIncident} onResolve={handleResolveIncident} />` dentro del bloque `trip-status` (junto al contador de baches, `ConductorView.jsx` línea ~120).

### Lado pasajero — `BusMap.jsx`

Un `DivIcon` chico de badge, renderizado como marcador aparte sobre el mismo punto del bus (mismo patrón que ya usa `selectedStopIcon`/`passengerIcon`), y una línea nueva en el popup del bus:

```jsx
const incidentBadgeIcon = new L.DivIcon({
  className: 'incident-badge',
  html: '<span aria-hidden="true">⚠️</span>',
  iconSize: [18, 18],
  iconAnchor: [9, 26],
})
```

```jsx
{buses.map((bus) =>
  bus.incident ? (
    <Marker
      key={`incident-${bus.busId}`}
      position={[bus.lat, bus.lng]}
      icon={incidentBadgeIcon}
      zIndexOffset={950}
      interactive={false}
    />
  ) : null,
)}
```

Dentro del `<Popup>` del bus (junto al bloque `bus.isStale` existente):

```jsx
{bus.incident && (
  <div className="bus-popup__incident">
    ⚠️ {INCIDENT_LABELS[bus.incident.type]}
    {bus.incident.note && `: ${bus.incident.note}`}
  </div>
)}
```

### CSS — `src/styles/app.css`

Nuevas clases: `.incident-reporter`, `.incident-reporter__toggle`, `.incident-reporter__types`, `.incident-reporter__cancel`, `.incident-reporter--active` (lado conductor, reutilizando las variables `--navy`/`--white`/`--bg-light` y el estilo de botón de `.trip-button`); `.incident-badge` (posicionamiento del DivIcon), `.bus-popup__incident` (mismo estilo que `.bus-popup__stale`, ya existente).

### Reglas Firebase

Sin cambios — `database.rules.json` ya tiene `"buses": { ".read": true, ".write": true }`, e `incident` es solo un campo más dentro de ese mismo nodo.

## Verificación

Sin framework de tests automatizado (convención del proyecto). Verificación manual:

1. Modo conductor, iniciar viaje, tocar "⚠️ Reportar incidente" → elegir "Avería mecánica" con una nota → confirmar que el botón cambia a "✅ Marcar resuelto".
2. En otro dispositivo/pestaña en modo pasajero, en la misma ruta: confirmar que aparece el badge ⚠️ sobre el bus, y que el popup muestra "Avería mecánica: <nota>".
3. Tocar "✅ Marcar resuelto" en el conductor → confirmar que el badge y la línea del popup desaparecen del pasajero en tiempo real (sin recargar).
4. Reportar un incidente y luego tocar "Detener viaje" sin resolverlo → confirmar que el bus (y su badge) desaparece del mapa del pasajero, ya que el bus completo queda `active: false`.
5. Iniciar un viaje nuevo → confirmar que no arrastra el incidente de un viaje anterior (`activeIncident` se resetea en `handleStart`).
6. Confirmar que el reporte de baches (`potholeCount`) sigue funcionando sin cambios.
