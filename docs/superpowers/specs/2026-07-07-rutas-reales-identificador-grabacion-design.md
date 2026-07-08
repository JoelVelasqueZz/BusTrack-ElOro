# Rutas reales (GAD Machala), identificador de bus y grabación de recorrido

**Fecha:** 2026-07-07
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

Idea original del usuario: grabar rutas como conductor, identificar buses duplicados por número (ej. `Bus20-1`, `Bus20-2`), buscar por número en la vista pasajero, un motor de recomendación por destino, un modo Ciudad/Provincial, e importar datos reales de rutas desde PDFs del GAD Machala.

Se decidió recortar el alcance a tres piezas, que resultaron estar más interconectadas de lo que parecía al inicio:

1. **Rutas reales** — reemplazar las 2 rutas de ejemplo de `src/config/machala.js` por las 20 líneas oficiales de buses urbanos de Machala, extraídas de los PDFs en `docs/rutas-gad-machala/`.
2. **Identificador automático de bus** — cuando dos conductores activos comparten número en la misma línea, se les asigna un sufijo (`20-1`, `20-2`) sin intervención manual.
3. **Grabación de recorrido por el conductor** — el conductor puede grabar su GPS en vivo y guardarlo como el `path` oficial de su línea, reemplazando el path sembrado desde el PDF.

Quedan explícitamente **fuera** de este alcance (posibles fases futuras):

- Buscar por número de bus como mecanismo *primario* de selección en la vista pasajero (la ruta sigue siendo la selección primaria; el identificador de bus solo sirve para distinguir unidades en el mapa/popup).
- Motor de recomendación por destino — cuando se aborde, en versión simplificada: comparar ETA entre todas las rutas activas hacia sus paradas existentes, no geocoding de un destino libre.
- Modo Ciudad vs Provincial (CIFA, Ecuatoriano Pullman, etc.) — no hay forma realista de que buses interprovinciales privados reporten su posición en un proyecto universitario sin acuerdo con esas empresas.

## Hallazgo relevante sobre los PDFs (`docs/rutas-gad-machala/`)

Se revisaron `Linea-1.pdf` y `Linea-20.pdf` de los 20 archivos subidos. Cada PDF de "Movilidad Machala EP" contiene:

- La **misma leyenda completa** con la lista de paradas de las 20 líneas (no solo la línea del archivo) — basta con uno o dos PDFs para tener el listado de paradas de todas.
- Un mapa esquemático de la ciudad con la ruta de esa línea resaltada en rojo/magenta, y una lista de calles en orden de recorrido, específica de esa línea.
- **No hay coordenadas reales** — es un mapa esquemático, no georreferenciado.

Muchos lugares (Hospital Teófilo Dávila, SOLCA, Estadio 9 de Mayo, Terminal Terrestre, etc.) se repiten entre líneas.

## Modelo de datos en Firebase

```
/routes/{routeId}
  name, color
  stops: [{ id, name, lat, lng, order }]
  path: [[lat,lng], ...]

/unitCounters/{routeId}_{numero}
  ← entero, solo usado internamente para asignar sufijos de identificador de bus
```

- `routes` reemplaza al arreglo `ROUTES` que hoy vive en `src/config/machala.js`. Mismo shape que ya consumen `useEta`/`BusMap`, así que esos componentes no cambian su lógica interna — cambia únicamente la fuente: un nuevo hook `useRoutes()` (calcado de `useBuses()`) que hace `onValue(ref(db, 'routes'))`.
- `src/config/machala.js` se reduce a `MACHALA_CENTER` y `DEFAULT_ZOOM` (config de mapa, no de rutas).
- **Sin respaldo local** para rutas: Firebase es la única fuente de verdad. Un respaldo local no rescataría la experiencia si Firebase no responde, porque las posiciones de los buses (`/buses`) también dependen de Firebase — sin conexión, el mapa ya es inútil con o sin fallback de rutas. Además, un fallback local divergiría con el tiempo en cuanto un conductor grabe un recorrido nuevo (esa actualización solo existe en Firebase).
- `unitCounters` es invisible para el usuario, solo lo usa el mecanismo de la sección siguiente.

## Siembra de datos reales (una sola vez)

1. Construir un diccionario de puntos de interés (POIs) — cada lugar mencionado en las paradas de las 20 líneas (Hospital Teófilo Dávila, SOLCA, Terminal Terrestre, etc.), geocodificado una sola vez vía un servicio público (OpenStreetMap/Nominatim), para no repetir la búsqueda de un mismo lugar en varias líneas.
2. Construir las 20 líneas (nombre, color, paradas en orden con `lat/lng` tomados del diccionario de POIs, y `path` inicial como la secuencia de coordenadas de sus paradas — misma fidelidad que las rutas de ejemplo actuales, ya que el PDF no da coordenadas exactas de calle).
3. Script `scripts/seedRoutes.mjs`, ejecutado manualmente una sola vez, que escribe esas 20 líneas en `/routes` de Firebase.

Este es un trabajo de captura de datos considerable (20 líneas × ~10-15 paradas cada una) — se ejecuta como una tarea separada durante la implementación, no algo a decidir línea por línea en el diseño.

Con el tiempo, el `path` inicial (aproximado, por POIs) de cada línea se reemplaza por datos reales de GPS a medida que los conductores usan la grabación de recorrido (sección siguiente).

## Identificador automático de bus

**Mecanismo:** contador en `/unitCounters/{routeId}_{numero}`, incrementado con una transacción atómica de Firebase (`runTransaction`). Si dos conductores presionan "Iniciar viaje" con el mismo número al mismo tiempo, Firebase serializa las transacciones y cada una obtiene un valor distinto — sin condición de carrera. El contador nunca baja ni se reutiliza (aunque el bus anterior ya haya terminado su viaje), evitando tener que rastrear qué sufijos están libres.

**Dónde se engancha:** en `src/components/conductor/ConductorView.jsx`, dentro de `handleStart`. Hoy es síncrono (`busId = ${routeId}-${numero}`); pasa a ser async:

1. Se ejecuta la transacción sobre `/unitCounters/{routeId}_{numero}` para obtener el sufijo.
2. `busId = ${routeId}-${numero}-${suffix}` (clave en `/buses`, sin cambios en el resto del pipeline de publicación).
3. `unitLabel = ${numero}-${suffix}` (ej. `"20-2"`) — nuevo campo publicado en `/buses/{busId}` y mostrado al pasajero.

**En el mapa del pasajero:** el popup en `src/components/passenger/BusMap.jsx` pasa de mostrar `#{numero}` a mostrar `#{unitLabel}` (ej. "CIFA #20-2 → Huaquillas").

`src/components/conductor/TripControls.jsx` no cambia — el conductor solo escribe "20", nunca ve ni piensa en el sufijo.

Este mecanismo también corrige un bug latente ya presente hoy: sin él, dos conductores con el mismo número en la misma línea se pisan silenciosamente en el mismo nodo de `/buses`.

## Grabación de recorrido por el conductor

**En `TripControls.jsx`:** checkbox nuevo "Grabar este recorrido como ruta oficial", deshabilitado una vez el viaje está activo (mismo patrón que los demás campos). Solo puede reemplazar el `path` de la línea ya elegida en el selector `Ruta` — no crea líneas nuevas.

**Mecanismo:** nuevo hook `useRouteRecorder(active, position)` — mientras `active` es `true`, cada cambio de `position` (la misma posición que ya expone `useGeolocation`, sin abrir un segundo GPS) se agrega como `[lat, lng]` a un array en memoria. No escribe a Firebase punto por punto, solo acumula localmente.

**Al presionar "Detener viaje":**
- Si se grabaron **menos de 10 puntos**, se descarta en silencio (recorrido demasiado corto o cancelado rápido) — no vale la pena sobreescribir con un path casi vacío.
- Si hay 10 o más puntos, se llama a `saveRecordedPath(routeId, points)` (nueva función, mismo estilo que `src/services/locationService.js`), que hace `set(ref(db, routes/{routeId}/path), points)` — solo toca el nodo `path`; `name`/`color`/`stops` quedan intactos.

**Feedback en pantalla:** mientras el viaje y la grabación están activos, el panel `trip-status` de `ConductorView.jsx` muestra "Grabando recorrido: N puntos".

## Reglas de Firebase (`database.rules.json`)

Se agregan dos nodos, con el mismo nivel de permisividad que los existentes (consistente con "sin login, escritura abierta para el MVP"):

```json
{
  "rules": {
    "buses": { ".read": true, ".write": true, ".indexOn": ["active"] },
    "potholes": { ".read": true, ".write": true },
    "tracks": { ".read": true, ".write": true },
    "routes": { ".read": true, ".write": true },
    "unitCounters": { ".read": true, ".write": true }
  }
}
```

## Verificación

1. Correr `scripts/seedRoutes.mjs` contra el proyecto Firebase real; confirmar en la consola de Firebase que `/routes` tiene las 20 líneas con `stops`/`path`.
2. Vista pasajero: el selector de rutas lista las 20 líneas reales (no las 2 de ejemplo); mapa y ETA siguen funcionando igual que antes.
3. Vista conductor: iniciar dos viajes con el mismo número en la misma línea desde dos dispositivos/pestañas distintas; confirmar que Firebase asigna sufijos distintos (`-1`, `-2`) sin pisarse los datos.
4. Activar "grabar recorrido", hacer un recorrido corto de prueba, detener el viaje; confirmar que `/routes/{routeId}/path` se actualizó con los puntos grabados.
5. Repetir con menos de 10 puntos; confirmar que el `path` original no se sobreescribe.
