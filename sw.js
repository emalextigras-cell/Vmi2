const CACHE = 'vmi-purevent-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./','./index.html','./css/app.css','./js/core.js','./js/bluetooth.js','./js/history.js','./js/charts.js','./js/analysis.js','./js/app.js']))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))));
