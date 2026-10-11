// Sélection du mot du jour PERSONNEL (réservoir). Module pur : aucune dépendance Deno/Node, testé avec Vitest.
export interface WordRow { id: string; display_order: number | null }
export interface ReviewRow { word_id: string; status: string | null; last_reviewed_at: string | null }
export interface ProgressRow {
  word_id: string;
  seen: boolean;
  correct_count: number;
  incorrect_count: number;
  last_reviewed: string | null;
}
export type SelectionKind = 'new' | 'reservoir' | 'none';
export interface Selection { kind: SelectionKind; wordId: string | null; activeCount: number; reservoirSize: number }

export const DEFAULT_RESERVOIR_SIZE = 20;

export function normalizeReservoirSize(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_RESERVOIR_SIZE;
}

function byDisplayOrder(a: WordRow, b: WordRow): number {
  const ao = a.display_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Mot le moins assimilé parmi les mots actifs : pire ratio bonnes/total, puis révision la plus ancienne.
function leastAssimilated(
  activeIds: string[],
  words: Map<string, WordRow>,
  progress: Map<string, ProgressRow>,
  reviews: Map<string, ReviewRow>,
): string | null {
  const scored = activeIds
    .filter((id) => words.has(id))
    .map((id) => {
      const p = progress.get(id);
      const total = (p?.correct_count ?? 0) + (p?.incorrect_count ?? 0);
      const ratio = total > 0 ? (p!.correct_count / total) : 0;
      const last = p?.last_reviewed ?? reviews.get(id)?.last_reviewed_at ?? null;
      const lastMs = last ? new Date(last).getTime() : Number.NEGATIVE_INFINITY;
      return { id, ratio, lastMs, word: words.get(id)! };
    });
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (a.ratio !== b.ratio) return a.ratio - b.ratio;
    if (a.lastMs !== b.lastMs) return a.lastMs < b.lastMs ? -1 : 1;
    return byDisplayOrder(a.word, b.word);
  });
  return scored[0].id;
}

export function selectPersonalWord(input: {
  words: WordRow[];
  reviews: ReviewRow[];
  progress: ProgressRow[];
  reservoirSize: unknown;
}): Selection {
  const reservoirSize = normalizeReservoirSize(input.reservoirSize);
  const words = new Map(input.words.map((w) => [w.id, w] as [string, WordRow]));
  const reviews = new Map(input.reviews.map((r) => [r.word_id, r] as [string, ReviewRow]));
  const progress = new Map(input.progress.map((p) => [p.word_id, p] as [string, ProgressRow]));

  // Un mot est "connu" s'il a une ligne de révision (tout statut) ou s'il est marqué vu.
  const known = new Set<string>(input.reviews.map((r) => r.word_id));
  for (const p of input.progress) if (p.seen) known.add(p.word_id);

  const activeIds = input.reviews.filter((r) => (r.status ?? 'active') === 'active').map((r) => r.word_id);

  if (activeIds.length < reservoirSize) {
    const next = [...input.words].sort(byDisplayOrder).find((w) => !known.has(w.id));
    if (next) return { kind: 'new', wordId: next.id, activeCount: activeIds.length, reservoirSize };
  }

  const worst = leastAssimilated(activeIds, words, progress, reviews);
  if (worst) return { kind: 'reservoir', wordId: worst, activeCount: activeIds.length, reservoirSize };

  return { kind: 'none', wordId: null, activeCount: activeIds.length, reservoirSize };
}

// ── Accès base (client Supabase injecté => testable avec un faux client) ─────────────────────────
export function toWordPayload(w: Record<string, unknown>) {
  return {
    id: w.id,
    word: w.word,
    definition: w.definition,
    exampleSentence: w.example_sentence,
    category: w.category,
    register: w.register,
    gender: w.gender ?? undefined,
  };
}

export interface PersonalResult {
  word: ReturnType<typeof toWordPayload>;
  kind: SelectionKind | 'fixed';
  activeCount?: number;
  reservoirSize?: number;
}

// deno-lint-ignore no-explicit-any
export async function resolvePersonalWord(supabase: any, userId: string, todayParis: string): Promise<PersonalResult | null> {
  // 1. Mot déjà fixé pour aujourd'hui ?
  const { data: existing, error: exErr } = await supabase
    .from('user_daily_word')
    .select('word_id')
    .eq('user_id', userId)
    .eq('word_date', todayParis)
    .maybeSingle();
  if (exErr) throw exErr;

  let wordId: string | null = existing?.word_id ?? null;
  let kind: PersonalResult['kind'] = 'fixed';
  let activeCount: number | undefined;
  let reservoirSize: number | undefined;

  if (!wordId) {
    // 2. Charger les données de l'utilisateur et choisir
    const [wordsRes, reviewsRes, progressRes, settingsRes] = await Promise.all([
      supabase.from('words').select('id, display_order'),
      supabase.from('word_reviews').select('word_id, status, last_reviewed_at').eq('user_id', userId),
      supabase.from('user_progress').select('word_id, seen, correct_count, incorrect_count, last_reviewed').eq('user_id', userId),
      supabase.from('user_settings').select('reservoir_size').eq('user_id', userId).maybeSingle(),
    ]);
    for (const r of [wordsRes, reviewsRes, progressRes, settingsRes]) if (r.error) throw r.error;

    const sel = selectPersonalWord({
      words: wordsRes.data ?? [],
      reviews: reviewsRes.data ?? [],
      progress: progressRes.data ?? [],
      reservoirSize: settingsRes.data?.reservoir_size,
    });
    if (!sel.wordId) return null; // rien à proposer -> l'appelant retombe sur le mot global
    kind = sel.kind;
    activeCount = sel.activeCount;
    reservoirSize = sel.reservoirSize;

    // 3. Fixer pour la journée (course possible : on relit la ligne gagnante)
    const { error: insErr } = await supabase
      .from('user_daily_word')
      .upsert({ user_id: userId, word_date: todayParis, word_id: sel.wordId }, { onConflict: 'user_id,word_date', ignoreDuplicates: true });
    if (insErr) throw insErr;
    const { data: stored, error: stErr } = await supabase
      .from('user_daily_word')
      .select('word_id')
      .eq('user_id', userId)
      .eq('word_date', todayParis)
      .single();
    if (stErr) throw stErr;
    wordId = stored.word_id;
  }

  const { data: word, error: wErr } = await supabase.from('words').select('*').eq('id', wordId).single();
  if (wErr) throw wErr;

  return { word: toWordPayload(word), kind, activeCount, reservoirSize };
}
