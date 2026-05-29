// service-worker.js — stale-while-revalidate offline strategy
//
// Assets are served from cache for instant, offline-capable loads, but every
// request also refreshes the cache in the background. This means deployed
// updates reach users automatically on their next launch WITHOUT needing a
// manual CACHE_NAME bump on every change (the old cache-first strategy served
// stale code indefinitely until the version string was hand-edited).

const CACHE_NAME = 'cricket-umpire-v11';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/storage.js',
  '/js/match.js',
  '/js/router.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/html2canvas.min.js'
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
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    // Kick off a fresh fetch and update the cache in the background.
    const network = fetch(req).then(response => {
      if (response && response.ok) cache.put(req, response.clone());
      return response;
    }).catch(() => null);

    // Serve cache instantly when we have it; the background fetch above keeps
    // the cache current for the next load.
    if (cached) {
      event.waitUntil(network);
      return cached;
    }

    // Nothing cached yet: wait for the network, with an app-shell fallback
    // for navigations so the app still opens offline on a cold cache.
    const response = await network;
    if (response) return response;
    if (req.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  })());
});
