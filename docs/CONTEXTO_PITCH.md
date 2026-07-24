# Contexto de BusTrack El Oro — para preguntas del jurado

Resumen rápido (técnico + negocio) por si preguntan algo que no entra en el pitch de 3:30 min. Detalle técnico completo en [FUNCIONALIDADES.md](FUNCIONALIDADES.md); stack e instalación en el [README](../README.md).

## ¿Qué es?

App de rastreo de buses urbanos en tiempo real para El Oro, Ecuador. Dos vistas en una sola app: **Conductor** (transmite su posición) y **Pasajero** (ve los buses en vivo, ETA y avisos). Sin hardware externo — el celular del conductor es el GPS.

## El problema que resuelve

Encuesta propia a usuarios de transporte urbano en Machala (INNOVA UTMACH 2026): la queja principal es no saber cuándo llega el bus ni si ya pasó, lo que genera esperas largas e inciertas. No existe hoy un sistema público de rastreo para las 20 líneas de la ciudad.

## Cómo funciona (técnico)

- **Stack:** React + Vite (frontend), Firebase Realtime Database (datos en vivo), Leaflet + OpenStreetMap (mapa), Capacitor (empaquetado a APK Android).
- **Sin hardware externo:** el conductor abre la app, elige su ruta/unidad, y su celular transmite `lat/lng/velocidad/rumbo` a Firebase cada pocos segundos mientras dura el viaje. Esa es la diferencia clave frente a un sistema AVL tradicional, que necesita comprar, instalar y mantener un dispositivo GPS dedicado por cada bus.
- **Sin login:** se genera un `deviceId` local (UUID en `localStorage`); el usuario solo elige su rol (Conductor/Pasajero). Cero fricción de registro.
- **Rutas reales:** las 20 líneas se trazaron sobre las calles reales (no líneas rectas) combinando los PDFs oficiales del GAD Machala con OpenStreetMap/OSRM.
- **ETA real:** se calcula proyectando el bus y la parada sobre ese trazado real y midiendo distancia a lo largo de la ruta (no en línea recta), usando el rumbo del bus para no confundir el tramo de ida con el de vuelta en calles paralelas.
- **Funciones ya construidas:** mapa en vivo con estado de señal, aviso de proximidad configurable (1–15 min) con notificación local, reporte de incidentes del conductor visible en tiempo real al pasajero, detección de baches por acelerómetro (se registran, aún no se muestran en el mapa del pasajero), buscador "¿A dónde vas?" para quien no conoce los números de ruta, y botón de ciudades con "Próximamente" para Pasaje/El Guabo/Santa Rosa.
- **Escalabilidad de código:** agregar otro cantón de El Oro no requiere tocar la app — solo trazar sus rutas con el script `build-routes.mjs` y sembrarlas en Firebase.
- **Demo para el jurado:** además del APK Android, la app corre como PWA (se instala desde el navegador con "Agregar a inicio", sin tienda de apps) para que quien tenga iPhone también pueda probarla escaneando un QR.

## Modelo de negocio: B2G

- **Es B2G (Business to Government), no B2C.** El pasajero usa la app gratis; quien paga es el **GAD** (municipal o provincial) o la cooperativa/operadora de transporte, no el ciudadano.
- **¿Por qué pagaría el GAD?** Movilidad urbana y transparencia del servicio de transporte público son responsabilidad municipal; hoy no tienen visibilidad de sus propias rutas. Es una herramienta de gestión y de cara al ciudadano, no solo "una app más".
- **Ventaja de costo frente a la competencia (sistemas AVL tradicionales):** no hay hardware que comprar ni instalar por unidad — el conductor ya tiene el GPS en su bolsillo. Eso baja drásticamente el costo de arranque comparado a flotas con dispositivos GPS dedicados.
- **Modelo propuesto:** licencia tipo SaaS (mensual o anual) al GAD, escalable por cantón/número de rutas — mismo producto, se cobra según cobertura, no por unidad de hardware.
- **Escalabilidad comercial:** el mismo motor sirve para cualquier cantón de la provincia (o del país) sin reescribir la app, lo que abarata cada expansión y es un argumento fuerte para el jurado sobre crecimiento futuro.

## Limitaciones honestas (por si las preguntan directo)

- Depende de que el celular del conductor tenga datos móviles activos — no funciona sin conexión a internet.
- No hay todavía validación contra un conductor que reporte una posición falsa (antifraude) — es un riesgo conocido, no resuelto aún.
- No hay un número exacto de costo comparado a un sistema AVL tradicional; el argumento de ahorro es cualitativo (sin hardware) más que una cifra calculada.
- Los baches detectados se guardan pero todavía no se ven en el mapa del pasajero.
