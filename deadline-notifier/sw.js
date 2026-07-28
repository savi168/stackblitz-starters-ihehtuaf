/*
 * Service worker du Deadline Notifier :
 *  - permet l'installation PWA et l'affichage des notifications sur Android
 *    (reg.showNotification — new Notification() y est interdit),
 *  - met l'app en cache (network-first) pour qu'elle s'ouvre hors ligne.
 */
const CACHE = 'deadline-notifier-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) =>
    clients.length ? clients[0].focus() : self.clients.openWindow('./')
  ));
});
