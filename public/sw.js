// NOTE: Bump this when changing caching strategy to force clients to drop old caches.
const CACHE_NAME = 'mot-du-jour-v3';
// Use relative paths so they resolve correctly regardless of the deployment base path
// (e.g. GitHub Pages /mot-quotidien/ vs root /).
// IMPORTANT: absolute paths like '/' break SW installation on sub-path deployments.
const urlsToCache = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => {
        // Non-fatal: log and skip caching on install failure so the SW still activates.
        console.warn('[SW] cache.addAll failed (non-fatal):', err);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches and notify clients to reload
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim()).then(() => {
      // Notify all clients to reload so they pick up the new version
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isSameOrigin = url.origin === self.location.origin;
  const isViteAsset = url.pathname.startsWith('/@') || url.pathname.includes('/node_modules/.vite/');
  const isSourceAsset = url.pathname.startsWith('/src/');
  const isChunkLike = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.map');

  // Never cache dev/build assets or JS/CSS chunks — always go to network.
  if (!isSameOrigin || isViteAsset || isSourceAsset || isChunkLike) {
    return;
  }

  // Network-first for HTML documents: always fetch fresh, fall back to cache.
  // This ensures a new deployment is picked up without uninstalling the PWA.
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest, etc.)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || event.request.method !== 'GET') {
            return response;
          }
          if (urlsToCache.includes(url.pathname)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
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
