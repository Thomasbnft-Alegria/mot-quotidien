const ADMIN_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;
const ADMIN_TOKEN = "mq-admin-2026";

export interface WordData {
  word: string;
  definition: string;
  category: string;
  register: string;
  example_sentence: string;
}

// ── Wiktionary helpers ─────────────────────────────────────────────────────

function extractFrenchSection(wikitext: string): string | null {
  const match = wikitext.match(
    /== \{\{langue\|fr\}\} ==([\s\S]*?)(?=== \{\{langue\|(?!fr\}\})[^}]+\}\} ==|$)/
  );
  return match ? match[1] : null;
}

function joinMultilineTemplates(text: string): string {
  // Collapse multi-line {{exemple | lang=fr \n| text \n| source=...}} onto single lines
  let result = text;
  for (let i = 0; i < 5; i++) {
    result = result.replace(/(\{\{[^{}]*)\n\|([^\n]*)/g, "$1 | $2");
    result = result.replace(/(\{\{[^{}]*)\n\}\}/g, "$1}}");
  }
  return result;
}

function detectCategory(text: string): string {
  // Use FIRST {{S|TYPE|fr}} (without extra params like "flexion")
  const match = text.match(/\{\{S\|([^|}\s]+)\|fr\}\}/);
  if (match) {
    const t = match[1].toLowerCase();
    if (["verbe", "adjectif", "adverbe", "nom", "locution"].includes(t)) return t;
  }
  // Fallback
  if (/=== Verbe ===/.test(text)) return "verbe";
  if (/=== Adjectif ===/.test(text)) return "adjectif";
  if (/=== Adverbe ===/.test(text)) return "adverbe";
  return "nom";
}

function removeNestedTemplates(text: string): string {
  let result = text;
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(/\{\{[^{}]*\}\}/g, "");
  }
  return result;
}

function cleanWikitext(text: string): string {
  let t = removeNestedTemplates(text);
  t = t
    .replace(/\[\[([^\|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\|[^|]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

function extractFirstDefinition(text: string): string | null {
  for (const line of text.split("\n")) {
    if (/^# [^*:#]/.test(line)) {
      const clean = cleanWikitext(line.replace(/^# /, ""));
      if (clean.length > 3 && !clean.includes("{{")) return clean;
    }
  }
  return null;
}

function extractExempleText(line: string): string | null {
  // {{exemple | lang=fr | TEXT | source=...}} — grab 3rd pipe param
  // After joinMultilineTemplates, everything should be on one line
  const m = line.match(/\{\{exemple[^|]*\|[^|]*\|([^|}]+)/i);
  if (m) {
    const clean = cleanWikitext(m[1]);
    if (clean.length > 10 && !clean.includes("{{")) return clean;
  }
  // Also handle {{exemple|TEXT|source=...}} (no lang param)
  const m2 = line.match(/\{\{exemple\|([^|}]+)/i);
  if (m2) {
    const clean = cleanWikitext(m2[1]);
    if (clean.length > 10 && !clean.includes("{{")) return clean;
  }
  return null;
}

function extractFirstExample(text: string): string | null {
  const joined = joinMultilineTemplates(text);
  for (const line of joined.split("\n")) {
    if (/^#[*:] /.test(line)) {
      const fromTemplate = extractExempleText(line);
      if (fromTemplate) return fromTemplate;

      const clean = cleanWikitext(line.replace(/^#[*:] /, ""));
      if (clean.length > 10 && !clean.includes("{{") && !clean.includes("}}")) return clean;
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

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchWordDefinition(word: string): Promise<WordData> {
  const encoded = encodeURIComponent(word.toLowerCase().trim());
  const url = `https://fr.wiktionary.org/w/api.php?action=parse&page=${encoded}&prop=wikitext&format=json&origin=*`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Erreur réseau Wiktionnaire");

  const data = await res.json();
  if (data.error || !data.parse?.wikitext?.["*"]) {
    throw new Error(`Mot "${word}" introuvable dans le Wiktionnaire français.`);
  }

  const wikitext = data.parse.wikitext["*"];
  const frSection = extractFrenchSection(wikitext);

  if (!frSection) {
    throw new Error(`"${word}" n'existe pas en français dans le Wiktionnaire.`);
  }

  const definition = extractFirstDefinition(frSection);
  if (!definition) {
    throw new Error(`Pas de définition française trouvée pour "${word}".`);
  }

  return {
    word: word.trim(),
    definition,
    category: detectCategory(frSection),
    register: detectRegister(frSection),
    example_sentence: extractFirstExample(frSection) || `Phrase d'exemple avec "${word}".`,
  };
}

export async function insertWordToDatabase(wordData: WordData): Promise<void> {
  const res = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ action: "insert_words", words: [wordData] }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    if (data.error?.includes("duplicate") || data.error?.includes("unique")) {
      throw new Error(`Le mot "${wordData.word}" existe déjà dans la base.`);
    }
    throw new Error(data.error || "Erreur lors de l'insertion");
  }
}
