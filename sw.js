const CACHE = 'rsl-v1.1.6';
const ASSETS = ['./', './index.html', './style.css', './manifest.json', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './src/main.js', './src/game.js', './src/ai.js', './src/render.js', './src/sprites.js', './src/input.js', './src/ui.js', './src/audio.js', './src/map.js', './src/pathfinding.js', './src/entities.js', './src/data.js', './src/util.js', './src/i18n.js', './src/assets.js', './src/lights.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
