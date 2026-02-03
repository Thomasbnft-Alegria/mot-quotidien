import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const NOTIFICATION_ASKED_KEY = 'notification_permission_asked';
const SUBSCRIPTION_ENDPOINT_KEY = 'push_subscription_endpoint';

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
      const registration = await navigator.serviceWorker.ready;
      
      // For demo purposes without VAPID keys, we create a mock subscription
      // In production, you would use real VAPID keys
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Try to subscribe with a dummy applicationServerKey for demo
        // Real implementation would use VAPID public key
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            // This would normally be your VAPID public key
            applicationServerKey: urlBase64ToUint8Array(
              'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
            )
          });
        } catch (pushError) {
          console.warn('Push subscription failed, storing local subscription:', pushError);
          // Store a local-only subscription for demo purposes
          const mockSubscription = {
            endpoint: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            p256dh: 'demo-key',
            auth: 'demo-auth'
          };
          await saveSubscription(mockSubscription.endpoint, mockSubscription.p256dh, mockSubscription.auth);
          return;
        }
      }

      if (subscription) {
        const key = subscription.getKey('p256dh');
        const auth = subscription.getKey('auth');
        
        const p256dh = key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '';
        const authKey = auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '';
        
        await saveSubscription(subscription.endpoint, p256dh, authKey);
      }
    } catch (error) {
      console.error('Error subscribing to push:', error);
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
      } else {
        // Insert new subscription
        await supabase
          .from('push_subscriptions')
          .insert({ endpoint, p256dh, auth, enabled: true });
      }

      localStorage.setItem(SUBSCRIPTION_ENDPOINT_KEY, endpoint);
      setIsSubscribed(true);
    } catch (error) {
      console.error('Error saving subscription:', error);
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
      console.error('Error toggling notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Mot du Jour', {
        body: 'Votre mot du jour est arrivé ! 📚',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: '/' }
      } as NotificationOptions);
      return true;
    } catch (error) {
      console.error('Error sending test notification:', error);
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
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
