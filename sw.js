const CACHE_NAME = 'mid-mile-v3'; // تم تحديث الإصدار لإجبار الموبايلات على قراءة التعديلات الجديدة
const urlsToCache = [
  './',
  './index.html',
  './main.html',
  './app-auth.js',
  './app.js',
  './dashboard/index.html',
  './dashboard/admin.js',
  './manifest.json',
  './breadfast-logo (1).png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
