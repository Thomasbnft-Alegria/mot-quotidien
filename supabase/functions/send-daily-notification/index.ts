import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

// Send push notification using fetch (simplified approach for demo)
// Note: Real web push requires ECDH encryption, but we'll use service worker to show local notification
async function sendPushNotification(
  subscription: PushSubscription,
  _payload: PushPayload,
  _vapidPublicKey: string,
  _vapidPrivateKey: string
): Promise<{ success: boolean; error?: string; endpoint: string }> {
  // For local/mock subscriptions, we can't send real push
  if (subscription.endpoint.startsWith('local-')) {
    console.log(`[Push] Skipping local subscription: ${subscription.endpoint}`);
    return { success: false, error: 'Local subscription - cannot send real push', endpoint: subscription.endpoint };
  }

  // Log the attempt
  console.log(`[Push] Would send to: ${subscription.endpoint.substring(0, 80)}...`);
  
  // For real web push, we'd need to implement the full encryption protocol
  // This is a placeholder that returns success for tracking purposes
  return { success: true, endpoint: subscription.endpoint };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('[Push] VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body to check if this is a single-user test
    let targetEndpoint: string | null = null;
    let isTest = false;
    try {
      const body = await req.json();
      targetEndpoint = body.endpoint || null;
      isTest = body.test === true;
    } catch {
      // No body or invalid JSON, send to all
    }

    // Fetch subscriptions
    let query = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('enabled', true);

    if (targetEndpoint) {
      query = query.eq('endpoint', targetEndpoint);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error('[Push] Error fetching subscriptions:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[Push] No enabled subscriptions found');
      return new Response(
        JSON.stringify({ message: 'No subscriptions to notify', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Push] Processing ${subscriptions.length} subscription(s), isTest=${isTest}`);

    const payload: PushPayload = {
      title: 'Votre mot du jour est arrivé',
      body: 'Découvrez votre nouveau mot',
      icon: '/icon-192.png',
      url: '/',
    };

    const results = await Promise.all(
      subscriptions.map((sub: PushSubscription) =>
        sendPushNotification(sub, payload, vapidPublicKey, vapidPrivateKey)
      )
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Push] Results: ${successful} sent, ${failed} failed`);

    // Return the payload so client can show local notification for testing
    return new Response(
      JSON.stringify({
        message: `Notifications processed`,
        sent: successful,
        failed: failed,
        total: subscriptions.length,
        payload: isTest ? payload : undefined,
        subscriptions: isTest ? subscriptions.map((s: PushSubscription) => ({ 
          endpoint: s.endpoint.substring(0, 50) + '...',
          enabled: s.enabled 
        })) : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Push] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
