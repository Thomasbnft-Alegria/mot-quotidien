import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Wiktionary helpers ─────────────────────────────────────────────────────

async function fetchDefinitionFromWiktionary(word: string) {
  const encodedWord = encodeURIComponent(word.toLowerCase().trim());
  const url = `https://fr.wiktionary.org/w/api.php?action=parse&page=${encodedWord}&prop=wikitext&format=json&origin=*`;

  const response = await fetch(url, {
    headers: { "User-Agent": "mot-quotidien-app/1.0" },
  });
  const data = await response.json();

  if (data.error || !data.parse?.wikitext?.["*"]) return null;

  const wikitext = data.parse.wikitext["*"];
  return parseWikitext(word.trim(), wikitext);
}

function extractFrenchSection(wikitext: string): string {
  const match = wikitext.match(/== \{\{langue\|fr\}\} ==([\s\S]*?)(?=== \{\{langue\|(?!fr\}\})[^}]+\}\} ==|$)/);
  return match ? match[1] : wikitext;
}

function detectCategory(text: string): string {
  if (/\{\{S\|verbe/.test(text)) return "verbe";
  if (/\{\{S\|adjectif/.test(text)) return "adjectif";
  if (/\{\{S\|adverbe/.test(text)) return "adverbe";
  if (/\{\{S\|nom/.test(text)) return "nom";
  if (/\{\{S\|locution/.test(text)) return "locution";
  // Fallback: look for old-style headers
  if (/=== Verbe ===/.test(text)) return "verbe";
  if (/=== Adjectif ===/.test(text)) return "adjectif";
  if (/=== Adverbe ===/.test(text)) return "adverbe";
  return "nom";
}

function cleanWikitext(text: string): string {
  return text
    .replace(/'''\[\[([^\|\]]+\|)?([^\]]+)\]\]'''/g, "$2")
    .replace(/\[\[([^\|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstDefinition(text: string): string | null {
  // Lines starting with exactly "# " (not "## " or "#* ")
  const lines = text.split("\n");
  for (const line of lines) {
    if (/^# [^*:#]/.test(line)) {
      return cleanWikitext(line.replace(/^# /, ""));
    }
  }
  return null;
}

function extractFirstExample(text: string): string | null {
  const lines = text.split("\n");
  for (const line of lines) {
    if (/^#[*:] /.test(line)) {
      const clean = cleanWikitext(line.replace(/^#[*:] /, ""));
      if (clean.length > 5) return clean;
    }
  }
  return null;
}

function detectRegister(text: string): string {
  const lower = text.toLowerCase();
  if (/familier|fam\.|populaire|pop\./.test(lower)) return "familier";
  if (/soutenu|littéraire|litt\.|poétique/.test(lower)) return "soutenu";
  if (/vieilli|archaïque/.test(lower)) return "vieilli";
  return "courant";
}

function parseWikitext(word: string, wikitext: string) {
  const frSection = extractFrenchSection(wikitext);

  const category = detectCategory(frSection);
  const definition = extractFirstDefinition(frSection);
  const example = extractFirstExample(frSection);
  const register = detectRegister(frSection);

  if (!definition) return null;

  return {
    word,
    definition,
    category,
    register,
    example_sentence: example || `Phrase d'exemple avec "${word}".`,
  };
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify user JWT
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await anonClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalide" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { word, action, wordData: manualData } = body;

    if (!word || typeof word !== "string") {
      return new Response(JSON.stringify({ error: "Le champ 'word' est requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PREVIEW: fetch definition without inserting ────────────────
    if (action === "preview") {
      const wordDef = await fetchDefinitionFromWiktionary(word);
      if (!wordDef) {
        return new Response(
          JSON.stringify({ error: `Mot "${word}" introuvable dans le Wiktionnaire français.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ success: true, word: wordDef }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── INSERT: save word to database ──────────────────────────────
    if (action === "insert") {
      // Use manualData if provided (after user edits), else fetch fresh
      let wordDef = manualData;
      if (!wordDef) {
        wordDef = await fetchDefinitionFromWiktionary(word);
        if (!wordDef) {
          return new Response(
            JSON.stringify({ error: `Mot "${word}" introuvable dans le Wiktionnaire français.` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Ensure word field matches
      wordDef.word = word.trim();

      // Get next display_order
      const { data: maxRow } = await serviceClient
        .from("words")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1)
        .single();

      const nextOrder = (maxRow?.display_order ?? 0) + 1;

      const { data, error } = await serviceClient
        .from("words")
        .insert({ ...wordDef, display_order: nextOrder })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return new Response(
            JSON.stringify({ error: `Le mot "${word}" existe déjà dans la base.` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw error;
      }

      return new Response(JSON.stringify({ success: true, word: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("add-custom-word error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
