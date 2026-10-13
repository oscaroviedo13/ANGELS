/* Capa PWA + envío a KoboToolbox (vía un Worker intermediario).
   - La app sigue funcionando sin conexión con la copia local (localStorage).
   - Cada cambio se detecta comparando contra la última copia sincronizada y se
     pone en una cola; la cola se envía cuando hay internet.
   - Solo ENVÍA: Kobo es el archivo de datos; no se descarga nada de vuelta. */
(function () {
  'use strict';

  var CFG = window.ANGELS_CONFIG || {};
  var K_KEY = 'angels_key', K_QUEUE = 'angels_queue', K_SNAP = 'angels_snap', K_LOG = 'angels_log', K_MODE = 'angels_mode';
  var MODE = 'kobo-1';

  /* Migración única: restos de la versión anterior (Google Sheets) -> se descartan clave, cola y copia sincronizada,
     así los datos que ya están en el celular se reenvían a Kobo y la clave vieja no se reutiliza. */
  try {
    if (localStorage.getItem(K_MODE) !== MODE) {
      localStorage.removeItem(K_KEY); localStorage.removeItem(K_QUEUE); localStorage.removeItem(K_SNAP); localStorage.removeItem(K_LOG);
      localStorage.setItem(K_MODE, MODE);
    }
  } catch (e) {}

  var queue = readJSON(K_QUEUE, []);
  var snap = readJSON(K_SNAP, null);
  var busy = false, deferredInstall = null, BATCH = 25;
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function logEv(msg, ok) {
    var l = readJSON(K_LOG, []);
    l.push({ t: new Date().toISOString(), m: String(msg), ok: ok !== false });
    writeJSON(K_LOG, l.slice(-60));
  }
  function getKey() { return localStorage.getItem(K_KEY) || ''; }
  function urlOk() { return CFG.API_URL && /^https:\/\/[^\s]+$/.test(CFG.API_URL); }
  function configured() { return urlOk() && !!getKey(); }

  /* ---------- Instantánea y cola de cambios ---------- */
  function makeSnap(d) {
    var s = { athletes: {}, payments: [], attendance: [] };
    d.athletes.forEach(function (a) { s.athletes[a.id] = JSON.stringify(a); });
    d.payments.forEach(function (p) { s.payments.push(p.id); });
    d.attendance.forEach(function (x) { s.attendance.push(x.athleteId + '|' + x.date); });
    return s;
  }

  function queueDiff() {
    if (!configured()) return;
    var first = !snap;
    if (first) snap = { athletes: {}, payments: [], attendance: [] };
    var ops = [];
    var ids = {};
    data.athletes.forEach(function (a) {
      ids[a.id] = 1;
      var j = JSON.stringify(a);
      if (snap.athletes[a.id] !== j) { ops.push({ op: 'upsertAthlete', athlete: a }); snap.athletes[a.id] = j; }
    });
    Object.keys(snap.athletes).forEach(function (id) {
      if (!ids[id]) { ops.push({ op: 'deleteAthlete', id: id }); delete snap.athletes[id]; }
    });
    data.payments.forEach(function (p) {
      if (snap.payments.indexOf(p.id) === -1) { ops.push({ op: 'addPayment', payment: p }); snap.payments.push(p.id); }
    });
    var keep = [];
    data.attendance.forEach(function (x) {
      var k = x.athleteId + '|' + x.date;
      keep.push(k);
      if (snap.attendance.indexOf(k) === -1) { ops.push({ op: 'addAttendance', att: x }); }
    });
    snap.attendance = keep;
    ops.forEach(function (o) { o.uid = uid(); o.ts = new Date().toISOString(); });
    if (ops.length) { queue = queue.concat(ops); writeJSON(K_QUEUE, queue); }
    writeJSON(K_SNAP, snap);
  }

  /* ---------- Comunicación con Apps Script ---------- */
  function call(body) {
    // text/plain evita la petición previa (preflight) que Apps Script no soporta
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ key: getKey() }, body))
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || 'Error del servidor'); e.code = j.error; throw e; }
      return j;
    });
  }

  function flush() {
    if (!queue.length) return Promise.resolve();
    queue.forEach(function (o) { if (!o.uid) { o.uid = uid(); o.ts = o.ts || new Date().toISOString(); } });
    var batch = queue.slice(0, BATCH);
    return call({ action: 'ops', ops: batch }).then(function (r) {
      var done = {}; (r.done || []).forEach(function (u) { done[u] = 1; });
      var before = queue.length;
      queue = queue.filter(function (o) { return !done[o.uid]; });
      writeJSON(K_QUEUE, queue);
      var fails = r.failed || [];
      logEv('Enviados ' + (before - queue.length) + ' de ' + batch.length + (fails.length ? ' · fallaron ' + fails.length + ' (Kobo ' + (fails[0].status || 'sin respuesta') + ': ' + String(fails[0].body || '').slice(0, 160) + ')' : ''), !fails.length);
      if (queue.length === before) {
        var f = fails[0] || {};
        throw new Error('Kobo respondió ' + (f.status || 'sin respuesta') + (f.status === 404 ? ' (revisa KOBO_SUBMIT y que el formulario esté implementado)' : f.status === 401 || f.status === 403 ? ' (activa Permitir envíos anónimos en Kobo)' : f.status === 400 ? ' (campos del formulario no coinciden)' : ''));
      }
      if (queue.length) return flush();
    });
  }

  function sync(manual) {
    if (!configured()) { setStatus(urlOk() ? 'nokey' : 'local'); if (manual) openConn(); return Promise.resolve(); }
    if (busy) return Promise.resolve();
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    busy = true; setStatus('sync');
    if (!snap) queueDiff(); // primera conexión: envía lo que ya existía en este dispositivo
    return flush().then(function () { setStatus('ok'); })
      .catch(function (e) {
        if (e && e.code === 'clave') { logEv('Clave incorrecta', false); localStorage.removeItem(K_KEY); setStatus('nokey'); openConn('La clave no es correcta. Escríbela de nuevo.'); }
        else {
          var m = (e && e.name === 'TypeError') ? 'No se pudo contactar al Worker (revisa la URL en config.js o tu conexión)' : (e && e.message) || 'Error';
          logEv(m, false); setStatus('error', new Error(m));
        }
      })
      .then(function () { busy = false; });
  }

  /* ---------- Sustituye funciones de la app original ---------- */
  save = function () {
    writeJSON(KEY, data);
    queueDiff();
    renderAll();
    setStatus(queue.length ? 'pending' : (configured() ? 'ok' : 'local'));
    sync();
  };

  function wipeAll() {
    ['angelsGymnastics_v1', K_KEY, K_QUEUE, K_SNAP, K_LOG, K_MODE].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    var tareas = [];
    if (window.caches) tareas.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    if (navigator.serviceWorker) tareas.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    return Promise.all(tareas).catch(function () {}).then(function () { location.reload(); });
  }
  clearAll = function () {
    var pend = queue.length;
    if (!confirm('Se borrará TODO en este dispositivo: registros, cola de envío, clave y archivos guardados. Los datos ya enviados siguen en Kobo, pero la app NO los vuelve a descargar.' + (pend ? '\n\n⚠ Hay ' + pend + ' cambios SIN ENVIAR a Kobo que se perderían.' : '') + '\n\n¿Continuar?')) return;
    wipeAll();
  };

  importData = function (e) { if (e && e.target) e.target.value = ''; alert('La importación está desactivada: los datos se envían a KoboToolbox.'); };

  /* ---------- Interfaz: estado, conexión e instalación ---------- */
  var LABELS = {
    ok: ['● Enviado a Kobo', '#9be3c3'], sync: ['↻ Sincronizando…', '#ffe29a'],
    pending: ['● Cambios pendientes de enviar', '#ffe29a'], offline: ['● Sin conexión (se guarda local)', '#ffb4ae'],
    error: ['● Error de sincronización', '#ffb4ae'], local: ['● Modo local (sin Kobo)', '#d8e2ef'],
    nokey: ['● Falta la clave de acceso', '#ffe29a']
  };
  function setStatus(s, err) {
    var el = document.getElementById('syncState'); if (!el) return;
    var l = LABELS[s] || LABELS.local;
    var n = queue.length ? ' (' + queue.length + ')' : '';
    el.textContent = l[0] + (s === 'pending' || s === 'offline' || s === 'error' ? n : '');
    el.style.color = l[1];
    el.title = err && err.message ? err.message : '';
    if (err && err.message) el.textContent += ' — ' + err.message;
  }

  function buildUI() {
    var hn = document.querySelector('.header-note'); if (!hn) return;
    hn.style.maxWidth = '340px';
    hn.innerHTML = '<div id="syncState" style="font-weight:700;font-size:12px"></div>' +
      '<div class="actions" style="margin-top:6px;justify-content:flex-end">' +
      '<button class="gold" id="btnSync" type="button" style="padding:7px 10px;font-size:12px">Enviar a Kobo</button>' +
      '<button class="ghost" id="btnConn" type="button" style="padding:7px 10px;font-size:12px">Conexión</button>' +
      '<button class="ghost" id="btnLog" type="button" style="padding:7px 10px;font-size:12px">Seguimiento</button>' +
      '<button class="gold hidden" id="btnInstall" type="button" style="padding:7px 10px;font-size:12px">Instalar app</button></div>';
    document.getElementById('btnSync').onclick = function () { sync(true); };
    document.getElementById('btnConn').onclick = function () { openConn(); };
    document.getElementById('btnLog').onclick = function () { openLog(); };
    document.getElementById('btnInstall').onclick = function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; document.getElementById('btnInstall').classList.add('hidden'); });
    };
  }

  function escH(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function openLog(result) {
    var l = readJSON(K_LOG, []).slice().reverse();
    var rows = l.length ? l.map(function (x) {
      var d = new Date(x.t);
      return '<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:13px;color:' + (x.ok ? 'inherit' : 'var(--red)') + '">' +
        '<b>' + d.toLocaleString('es-CO') + '</b><br>' + escH(x.m) + '</div>';
    }).join('') : '<p class="muted">Aún no hay intentos de envío.</p>';
    var html = '<p><b>Cola pendiente:</b> ' + queue.length + ' · <b>Conectado:</b> ' + (configured() ? 'sí' : 'no') + ' · <b>Versión:</b> ' + MODE + '</p>' +
      '<p class="muted" style="word-break:break-all"><b>Worker:</b> ' + escH(CFG.API_URL || '(sin configurar)') + '</p>' +
      (result ? '<p style="font-weight:700;color:' + (result.ok ? 'var(--green,#1b7a4b)' : 'var(--red)') + '">' + escH(result.msg) + '</p>' : '') +
      '<div class="actions"><button class="primary" id="logTest" type="button">Probar conexión con Kobo</button>' +
      '<button class="ghost" id="logSend" type="button">Reintentar envío</button>' +
      '<button class="danger" id="logWipe" type="button">Borrar todo en este dispositivo</button></div>' +
      '<div style="margin-top:12px;max-height:45vh;overflow:auto">' + rows + '</div>';
    openModal('Seguimiento de envíos', html);
    document.getElementById('logSend').onclick = function () { closeModal(); sync(true).then(function () { openLog(); }); };
    document.getElementById('logWipe').onclick = function () { closeModal(); clearAll(); };
    document.getElementById('logTest').onclick = function () {
      if (!configured()) { closeModal(); openConn(); return; }
      this.disabled = true; this.textContent = 'Probando…';
      call({ action: 'test' }).then(function (r) {
        var ok = r.status === 201 || r.status === 202 || r.status === 409;
        logEv('Prueba: Kobo respondió ' + r.status + (r.body ? ' · ' + String(r.body).slice(0, 160) : ''), ok);
        openLog({ ok: ok, msg: ok ? '✔ Kobo recibió el envío de prueba (código ' + r.status + '). Búscalo en Datos con tipo = prueba.' : '✖ Kobo respondió ' + r.status + '. ' + (r.hint || '') });
      }).catch(function (e) {
        var m = e.code === 'clave' ? 'Clave incorrecta' : (e.name === 'TypeError' ? 'No se pudo contactar al Worker (URL o conexión)' : e.message);
        logEv('Prueba falló: ' + m, false); openLog({ ok: false, msg: '✖ ' + m });
      });
    };
  }

  function openConn(msg) {
    var html = (msg ? '<p style="color:var(--red);font-weight:700">' + msg + '</p>' : '') +
      '<p class="muted">Escribe la clave de acceso que definiste en el Worker (variable <b>CLAVE</b>). Se guarda solo en este dispositivo.</p>' +
      (urlOk() ? '' : '<p style="color:var(--red)"><b>Falta configurar la URL del Worker</b> en el archivo <code>config.js</code> del repositorio.</p>') +
      '<div class="field"><label>Clave de acceso</label><input type="password" id="connKey" autocomplete="off" value="' + '' + '"></div>' +
      '<div class="actions"><button class="primary" id="connSave" type="button">Guardar y sincronizar</button>' +
      (getKey() ? '<button class="danger" id="connForget" type="button">Olvidar clave en este dispositivo</button>' : '') + '</div>';
    openModal('Conexión con Kobo', html);
    document.getElementById('connSave').onclick = function () {
      var v = document.getElementById('connKey').value.trim();
      if (!v) return;
      localStorage.setItem(K_KEY, v); closeModal(); sync();
    };
    var f = document.getElementById('connForget');
    if (f) f.onclick = function () { localStorage.removeItem(K_KEY); closeModal(); setStatus('nokey'); };
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredInstall = e;
    var b = document.getElementById('btnInstall'); if (b) b.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', function () { var b = document.getElementById('btnInstall'); if (b) b.classList.add('hidden'); });
  window.addEventListener('online', function () { sync(); });
  window.addEventListener('offline', function () { setStatus('offline'); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
  setInterval(function () { if (document.visibilityState === 'visible') sync(); }, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  buildUI();
  setStatus(configured() ? (queue.length ? 'pending' : 'ok') : (urlOk() ? 'nokey' : 'local'));
  if (urlOk() && !getKey()) openConn(); else sync();
})();
