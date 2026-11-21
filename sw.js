const CACHE_NAME = 'vmi-test-v14-cache-78';
const CACHE_PREFIX = 'vmi-test-';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/modules/analysis.js',
  './js/modules/assistant-renderer.js',
  './js/modules/assistant-summary.js',
  './js/modules/assistant-view.js',
  './js/modules/backup.js',
  './js/modules/ble.js',
  './js/modules/bluetooth-autoconnect.js',
  './js/modules/bluetooth-advanced-commands.js',
  './js/modules/bluetooth-decoder.js',
  './js/modules/bluetooth-freshness.js',
  './js/modules/bluetooth-history-row.js',
  './js/modules/bluetooth-history-stream.js',
  './js/modules/bluetooth-protocol.js',
  './js/modules/bluetooth-response-gate.js',
  './js/modules/bluetooth-runtime.js',
  './js/modules/bluetooth-session.js',
  './js/modules/bluetooth-service.js',
  './js/modules/bluetooth-notification-adapter.js',
  './js/modules/bluetooth-write-queue.js',
  './js/modules/chart-renderer.js',
  './js/modules/charts.js',
  './js/modules/clock-correction.js',
  './js/modules/core.js',
  './js/modules/data-quality.js',
  './js/modules/dataio.js',
  './js/modules/date-utils.js',
  './js/modules/diagnostic-confidence.js',
  './js/modules/technical-diagnostic.js',
  './js/modules/energy-climate.js',
  './js/modules/energy-estimate.js',
  './js/modules/energy-meter.js',
  './js/modules/energy-readiness-renderer.js',
  './js/modules/history-selection.js',
  './js/modules/history.js',
  './js/modules/history-sync-commit.js',
  './js/modules/history-advice-renderer.js',
  './js/modules/legacy-migration.js',
  './js/modules/navigation.js',
  './js/modules/live-freshness.js',
  './js/modules/measurement-filter.js',
  './js/modules/psychrometry.js',
  './js/modules/seasonal-advice.js',
  './js/modules/store.js',
  './js/modules/sync.js',
  './js/modules/weather.js',
  './js/modules/weekly-diagnostic.js',
  './js/types/vmi-types.js'
];

// Seuls les fichiers explicitement nécessaires à l'application sont éligibles au cache.
// Une URL avec paramètres (aperçus, pages de test, cache-busting) reste hors cache.
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||url.search||!APP_SHELL_URLS.has(url.href))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(event.request)).then(cached=>{
    if(cached)return cached;
    if(event.request.mode==='navigate')return caches.open(CACHE_NAME).then(cache=>cache.match('./index.html'));
    return Response.error();
  })));
});
