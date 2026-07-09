# Trazado de ruta siguiendo calles reales (OSRM)

**Fecha:** 2026-07-09
**Estado:** Aprobado, implementado (Task 1) y revisado tras piloto real. Ver "Revisión post-piloto" al final — cambia la fuente principal de datos.

## Revisión post-piloto (mismo día)

El piloto de Línea 1/Línea 6 con el método original (OSRM enrutando entre las paradas geocodificadas) mostró un problema de fondo: las "paradas" (`pois.json`) son puntos de referencia cercanos a la ruta, no puntos por los que el bus literalmente pasa — OSRM snapeaba el punto "Universidad" a un camino interno del campus (`Via A Unidad Académica de Ciencias Sociales`) en vez de la avenida real (Av. 25 de Junio). Además, se descubrió que **17 de los 45 lugares en `pois.json` (38%) nunca se geocodificaron** y comparten una coordenada placeholder idéntica (`-3.2586, -79.9606`) — un problema de datos más grave que el de enrutamiento.

Investigando alternativas, se encontró que **OpenStreetMap ya tiene las 20 líneas de Machala mapeadas como relaciones `route=bus` reales**, digitalizadas por la comunidad de OSM con nombres como `Linea 1 El Cambio - Mercado 25 de Junio` — que coincide con el orden de paradas ya usado en `routes-raw.json`. Se probó extraer la geometría de esa relación para Línea 1 vía Overpass API: 52 segmentos de vía (excluyendo miembros `role=platform/stop`, que son las paradas, no la calle) encadenados correctamente, con solo un hueco de 445m en toda la ruta.

**Nueva fuente principal de datos:** en vez de generar `path` enrutando con OSRM entre las paradas geocodificadas, se busca la relación de bus de OSM que corresponde a cada línea (por nombre, ej. `Linea {N} {primera parada} - {última parada}`), se trae su geometría completa vía Overpass, se descartan los miembros que son paradas (no calle), y se encadenan los segmentos de vía en orden. Si queda algún hueco grande entre segmentos consecutivos (mapeo incompleto de OSM), se rellena con una llamada puntual a OSRM entre los dos extremos del hueco. El método anterior (OSRM enrutando entre paradas, ya implementado en Task 1) pasa a ser el **fallback**: se usa solo si no se encuentra una relación de OSM para esa línea. La línea recta entre paradas sigue siendo el último fallback si todo lo demás falla.

El problema de los 17 POIs sin geocodificar queda **fuera de alcance de esta spec** — no bloquea la generación del `path` (que ahora viene de la relación de OSM, no de las paradas), pero sigue pendiente para la precisión de los marcadores de parada en el mapa. Se registra como mejora futura, no se resuelve aquí.

## Revisión post-piloto v2 (mismo día): falta la vuelta

El piloto con una sola relación de OSM por línea (Task 3) mejoró mucho la fidelidad a las calles, pero el usuario notó, comparando contra el PDF, que solo se dibuja "la ida" — falta el resto del recorrido para cerrar el circuito de vuelta al punto de partida.

Investigando: cada línea tiene **dos** relaciones de bus en OSM (ej. `Linea 1 El Cambio - Mercado 25 de Junio` y `Linea 1 Mercado 25 de Junio - El Cambio`), pero **ninguna de las dos por sí sola cubre el recorrido completo** — la comunidad de OSM partió cada línea en dos mitades que se unen en un punto compartido (para Línea 1, cerca de Puerto Bolívar; para Línea 6, en otro punto), no en "ida completa" + "vuelta completa" independientes. Verificado con Overpass en ambas líneas piloteadas: el extremo de una relación coincide con el extremo de la otra con solo 0-6 metros de separación — evidencia clara de que son dos mitades de un mismo circuito, no dos relaciones independientes.

**Ajuste al diseño:** cuando existan las dos relaciones de una línea, se combinan automáticamente: se calculan sus 4 posibles emparejamientos de extremos (inicio-inicio, inicio-fin, fin-inicio, fin-fin), se toma el emparejamiento con menor distancia, y si esa distancia es menor a ~50m (umbral conservador, con margen holgado sobre los 0-6m observados) se concatenan en ese punto de unión (rellenando con OSRM si el hueco no es cero). Si las dos relaciones no encajan así (unión mayor a 50m), se usa solo una por coincidencia de nombre con la primera/última parada, igual que en Task 3 — esto cubre el caso de que ambas relaciones sean, en algunas líneas, recorridos independientes ya completos.

Si tras este ajuste el resultado visual sigue sin convencer, el usuario pidió pasar a trazar manualmente desde el PDF esa línea puntual, aunque sea más lento, en vez de seguir iterando con métodos automáticos.

## Revisión post-piloto v3 (mismo día): desvío por Av. Ferroviaria en el regreso de Línea 1

El piloto v3 (Task 6) combinó correctamente las dos relaciones de Línea 6, pero el usuario notó, comparando contra el PDF, que el tramo de regreso de **Línea 1** tiene un desvío por Av. Ferroviaria que no corresponde — el PDF indica que ese tramo va por Av. 25 de Junio, cerca del redondel donde cruzan Av. Dr. José Arízaga Vega y Av. Edgar Córdova Polo.

Investigando la causa con Overpass: dentro de la relación de "regreso" de Línea 1 (16761814), los 69 segmentos de vía (`way` members) **no están en orden de recorrido** — hay un grupo de ~27 segmentos (un tramo real de la ruta, probablemente el acceso a "El Cambo") insertado en una posición incorrecta de la lista de miembros, generando un salto de 5.6km que el algoritmo de `stitchRelationPath` (Task 3/5) rellenaba con una llamada a OSRM. Al no tener ningún punto intermedio real que seguir, OSRM calculaba su propia ruta "más corta" entre los dos extremos del salto, que resultó ser justo el desvío por Ferroviaria que el usuario detectó — el defecto no era de datos faltantes, sino del algoritmo de encadenado, que asumía (incorrectamente) que el orden de los miembros de una relación de OSM refleja el orden real de recorrido.

**Corrección:** se reemplaza el encadenado secuencial (`stitchRelationPath` recorriendo los `ways` en el orden dado por la relación, rellenando huecos grandes con OSRM) por un algoritmo de **fusión de fragmentos por vecino más cercano** (greedy fragment-merging): cada segmento de vía se trata como un fragmento independiente; en cada paso se buscan los dos fragmentos (y su orientación) cuyos extremos queden más cerca entre sí, y se fusionan; se repite hasta quedar con un solo fragmento. Esto no asume ningún orden previo en los datos de OSM — reconstruye el orden real de recorrido a partir de la geometría. Validado con datos reales: para la relación de regreso de Línea 1, el hueco máximo bajó de 5657m (con el algoritmo secuencial) a 19m (con fusión de fragmentos); el resultado combinado de ambas relaciones de Línea 1 (ida + regreso) con este algoritmo forma un **loop cerrado** de 767 puntos (empieza y termina en el mismo punto), con un único hueco residual de 445m (dentro del umbral de parche de OSRM ya existente, sin desvíos largos).

Este cambio reemplaza el algoritmo de encadenado dentro de `stitchRelationPath`, usado tanto para el caso de una sola relación (Task 3) como para cada relación individual antes de combinarlas (Task 5) — aplica a las 20 líneas, no solo a Línea 1, y no requiere trazado manual.

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
