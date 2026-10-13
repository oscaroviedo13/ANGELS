/**
 * Club Angels Gymnastics – intermediario PWA -> KoboToolbox (Cloudflare Worker)
 *
 * Por qué existe: KoboToolbox no permite CORS en sus servidores públicos, así que el navegador no
 * puede enviarle datos directamente. La app envía aquí y este Worker reenvía a Kobo (OpenRosa/XML).
 *
 * TODA LA CONFIGURACIÓN ESTÁ EN EL BLOQUE "CONFIG" DE ABAJO. No necesitas variables de Cloudflare
 * (si existe la variable CLAVE en Cloudflare, esa tiene prioridad sobre CLAVE_RESPALDO).
 * Diagnóstico: abre  https://TU-WORKER.workers.dev/?diag=1  en el navegador.
 */
const CONFIG = {
  KOBO_USUARIO: 'oscaroviedo13',          // <- tu NOMBRE DE USUARIO de Kobo (no el correo)
  KOBO_SERVIDOR: 'kc.kobotoolbox.org',    // kc.kobotoolbox.org (entras por kf.) · kc-eu.kobotoolbox.org (entras por eu.)
  FORM_ID: 'aCfzo7vuit7qxwBBtf5ns7',     // ID que Kobo asignó al implementar (sale en /formList como <formID>)
  ALLOWED_ORIGIN: 'https://oscaroviedo13.github.io',
  CLAVE_RESPALDO: 'CAMBIA_ESTA_CLAVE'     // clave que se escribe en el celular (si no usas el secreto CLAVE)
};
function cfg(env) {
  return {
    submit: 'https://' + CONFIG.KOBO_SERVIDOR + '/' + CONFIG.KOBO_USUARIO + '/submission',
    formId: CONFIG.FORM_ID,
    origin: CONFIG.ALLOWED_ORIGIN,
    clave: (env && env.CLAVE) || CONFIG.CLAVE_RESPALDO
  };
}

const WORKER_VERSION = '1.3.3';
const ATLETA = ['id', 'createdAt', 'name', 'birth', 'document', 'age', 'sex', 'blood', 'rh', 'height', 'weight', 'eps',
  'address', 'neighborhood', 'school', 'grade', 'guardian1', 'phone1', 'guardian2', 'phone2', 'modality', 'site',
  'days', 'schedule', 'level', 'coach', 'entryDate', 'photoName', 'idFileName', 'epsFileName', 'plan', 'price',
  'totalClasses', 'remaining', 'attended', 'startDate', 'endDate', 'paidAt', 'payments', 'notes', 'imageMinor', 'imageAdult'];
const PAGO = { id: 'pago_id', athleteId: 'athleteId', amount: 'pago_amount', plan: 'pago_plan', startDate: 'pago_startDate',
  endDate: 'pago_endDate', method: 'pago_method', date: 'pago_date' };

function esc(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convierte una operación de la app en los campos planos del formulario de Kobo. */
export function aCampos(o) {
  const f = { registrado_en: o.ts || new Date().toISOString() };
  if (o.op === 'upsertAthlete' && o.athlete && o.athlete.id) {
    f.tipo = 'gimnasta';
    ATLETA.forEach(function (k) {
      let v = o.athlete[k];
      if (Array.isArray(v)) v = v.join(',');
      f[k] = v;
    });
  } else if (o.op === 'deleteAthlete' && o.id) {
    f.tipo = 'eliminar'; f.athleteId = o.id;
  } else if (o.op === 'addPayment' && o.payment && o.payment.id) {
    f.tipo = 'pago';
    Object.keys(PAGO).forEach(function (k) { f[PAGO[k]] = o.payment[k]; });
  } else if (o.op === 'addAttendance' && o.att && o.att.athleteId) {
    f.tipo = 'asistencia'; f.athleteId = o.att.athleteId; f.asist_date = o.att.date;
  } else return null;
  return f;
}

export function aXml(formId, campos, instanceId) {
  let x = '<?xml version="1.0" encoding="UTF-8"?><data id="' + esc(formId) + '">';
  Object.keys(campos).forEach(function (k) { x += '<' + k + '>' + esc(campos[k]) + '</' + k + '>'; });
  return x + '<meta><instanceID>uuid:' + esc(instanceId) + '</instanceID></meta></data>';
}

function uuidDe(texto) {            // uuid válido y estable a partir del uid de la operación (reintentos = mismo envío)
  let h = 0x811c9dc5, hex = '';
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; }
    hex += ('00000000' + h.toString(16)).slice(-8);
  }
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}

async function enviarAKobo(c, xml) {
  const fd = new FormData();
  fd.append('xml_submission_file', new Blob([xml], { type: 'text/xml' }), 'envio.xml');
  const r = await fetch(c.submit, { method: 'POST', headers: { 'X-OpenRosa-Version': '1.0' }, body: fd });
  let body = ''; try { body = (await r.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300); } catch (e) {}
  return { status: r.status, body: body };   // 201 creado · 202 aceptado · 409 duplicado (ya estaba)
}

/** Página de diagnóstico: comprueba usuario, servidor y formulario de Kobo (no crea ni modifica datos). */
async function diagnostico(c) {
  const filas = [];
  const servidores = ['kc.kobotoolbox.org', 'kc-eu.kobotoolbox.org'];
  let bien = false;
  for (const s of servidores) {
    const url = 'https://' + s + '/' + CONFIG.KOBO_USUARIO + '/formList';
    let st = 0, txt = '';
    try { const r = await fetch(url, { headers: { 'X-OpenRosa-Version': '1.0' } }); st = r.status; txt = await r.text(); } catch (e) { txt = String(e); }
    const ids = (txt.match(/<formID>([^<]+)<\/formID>/g) || []).map(function (x) { return x.replace(/<\/?formID>/g, ''); });
    const esCfg = s === CONFIG.KOBO_SERVIDOR;
    let msg, ok = false;
    if (st === 200 && ids.indexOf(c.formId) > -1) { ok = true; msg = 'Usuario y formulario correctos (formulario "' + c.formId + '" encontrado).'; }
    else if (st === 200) msg = 'El usuario existe pero NO aparece el formulario "' + c.formId + '". Formularios encontrados: ' + (ids.join(', ') || 'ninguno') + '. Implementa el formulario o ajusta FORM_ID.';
    else if (st === 401 || st === 403) msg = 'El usuario existe en este servidor, pero Kobo pide credenciales: activa "Permitir envíos anónimos" (Proyecto > Compartir).';
    else if (st === 404) msg = 'El usuario "' + CONFIG.KOBO_USUARIO + '" NO existe en este servidor.';
    else msg = 'Respuesta inesperada de Kobo (' + st + ').';
    if (ok && esCfg) bien = true;
    filas.push('<tr><td>' + s + (esCfg ? ' <b>(el configurado)</b>' : '') + '</td><td>' + (st || 'sin respuesta') + '</td><td style="color:' + (ok ? '#16835d' : '#b42318') + '">' + (ok ? '✔ ' : '✖ ') + msg + '</td></tr>');
  }
  const resumen = bien ? '✔ TODO CORRECTO: la app puede enviar a Kobo.' : '✖ Hay un problema de configuración. Corrige el bloque CONFIG del Worker según la tabla.';
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico Angels</title>' +
    '<body style="font-family:system-ui;max-width:900px;margin:24px auto;padding:0 14px"><h2>Diagnóstico Worker Angels → Kobo</h2>' +
    '<p><b>Versión del Worker:</b> ' + WORKER_VERSION + '<br><b>Usuario Kobo configurado:</b> ' + CONFIG.KOBO_USUARIO + '<br><b>Servidor configurado:</b> ' + CONFIG.KOBO_SERVIDOR + '<br><b>FORM_ID:</b> ' + c.formId + '<br><b>Clave definida:</b> ' + (c.clave && c.clave !== 'CAMBIA_ESTA_CLAVE' ? 'sí' : '<span style="color:#b42318">NO (cambia CLAVE_RESPALDO)</span>') + '</p>' +
    '<p style="font-size:18px;font-weight:700">' + resumen + '</p>' +
    '<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tr><th>Servidor</th><th>Código</th><th>Resultado</th></tr>' + filas.join('') + '</table></body>';
}

export default {
  async fetch(req, env) {
    const c = cfg(env);
    const origen = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origen === c.origin ? origen : c.origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin'
    };
    const json = (obj, st) => new Response(JSON.stringify(obj), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') {
      if (new URL(req.url).searchParams.get('diag')) return new Response(await diagnostico(c), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return json({ ok: true, mensaje: 'Intermediario Angels -> Kobo activo', version: WORKER_VERSION });
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
    if (origen && origen !== c.origin) return json({ ok: false, error: 'Origen no permitido' }, 403);
    try {
      if (!c.clave || c.clave === 'CAMBIA_ESTA_CLAVE') return json({ ok: false, error: 'Define una CLAVE en el Worker (CLAVE_RESPALDO)' });
      const body = JSON.parse(await req.text());
      if (body.key !== c.clave) return json({ ok: false, error: 'clave' });
      if (body.action === 'test') {
        const rs = await enviarAKobo(c, aXml(c.formId, { tipo: 'prueba', registrado_en: new Date().toISOString() }, crypto.randomUUID()));
        const hint = rs.status === 404 ? 'Usuario o servidor de Kobo incorrectos. Abre la dirección del Worker con ?diag=1 para ver cuál.' :
          (rs.status === 401 || rs.status === 403) ? 'Activa "Permitir envíos anónimos" en Kobo.' :
          rs.status === 400 ? 'El FORM_ID o los campos no coinciden con el XLSForm.' : '';
        return json({ ok: true, status: rs.status, body: rs.body, hint: hint, worker: WORKER_VERSION });
      }
      if (body.action !== 'ops') return json({ ok: false, error: 'Acción no válida' });
      const ops = (body.ops || []).slice(0, 40);
      const done = [], failed = [];
      for (const o of ops) {
        const campos = aCampos(o);
        if (!campos || !o.uid) { if (o.uid) done.push(o.uid); continue; }   // operación inválida: se descarta
        let rs = { status: 0, body: '' };
        try { rs = await enviarAKobo(c, aXml(c.formId, campos, uuidDe(o.uid))); } catch (e) { rs = { status: 0, body: String(e) }; }
        if (rs.status === 201 || rs.status === 202 || rs.status === 409) done.push(o.uid); else failed.push({ uid: o.uid, status: rs.status, body: rs.body });
      }
      return json({ ok: true, done: done, failed: failed });
    } catch (err) {
      return json({ ok: false, error: String(err) });
    }
  }
};
