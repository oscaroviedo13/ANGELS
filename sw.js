/* Service worker – Club Angels Gymnastics
   Estrategia: red primero (para recibir actualizaciones) y caché como respaldo sin conexión.
   Las llamadas al intermediario (Worker) NO se interceptan. */
try { importScripts('version.js'); } catch (e) {}
const VER = (self.ANGELS_VERSION && self.ANGELS_VERSION.app) || '0';
const CACHE = 'angels-' + VER;
const ASSETS = [
  './',
  './index.html',
  './version.js',
  './config.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok ? c.put(u, r) : null).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Worker de Kobo, fuentes, etc.

  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
