// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@^1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DBSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
  preferred_time: string;
}

// Convert standard base64 to base64url
function b64ToB64url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  const [prefHours, prefMinutes] = preferredTime.split(':').map(Number);
  const prefTotalMinutes = prefHours * 60 + prefMinutes;
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const diff = currentTotalMinutes - prefTotalMinutes;
  return diff >= 0 && diff < 5;
}

// Get today's word from the database
async function getTodayWord(supabase: ReturnType<typeof createClient>): Promise<{ word: string; id: string } | null> {
  const todayParis = getParisDateString();
  console.log(`[Push] Getting daily word for Paris date: ${todayParis}`);

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

    // Debug: log VAPID public key info
    console.log(`[Push] VAPID public key length: ${vapidPublicKey.length}, starts with: ${vapidPublicKey.substring(0, 10)}`);
    console.log(`[Push] VAPID private key length: ${vapidPrivateKey.length}`);

    const vapid = {
      subject: 'mailto:contact@mot-quotidien.app',
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    };

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
      isScheduled = true;
    }

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

    // Filter by preferred time for scheduled calls
    let subscriptionsToNotify = subscriptions;
    if (isScheduled && !isTest) {
      subscriptionsToNotify = subscriptions.filter((sub: DBSubscription) =>
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

    // Get today's word
    const todayWord = await getTodayWord(supabase);
    const wordName = todayWord ? todayWord.word : 'votre nouveau mot';

    // Send push to each subscription
    const results = await Promise.all(
      subscriptionsToNotify.map(async (sub: DBSubscription) => {
        // Skip local/mock subscriptions
        if (sub.endpoint.startsWith('local-')) {
          console.log(`[Push] Skipping local subscription: ${sub.endpoint}`);
          return { success: false, error: 'Local subscription', endpoint: sub.endpoint };
        }

        const prefTime = sub.preferred_time ? sub.preferred_time.substring(0, 5) : '??:??';

        const title = isTest
          ? `Découvrez : ${wordName} (test - heure planifiée : ${prefTime})`
          : `Découvrez : ${wordName}`;

        const notificationPayload = JSON.stringify({
          title,
          body: '',
          icon: '/icon-192.png',
          url: '/',
        });

        console.log(`[Push] Sending to ${sub.endpoint.substring(0, 50)}... title: ${title}`);

        try {
          // Convert DB keys (standard base64) to base64url for the library
          const subscription = {
            endpoint: sub.endpoint,
            expirationTime: null as number | null,
            keys: {
              p256dh: b64ToB64url(sub.p256dh),
              auth: b64ToB64url(sub.auth),
            },
          };

          // Build the encrypted push payload using Web Crypto
          const pushPayload = await buildPushPayload(
            {
              data: notificationPayload,
              options: { ttl: 86400, urgency: 'normal' },
            },
            subscription,
            vapid,
          );

          // Send the push notification
          const response = await fetch(sub.endpoint, pushPayload);

          if (response.ok || response.status === 201) {
            console.log(`[Push] Sent successfully to: ${sub.endpoint.substring(0, 50)}...`);
            return { success: true, endpoint: sub.endpoint };
          } else {
            const errorText = await response.text();
            console.error(`[Push] Failed: ${response.status} - ${errorText}`);
            return { success: false, error: `HTTP ${response.status}: ${errorText}`, endpoint: sub.endpoint };
          }
        } catch (err) {
          console.error(`[Push] Error sending to ${sub.endpoint.substring(0, 50)}:`, err);
          return { success: false, error: String(err), endpoint: sub.endpoint };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Push] Results: ${successful} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({
        message: 'Notifications processed',
        currentTime,
        sent: successful,
        failed,
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
