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

## Configuración completa (qué va en cada lugar)

| Dónde | Qué | Valor |
|---|---|---|
| **Kobo** | Proyecto | Subir `kobo/Angels_Formulario_Kobo.xlsx` → **Implementar** |
| **Kobo** | Compartir | Activar **Permitir envíos anónimos** |
| **Cloudflare Worker** | Código | Pegar `worker/worker.js` completo (**Edit code → Deploy**) |
| **Cloudflare Worker** | Bloque `CONFIG` (arriba del código) | `KOBO_USUARIO` = tu nombre de usuario de Kobo · `KOBO_SERVIDOR` = `kc.kobotoolbox.org` (o `kc-eu.kobotoolbox.org` si entras por eu.) · `FORM_ID` = `aCfzo7vuit7qxwBBtf5ns7` (el que Kobo muestra en `/formList`) · `ALLOWED_ORIGIN` = `https://oscaroviedo13.github.io` · `CLAVE_RESPALDO` = clave larga propia |
| **Cloudflare Worker** | Variables (opcional) | Solo `CLAVE` (Secret) si prefieres no dejar la clave en el código. Las demás variables ya NO se usan |
| **GitHub `config.js`** | `API_URL` | URL del Worker: `https://angels-kobo.oscaroviedo13.workers.dev` |
| **Celular** | Botón *Conexión* | La misma clave del Worker |

**Comprobar todo de una vez:** abre `https://angels-kobo.oscaroviedo13.workers.dev/?diag=1` en el navegador. Muestra el usuario/servidor/formulario que el Worker ve en Kobo y qué corregir (✔ / ✖). Debe decir "TODO CORRECTO".

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
