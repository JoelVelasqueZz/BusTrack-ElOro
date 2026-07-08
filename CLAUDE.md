\# BusTrack El Oro — INNOVA UTMACH 2026



\## Proyecto activo

webapp React + Firebase + Capacitor → APK Android

Sistema de rastreo de buses urbanos para El Oro, Ecuador

Sin hardware externo — el celular del conductor es el GPS



\## Estado actual

\- PLAN.md creado con las 33 tareas en 7 fases

\- package.json creado (Fase 0 iniciada pero no completada)

\- Pendiente: completar Fase 0 desde Tarea 1



\## Cuando retomes

1\. Lee PLAN.md

2\. Continúa desde Fase 0, Tarea 1 (scaffold Vite React)

3\. Ten listas las claves de Firebase antes de la Tarea 5



\## Stack

React + Vite · Firebase Realtime DB · Leaflet.js · Capacitor · Android



\## Decisiones clave

\- Una sola app, dos vistas: Conductor y Pasajero

\- Sin login — selector de rol + deviceId en localStorage

\- Rutas hardcodeadas en src/config/machala.js

\- GPS primer plano + Wake Lock

\- Notificaciones locales cuando bus está a 2 minutos

\- Cobertura: toda la provincia de El Oro, no solo Machala

