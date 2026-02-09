import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    // Check if notifications are supported
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermissionStatus('unsupported');
      return;
    }

    // Check current permission status
    setPermissionStatus(Notification.permission as PermissionStatus);
    
    // Check if we've already asked
    const asked = localStorage.getItem(NOTIFICATION_ASKED_KEY);
    setHasBeenAsked(asked === 'true');

    // Load preferred time from localStorage
    const storedTime = localStorage.getItem(PREFERRED_TIME_KEY);
    if (storedTime) {
      setPreferredTime(storedTime);
    }

    // Check if already subscribed
    const storedEndpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    if (storedEndpoint && Notification.permission === 'granted') {
      checkSubscriptionStatus(storedEndpoint);
    }
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
          // Convert "HH:MM:SS" to "HH:MM"
          const time = data.preferred_time.substring(0, 5);
          setPreferredTime(time);
          localStorage.setItem(PREFERRED_TIME_KEY, time);
        }
      } else {
        localStorage.removeItem(SUBSCRIPTION_ENDPOINT_KEY);
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      setIsSubscribed(false);
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false;
    }

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
      console.error('Error requesting notification permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const subscribeToPush = async () => {
    try {
      console.log('[Push] Starting subscription process...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');
      
      let subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Existing subscription:', subscription ? 'yes' : 'no');
      
      if (!subscription && VAPID_PUBLIC_KEY) {
        try {
          console.log('[Push] Subscribing with VAPID key...');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          console.log('[Push] Subscription created:', subscription.endpoint.substring(0, 50) + '...');
        } catch (pushError) {
          console.error('[Push] Push subscription failed:', pushError);
          const mockSubscription = {
            endpoint: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            p256dh: 'demo-key',
            auth: 'demo-auth'
          };
          await saveSubscription(mockSubscription.endpoint, mockSubscription.p256dh, mockSubscription.auth);
          return;
        }
      } else if (!subscription) {
        console.log('[Push] No VAPID key, using local subscription');
        const mockSubscription = {
          endpoint: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          p256dh: 'demo-key',
          auth: 'demo-auth'
        };
        await saveSubscription(mockSubscription.endpoint, mockSubscription.p256dh, mockSubscription.auth);
        return;
      }

      if (subscription) {
        const key = subscription.getKey('p256dh');
        const auth = subscription.getKey('auth');
        
        const p256dh = key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '';
        const authKey = auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '';
        
        console.log('[Push] Saving subscription to database...');
        await saveSubscription(subscription.endpoint, p256dh, authKey);
      }
    } catch (error) {
      console.error('[Push] Error subscribing to push:', error);
    }
  };

  const saveSubscription = async (endpoint: string, p256dh: string, auth: string) => {
    try {
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', endpoint)
        .single();

      const timeForDb = `${preferredTime}:00`;

      if (existing) {
        await supabase
          .from('push_subscriptions')
          .update({ p256dh, auth, enabled: true, preferred_time: timeForDb })
          .eq('endpoint', endpoint);
        console.log('[Push] Updated existing subscription');
      } else {
        await supabase
          .from('push_subscriptions')
          .insert({ endpoint, p256dh, auth, enabled: true, preferred_time: timeForDb });
        console.log('[Push] Inserted new subscription');
      }

      localStorage.setItem(SUBSCRIPTION_ENDPOINT_KEY, endpoint);
      setIsSubscribed(true);
    } catch (error) {
      console.error('[Push] Error saving subscription:', error);
    }
  };

  const toggleNotifications = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    
    try {
      if (enabled) {
        const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
        if (!endpoint) {
          await subscribeToPush();
        } else {
          await supabase
            .from('push_subscriptions')
            .update({ enabled: true })
            .eq('endpoint', endpoint);
          setIsSubscribed(true);
        }
      } else {
        const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
        if (endpoint) {
          await supabase
            .from('push_subscriptions')
            .update({ enabled: false })
            .eq('endpoint', endpoint);
        }
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error('[Push] Error toggling notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePreferredTime = useCallback(async (time: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
      if (!endpoint) {
        console.error('[Push] No endpoint stored, cannot update preferred time');
        return false;
      }

      const timeForDb = `${time}:00`;
      
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ preferred_time: timeForDb })
        .eq('endpoint', endpoint);

      if (error) {
        console.error('[Push] Error updating preferred time:', error);
        return false;
      }

      setPreferredTime(time);
      localStorage.setItem(PREFERRED_TIME_KEY, time);
      console.log('[Push] Preferred time updated to:', time);
      return true;
    } catch (error) {
      console.error('[Push] Error updating preferred time:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(async (): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
    console.log('[Notification] sendTestNotification called');
    
    const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    console.log('[Notification] Stored endpoint:', endpoint ? endpoint.substring(0, 30) + '...' : 'none');

    try {
      console.log('[Notification] Calling edge function...');
      const { data, error } = await supabase.functions.invoke('send-daily-notification', {
        body: { endpoint, test: true }
      });

      console.log('[Notification] Edge function response:', data, error);

      if (error) {
        console.error('[Notification] Edge function error:', error);
        return { success: false, error: error.message || String(error) };
      }

      return { success: true, data };
    } catch (err) {
      console.error('[Notification] Failed to call edge function:', err);
      return { success: false, error: String(err) };
    }
  }, []);

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
    updatePreferredTime
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
