const CACHE_NAME = 'promedios-ubb-v1';

const ASSETS = [
  '/Promedionotas/',
  '/Promedionotas/index.html',
  '/Promedionotas/manifest.json',
  '/Promedionotas/sw.js',
  '/Promedionotas/icons/icon-192.png',
  '/Promedionotas/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(
        res => res || caches.match('/Promedionotas/index.html')
      )
    )
  );
});
