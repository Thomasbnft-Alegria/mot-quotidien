import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const NOTIFICATION_ASKED_KEY = 'notification_permission_asked';
const SUBSCRIPTION_ENDPOINT_KEY = 'push_subscription_endpoint';
const PREFERRED_TIME_KEY = 'push_preferred_time';

// VAPID public key - must match the one in Supabase secrets
const VAPID_PUBLIC_KEY = 'BJdFoUcnZB61ko_lThX8reUBGYedkJ7xTVSIXGCXjpfrWIl1muCEimqMypW6Y6NXW1hfYLRD3Tsy8SL9TEDv_jY';

type PermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasBeenAsked, setHasBeenAsked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preferredTime, setPreferredTime] = useState('12:30');

  // Use a ref so async functions always see the latest preferredTime
  const preferredTimeRef = useRef('12:30');
  preferredTimeRef.current = preferredTime;

  // Pre-warmed SW registration — populated at mount so it's ready before user clicks
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermissionStatus('unsupported');
      return;
    }

    setPermissionStatus(Notification.permission as PermissionStatus);

    const asked = localStorage.getItem(NOTIFICATION_ASKED_KEY);
    setHasBeenAsked(asked === 'true');

    const storedTime = localStorage.getItem(PREFERRED_TIME_KEY);
    if (storedTime) {
      setPreferredTime(storedTime);
      preferredTimeRef.current = storedTime;
    }

    const storedEndpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    if (storedEndpoint && Notification.permission === 'granted') {
      checkSubscriptionStatus(storedEndpoint);
    }

    // Pre-warm SW registration so it's cached before the user taps the toggle.
    // On iOS Safari, pushManager.subscribe() must be called with minimal async
    // delay from the user gesture — caching the registration eliminates the
    // navigator.serviceWorker.ready await at click time.
    navigator.serviceWorker.ready.then((reg) => {
      swRegistrationRef.current = reg;
    }).catch(() => {});
  }, []);

  const checkSubscriptionStatus = async (endpoint: string) => {
    try {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('enabled, preferred_time')
        .eq('endpoint', endpoint)
        .single();

      if (data) {
        setIsSubscribed(data.enabled);
        if (data.preferred_time) {
          const time = data.preferred_time.substring(0, 5);
          setPreferredTime(time);
          preferredTimeRef.current = time;
          localStorage.setItem(PREFERRED_TIME_KEY, time);
        }
      } else {
        localStorage.removeItem(SUBSCRIPTION_ENDPOINT_KEY);
        // isSubscribed stays false (initial state) — no async reset to avoid race condition with toggle
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      // Don't override isSubscribed on network error — avoids race condition
    }
  };

  // Returns a valid ServiceWorkerRegistration or throws with a clear message.
  // Uses the pre-warmed ref when available so there is no async delay at click
  // time (critical for iOS Safari user-gesture gating of pushManager.subscribe).
  const getSwRegistration = async (): Promise<ServiceWorkerRegistration> => {
    if (swRegistrationRef.current) {
      return swRegistrationRef.current;
    }
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Service Worker non disponible (timeout 8s)')), 8000)
      ),
    ]) as Promise<ServiceWorkerRegistration>;
  };

  // pushManager.subscribe with timeout to avoid infinite hang on some iOS/Android browsers
  const subscribeWithTimeout = (
    registration: ServiceWorkerRegistration,
    options: PushSubscriptionOptionsInit,
    timeoutMs = 15000,
  ): Promise<PushSubscription> => {
    return Promise.race([
      registration.pushManager.subscribe(options),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`pushManager.subscribe timeout (${timeoutMs / 1000}s) — vérifiez les permissions notifications du navigateur`)),
          timeoutMs,
        )
      ),
    ]) as Promise<PushSubscription>;
  };

  // Obtains (or renews) a push subscription and saves it to Supabase
  const subscribeToPush = async (): Promise<void> => {
    console.log('[Push] subscribeToPush start');
    const registration = await getSwRegistration();
    console.log('[Push] SW ready');

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('[Push] No existing subscription, subscribing...');
      try {
        subscription = await subscribeWithTimeout(registration, {
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('[Push] New subscription created');
      } catch (err) {
        // Push API not available in this context (HTTP, old iOS, etc.) → use local fallback
        console.warn('[Push] pushManager.subscribe failed, using local fallback:', err);
        const fallback = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await saveSubscription(fallback, 'demo-key', 'demo-auth');
        return;
      }
    } else {
      console.log('[Push] Reusing existing subscription');
    }

    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    const p256dh = key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '';
    const authKey = auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '';

    await saveSubscription(subscription.endpoint, p256dh, authKey);
  };

  const saveSubscription = async (endpoint: string, p256dh: string, auth: string): Promise<void> => {
    const timeForDb = `${preferredTimeRef.current}:00`;

    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .single();

    if (existing) {
      await supabase
        .from('push_subscriptions')
        .update({ p256dh, auth, enabled: true, preferred_time: timeForDb })
        .eq('endpoint', endpoint);
      console.log('[Push] Updated existing subscription in DB');
    } else {
      await supabase
        .from('push_subscriptions')
        .insert({ endpoint, p256dh, auth, enabled: true, preferred_time: timeForDb });
      console.log('[Push] Inserted new subscription in DB');
    }

    localStorage.setItem(SUBSCRIPTION_ENDPOINT_KEY, endpoint);
    setIsSubscribed(true);
  };

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;

    setIsLoading(true);
    localStorage.setItem(NOTIFICATION_ASKED_KEY, 'true');
    setHasBeenAsked(true);

    try {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission as PermissionStatus);

      if (permission === 'granted') {
        await subscribeToPush();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Push] requestPermission error:', error);
      toast.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNotifications = async (enabled: boolean): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (enabled) {
        // Always go through the full subscribe flow to ensure the subscription is fresh
        await subscribeToPush();
        return true;
      } else {
        const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
        if (endpoint) {
          await supabase
            .from('push_subscriptions')
            .update({ enabled: false })
            .eq('endpoint', endpoint);
        }
        setIsSubscribed(false);
        return true;
      }
    } catch (error) {
      console.error('[Push] toggleNotifications error:', error);
      toast.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferredTime = async (time: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
      if (!endpoint) {
        toast.error('Aucune souscription active — active les notifications d\'abord');
        return false;
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .update({ preferred_time: `${time}:00` })
        .eq('endpoint', endpoint);

      if (error) throw error;

      setPreferredTime(time);
      preferredTimeRef.current = time;
      localStorage.setItem(PREFERRED_TIME_KEY, time);
      console.log('[Push] Preferred time updated to:', time);
      return true;
    } catch (error) {
      console.error('[Push] updatePreferredTime error:', error);
      toast.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async (): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
    const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    console.log('[Push] sendTestNotification, endpoint:', endpoint ? endpoint.substring(0, 40) + '...' : 'none');

    try {
      const { data, error } = await supabase.functions.invoke('send-daily-notification', {
        body: { endpoint, test: true },
      });

      if (error) {
        console.error('[Push] Edge function error:', error);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, data };
    } catch (err) {
      console.error('[Push] sendTestNotification error:', err);
      return { success: false, error: String(err) };
    }
  };

  const shouldShowPrompt = !hasBeenAsked && permissionStatus === 'default';

  return {
    permissionStatus,
    isSubscribed,
    isLoading,
    preferredTime,
    shouldShowPrompt,
    requestPermission,
    toggleNotifications,
    sendTestNotification,
    updatePreferredTime,
  };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
