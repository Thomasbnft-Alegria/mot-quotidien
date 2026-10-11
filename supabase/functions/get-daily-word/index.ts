import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePersonalWord, toWordPayload } from "./personal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bump this version whenever a significant data/schema change requires cache invalidation on clients
const DATA_VERSION = "2026-06-07-v1";

// Get current date in Europe/Paris timezone as YYYY-MM-DD string
function getParisDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // YYYY-MM-DD
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const todayParis = getParisDateString();
    console.log("Getting daily word for Paris date: " + todayParis);

    // ── Mode PERSONNEL (opt-in) : { personal: true } + JWT utilisateur, ou clé service + userId (appel interne)
    let body: { personal?: boolean; userId?: string } = {};
    try { body = await req.json(); } catch { /* pas de body : mode global */ }

    if (body && body.personal === true) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      let userId: string | null = null;
      if (token && token === supabaseServiceKey && typeof body.userId === "string") {
        userId = body.userId;
      } else if (token) {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) userId = data.user.id;
      }

      if (userId) {
        try {
          const result = await resolvePersonalWord(supabase, userId, todayParis);
          if (result) {
            return json({
              success: true,
              dataVersion: DATA_VERSION,
              isPersonal: true,
              kind: result.kind,
              activeCount: result.activeCount,
              reservoirSize: result.reservoirSize,
              word: result.word,
              date: todayParis,
            });
          }
          console.warn("Personal mode: nothing to propose, falling back to global word");
        } catch (e) {
          // Ne jamais casser la page d'accueil : en cas d'erreur on retombe sur le mot global
          console.error("Personal mode failed, falling back to global word:", e);
        }
      }
    }

    // ── Mode GLOBAL (comportement historique, inchangé)
    // Step 1: Check if we already have a word for today
    const { data: todayWord, error: fetchError } = await supabase
      .from("words")
      .select("*")
      .eq("date_shown", todayParis)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching today's word:", fetchError);
      throw fetchError;
    }

    if (todayWord) {
      console.log("Found existing word for today: " + todayWord.word);
      return json({
        success: true,
        dataVersion: DATA_VERSION,
        word: toWordPayload(todayWord),
        date: todayParis,
      });
    }

    // Step 2: No word for today - select next unshown word (by display_order)
    console.log("No word for today, selecting next unshown word...");

    const { data: nextWord, error: nextError } = await supabase
      .from("words")
      .select("*")
      .is("date_shown", null)
      .order("display_order", { ascending: true })
      .limit(1)
      .single();

    if (nextError && nextError.code !== "PGRST116") {
      console.error("Error fetching next word:", nextError);
      throw nextError;
    }

    // If no unshown words, cycle back to the oldest shown word
    let selectedWord = nextWord;
    if (!selectedWord) {
      console.log("All words shown, cycling back to oldest...");
      const { data: oldestWord, error: oldestError } = await supabase
        .from("words")
        .select("*")
        .order("date_shown", { ascending: true })
        .limit(1)
        .single();

      if (oldestError) {
        console.error("Error fetching oldest word:", oldestError);
        throw oldestError;
      }
      selectedWord = oldestWord;
    }

    if (!selectedWord) {
      throw new Error("No words available in database");
    }

    // Step 3: Update the selected word's date_shown to today
    console.log("Setting date_shown for word: " + selectedWord.word);
    const { error: updateError } = await supabase
      .from("words")
      .update({ date_shown: todayParis })
      .eq("id", selectedWord.id);

    if (updateError) {
      console.error("Error updating word date_shown:", updateError);
      throw updateError;
    }

    return json({
      success: true,
      dataVersion: DATA_VERSION,
      word: toWordPayload(selectedWord),
      date: todayParis,
      isNew: true,
    });
  } catch (error) {
    console.error("Error in get-daily-word:", error);
    return json({ success: false, error: (error as Error).message }, 500);
  }
});
