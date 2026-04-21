import { useEffect, useState } from 'react';

export function useServiceWorker() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Avoid service worker caching during development/preview.
    // In dev, SW runtime caching can serve stale JS chunks and lead to React hook dispatcher errors.
    if (import.meta.env.DEV) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(import.meta.env.BASE_URL + 'sw.js')
        .then((reg) => {
          console.log('Service Worker registered:', reg.scope);
          setRegistration(reg);
          setIsRegistered(true);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });

      // Listen for controllerchange to reload when a new SW takes over.
      // This fires when the new SW takes control, even if the app was closed
      // during the update (postMessage would have been missed in that case)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] Controller changed, reloading...');
          window.location.reload();
        }
      });
    }
  }, []);

  return { isRegistered, registration };
}
