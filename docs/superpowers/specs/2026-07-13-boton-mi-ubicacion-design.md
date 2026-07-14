# Botón "centrar en mi ubicación" (vista Pasajero)

**Fecha:** 2026-07-13
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

La vista Pasajero ya rastrea la posición del usuario en primer plano (`usePassengerLocation.js`) y la pinta en el mapa como un punto azul pulsante (`passengerIcon` en `BusMap.jsx:23-28`), pero el mapa nunca se mueve solo hacia esa posición — si el pasajero se aleja explorando el mapa, no tiene forma de volver a su ubicación con un toque. El equipo pidió agregar ese botón como parte de un lote de mejoras post-demo.

El proyecto ya tiene resueltos, de forma incidental, dos requisitos que el equipo había propuesto como features separadas:
- **Permiso de ubicación**: ya se pide en `usePassengerLocation.js:16` vía `Geolocation.requestPermissions()`.
- **Permiso de notificaciones**: ya se pide en `EtaPanel.jsx` al montar.

Este spec cubre únicamente el botón de centrado — no toca esos permisos (ya existen) ni el umbral de aviso de "bus cerca" (feature separada, no diseñada todavía).

Queda **fuera de alcance**:
- Vista Conductor — no se toca.
- Auto-centrado automático al abrir la vista o al recibir la primera posición — el usuario confirmó que el centrado es **solo manual**, disparado por el botón.
- Cualquier control de zoom adicional (el mapa ya tiene `zoomControl={false}`, no se reactiva).

## Diseño

**`src/components/passenger/BusMap.jsx`** — nuevo sub-componente interno `LocateButton`, siguiendo el mismo patrón que `BusTrack` (componente hijo definido en el mismo archivo, antes de `BusMap`):

```jsx
function LocateButton({ passengerPosition }) {
  const map = useMap() // hook de react-leaflet
  const [status, setStatus] = useState('idle') // 'idle' | 'locating' | 'error'
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (status === 'locating' && passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      setStatus('idle')
      clearTimeout(timeoutRef.current)
    }
  }, [passengerPosition, status, map])

  const handleClick = async () => {
    if (passengerPosition) {
      map.flyTo([passengerPosition.lat, passengerPosition.lng], 17)
      return
    }
    setStatus('locating')
    try {
      await Geolocation.requestPermissions()
      timeoutRef.current = setTimeout(() => setStatus('error'), 6000)
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    if (status === 'error') {
      const t = setTimeout(() => setStatus('idle'), 4000)
      return () => clearTimeout(t)
    }
  }, [status])

  // Evita "setState tras unmount" si la vista se cierra mientras el timeout
  // de 6s de `locating` sigue pendiente (ej. el pasajero cambia de rol).
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  return (
    <div className="locate-button-wrap">
      {status === 'locating' && <span className="locate-button__msg">Buscando tu ubicación…</span>}
      {status === 'error' && <span className="locate-button__msg locate-button__msg--error">No se pudo obtener tu ubicación</span>}
      <button
        type="button"
        className="locate-button"
        aria-label="Centrar en mi ubicación"
        onClick={handleClick}
      >
        {/* ícono de crosshair/ubicación, SVG inline */}
      </button>
    </div>
  )
}
```

Se renderiza como hijo de `<MapContainer>` en `BusMap`, junto a los demás elementos del mapa:

```jsx
<LocateButton passengerPosition={passengerPosition} />
```

`BusMap` ya recibe `passengerPosition` como prop (línea 70 actual) — no hace falta tocar `PassengerView.jsx` ni threading nuevo.

**Import nuevo en `BusMap.jsx`:** `useMap` desde `react-leaflet`, `Geolocation` desde `@capacitor/geolocation` (mismo paquete que ya usa `usePassengerLocation.js`), y `useRef` desde `react`.

### Comportamiento

Al tocar el botón:
1. **Si ya hay `passengerPosition`** → `map.flyTo([lat, lng], 17)`, zoom fijo nivel calle, con animación por defecto de Leaflet.
2. **Si no hay posición todavía** → pasa a estado `locating`, muestra el mensaje "Buscando tu ubicación…", y llama `Geolocation.requestPermissions()`. En cuanto `usePassengerLocation` entregue una posición (el watch ya está corriendo en segundo plano desde que se montó la vista), el `useEffect` de arriba detecta el cambio, centra el mapa y vuelve a `idle`.
3. Si pasan 6s sin recibir posición (permiso denegado, GPS sin señal, etc.) → pasa a `error`, muestra "No se pudo obtener tu ubicación" por 4s, y vuelve a `idle` automáticamente.

**Auto-centrado:** nunca ocurre sin que el usuario toque el botón — confirmado explícitamente con el usuario durante el brainstorming.

### Manejo de errores

- Permiso denegado o timeout de 6s → mensaje de error temporal, sin bloquear el resto de la UI ni requerir acción adicional del usuario (puede volver a tocar el botón para reintentar).
- Si `Geolocation.requestPermissions()` lanza una excepción (navegador sin soporte, API no disponible), se captura en el `catch` y se trata igual que un error de permiso — mismo mensaje, mismo timeout de 4s.

### Estilo

- Botón circular flotante, ~44px, esquina inferior derecha de `.passenger-view__map` (zona libre — no hay controles de zoom ni otros overlays ahí).
- Estética consistente con los marcadores existentes: fondo blanco, ícono oscuro, sombra suave (mismo lenguaje visual que `passenger-marker__dot` / `stop-marker-selected__dot`, pero como botón HTML, no `DivIcon`).
- Mensaje de estado (`locate-button__msg`) como burbuja pequeña sobre el botón, con transición CSS de aparición/desaparición — sin librería de toast, coherente con que el resto del proyecto no usa ninguna.
- Nuevas reglas en `src/styles/app.css`, agrupadas cerca de los estilos existentes de `.passenger-marker`/`.stop-marker-selected`.

## Verificación

1. Levantar la app (`npm run dev`), entrar como Pasajero.
2. En Chrome DevTools → Sensors, fijar una ubicación simulada. Confirmar que aparece el punto azul del pasajero en el mapa.
3. Alejar/mover el mapa manualmente (pan/zoom), tocar el botón: confirmar que el mapa anima de vuelta a la posición simulada con zoom 17.
4. Desactivar la ubicación simulada (o denegar el permiso) y tocar el botón antes de que haya posición: confirmar que aparece "Buscando tu ubicación…" y, tras 6s sin datos, "No se pudo obtener tu ubicación", y que luego el botón vuelve a estar disponible para reintentar.
5. Confirmar que el mapa **no** se mueve solo al entrar a la vista, ni al recibir la primera posición sin haber tocado el botón.
6. Probar en el APK real (GPS real) como verificación final antes de dar la feature por cerrada.
