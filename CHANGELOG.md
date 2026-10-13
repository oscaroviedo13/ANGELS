# Historial de versiones – Angels PWA

Formato: MAYOR.MENOR.PARCHE. La versión vigente está en `version.js` (se muestra en la app bajo el estado de envío y en *Seguimiento*).
Al publicar: 1) cambia `app` y `fecha` en `version.js`, 2) añade una entrada aquí, 3) sube a GitHub, 4) crea la etiqueta/Release `vX.Y.Z`.
Si cambias `worker/worker.js`, pega también el código en Cloudflare (su versión aparece en *Seguimiento → Probar conexión*).

## 1.3.3 – 2026-10-13
- FORM_ID del Worker = ID asignado por Kobo (aCfzo7vuit7qxwBBtf5ns7).

## 1.3.2 – 2026-10-13
- Worker con bloque CONFIG único (sin variables de Cloudflare salvo CLAVE) y página de diagnóstico ?diag=1; config.js ya trae la URL del Worker.

## 1.3.1 – 2026-10-13
- Número de versión visible al final de la pantalla (pie de página).

## 1.3.0 – 2026-10-13
- Control de versiones: `version.js`, versión visible en la app, caché del service worker ligada a la versión.
- Aviso "Hay una versión nueva" con botón Actualizar (el celular detecta cambios cada 5 min y al volver a la app).
- El service worker ya no usa la caché HTTP del navegador al buscar archivos nuevos.
- Worker: informa su versión.

## 1.2.0 – 2026-10-13
- Botón *Seguimiento* (historial de envíos, prueba de conexión con Kobo, reintento).
- Borrado total en el dispositivo (datos, cola, clave, caché, service worker).
- Migración única que descarta restos de la versión con Google Sheets.
- Worker: detalle del error de Kobo y acción de prueba.

## 1.1.0 – 2026-10-13
- Los datos se envían a KoboToolbox mediante un Worker de Cloudflare (reemplaza Google Sheets). Solo envío.

## 1.0.0 – 2026-10-13
- Primera versión PWA instalable con sincronización a Google Sheets (Apps Script).
