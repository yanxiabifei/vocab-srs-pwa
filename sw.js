// sw.js - Service Worker (offline cache)
var CACHE_NAME = 'vocab-srs-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/srs.js',
  './js/dictionary.js',
  './js/wordbank.js',
  './js/session.js',
  './js/notifications.js',
  './js/ui.js',
  './js/app.js',
  './data/dictionary.json',
  './data/wordbooks/primary.json',
  './data/wordbooks/junior.json',
  './data/wordbooks/gaokao.json',
  './data/wordbooks/cet4.json',
  './data/wordbooks/cet6.json',
  './data/wordbooks/postgrad.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function() {
          return cached || new Response('Offline', { status: 503 });
        });
        return cached || fetchPromise;
      });
    })
  );
});
