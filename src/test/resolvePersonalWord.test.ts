/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect } from 'vitest';
import { resolvePersonalWord } from '../../supabase/functions/get-daily-word/personal';

type Row = Record<string, any>;

// Faux client Supabase en mémoire : from().select().eq()...maybeSingle()/single()/await, upsert()
function makeClient(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const upserts: Row[] = [];
  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const run = () => {
      if (opts.failTable === table) return { data: null, error: { message: 'boom ' + table } };
      const rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      return { data: rows, error: null };
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
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
