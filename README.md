# Club Angels Gymnastics – PWA de gestión

App web instalable en Android (PWA). Hosting: **GitHub Pages**. Base de datos: **Google Sheets** a través de un **Google Apps Script** que actúa como API.

> GitHub Pages solo sirve archivos estáticos (no ejecuta PHP). Por eso el "servidor" es el script de Google (código `.gs`, sintaxis JavaScript), gratis y sin hosting adicional.

```
index.html · config.js · sync.js · sw.js · manifest.webmanifest · icons/
apps-script/Codigo.gs        ← se pega en Google Apps Script (NO es para GitHub)
plantilla/Angels_BD.xlsx     ← plantilla de la base de datos (NO es para GitHub)
```

## 1. Crear la base de datos en Google Sheets
1. Entra a <https://drive.google.com> → **Nuevo → Subir archivo** → sube `plantilla/Angels_BD.xlsx`.
2. Ábrelo con **Hojas de cálculo de Google** y, dentro, **Archivo → Guardar como hoja de cálculo de Google**.
3. Verifica que existan las pestañas `Gimnastas`, `Pagos` y `Asistencia` (no cambies la fila 1).

## 2. Crear la API (Apps Script)
1. En esa hoja: **Extensiones → Apps Script**.
2. Borra el contenido y pega todo `apps-script/Codigo.gs`.
3. Cambia `CLAVE = 'CAMBIA_ESTA_CLAVE'` por una clave larga propia (ej. 20+ caracteres).
4. Selecciona la función **`configurar`** → **Ejecutar** → acepta los permisos.
5. **Implementar → Nueva implementación → Tipo: Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. Copia la **URL de la aplicación web** (termina en `/exec`).

> Si luego editas `Codigo.gs`, haz **Implementar → Administrar implementaciones → Editar → Nueva versión**; la URL se mantiene.

## 3. Publicar en GitHub
1. Abre `config.js` y pega la URL en `API_URL`.
2. Sube **el contenido** de esta carpeta (excepto `apps-script/` y `plantilla/`, que son opcionales) a la raíz del repositorio `ANGELS`.
3. **Settings → Pages**: rama `main`, carpeta `/ (root)`.
4. Sitio: <https://oscaroviedo13.github.io/ANGELS/>

## 4. Instalar en Android
1. Abre la URL en **Chrome** del celular.
2. Pulsa **Conexión** y escribe la clave (la misma de `CLAVE`). Queda guardada solo en ese celular.
3. Pulsa **Instalar app** (o menú ⋮ → *Instalar aplicación*).

## Cómo funciona
- Sin internet: todo se guarda localmente y los cambios quedan en cola; al volver la conexión se envían solos.
- El estado se ve en el encabezado (Sincronizado / Pendiente / Sin conexión). **Sincronizar** fuerza la actualización.
- Cada sincronización descarga el estado de la hoja, así varios celulares ven los mismos datos.
- Si dos personas editan **la misma ficha** a la vez, gana el último cambio enviado.

## Seguridad y privacidad
- La hoja contiene datos de menores: no la compartas de forma abierta y activa verificación en dos pasos en la cuenta de Google.
- La clave protege la API pero no está cifrada en tránsito más allá de HTTPS; es un control básico, no un sistema de usuarios.
- Los archivos (foto, documento, EPS) **no** se guardan; igual que antes, se envían por WhatsApp.

## Actualizaciones
Para forzar que los celulares tomen una nueva versión de la app, sube los archivos y cambia `CACHE = 'angels-v1'` a `angels-v2` en `sw.js`.
