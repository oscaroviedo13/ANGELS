/**
 * Club Angels Gymnastics – intermediario PWA -> KoboToolbox (Cloudflare Worker)
 *
 * Por qué existe: KoboToolbox no permite CORS en sus servidores públicos, así que el
 * navegador no puede enviarle datos directamente. La app envía aquí y este Worker
 * reenvía a Kobo como envíos OpenRosa (XML).
 *
 * Variables (Settings > Variables and Secrets del Worker):
 *   CLAVE         (Secret)  clave de acceso que se escribe en cada celular
 *   KOBO_SUBMIT   (Texto)   https://kc.kobotoolbox.org/TU_USUARIO_KOBO/submission
 *                           (servidor UE: https://kc-eu.kobotoolbox.org/TU_USUARIO_KOBO/submission)
 *   FORM_ID       (Texto)   angels_registros
 *   ALLOWED_ORIGIN(Texto)   https://oscaroviedo13.github.io
 */
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

async function enviarAKobo(env, xml) {
  const fd = new FormData();
  fd.append('xml_submission_file', new Blob([xml], { type: 'text/xml' }), 'envio.xml');
  const r = await fetch(env.KOBO_SUBMIT, { method: 'POST', headers: { 'X-OpenRosa-Version': '1.0' }, body: fd });
  return r.status;                   // 201 creado · 202 aceptado · 409 duplicado (ya estaba)
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origen === env.ALLOWED_ORIGIN ? origen : env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin'
    };
    const json = (obj, st) => new Response(JSON.stringify(obj), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') return json({ ok: true, mensaje: 'Intermediario Angels -> Kobo activo' });
    if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
    if (origen && origen !== env.ALLOWED_ORIGIN) return json({ ok: false, error: 'Origen no permitido' }, 403);
    try {
      if (!env.CLAVE || !env.KOBO_SUBMIT || !env.FORM_ID) return json({ ok: false, error: 'Faltan variables en el Worker' });
      const body = JSON.parse(await req.text());
      if (body.key !== env.CLAVE) return json({ ok: false, error: 'clave' });
      if (body.action !== 'ops') return json({ ok: false, error: 'Acción no válida' });
      const ops = (body.ops || []).slice(0, 40);
      const done = [], failed = [];
      for (const o of ops) {
        const campos = aCampos(o);
        if (!campos || !o.uid) { if (o.uid) done.push(o.uid); continue; }   // operación inválida: se descarta
        let st = 0;
        try { st = await enviarAKobo(env, aXml(env.FORM_ID, campos, uuidDe(o.uid))); } catch (e) { st = 0; }
        if (st === 201 || st === 202 || st === 409) done.push(o.uid); else failed.push({ uid: o.uid, status: st });
      }
      return json({ ok: true, done: done, failed: failed });
    } catch (err) {
      return json({ ok: false, error: String(err) });
    }
  }
};
