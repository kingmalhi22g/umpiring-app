// service-worker.js — network-first strategy
//
// When online, every request goes to the network first and the response is
// cached as a fresh fallback. This means deployed updates appear on the very
// next launch (no stale-cache lag). When offline, we fall back to the last
// cached copy, with the app shell served for navigations so the app still
// opens. The precache (cache.addAll on install) seeds the offline fallback.

const CACHE_NAME = 'cricket-umpire-v16';

// Relative paths so the app works whether it's served from the domain root
// (e.g. a custom domain) or a sub-folder (e.g. GitHub Pages /umpiring-app/).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/layout.css',
  './css/components.css',
  './css/redesign.css',
  './js/storage.js',
  './js/match.js',
  './js/router.js',
  './js/ui.js',
  './js/app.js',
  './js/html2canvas.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only handle same-origin GETs; let the browser deal with the rest.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Network-first: fetch fresh, update the cache, and serve it.
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      // Offline: fall back to cache, with an app-shell fallback for navigations.
      const cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
