// service-worker.js — self-retiring kill switch.
//
// The app no longer uses a service worker (offline caching caused stale-cache
// problems where updates wouldn't show without manually clearing data). This
// script exists ONLY to clean up after older versions: on any device that
// still has a worker registered, the browser auto-updates to this script,
// which deletes all caches and unregisters itself. After that the site loads
// fresh from the network like a normal website — no caching, no stale builds.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
  })());
});

// No fetch handler on purpose: every request goes straight to the network.
