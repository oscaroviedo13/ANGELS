/* Capa PWA + sincronización con Google Sheets (vía Apps Script).
   - La app sigue funcionando sin conexión con la copia local (localStorage).
   - Cada cambio se detecta comparando contra la última copia sincronizada y se
     pone en una cola; la cola se envía cuando hay internet.
   - Al sincronizar se descarga el estado completo desde la hoja de cálculo. */
(function () {
  'use strict';

  var CFG = window.ANGELS_CONFIG || {};
  var K_KEY = 'angels_key', K_QUEUE = 'angels_queue', K_SNAP = 'angels_snap';
  var NUM_A = ['price', 'totalClasses', 'remaining', 'attended'];
  var NUM_P = ['amount', 'plan'];

  var queue = readJSON(K_QUEUE, []);
  var snap = readJSON(K_SNAP, null);
  var busy = false, mutations = 0, deferredInstall = null;

  function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getKey() { return localStorage.getItem(K_KEY) || ''; }
  function urlOk() { return CFG.API_URL && /^https:\/\/script\.google(usercontent)?\.com\//.test(CFG.API_URL); }
  function configured() { return urlOk() && !!getKey(); }

  /* ---------- Normalización de lo que llega de la hoja ---------- */
  function normAthlete(r) {
    var a = {};
    Object.keys(r).forEach(function (k) {
      var v = r[k];
      if (k === 'payments') a[k] = String(v == null ? '' : v).split(',').filter(Boolean);
      else if (NUM_A.indexOf(k) > -1) a[k] = Number(v) || 0;
      else a[k] = v == null ? '' : String(v);
    });
    a.payments = a.payments || [];
    return a;
  }
  function normPayment(r) {
    var p = {};
    Object.keys(r).forEach(function (k) { p[k] = NUM_P.indexOf(k) > -1 ? (Number(r[k]) || 0) : (r[k] == null ? '' : String(r[k])); });
    return p;
  }
  function normAtt(r) { return { athleteId: String(r.athleteId || ''), date: String(r.date || '') }; }

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
    var batch = queue.slice();
    return call({ action: 'ops', ops: batch }).then(function () {
      queue = queue.slice(batch.length);
      writeJSON(K_QUEUE, queue);
    });
  }

  function sync(manual) {
    if (!configured()) { setStatus(urlOk() ? 'nokey' : 'local'); if (manual) openConn(); return Promise.resolve(); }
    if (busy) return Promise.resolve();
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    busy = true; setStatus('sync');
    if (!snap) queueDiff(); // primera conexión: sube lo que ya existía en este dispositivo
    return flush().then(function () {
      var mut = mutations;
      return call({ action: 'all' }).then(function (r) {
        if (mut !== mutations || queue.length) return; // hubo cambios mientras tanto: se reintenta luego
        data = {
          athletes: (r.athletes || []).map(normAthlete),
          payments: (r.payments || []).map(normPayment),
          attendance: (r.attendance || []).map(normAtt)
        };
        writeJSON(KEY, data);
        snap = makeSnap(data); writeJSON(K_SNAP, snap);
        renderAll();
      });
    }).then(function () { setStatus('ok'); })
      .catch(function (e) {
        if (e && e.code === 'clave') { localStorage.removeItem(K_KEY); setStatus('nokey'); openConn('La clave no es correcta. Escríbela de nuevo.'); }
        else setStatus('error', e);
      })
      .then(function () { busy = false; });
  }

  /* ---------- Sustituye funciones de la app original ---------- */
  save = function () {
    mutations++;
    writeJSON(KEY, data);
    queueDiff();
    renderAll();
    setStatus(queue.length ? 'pending' : (configured() ? 'ok' : 'local'));
    sync();
  };

  clearAll = function () {
    if (!confirm('Se borrará solo la copia guardada en este dispositivo. Los datos de Google Sheets NO se tocan y se volverán a descargar al sincronizar. ¿Continuar?')) return;
    if (queue.length && !confirm('Hay cambios pendientes de enviar que se perderían. ¿Continuar de todos modos?')) return;
    data = { athletes: [], payments: [], attendance: [] };
    writeJSON(KEY, data);
    queue = []; writeJSON(K_QUEUE, queue);
    snap = null; localStorage.removeItem(K_SNAP);
    renderAll(); toast('Copia local borrada'); sync(true);
  };

  importData = function (e) { if (e && e.target) e.target.value = ''; alert('La importación está desactivada: los datos viven en Google Sheets. Si necesitas cargar registros, pégalos directamente en la hoja.'); };

  /* ---------- Interfaz: estado, conexión e instalación ---------- */
  var LABELS = {
    ok: ['● Sincronizado', '#9be3c3'], sync: ['↻ Sincronizando…', '#ffe29a'],
    pending: ['● Cambios pendientes de enviar', '#ffe29a'], offline: ['● Sin conexión (se guarda local)', '#ffb4ae'],
    error: ['● Error de sincronización', '#ffb4ae'], local: ['● Modo local (sin Google Sheets)', '#d8e2ef'],
    nokey: ['● Falta la clave de acceso', '#ffe29a']
  };
  function setStatus(s, err) {
    var el = document.getElementById('syncState'); if (!el) return;
    var l = LABELS[s] || LABELS.local;
    var n = queue.length ? ' (' + queue.length + ')' : '';
    el.textContent = l[0] + (s === 'pending' || s === 'offline' || s === 'error' ? n : '');
    el.style.color = l[1];
    el.title = err && err.message ? err.message : '';
  }

  function buildUI() {
    var hn = document.querySelector('.header-note'); if (!hn) return;
    hn.style.maxWidth = '340px';
    hn.innerHTML = '<div id="syncState" style="font-weight:700;font-size:12px"></div>' +
      '<div class="actions" style="margin-top:6px;justify-content:flex-end">' +
      '<button class="gold" id="btnSync" type="button" style="padding:7px 10px;font-size:12px">Sincronizar</button>' +
      '<button class="ghost" id="btnConn" type="button" style="padding:7px 10px;font-size:12px">Conexión</button>' +
      '<button class="gold hidden" id="btnInstall" type="button" style="padding:7px 10px;font-size:12px">Instalar app</button></div>';
    document.getElementById('btnSync').onclick = function () { sync(true); };
    document.getElementById('btnConn').onclick = function () { openConn(); };
    document.getElementById('btnInstall').onclick = function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; document.getElementById('btnInstall').classList.add('hidden'); });
    };
  }

  function openConn(msg) {
    var html = (msg ? '<p style="color:var(--red);font-weight:700">' + msg + '</p>' : '') +
      '<p class="muted">Escribe la clave de acceso que definiste en el script de Google (constante <b>CLAVE</b>). Se guarda solo en este dispositivo.</p>' +
      (urlOk() ? '' : '<p style="color:var(--red)"><b>Falta configurar la URL del script</b> en el archivo <code>config.js</code> del repositorio.</p>') +
      '<div class="field"><label>Clave de acceso</label><input type="password" id="connKey" autocomplete="off" value="' + '' + '"></div>' +
      '<div class="actions"><button class="primary" id="connSave" type="button">Guardar y sincronizar</button>' +
      (getKey() ? '<button class="danger" id="connForget" type="button">Olvidar clave en este dispositivo</button>' : '') + '</div>';
    openModal('Conexión con Google Sheets', html);
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
