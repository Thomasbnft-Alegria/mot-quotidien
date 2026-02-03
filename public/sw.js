// NOTE: Bump this when changing caching strategy to force clients to drop old caches.
const CACHE_NAME = 'mot-du-jour-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache dev/build tool assets or JS/CSS chunks.
  // Caching these can serve stale React bundles and cause hook dispatcher errors.
  const isSameOrigin = url.origin === self.location.origin;
  const isViteAsset = url.pathname.startsWith('/@') || url.pathname.includes('/node_modules/.vite/');
  const isSourceAsset = url.pathname.startsWith('/src/');
  const isChunkLike = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.map');

  if (!isSameOrigin || isViteAsset || isSourceAsset || isChunkLike) {
    return; // Let the request go to the network normally.
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses or non-GET requests
          if (!response || response.status !== 200 || event.request.method !== 'GET') {
            return response;
          }

          // Only runtime-cache a small allowlist of safe, same-origin assets.
          const shouldRuntimeCache = urlsToCache.includes(url.pathname) || event.request.destination === 'document';
          if (!shouldRuntimeCache) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Mot du Jour';
  const options = {
    body: data.body || 'Votre mot du jour est arrivé',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification);
  event.notification.close();
  
  // Always navigate to home page
  const targetUrl = '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        console.log('[SW] Found clients:', clientList.length);
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if ('focus' in client) {
            console.log('[SW] Focusing existing client and navigating to:', targetUrl);
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open a new window
        console.log('[SW] Opening new window:', targetUrl);
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
