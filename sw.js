// sw.js - Service Worker (offline cache)
var CACHE_NAME = 'vocab-srs-v3';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './css/styles.css',
  './js/db.js',
  './js/srs.js',
  './js/dictionary.js',
  './js/wordbank.js',
  './js/session.js',
  './js/notifications.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
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
        // Stale-while-revalidate: return cache immediately,
        // update cache from network in background for next visit
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function() {
          return null;
        });

        // Network-first for navigation (HTML), cache-first for assets
        if (event.request.mode === 'navigate') {
          return fetchPromise.then(function(networkResponse) {
            return networkResponse || cached || new Response('Offline', { status: 503 });
          });
        }
        return cached || fetchPromise.then(function(networkResponse) {
          return networkResponse || new Response('Offline', { status: 503 });
        });
      });
    })
  );
});
