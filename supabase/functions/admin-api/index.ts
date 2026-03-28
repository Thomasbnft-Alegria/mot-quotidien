import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: check admin token (ADMIN_SECRET env var, or fallback hardcoded)
  const adminSecret = Deno.env.get("ADMIN_SECRET") || "mq-fb2026-x9k";
  const token = req.headers.get("x-admin-token");

  if (token !== adminSecret) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized", hint: `expected length ${adminSecret.length}` }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ── INSERT WORDS ──────────────────────────────────────────────
    if (action === "insert_words") {
      const { words } = body;
      if (!Array.isArray(words) || words.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "words array is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("words")
        .insert(words)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, inserted: data?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST WORDS ────────────────────────────────────────────────
    if (action === "list_words") {
      const { limit = 50, offset = 0 } = body;

      const { data, error, count } = await supabase
        .from("words")
        .select("*", { count: "exact" })
        .order("display_order", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, words: data, total: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DELETE WORD ───────────────────────────────────────────────
    if (action === "delete_word") {
      const { id } = body;
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase.from("words").delete().eq("id", id);
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPDATE WORD ───────────────────────────────────────────────
    if (action === "update_word") {
      const { id, ...fields } = body;
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      delete fields.action;

      const { data, error } = await supabase
        .from("words")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, word: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STATS ─────────────────────────────────────────────────────
    if (action === "stats") {
      const { count: total } = await supabase
        .from("words")
        .select("*", { count: "exact", head: true });

      const { count: shown } = await supabase
        .from("words")
        .select("*", { count: "exact", head: true })
        .not("date_shown", "is", null);

      return new Response(
        JSON.stringify({ success: true, total, shown, remaining: (total ?? 0) - (shown ?? 0) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Admin API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
