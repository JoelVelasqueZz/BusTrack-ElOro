# Trazado de ruta siguiendo calles reales (OSRM)

**Fecha:** 2026-07-09
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

La feature de línea de ruta coloreada (`2026-07-09-linea-ruta-coloreada-design.md`) dibuja correctamente el `path` de cada ruta en el mapa, pero el `path` sembrado hoy en `scripts/seed-data/build-routes.mjs` se genera como línea recta entre paradas consecutivas (`path: stops.map(stop => [stop.lat, stop.lng])`). Al revisar el PDF oficial de cada línea (`docs/rutas-gad-machala/Linea-N.pdf`), la ruta real sigue calles concretas (ej. Línea 1: Av. Ferroviaria → Av. Panamericana → Cdla. 10 de Agosto → ...), no líneas rectas que cruzan por encima de manzanas.

Se confirmó viabilidad técnica: el servidor público de ruteo OSRM (`router.project-osrm.org`) es alcanzable desde este entorno y devuelve geometría real de calles para coordenadas de Machala (probado con El Cambio → Universidad).

Queda **fuera de alcance**:
- La grabación GPS del conductor (`saveRecordedPath` en `src/services/routeService.js`) — sigue reemplazando el `path` sin comparación de calidad, sin cambios.
- Trazado manual completo de las 19 líneas — solo se usa como escape puntual por línea si OSRM no convence para alguna en particular, no como estrategia general.
- Cualquier cambio en `BusMap.jsx` o `PassengerView.jsx` — ya consumen `path` correctamente desde la feature anterior.

## Diseño

**`scripts/seed-data/build-routes.mjs`:**

- Por cada ruta, en vez de `path = stops.map(...)`, se llama una vez a OSRM con todas las coordenadas de sus paradas en orden:
  `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2};...?overview=full&geometries=geojson`
- Si la respuesta trae `code: "Ok"`, se toma `routes[0].geometry.coordinates` (formato `[lng, lat]`) y se convierte a `[lat, lng]` para mantener la convención existente del proyecto — ese array pasa a ser el nuevo `path`.
- Se agrega un delay de ~300ms entre llamadas a OSRM (cortesía con el servidor público de demo, evitar rate-limiting).

**Manejo de errores:** si la llamada a OSRM falla (sin red, timeout, `code !== "Ok"`, o cualquier excepción), esa ruta específica cae automáticamente a la línea recta actual (`stops.map(...)`) y se imprime un warning en consola con el id de la ruta afectada. El build nunca falla por un error de red en una sola línea.

**Escape manual por ruta:** `routes-raw.json` puede declarar opcionalmente un campo `path` (array de `[lat, lng]`) en la entrada de una ruta. Si está presente, `build-routes.mjs` usa esos puntos directamente como `path` y no llama a OSRM para esa ruta. Esto da una salida manual puntual si el resultado de OSRM no convence para alguna línea en particular, sin necesitar rediseñar el script.

**Piloto antes de aplicar a las 19 líneas:** `build-routes.mjs` acepta un flag opcional `--only=id1,id2,...` (ej. `--only=linea-1,linea-6`). Cuando está presente, solo esas rutas llaman a OSRM; el resto usa la línea recta de siempre (mismo camino que el fallback por error). Flujo de piloto:
1. Correr `node scripts/seed-data/build-routes.mjs --only=linea-1,linea-6`.
2. Correr `npm run seed:routes` para subir a Firebase.
3. Revisar en el navegador (vista Pasajero) Línea 1 y Línea 6 contra sus PDFs.
4. Si convence, correr `build-routes.mjs` sin `--only` (las 19 líneas) y volver a `seed:routes`.
5. Si alguna línea puntual no convence, agregarle su `path` manual en `routes-raw.json` y volver a correr solo esa línea con `--only`.

**Datos existentes en Firebase:** el usuario confirmó que ya grabó un recorrido de prueba real vía GPS, y que no hay problema en que el re-seed lo sobrescriba — no se necesita lógica de preservación de paths grabados.

## Verificación

1. Con `--only=linea-1`, confirmar que `routes.json` para `linea-1` tiene un `path` con muchos más puntos que paradas, y que esos puntos, vistos en el mapa, siguen calles (no cortan en diagonal por manzanas).
2. En el navegador, Línea 1 se ve como una línea que sigue las calles del PDF (Av. Ferroviaria, Av. Panamericana, etc.), no una poligonal recta entre paradas.
3. Con `--only` omitido, las 19 líneas generan `path` vía OSRM sin que el script falle (revisar consola por warnings de fallback).
4. Simular un fallo de OSRM (ej. coordenada inválida) y confirmar que esa ruta cae a línea recta sin romper el resto del build.
5. Si se agrega un `path` manual a una ruta en `routes-raw.json`, confirmar que el build la usa tal cual y no llama a OSRM para esa ruta.
