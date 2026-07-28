/*
 * Minimal service worker for the installed (PWA) app.
 * Strategy: network-first with cache fallback — users always get the latest
 * build when online, and the app shell still opens offline (the data itself
 * lives in localStorage / the REST API, not here).
 */
const CACHE = 'regreport-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only same-origin GETs: never cache API calls' POST/PUT or third-party fonts.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (new URL(request.url).pathname.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached || (request.mode === 'navigate' ? caches.match('./') : Promise.reject(new Error('offline')))
        )
      )
  );
});
