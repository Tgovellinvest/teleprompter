/* Service worker: guarda os arquivos do app para funcionar offline.
   Estratégia: responde do cache na hora e atualiza o cache em segundo plano.
   Uma mudança publicada aparece na segunda abertura do app com internet. */

var CACHE = 'teleprompter-v3';
var ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) { return n !== CACHE ? caches.delete(n) : null; }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (guardado) {
        var daRede = fetch(req).then(function (resp) {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        });
        if (guardado) {
          ev.waitUntil(daRede.catch(function () { /* offline: fica com o cache */ }));
          return guardado;
        }
        return daRede.catch(function () {
          if (req.mode === 'navigate') return cache.match('./');
          return Response.error();
        });
      });
    })
  );
});
