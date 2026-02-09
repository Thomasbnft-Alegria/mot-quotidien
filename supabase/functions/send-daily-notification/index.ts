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
  preferred_time: string;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

// Convert VAPID key from base64url to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Simple JWT creation for VAPID
async function createVapidJwt(audience: string, subject: string, privateKeyBase64: string): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: subject,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const privateKeyBytes = urlBase64ToUint8Array(privateKeyBase64);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${unsignedToken}.${encodedSignature}`;
}

// Send push notification using Web Push protocol
async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; error?: string; endpoint: string }> {
  // Skip local/mock subscriptions
  if (subscription.endpoint.startsWith('local-')) {
    console.log(`[Push] Skipping local subscription: ${subscription.endpoint}`);
    return { success: false, error: 'Local subscription - cannot send real push', endpoint: subscription.endpoint };
  }

  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    // Create VAPID authorization header
    const jwt = await createVapidJwt(audience, 'mailto:contact@mot-quotidien.app', vapidPrivateKey);
    const vapidHeader = `vapid t=${jwt}, k=${vapidPublicKey}`;

    // Prepare the payload
    const payloadString = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadString);

    // Send the push notification
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidHeader,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body: payloadBytes,
    });

    if (response.ok || response.status === 201) {
      console.log(`[Push] Sent successfully to: ${subscription.endpoint.substring(0, 50)}...`);
      return { success: true, endpoint: subscription.endpoint };
    } else {
      const errorText = await response.text();
      console.error(`[Push] Failed to send: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}`, endpoint: subscription.endpoint };
    }
  } catch (error) {
    console.error(`[Push] Error sending notification:`, error);
    return { success: false, error: String(error), endpoint: subscription.endpoint };
  }
}

// Get current time in Paris timezone
function getParisTime(): { hours: number; minutes: number; timeString: string } {
  const now = new Date();
  const parisFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeString = parisFormatter.format(now);
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes, timeString };
}

// Get current date in Paris timezone as YYYY-MM-DD
function getParisDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

// Check if preferred time matches current time (with 5-minute tolerance)
function isTimeMatch(preferredTime: string, currentHours: number, currentMinutes: number): boolean {
  // preferred_time format: "HH:MM:SS" or "HH:MM"
  const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
  
  const prefTotalMinutes = prefHours * 60 + prefMinutes;
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  
  // Check if within 5-minute window (0-4 minutes after preferred time)
  const diff = currentTotalMinutes - prefTotalMinutes;
  return diff >= 0 && diff < 5;
}

// Get today's word from the database
async function getTodayWord(supabase: ReturnType<typeof createClient>): Promise<{ word: string; id: string } | null> {
  const todayParis = getParisDateString();
  console.log(`[Push] Getting daily word for Paris date: ${todayParis}`);

  // Check if we already have a word for today
  const { data: todayWord, error: fetchError } = await supabase
    .from("words")
    .select("id, word")
    .eq("date_shown", todayParis)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("[Push] Error fetching today's word:", fetchError);
    return null;
  }

  if (todayWord) {
    console.log(`[Push] Found existing word for today: ${todayWord.word}`);
    return { word: todayWord.word, id: todayWord.id };
  }

  // No word for today - select next unshown word
  console.log("[Push] No word for today, selecting next unshown word...");
  
  const { data: nextWord, error: nextError } = await supabase
    .from("words")
    .select("id, word")
    .is("date_shown", null)
    .order("display_order", { ascending: true })
    .limit(1)
    .single();

  if (nextError && nextError.code !== "PGRST116") {
    console.error("[Push] Error fetching next word:", nextError);
    return null;
  }

  let selectedWord = nextWord;
  if (!selectedWord) {
    // All words shown, cycle back to oldest
    console.log("[Push] All words shown, cycling back to oldest...");
    const { data: oldestWord, error: oldestError } = await supabase
      .from("words")
      .select("id, word")
      .order("date_shown", { ascending: true })
      .limit(1)
      .single();

    if (oldestError) {
      console.error("[Push] Error fetching oldest word:", oldestError);
      return null;
    }
    selectedWord = oldestWord;
  }

  if (!selectedWord) {
    console.error("[Push] No words available in database");
    return null;
  }

  // Set date_shown for the selected word
  console.log(`[Push] Setting date_shown for word: ${selectedWord.word}`);
  const { error: updateError } = await supabase
    .from("words")
    .update({ date_shown: todayParis })
    .eq("id", selectedWord.id);

  if (updateError) {
    console.error("[Push] Error updating word date_shown:", updateError);
  }

  return { word: selectedWord.word, id: selectedWord.id };
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

    // Parse request body
    let targetEndpoint: string | null = null;
    let isTest = false;
    let isScheduled = false;
    try {
      const body = await req.json();
      targetEndpoint = body.endpoint || null;
      isTest = body.test === true;
      isScheduled = body.scheduled === true;
    } catch {
      // No body or invalid JSON, treat as scheduled cron call
      isScheduled = true;
    }

    // Get current Paris time
    const { hours: currentHours, minutes: currentMinutes, timeString: currentTime } = getParisTime();
    console.log(`[Push] Current Paris time: ${currentTime}, isScheduled=${isScheduled}, isTest=${isTest}`);

    // Fetch enabled subscriptions
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

    // Filter subscriptions based on preferred time (only for scheduled calls)
    let subscriptionsToNotify = subscriptions;
    if (isScheduled && !isTest) {
      subscriptionsToNotify = subscriptions.filter((sub: PushSubscription) => 
        isTimeMatch(sub.preferred_time, currentHours, currentMinutes)
      );
      console.log(`[Push] Found ${subscriptionsToNotify.length} subscriptions matching current time ${currentTime}`);
    }

    if (subscriptionsToNotify.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No subscriptions due for notification at this time', 
          currentTime,
          totalSubscriptions: subscriptions.length,
          sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Push] Processing ${subscriptionsToNotify.length} subscription(s)`);

    // Get today's word for the notification message
    const todayWord = await getTodayWord(supabase);
    // Build notification payload per subscription (to include preferred_time for tests)
    const buildPayload = (sub: PushSubscription): PushPayload => {
      const wordName = todayWord ? todayWord.word : 'votre nouveau mot';
      const prefTime = sub.preferred_time ? sub.preferred_time.substring(0, 5) : '??:??';
      
      if (isTest) {
        return {
          title: `Découvrez : ${wordName} (test - heure planifiée : ${prefTime})`,
          body: '',
          icon: '/icon-192.png',
          url: '/',
        };
      }
      return {
        title: `Découvrez : ${wordName}`,
        body: '',
        icon: '/icon-192.png',
        url: '/',
      };
    };

    const results = await Promise.all(
      subscriptionsToNotify.map((sub: PushSubscription) => {
        const payload = buildPayload(sub);
        console.log(`[Push] Sending to ${sub.endpoint.substring(0, 40)}... payload: ${payload.title}`);
        return sendPushNotification(sub, payload, vapidPublicKey, vapidPrivateKey);
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Push] Results: ${successful} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({
        message: `Notifications processed`,
        currentTime,
        sent: successful,
        failed: failed,
        total: subscriptionsToNotify.length,
        results: isTest ? results : undefined,
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
