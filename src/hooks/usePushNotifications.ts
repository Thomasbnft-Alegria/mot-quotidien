import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const NOTIFICATION_ASKED_KEY = 'notification_permission_asked';
const SUBSCRIPTION_ENDPOINT_KEY = 'push_subscription_endpoint';

// VAPID public key - must match the one in Supabase secrets
// This is the public key, safe to expose in client code
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

type PermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasBeenAsked, setHasBeenAsked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

    // Check if already subscribed
    const storedEndpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    if (storedEndpoint && Notification.permission === 'granted') {
      // Verify subscription still exists in DB
      checkSubscriptionStatus(storedEndpoint);
    }
  }, []);

  const checkSubscriptionStatus = async (endpoint: string) => {
    try {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('enabled')
        .eq('endpoint', endpoint)
        .single();
      
      if (data) {
        setIsSubscribed(data.enabled);
      } else {
        // Subscription not found, clear local storage
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
      
      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Existing subscription:', subscription ? 'yes' : 'no');
      
      if (!subscription && VAPID_PUBLIC_KEY) {
        // Subscribe with real VAPID key
        try {
          console.log('[Push] Subscribing with VAPID key...');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          console.log('[Push] Subscription created:', subscription.endpoint.substring(0, 50) + '...');
        } catch (pushError) {
          console.error('[Push] Push subscription failed:', pushError);
          // Fallback to local subscription for demo
          const mockSubscription = {
            endpoint: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            p256dh: 'demo-key',
            auth: 'demo-auth'
          };
          await saveSubscription(mockSubscription.endpoint, mockSubscription.p256dh, mockSubscription.auth);
          return;
        }
      } else if (!subscription) {
        // No VAPID key configured, use local subscription
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
      // Check if subscription already exists
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', endpoint)
        .single();

      if (existing) {
        // Update existing subscription
        await supabase
          .from('push_subscriptions')
          .update({ p256dh, auth, enabled: true })
          .eq('endpoint', endpoint);
        console.log('[Push] Updated existing subscription');
      } else {
        // Insert new subscription
        await supabase
          .from('push_subscriptions')
          .insert({ endpoint, p256dh, auth, enabled: true });
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
        // If enabling and no endpoint exists, subscribe first
        const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
        if (!endpoint) {
          await subscribeToPush();
        } else {
          // Update existing subscription
          await supabase
            .from('push_subscriptions')
            .update({ enabled: true })
            .eq('endpoint', endpoint);
          setIsSubscribed(true);
        }
      } else {
        // Disable notifications
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

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    console.log('[Notification] sendTestNotification called');
    
    const endpoint = localStorage.getItem(SUBSCRIPTION_ENDPOINT_KEY);
    console.log('[Notification] Stored endpoint:', endpoint ? endpoint.substring(0, 30) + '...' : 'none');

    // Try to call the edge function to trigger server-side notification
    try {
      console.log('[Notification] Calling edge function...');
      const { data, error } = await supabase.functions.invoke('send-daily-notification', {
        body: { 
          endpoint: endpoint,
          test: true 
        }
      });

      console.log('[Notification] Edge function response:', data, error);

      if (error) {
        console.error('[Notification] Edge function error:', error);
      }
    } catch (err) {
      console.error('[Notification] Failed to call edge function:', err);
    }

    // Also show local notification as fallback/confirmation
    if (!('Notification' in window)) {
      console.error('[Notification] Notification API not supported');
      return false;
    }

    if (Notification.permission !== 'granted') {
      console.error('[Notification] Permission not granted');
      return false;
    }

    try {
      console.log('[Notification] Creating local notification...');
      const notification = new Notification('Votre mot du jour est arrivé', {
        body: 'Ceci est un test - Découvrez votre nouveau mot',
        icon: '/icon-192.png',
        tag: 'test-notification'
      });

      notification.onclick = () => {
        console.log('[Notification] Notification clicked, navigating to /');
        window.focus();
        window.location.href = '/';
      };

      console.log('[Notification] Local notification created successfully');
      return true;
    } catch (error) {
      console.error('[Notification] Error creating notification:', error);
      return false;
    }
  }, []);

  const shouldShowPrompt = !hasBeenAsked && permissionStatus === 'default';

  return {
    permissionStatus,
    isSubscribed,
    isLoading,
    shouldShowPrompt,
    requestPermission,
    toggleNotifications,
    sendTestNotification
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
