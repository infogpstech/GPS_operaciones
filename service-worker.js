const CACHE_NAME = 'gos-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './api-config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
