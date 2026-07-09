# Línea de ruta coloreada en el mapa (vista Pasajero)

**Fecha:** 2026-07-09
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y alcance

Hoy, al elegir una ruta en el selector de la vista Pasajero, el mapa muestra las paradas (`CircleMarker`) y los buses activos, pero no dibuja el trazado de la ruta en sí. El usuario pidió que, al elegir una ruta, se marque también la línea/polyline de esa ruta en el mapa, con un color propio — igual que aparece coloreada en los PDFs oficiales del GAD Machala (`docs/rutas-gad-machala/`).

El modelo de datos ya tiene todo lo necesario — cada ruta en Firebase (`/routes/{routeId}`) ya trae `color` (ej. `"#e63946"`, ver `scripts/seed-data/routes.json:4`) y `path` (array de `[lat, lng]`, sembrado desde los PDFs o grabado por el conductor, ver `feature: 2026-07-07-rutas-reales-identificador-grabacion-design.md`). El hueco es puramente de renderizado: `route.path` nunca llega a `BusMap.jsx`, y no hay ningún `<Polyline>` que lo dibuje.

Queda **fuera de alcance**:
- Vista Conductor (`ConductorView.jsx`) — no se toca.
- Distinguir visualmente rutas "grabadas" (trazado real por GPS) de rutas "no grabadas" (línea recta entre paradas, menor fidelidad) — posible mejora futura, no ahora.
- Mostrar varias rutas a la vez — el usuario confirmó que solo se muestra la ruta actualmente seleccionada, igual que hoy solo se muestran los buses/paradas de esa ruta.

## Diseño

**`src/components/passenger/PassengerView.jsx`** (línea 41-46): se agrega la prop `path={route?.path}` al `<BusMap>`, junto a las props existentes (`buses`, `stops`, `routeColor`, `passengerPosition`).

**`src/components/passenger/BusMap.jsx`**:
- `BusMap` (línea 63) recibe la nueva prop `path`.
- Se agrega un `<Polyline positions={path} pathOptions={{ color: routeColor ?? '#1a2b4a', weight: 3 }} />`, renderizado solo si `path?.length >= 2` (mismo guard que ya usa `BusTrack` en línea 59, evita crash con rutas sin path o con un solo punto).
- Se ubica antes de los marcadores de paradas/buses en el JSX, para que quede debajo visualmente (los círculos de paradas y los íconos de bus no quedan tapados por la línea).
- Se diferencia del track en vivo del bus (`BusTrack`, línea 57-61, que usa `weight: 4, opacity: 0.7`) usando `weight: 3` sin `opacity` reducida — el trazado oficial de la ruta se ve como línea de fondo, el track en vivo del bus se nota más grueso/translúcido encima. No se introduce un color distinto porque ambos representan la misma ruta; la diferencia de grosor/opacidad basta para no confundirlos.

**Comportamiento resultante:** al cambiar de ruta en el `<select>` (línea 59 de `PassengerView.jsx`), React re-renderiza `BusMap` con el nuevo `route.path` y `route.color` — la polyline anterior se reemplaza automáticamente, sin lógica adicional de limpieza.

**Manejo de errores:** si una ruta no tiene `path` (o tiene menos de 2 puntos), simplemente no se dibuja ninguna línea — el mapa sigue funcionando igual que hoy (paradas + buses), sin mensajes de error ni estados especiales.

## Verificación

1. Levantar la app, entrar como Pasajero, elegir "Línea 1" (o cualquier línea sembrada): confirmar que aparece una línea en el mapa con el color de esa ruta, siguiendo aproximadamente la secuencia de sus paradas.
2. Cambiar a otra línea en el selector: confirmar que la línea anterior desaparece y aparece la nueva, con su propio color.
3. Confirmar que las paradas (círculos) y los buses (íconos) siguen visibles y no quedan ocultos debajo de la polyline.
4. Si existe alguna ruta sembrada sin `path` o con un solo punto, confirmar que el mapa no se rompe (no se dibuja línea, resto de la UI normal).
