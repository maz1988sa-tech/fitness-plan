/* Offline shell for the fitness app. Same-origin GET only: Supabase requests are never cached or intercepted. */
var CACHE = 'fp-shell-v1';
var SHELL = [
  './', './index.html', './app.js?v=1', './logic.js?v=1', './config.js?v=1', './vendor/supabase-2.117.2.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png',
  './fonts/changa-arabic-wght-normal.woff2', './fonts/changa-latin-wght-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', './fonts/ibm-plex-sans-arabic-latin-400-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2', './fonts/ibm-plex-sans-arabic-latin-600-normal.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Network first (so a new deploy shows up at once), falling back to the cache when offline or slower than 4 s.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    var timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 4000); });
    return Promise.race([net, timeout]).catch(function () {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html').then(function (idx) { return idx || net; });
        return net;
      });
    });
  }));
});
