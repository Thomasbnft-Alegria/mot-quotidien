// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPushPayload } from "https://esm.sh/@block65/webcrypto-web-push@1";

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
  user_id?: string | null;
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

    // Dedup: une seule subscription (la plus récente) PAR UTILISATEUR.
    // Les subscriptions non rattachées (user_id NULL, historiques) forment un groupe à part, comme avant.
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('id, created_at, user_id')
      .order('created_at', { ascending: false });

    if (allSubs && allSubs.length > 1) {
      const seenGroups = new Set<string>();
      const idsToDelete: string[] = [];
      for (const s of allSubs as { id: string; user_id: string | null }[]) {
        const group = s.user_id ?? '__unlinked__';
        if (seenGroups.has(group)) idsToDelete.push(s.id);
        else seenGroups.add(group);
      }
      if (idsToDelete.length > 0) {
        await supabase.from('push_subscriptions').delete().in('id', idsToDelete);
        console.log(`[Push] Dedup: deleted ${idsToDelete.length} old subscription(s), kept most recent per user`);
      }
    }

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

    // Mot global (repli) : calculé une seule fois, et seulement si au moins un abonnement en a besoin
    let globalWordPromise: Promise<string> | null = null;
    const getGlobalWordName = (): Promise<string> => {
      if (!globalWordPromise) {
        globalWordPromise = getTodayWord(supabase).then((w) => (w ? w.word : 'votre nouveau mot'));
      }
      return globalWordPromise;
    };

    // Mot PERSONNEL d'un utilisateur : appel interne à get-daily-word (clé service + userId).
    // Retourne null si indisponible -> l'appelant retombe sur le mot global.
    const getPersonalWordName = async (userId: string): Promise<string | null> => {
      try {
        const res = await fetch(supabaseUrl + '/functions/v1/get-daily-word', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + supabaseServiceKey,
            'apikey': supabaseServiceKey,
          },
          body: JSON.stringify({ personal: true, userId }),
        });
        if (!res.ok) {
          console.error('[Push] Personal word HTTP ' + res.status);
          return null;
        }
        const data = await res.json();
        return data && data.success && data.isPersonal === true && data.word ? data.word.word : null;
      } catch (err) {
        console.error('[Push] Personal word failed:', err);
        return null;
      }
    };

    // Send push to each subscription
    const results = await Promise.all(
      subscriptionsToNotify.map(async (sub: DBSubscription & { last_notified_at?: string | null }) => {
        // Skip local/mock subscriptions
        if (sub.endpoint.startsWith('local-')) {
          console.log(`[Push] Skipping local subscription: ${sub.endpoint}`);
          return { success: false, error: 'Local subscription', endpoint: sub.endpoint };
        }

        // Anti-doublon : skip si notifié il y a moins de 20h (sauf en mode test)
        if (!isTest && sub.last_notified_at) {
          const lastMs = new Date(sub.last_notified_at).getTime();
          const ageHours = (Date.now() - lastMs) / (1000 * 60 * 60);
          if (ageHours < 20) {
            console.log(`[Push] Skipping (dedupe): last notified ${ageHours.toFixed(1)}h ago for ${sub.endpoint.substring(0, 50)}...`);
            return { success: false, error: `Skipped: notified ${ageHours.toFixed(1)}h ago`, endpoint: sub.endpoint, skipped: true };
          }
        }

        const prefTime = sub.preferred_time ? sub.preferred_time.substring(0, 5) : '??:??';

        // Abonnement rattaché à un utilisateur => son mot personnel ; sinon (ou en cas d'échec) mot global
        let wordName: string | null = null;
        if (sub.user_id) wordName = await getPersonalWordName(sub.user_id);
        if (!wordName) wordName = await getGlobalWordName();

        const title = isTest
          ? `Découvrez : ${wordName} (test - heure planifiée : ${prefTime})`
          : `Découvrez : ${wordName}`;

        const notificationPayload = JSON.stringify({
          title,
          body: '',
          icon: '/icon-192.png',
          url: './',
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
            // Marquer comme notifié (bypass RLS via service role)
            const { error: updErr } = await supabase
              .from('push_subscriptions')
              .update({ last_notified_at: new Date().toISOString() })
              .eq('id', sub.id);
            if (updErr) console.error('[Push] Failed to update last_notified_at:', updErr);
            return { success: true, endpoint: sub.endpoint };
          } else if (response.status === 410 || response.status === 404) {
            // Subscription expired or unregistered — remove it from DB automatically
            console.warn(`[Push] Subscription expired (${response.status}), removing from DB: ${sub.endpoint.substring(0, 50)}...`);
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
            return { success: false, error: `Subscription expired (${response.status}) — removed from DB`, endpoint: sub.endpoint, removed: true };
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
