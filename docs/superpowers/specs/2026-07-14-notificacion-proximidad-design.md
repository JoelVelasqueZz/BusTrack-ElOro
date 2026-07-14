# Notificación de proximidad configurable (vista Pasajero)

**Fecha:** 2026-07-14
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

La vista Pasajero ya calcula un ETA (`useEta.js`) y dispara un aviso —resaltado visual del panel + notificación local— cuando el bus está a ≤2 minutos de la parada seleccionada (`computeEta()` en `geo.js:75`, consumido por `EtaPanel.jsx`). Ese umbral de 2 minutos está hardcodeado. El equipo pidió que el pasajero pueda configurarlo desde un apartado de configuración en modo pasajero.

Queda **fuera de alcance**:
- Vista Conductor — no se toca.
- Cualquier cambio al cálculo de ETA en sí (`computeEta`) más allá de parametrizar el umbral de aviso.
- El botón de centrar ubicación (feature separada, ya implementada y mergeada a `master`).
- Persistencia en servidor (Firebase) — es una preferencia local del dispositivo, no estado compartido entre usuarios.

## Diseño

**`src/hooks/useNotifyThreshold.js`** (nuevo) — hook aislado, mismo estilo que `usePassengerLocation.js` / `useEta.js`. Persiste en `localStorage` bajo la clave `bustrack_notify_minutes`, siguiendo el patrón ya usado en `RoleContext.jsx:8-15` (lectura inicial) y `RoleContext.jsx:21-27` (persistencia vía `useEffect`):

```jsx
import { useEffect, useState } from 'react'

const THRESHOLD_KEY = 'bustrack_notify_minutes'
const DEFAULT_THRESHOLD = 2
const MIN_THRESHOLD = 1
const MAX_THRESHOLD = 15

function isValidThreshold(value) {
  return Number.isFinite(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
}

function readStoredThreshold() {
  const raw = Number(localStorage.getItem(THRESHOLD_KEY))
  return isValidThreshold(raw) ? raw : DEFAULT_THRESHOLD
}

export function useNotifyThreshold() {
  const [thresholdMinutes, setThresholdMinutes] = useState(readStoredThreshold)

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEY, String(thresholdMinutes))
  }, [thresholdMinutes])

  const setThreshold = (value) => {
    const parsed = Number(value)
    if (isValidThreshold(parsed)) setThresholdMinutes(parsed)
  }

  return { thresholdMinutes, setThreshold }
}
```

Valores inválidos (0, negativos, >15, texto no numérico) se descartan silenciosamente en `setThreshold` — el estado no cambia, no hay excepción ni feedback de error (el `<input type="number" min={1} max={15}>` ya restringe la mayoría de los casos desde la UI).

**`src/utils/geo.js` — `computeEta()`** — agrega parámetro `thresholdMinutes = 2` (default preserva el comportamiento actual para cualquier otro caller). Reemplaza `etaMinutes <= 2` por `etaMinutes <= thresholdMinutes`. Renombra la clave de retorno `within2min` → `withinThreshold`.

**`src/hooks/useEta.js`** — acepta `thresholdMinutes` como cuarto argumento, lo pasa a `computeEta(...)`, lo agrega al array de dependencias del `useMemo`, y actualiza `EMPTY_ETA` para usar `withinThreshold: false`.

**`src/components/passenger/EtaPanel.jsx`** — rename directo: las 3 referencias a `eta.within2min` (líneas 17, 20, 46, 63) pasan a `eta.withinThreshold`. Sin cambio de comportamiento.

**`src/components/passenger/NotifySettings.jsx`** (nuevo) — sub-componente de UI, mismo patrón de overlay simple sin librería de modal que usa `LocateButton` en `BusMap.jsx`:

```jsx
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
```

**`src/components/passenger/PassengerView.jsx`** — instancia `useNotifyThreshold()`, pasa `thresholdMinutes` a `useEta(routeBuses, stop, route?.path, thresholdMinutes)`, y renderiza `<NotifySettings thresholdMinutes={thresholdMinutes} onChange={setThreshold} />` dentro de `.passenger-view__topbar`, junto al botón de volver y el selector de ruta (línea ~50-71).

**`src/services/notificationService.js`** — sin cambios. Ya recibe los minutos reales calculados (`notifyBusNear(busNumber, minutes, busId)`), no un umbral hardcodeado.

### Manejo de errores

- Input fuera de rango o no numérico → se ignora, se conserva el último valor válido, sin crash ni mensaje de error (el rango 1–15 ya es intencionalmente amplio y el `<input type="number">` limita gran parte de la entrada inválida desde el navegador/teclado nativo).
- `localStorage` no disponible (caso raro) → `readStoredThreshold` cae al default `2` porque `Number(null)` es `0`, que falla `isValidThreshold` y activa el fallback.

### Estilo

- Botón ⚙️ circular, mismo lenguaje visual que `.locate-button` (fondo blanco, ícono oscuro, sombra suave), ubicado en la topbar junto al selector de ruta/parada — no compite por espacio con el botón de centrar ubicación, que vive dentro del mapa.
- Panel desplegable (`.notify-settings__panel`) con fondo `var(--white)`, texto `var(--navy)`, mismo radio de borde y sombra que el resto de overlays del proyecto.
- Nuevas reglas en `src/styles/app.css`, agrupadas cerca de `.locate-button`.

## Verificación

1. Levantar la app (`npm run dev`), entrar como Pasajero, seleccionar una ruta y parada con bus activo.
2. Tocar ⚙️, cambiar el valor a 5, cerrar el panel.
3. Confirmar que el panel de ETA se resalta (`eta-panel--near`) cuando el bus está a ≤5 min, no solo a ≤2 min.
4. Confirmar que la notificación local se dispara al mismo umbral (5 min).
5. Recargar la app — confirmar que el valor configurado (5) persiste.
6. Probar valores inválidos (0, -1, 20, texto) — confirmar que se ignoran, sin crash, y el valor previo se mantiene.
7. Confirmar que la vista Conductor no fue tocada.
8. Probar en el APK real como verificación final antes de dar la feature por cerrada.
