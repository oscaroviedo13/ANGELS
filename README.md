# Club Angels Gymnastics – PWA de gestión (envío a KoboToolbox)

App web instalable en Android (PWA) en **GitHub Pages**. Los datos se guardan en el celular y se **envían a KoboToolbox**.

```
GitHub Pages (app)  ──►  Cloudflare Worker (intermediario)  ──►  KoboToolbox
```

> KoboToolbox **no permite CORS** en sus servidores públicos: el navegador no puede enviarle datos directamente. Por eso el Worker (gratis) recibe lo que envía la app y lo reenvía a Kobo.

```
index.html · config.js · sync.js · sw.js · manifest.webmanifest · icons/   ← van a GitHub
worker/worker.js · worker/wrangler.toml                                    ← van a Cloudflare (no a GitHub Pages)
kobo/Angels_Formulario_Kobo.xlsx                                           ← se sube a Kobo
```

## 1. Crear el formulario en Kobo
1. En KoboToolbox: **Nuevo proyecto → Subir un XLSForm** → `kobo/Angels_Formulario_Kobo.xlsx`.
2. **Implementar** el formulario.
3. En **Configuración → Compartir**, activa **"Permitir envíos anónimos"** (el Worker envía sin usuario; la clave la controla el Worker).
4. Anota tu **nombre de usuario de Kobo** y el servidor (`kc.kobotoolbox.org` o `kc-eu.kobotoolbox.org`).

## 2. Crear el intermediario (Cloudflare Worker)
1. Crea cuenta gratis en <https://dash.cloudflare.com> → **Workers & Pages → Create → Create Worker** (nombre `angels-kobo`) → **Deploy**.
2. **Edit code**: borra todo, pega `worker/worker.js` y **Deploy**.
3. **Settings → Variables and Secrets → Add**:
   - `CLAVE` (tipo **Secret**): una clave larga propia, ej. `Angels-7kQ2xM9vLp4Rt8Zw`
   - `KOBO_SUBMIT` (Text): `https://kc.kobotoolbox.org/TU_USUARIO_KOBO/submission`
   - `FORM_ID` (Text): `angels_registros`
   - `ALLOWED_ORIGIN` (Text): `https://oscaroviedo13.github.io`
4. Copia la URL del Worker (`https://angels-kobo.TU-USUARIO.workers.dev`). Al abrirla en el navegador debe decir "Intermediario Angels -> Kobo activo".

## 3. Publicar la app en GitHub
1. En `config.js` pega la URL del Worker en `API_URL`.
2. Sube a la raíz del repo `ANGELS` los archivos de la app (sin `worker/` ni `kobo/`). Reemplaza los anteriores y **borra** `apps-script/` y `plantilla/` si estaban.
3. Espera 1–3 min a que Pages publique.

## 4. Usar en Android
1. Abre la URL en Chrome → **Conexión** → escribe la `CLAVE` → *Guardar y enviar*.
2. **Instalar app**.
3. Estado "● Enviado a Kobo" = al día. Sin internet los cambios quedan en cola.

## Cómo quedan los datos en Kobo
Cada acción es **un envío** (registro histórico). Columna `tipo`:
- `gimnasta`: ficha completa. Cada vez que se edita llega **un envío nuevo**; la versión vigente es la **más reciente** por `id`.
- `pago`: un pago (`pago_*`, `athleteId`).
- `asistencia`: `athleteId` + `asist_date`.
- `eliminar`: el gimnasta `athleteId` fue eliminado en la app.

En Kobo filtra por `tipo` y exporta a Excel/CSV; para el estado actual, toma el último `registrado_en` por `id`.

## Limitaciones (importante)
- **Solo envío:** la app no descarga datos de Kobo. Cada celular muestra lo que tiene guardado localmente; dos celulares **no se ven entre sí**. Usa un solo celular principal, o trabaja con la consulta en Kobo.
- **Borrar la copia local** deja la app vacía en ese celular (los datos siguen en Kobo). Usa "Exportar respaldo JSON" antes.
- Los archivos (foto, documento, EPS) no se guardan; se envían por WhatsApp.
- La hoja contiene datos de menores: protege la cuenta de Kobo (contraseña fuerte) y no compartas el proyecto de forma abierta.
- Los envíos anónimos están habilitados en el formulario; la `CLAVE` protege solo el Worker. Si alguien conoce la URL de envío de Kobo podría enviar registros falsos: no la compartas.

## Versiones
- La versión vigente está en **`version.js`** (única fuente). Se ve en la app bajo el estado de envío y en *Seguimiento*.
- Historial en **`CHANGELOG.md`**. Para publicar una versión: `python3 bump.py 1.3.1 "qué cambió"` (actualiza `version.js`, el Worker y el historial), sube a GitHub y crea la etiqueta/Release `v1.3.1`.
- Los celulares revisan cada 5 min si hay versión nueva y muestran el aviso **Actualizar**.
- Si cambias `worker/worker.js`, pega el código también en Cloudflare (su versión sale en *Seguimiento → Probar conexión*).
