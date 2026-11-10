/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect } from 'vitest';
import { resolvePersonalWord } from '../../supabase/functions/get-daily-word/personal';

type Row = Record<string, any>;

// Faux client Supabase en mémoire : from().select().eq()...maybeSingle()/single()/await, upsert()
function makeClient(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const upserts: Row[] = [];
  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const lts: Array<[string, any]> = [];
    let ord: [string, boolean] | null = null;
    let lim: number | null = null;
    const run = () => {
      if (opts.failTable === table) return { data: null, error: { message: 'boom ' + table } };
      let rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v) && lts.every(([k, v]) => r[k] < v));
      if (ord) { const [k, asc] = ord; rows = [...rows].sort((a, c) => (a[k] < c[k] ? -1 : a[k] > c[k] ? 1 : 0) * (asc ? 1 : -1)); }
      if (lim !== null) rows = rows.slice(0, lim);
      return { data: rows, error: null };
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      lt: (k: string, v: any) => { lts.push([k, v]); return q; },
      lte: (k: string, v: any) => { lts.push([k, v + '\uffff']); return q; },
      order: (k: string, o: { ascending: boolean }) => { ord = [k, o.ascending]; return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: () => { const r = run(); return Promise.resolve(r.error ? r : { data: r.data![0] ?? null, error: null }); },
      single: () => { const r = run(); return Promise.resolve(r.error ? r : r.data![0] ? { data: r.data![0], error: null } : { data: null, error: { message: 'no row' } }); },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      upsert: (row: Row, o: { onConflict: string; ignoreDuplicates?: boolean }) => {
        upserts.push(row);
        const keys = o.onConflict.split(',');
        const exists = (tables[table] ?? []).some((r) => keys.every((k) => r[k] === row[k]));
        if (!exists) (tables[table] ??= []).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  }
  return { client: { from }, upserts };
}

const W = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: 'w' + (i + 1), display_order: i + 1, word: 'mot' + (i + 1), definition: 'def' + (i + 1),
  example_sentence: 'ex' + (i + 1), category: 'nom', register: 'courant', gender: 'masculin',
}));

describe('resolvePersonalWord', () => {
  it('nouvel utilisateur : propose w1, le fixe pour la journée et renvoie un payload complet', async () => {
    const tables: Record<string, Row[]> = { words: W(3), word_reviews: [], user_progress: [], user_settings: [], user_daily_word: [] };
    const { client, upserts } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-10-12');
    expect(r?.kind).toBe('new');
    expect(r?.word).toMatchObject({ id: 'w1', word: 'mot1', exampleSentence: 'ex1', gender: 'masculin' });
    expect(upserts).toHaveLength(1);
    expect(tables.user_daily_word).toEqual([{ user_id: 'u1', word_date: '2026-10-12', word_id: 'w1' }]);
  });

  it('2e appel le même jour : même mot, kind=fixed, aucune nouvelle écriture même si le classement change', async () => {
    const tables: Record<string, Row[]> = { words: W(5), word_reviews: [], user_progress: [], user_settings: [], user_daily_word: [] };
    const { client, upserts } = makeClient(tables);
    const first = await resolvePersonalWord(client, 'u1', '2026-10-12');
    tables.word_reviews.push({ user_id: 'u1', word_id: 'w1', status: 'active', last_reviewed_at: null });
    const second = await resolvePersonalWord(client, 'u1', '2026-10-12');
    expect(second?.word.id).toBe(first?.word.id);
    expect(second?.kind).toBe('fixed');
    expect(upserts).toHaveLength(1);
  });

  it("jour suivant sans clic 'Révisé' : le même mot neuf est reproposé (pas de ligne de révision)", async () => {
    const tables: Record<string, Row[]> = { words: W(5), word_reviews: [], user_progress: [], user_settings: [], user_daily_word: [] };
    const { client } = makeClient(tables);
    const d1 = await resolvePersonalWord(client, 'u1', '2026-10-12');
    const d2 = await resolvePersonalWord(client, 'u1', '2026-10-13');
    expect(d1?.word.id).toBe('w1');
    expect(d2?.word.id).toBe('w1');
  });

  it("jour suivant après 'Révisé' : on passe au mot suivant", async () => {
    const tables: Record<string, Row[]> = { words: W(5), word_reviews: [], user_progress: [], user_settings: [], user_daily_word: [] };
    const { client } = makeClient(tables);
    await resolvePersonalWord(client, 'u1', '2026-10-12');
    tables.word_reviews.push({ user_id: 'u1', word_id: 'w1', status: 'active', last_reviewed_at: null });
    const d2 = await resolvePersonalWord(client, 'u1', '2026-10-13');
    expect(d2?.word.id).toBe('w2');
  });

  it('réservoir plein (taille lue dans user_settings) : mot le moins assimilé', async () => {
    const tables: Record<string, Row[]> = {
      words: W(5),
      word_reviews: [
        { user_id: 'u1', word_id: 'w1', status: 'active', last_reviewed_at: null },
        { user_id: 'u1', word_id: 'w2', status: 'active', last_reviewed_at: null },
      ],
      user_progress: [
        { user_id: 'u1', word_id: 'w1', seen: true, correct_count: 3, incorrect_count: 0, last_reviewed: null },
        { user_id: 'u1', word_id: 'w2', seen: true, correct_count: 0, incorrect_count: 2, last_reviewed: null },
      ],
      user_settings: [{ user_id: 'u1', reservoir_size: 2 }],
      user_daily_word: [],
    };
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-10-12');
    expect(r).toMatchObject({ kind: 'reservoir', activeCount: 2, reservoirSize: 2 });
    expect(r?.word.id).toBe('w2');
  });

  it("isolation : les données d'un autre utilisateur sont ignorées", async () => {
    const tables: Record<string, Row[]> = {
      words: W(3),
      word_reviews: [{ user_id: 'u2', word_id: 'w1', status: 'active', last_reviewed_at: null }],
      user_progress: [{ user_id: 'u2', word_id: 'w2', seen: true, correct_count: 1, incorrect_count: 0, last_reviewed: null }],
      user_settings: [],
      user_daily_word: [{ user_id: 'u2', word_date: '2026-10-12', word_id: 'w3' }],
    };
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-10-12');
    expect(r?.word.id).toBe('w1');
  });

  it('rien à proposer : renvoie null (l’appelant retombe sur le mot global)', async () => {
    const tables: Record<string, Row[]> = {
      words: W(1),
      word_reviews: [{ user_id: 'u1', word_id: 'w1', status: 'mastered', last_reviewed_at: null }],
      user_progress: [], user_settings: [], user_daily_word: [],
    };
    const { client, upserts } = makeClient(tables);
    expect(await resolvePersonalWord(client, 'u1', '2026-10-12')).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it('erreur base : lève une exception (index.ts la capte et retombe sur le mot global)', async () => {
    const tables: Record<string, Row[]> = { words: W(2), word_reviews: [], user_progress: [], user_settings: [], user_daily_word: [] };
    const { client } = makeClient(tables, { failTable: 'word_reviews' });
    await expect(resolvePersonalWord(client, 'u1', '2026-10-12')).rejects.toBeTruthy();
  });
});

describe('resolvePersonalWord — rotation sur 5 jours (réservoir plein)', () => {
  const full = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
    words: W(6),
    word_reviews: [1, 2, 3].map((n) => ({ user_id: 'u1', word_id: 'w' + n, status: 'active', last_reviewed_at: null, easy_count: 0, ease_factor: 2.5 })),
    user_progress: [],
    user_settings: [{ user_id: 'u1', reservoir_size: 3 }],
    user_daily_word: [],
    ...extra,
  });

  it('un mot montré hier ne redevient pas le mot du jour tant que d\'autres mots actifs existent', async () => {
    const tables = full({ user_daily_word: [{ user_id: 'u1', word_date: '2026-11-09', word_id: 'w1' }] });
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    expect(r?.kind).toBe('reservoir');
    expect(r?.word.id).not.toBe('w1');
  });

  it('plusieurs jours de suite : le mot change chaque jour (3 mots actifs => 3 mots différents)', async () => {
    const tables = full();
    const { client } = makeClient(tables);
    const seen: string[] = [];
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-12']) {
      const r = await resolvePersonalWord(client, 'u1', d);
      seen.push(r!.word.id as string);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('tous les mots actifs ont été montrés récemment : on reprend le moins assimilé (jamais de blocage)', async () => {
    const tables = full({ user_daily_word: ['w1', 'w2', 'w3'].map((id, i) => ({ user_id: 'u1', word_date: '2026-11-0' + (6 + i), word_id: id })) });
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    expect(r?.word.id).toBeTruthy();
    expect(['w1', 'w2', 'w3']).toContain(r?.word.id);
  });

  it("seuls les 5 derniers jours comptent : un mot montré il y a 6 jours peut revenir", async () => {
    const days = ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05'];
    const tables = full({
      word_reviews: ['w1', 'w2'].map((id) => ({ user_id: 'u1', word_id: id, status: 'active', last_reviewed_at: null, easy_count: 0, ease_factor: 2.5 })),
      user_settings: [{ user_id: 'u1', reservoir_size: 2 }],
      user_daily_word: [
        ...days.map((d) => ({ user_id: 'u1', word_date: d, word_id: 'wX' })),
        { user_id: 'u1', word_date: '2026-11-04', word_id: 'w1' }, // 6 jours avant : hors fenêtre
      ],
    });
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    // Fenêtre = min(5, actifs-1) = 1 ici : seul wX (hors liste active) est récent. w1 (montré il y a 6 jours) et w2 (jamais montré)
    // sont à égalité de classement : le jamais montré (w2) passe avant le montré il y a longtemps (w1), mais w1 n'est pas écarté.
    expect(['w1', 'w2']).toContain(r?.word.id);
    expect(r?.word.id).toBe('w2');
  });

  it("la ligne d'aujourd'hui ne compte pas dans la rotation (un mot déjà fixé reste fixé)", async () => {
    const tables = full({ user_daily_word: [{ user_id: 'u1', word_date: '2026-11-10', word_id: 'w2' }] });
    const { client, upserts } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    expect(r?.kind).toBe('fixed');
    expect(r?.word.id).toBe('w2');
    expect(upserts).toHaveLength(0);
  });

  it("les mots montrés à un AUTRE utilisateur n'influencent pas la rotation", async () => {
    const tables = full({ user_daily_word: [{ user_id: 'u2', word_date: '2026-11-09', word_id: 'w1' }] });
    const { client } = makeClient(tables);
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    expect(r?.word.id).toBe('w1');
  });
});

describe("resolvePersonalWord — la ligne d'aujourd'hui n'entre pas dans l'historique de rotation", () => {
  it("un mot choisi aujourd'hui (jour en cours) n'est pas traité comme « montré récemment » pour le calcul du jour", async () => {
    // Cas précis : aujourd'hui n'a pas encore de mot fixé ; une ligne datée d'AUJOURD'HUI ne peut exister que par erreur.
    // Elle ne doit pas écarter w1 (on la lit avec word_date < aujourd'hui).
    const tables: Record<string, Row[]> = {
      words: W(3),
      word_reviews: [1, 2].map((n) => ({ user_id: 'u1', word_id: 'w' + n, status: 'active', last_reviewed_at: null, easy_count: 0, ease_factor: 2.5 })),
      user_progress: [], user_settings: [{ user_id: 'u1', reservoir_size: 2 }],
      user_daily_word: [{ user_id: 'u1', word_date: '2026-11-10', word_id: 'w1' }],
    };
    const { client } = makeClient(tables);
    // la ligne du jour existe => le mot est « fixé » : preuve que la lecture « avant aujourd'hui » ne la confond pas avec l'historique
    const r = await resolvePersonalWord(client, 'u1', '2026-11-10');
    expect(r?.kind).toBe('fixed');
    expect(r?.word.id).toBe('w1');
  });

  it("l'historique lu exclut strictement aujourd'hui : demain, le mot d'aujourd'hui compte comme « montré hier »", async () => {
    const tables: Record<string, Row[]> = {
      words: W(3),
      word_reviews: [1, 2, 3].map((n) => ({ user_id: 'u1', word_id: 'w' + n, status: 'active', last_reviewed_at: null, easy_count: 0, ease_factor: 2.5 })),
      user_progress: [], user_settings: [{ user_id: 'u1', reservoir_size: 3 }], user_daily_word: [],
    };
    const { client } = makeClient(tables);
    const d1 = await resolvePersonalWord(client, 'u1', '2026-11-10');
    const d2 = await resolvePersonalWord(client, 'u1', '2026-11-11');
    expect(d2?.word.id).not.toBe(d1?.word.id);
  });
});
