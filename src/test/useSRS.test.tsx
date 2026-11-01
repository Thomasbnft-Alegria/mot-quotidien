/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Word } from '@/types/word';

type Row = Record<string, any>;
const db: { word_reviews: Row[]; user_progress: Row[]; upserts: Row[]; failUpsert: boolean } = { word_reviews: [], user_progress: [], upserts: [], failUpsert: false };

// L'objet utilisateur doit être stable entre les rendus (comme le vrai useAuth), sinon le chargement boucle.
const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: 'word_reviews' | 'user_progress') => {
      const filters: Array<[string, unknown]> = [];
      const run = () => ({ data: db[table].filter((r) => filters.every(([k, v]) => r[k] === v)), error: null });
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        insert: () => Promise.resolve({ error: null }),
        upsert: (row: Row) => { db.upserts.push(row); return Promise.resolve({ error: db.failUpsert ? { message: 'boom' } : null }); },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  },
}));

import { useSRS } from '@/hooks/useSRS';

const mkWord = (id: string): Word => ({ id, word: 'mot' + id, definition: 'd', exampleSentence: 'e', category: 'nom', register: 'courant' }) as Word;
const words = ['a', 'b', 'c'].map(mkWord);
const review = (wordId: string, over: Row = {}): Row => ({
  id: 'r-' + wordId, user_id: 'u1', word_id: wordId, ease_factor: 2.5, interval_days: 6, repetitions: 2,
  next_review_date: '2026-01-01', status: 'active', easy_count: 0, mastered_at: null, check_stage: 0, next_check_date: null, ...over,
});

async function load() {
  const hook = renderHook(() => useSRS(words));
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  await waitFor(() => expect(hook.result.current.tableExists).toBe(true));
  return hook;
}

beforeEach(() => {
  db.word_reviews = []; db.user_progress = []; db.upserts = []; db.failUpsert = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-10T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('useSRS.submitReview — règles de maîtrise enregistrées', () => {
  it('réponse fausse (même avec Facile) : SM-2 comme Difficile, aucun point', async () => {
    db.word_reviews = [review('a', { easy_count: 2 })];
    const { result } = await load();
    let outcome: any;
    await act(async () => { outcome = await result.current.submitReview('a', 'easy', false); });
    const saved = db.upserts.at(-1)!;
    expect(saved).toMatchObject({ word_id: 'a', status: 'active', easy_count: 2, repetitions: 0, interval_days: 1 });
    expect(outcome.pointGained).toBe(false);
    expect(result.current.getMastery('a').easyCount).toBe(2);
  });

  it('bonne réponse + Facile : +1 point', async () => {
    db.word_reviews = [review('a', { easy_count: 1 })];
    const { result } = await load();
    await act(async () => { await result.current.submitReview('a', 'easy', true); });
    expect(db.upserts.at(-1)).toMatchObject({ status: 'active', easy_count: 2 });
    expect(result.current.getMastery('a').easyCount).toBe(2);
  });

  it('bonne réponse + Bien : pas de point, SM-2 avance', async () => {
    db.word_reviews = [review('a', { easy_count: 1 })];
    const { result } = await load();
    await act(async () => { await result.current.submitReview('a', 'good', true); });
    const saved = db.upserts.at(-1)!;
    expect(saved.easy_count).toBe(1);
    expect(saved.repetitions).toBe(3);
  });

  it('3e Facile : mot maîtrisé, date de maîtrise et 1er contrôle à +1 mois', async () => {
    db.word_reviews = [review('a', { easy_count: 2 })];
    const { result } = await load();
    let outcome: any;
    await act(async () => { outcome = await result.current.submitReview('a', 'easy', true); });
    expect(outcome.justMastered).toBe(true);
    expect(db.upserts.at(-1)).toMatchObject({
      status: 'mastered', easy_count: 3, mastered_at: '2026-02-10T10:00:00.000Z', check_stage: 0, next_check_date: '2026-03-10',
    });
    expect(result.current.dueReviews().map((w) => w.id)).not.toContain('a'); // pas encore dû en contrôle
  });

  it('contrôle réussi : le calendrier SM-2 est conservé, prochain contrôle à +3 mois', async () => {
    db.word_reviews = [review('a', {
      status: 'mastered', easy_count: 3, mastered_at: '2026-01-10T10:00:00.000Z', check_stage: 0,
      next_check_date: '2026-02-10', next_review_date: '2026-01-20', interval_days: 14, repetitions: 4,
    })];
    const { result } = await load();
    expect(result.current.getMastery('a').isCheck).toBe(true);
    let outcome: any;
    await act(async () => { outcome = await result.current.submitReview('a', 'easy', true); });
    expect(outcome.checkPassed).toBe(true);
    expect(db.upserts.at(-1)).toMatchObject({
      status: 'mastered', check_stage: 1, next_check_date: '2026-04-10', interval_days: 14, repetitions: 4, next_review_date: '2026-01-20',
    });
  });

  it('contrôle raté : le mot repasse actif avec 1 Facile à refaire et revient demain', async () => {
    db.word_reviews = [review('a', {
      status: 'mastered', easy_count: 3, mastered_at: '2026-01-10T10:00:00.000Z', check_stage: 0, next_check_date: '2026-02-10',
    })];
    const { result } = await load();
    let outcome: any;
    await act(async () => { outcome = await result.current.submitReview('a', 'good', true); });
    expect(outcome.checkFailed).toBe(true);
    expect(db.upserts.at(-1)).toMatchObject({
      status: 'active', easy_count: 2, mastered_at: null, check_stage: 0, next_check_date: null, repetitions: 0, next_review_date: '2026-02-11',
    });
  });

  it('mot ignoré : aucune écriture en base', async () => {
    db.word_reviews = [review('a', { status: 'ignored' })];
    const { result } = await load();
    await act(async () => { await result.current.submitReview('a', 'easy', true); });
    expect(db.upserts).toHaveLength(0);
  });
});

describe('useSRS.submitReview — échec d\'enregistrement', () => {
  it('renvoie null et ne modifie pas l\'état local quand la base refuse l\'écriture', async () => {
    db.word_reviews = [review('a', { easy_count: 1 })];
    const { result } = await load();
    db.failUpsert = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let outcome: any = 'pas appelé';
    await act(async () => { outcome = await result.current.submitReview('a', 'easy', true); });
    spy.mockRestore();
    expect(outcome).toBeNull();
    expect(result.current.getMastery('a').easyCount).toBe(1); // inchangé : pas de faux point affiché
  });
});

describe('useSRS.dueReviews — composition de la session', () => {
  it('max 2 contrôles, mots ignorés exclus, contrôles pas encore dus exclus', async () => {
    const chk = (id: string, date: string) => review(id, { status: 'mastered', easy_count: 3, mastered_at: '2026-01-01T00:00:00.000Z', next_check_date: date, next_review_date: '2099-01-01' });
    const many = ['m1', 'm2', 'm3', 'f1', 'g1', 'i1', 'a1', 'a2', 'a3', 'a4'].map(mkWord);
    db.word_reviews = [
      chk('m1', '2026-02-01'), chk('m2', '2026-02-05'), chk('m3', '2026-02-09'), chk('f1', '2026-03-01'),
      review('g1', { status: 'mastered', check_stage: 2, next_check_date: null, next_review_date: '2099-01-01' }),
      review('i1', { status: 'ignored' }),
      review('a1'), review('a2'), review('a3'), review('a4'),
    ];
    const hook = renderHook(() => useSRS(many));
    await waitFor(() => expect(hook.result.current.tableExists).toBe(true));
    const ids = hook.result.current.dueReviews().map((w) => w.id);
    expect(ids).toHaveLength(5);
    expect(ids.filter((i) => i.startsWith('m'))).toEqual(['m1', 'm2']);
    expect(ids).not.toContain('i1');
    expect(ids).not.toContain('f1');
    expect(ids).not.toContain('g1');
  });
});
