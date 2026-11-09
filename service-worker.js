const CACHE_NAME = 'gos-pwa-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './Interfaces/vistas/style.css',
  './main.js',
  './Utilidades/api-config.js',
  './Utilidades/helpers.js',
  './Motores de negocio/consultas.js',
  './Motores de negocio/despachador.js',
  './manifest.json',
  './Recursos/logo-gos.svg',
  './Recursos/icon-gos-192.svg',
  './Recursos/icon-gos-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('GOs PWA: Abriendo caché independiente');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('GOs PWA: Eliminando caché heredado o ajeno:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Evitar interceptar peticiones cruzadas a dominios de Apps Script o GPSpedia
  if (event.request.url.includes('google.com') || event.request.url.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
