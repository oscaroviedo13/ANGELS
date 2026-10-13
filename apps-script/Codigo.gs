/**
 * Club Angels Gymnastics – API para la PWA (Google Apps Script)
 * Script vinculado a la hoja de cálculo: Extensiones > Apps Script.
 *
 * 1) Cambia CLAVE por una clave larga y propia (la escribirás una vez en cada celular).
 * 2) Ejecuta la función "configurar" una vez (pide permisos y deja las hojas listas).
 * 3) Implementar > Nueva implementación > Aplicación web
 *      Ejecutar como: Yo   |   Quién tiene acceso: Cualquier usuario
 * 4) Copia la URL que termina en /exec y pégala en config.js del repositorio.
 */
const CLAVE = 'CAMBIA_ESTA_CLAVE';

const HOJAS = {
  Gimnastas: ['id', 'createdAt', 'name', 'birth', 'document', 'age', 'sex', 'blood', 'rh', 'height', 'weight', 'eps',
    'address', 'neighborhood', 'school', 'grade', 'guardian1', 'phone1', 'guardian2', 'phone2', 'modality', 'site',
    'days', 'schedule', 'level', 'coach', 'entryDate', 'photoName', 'idFileName', 'epsFileName', 'plan', 'price',
    'totalClasses', 'remaining', 'attended', 'startDate', 'endDate', 'paidAt', 'payments', 'notes', 'imageMinor', 'imageAdult'],
  Pagos: ['id', 'athleteId', 'amount', 'plan', 'startDate', 'endDate', 'method', 'date'],
  Asistencia: ['athleteId', 'date']
};
const NUMERICAS = {
  Gimnastas: ['price', 'totalClasses', 'remaining', 'attended'],
  Pagos: ['amount', 'plan'],
  Asistencia: []
};

/** Ejecutar UNA vez desde el editor: crea hojas/encabezados y fuerza formato texto (evita que Sheets convierta fechas y teléfonos). */
function configurar() {
  asegurarHojas_(true);
  SpreadsheetApp.getActiveSpreadsheet().toast('Hojas listas. Ahora implementa como aplicación web.');
}

function asegurarHojas_(formato) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HOJAS).forEach(function (nombre) {
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    const cols = sh.getLastColumn();
    const actual = cols ? sh.getRange(1, 1, 1, cols).getValues()[0].map(String) : [];
    HOJAS[nombre].forEach(function (c) {
      if (actual.indexOf(c) === -1) { sh.getRange(1, actual.length + 1).setValue(c); actual.push(c); }
    });
    if (formato) {
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, actual.length).setBackground('#142642').setFontColor('#ffffff').setFontWeight('bold');
      const filas = Math.max(sh.getMaxRows() - 1, 1);
      actual.forEach(function (c, i) {
        const num = NUMERICAS[nombre].indexOf(c) > -1;
        sh.getRange(2, i + 1, filas, 1).setNumberFormat(num ? '0' : '@');
      });
    }
  });
}

function hoja_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }

function valor_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

function leer_(nombre) {
  const sh = hoja_(nombre);
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2) return [];
  const vals = sh.getRange(1, 1, lr, lc).getValues();
  const head = vals[0].map(String);
  return vals.slice(1)
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) {
      const o = {};
      head.forEach(function (h, i) { if (h) o[h] = valor_(r[i]); });
      return o;
    });
}

function cabecera_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

function filaDe_(head, obj, previa) {
  return head.map(function (h, i) {
    if (obj.hasOwnProperty(h)) {
      let v = obj[h];
      if (Array.isArray(v)) v = v.join(',');
      return v === null || v === undefined ? '' : v;
    }
    return previa ? previa[i] : '';   // conserva columnas extra que añadas a mano
  });
}

function buscarFila_(sh, colNombre, valor) {
  const lr = sh.getLastRow();
  if (lr < 2) return -1;
  const col = cabecera_(sh).indexOf(colNombre) + 1;
  const vals = sh.getRange(2, col, lr - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (String(valor_(vals[i][0])) === String(valor)) return i + 2;
  return -1;
}

function upsertGimnasta_(a) {
  if (!a || !a.id) return;
  const sh = hoja_('Gimnastas');
  const head = cabecera_(sh);
  const fila = buscarFila_(sh, 'id', a.id);
  if (fila > 0) {
    const previa = sh.getRange(fila, 1, 1, head.length).getValues()[0];
    sh.getRange(fila, 1, 1, head.length).setValues([filaDe_(head, a, previa)]);
  } else {
    sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues([filaDe_(head, a, null)]);
  }
}

function agregarPago_(p) {
  if (!p || !p.id) return;
  const sh = hoja_('Pagos');
  if (buscarFila_(sh, 'id', p.id) > 0) return;       // idempotente
  const head = cabecera_(sh);
  sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues([filaDe_(head, p, null)]);
}

function agregarAsistencia_(x) {
  if (!x || !x.athleteId || !x.date) return;
  const sh = hoja_('Asistencia');
  const ya = leer_('Asistencia').some(function (r) { return String(r.athleteId) === String(x.athleteId) && String(r.date) === String(x.date); });
  if (ya) return;
  const head = cabecera_(sh);
  sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues([filaDe_(head, x, null)]);
}

function eliminarGimnasta_(id) {
  const sg = hoja_('Gimnastas');
  const f = buscarFila_(sg, 'id', id);
  if (f > 0) sg.deleteRow(f);
  const sa = hoja_('Asistencia');
  const lr = sa.getLastRow();
  if (lr < 2) return;
  const col = cabecera_(sa).indexOf('athleteId') + 1;
  const vals = sa.getRange(2, col, lr - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(id)) sa.deleteRow(i + 2);
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return responder_({ ok: true, mensaje: 'API Club Angels activa. Usa POST desde la app.' });
}

function doPost(e) {
  try {
    if (CLAVE === 'CAMBIA_ESTA_CLAVE') return responder_({ ok: false, error: 'Define una CLAVE propia en el script' });
    const body = JSON.parse(e.postData.contents);
    if (body.key !== CLAVE) return responder_({ ok: false, error: 'clave' });

    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      asegurarHojas_(false);
      if (body.action === 'all') {
        return responder_({
          ok: true,
          athletes: leer_('Gimnastas'),
          payments: leer_('Pagos'),
          attendance: leer_('Asistencia')
        });
      }
      if (body.action === 'ops') {
        (body.ops || []).forEach(function (o) {
          if (o.op === 'upsertAthlete') upsertGimnasta_(o.athlete);
          else if (o.op === 'deleteAthlete') eliminarGimnasta_(o.id);
          else if (o.op === 'addPayment') agregarPago_(o.payment);
          else if (o.op === 'addAttendance') agregarAsistencia_(o.att);
        });
        SpreadsheetApp.flush();
        return responder_({ ok: true, aplicadas: (body.ops || []).length });
      }
      return responder_({ ok: false, error: 'Acción no válida' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return responder_({ ok: false, error: String(err) });
  }
}
