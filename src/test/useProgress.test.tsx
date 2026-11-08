/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Word } from '@/types/word';

type Row = Record<string, any>;
const db = vi.hoisted(() => ({
  user_progress: [] as Row[],
  user_streaks: null as Row | null,
  word_reviews: [] as Row[],
  streakUpserts: [] as Row[],
}));
const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as any, isLoading: false } }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: table === 'user_streaks' ? db.user_streaks : null, error: null }),
        upsert: (row: Row) => { if (table === 'user_streaks') db.streakUpserts.push(row); return Promise.resolve({ error: null }); },
        then: (res: any, rej: any) => {
          const data = table === 'user_progress' ? db.user_progress : table === 'word_reviews' ? db.word_reviews : [];
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  },
}));

import { useProgress } from '@/hooks/useProgress';

const W = (id: string): Word => ({ id, word: 'mot' + id, definition: 'd', exampleSentence: 'e', category: 'nom', register: 'courant' }) as Word;
const prog = (id: string, seen: boolean, c = 0, i = 0): Row => ({ word_id: id, seen, seen_date: seen ? '2026-10-01' : null, correct_count: c, incorrect_count: i, last_reviewed: null });

async function load() {
  const hook = renderHook(() => useProgress());
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  return hook;
}

beforeEach(() => {
  db.user_progress = []; db.user_streaks = null; db.word_reviews = []; db.streakUpserts = [];
  auth.value = { user: { id: 'u1' }, isLoading: false };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T10:00:00'));
});
afterEach(() => vi.useRealTimers());

describe('useProgress — maîtrise = statut du réservoir', () => {
  it('getMasteredCount compte uniquement les mots au statut mastered', async () => {
    db.word_reviews = [
      { word_id: 'a', status: 'mastered' }, { word_id: 'b', status: 'mastered' },
      { word_id: 'c', status: 'active' }, { word_id: 'd', status: 'ignored' },
    ];
    const { result } = await load();
    expect(result.current.getMasteredCount()).toBe(2);
  });

  it("n'utilise plus l'ancienne règle (3 bonnes réponses ET 75 %) : un mot à 5/5 non maîtrisé ne compte pas", async () => {
    db.user_progress = [prog('a', true, 5, 0)];
    db.word_reviews = [{ word_id: 'a', status: 'active' }];
    const { result } = await load();
    expect(result.current.getMasteredCount()).toBe(0);
  });

  it('statut absent (null) = actif, jamais maîtrisé', async () => {
    db.word_reviews = [{ word_id: 'a', status: null }];
    const { result } = await load();
    expect(result.current.getMasteredCount()).toBe(0);
    expect(result.current.reviewStatus.a).toBe('active');
  });

  it('aucun mot : 0', async () => {
    const { result } = await load();
    expect(result.current.getMasteredCount()).toBe(0);
  });
});

describe('useProgress — le quiz exclut les mots maîtrisés ou ignorés', () => {
  it('seuls les mots vus, ni maîtrisés ni ignorés, sont proposés', async () => {
    db.user_progress = [prog('a', true), prog('b', true), prog('c', true), prog('d', true), prog('e', false)];
    db.word_reviews = [
      { word_id: 'a', status: 'mastered' }, { word_id: 'b', status: 'ignored' },
      { word_id: 'c', status: 'active' },
    ];
    const { result } = await load();
    const ids = result.current.getQuizWords(['a', 'b', 'c', 'd', 'e'].map(W), 10).map((w) => w.id).sort();
    expect(ids).toEqual(['c', 'd']); // a maîtrisé, b ignoré, e jamais vu
  });

  it('un mot maîtrisé est exclu même s\'il a beaucoup d\'erreurs ; un mot non maîtrisé reste même à 5/5', async () => {
    db.user_progress = [prog('a', true, 1, 9), prog('b', true, 5, 0)];
    db.word_reviews = [{ word_id: 'a', status: 'mastered' }, { word_id: 'b', status: 'active' }];
    const { result } = await load();
    expect(result.current.getQuizWords(['a', 'b'].map(W), 10).map((w) => w.id)).toEqual(['b']);
  });
});

describe('useProgress.recordActivity — série de jours', () => {
  it('première activité : série à 1, sans toucher au compteur de mots découverts', async () => {
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts.at(-1)).toEqual({ user_id: 'u1', current_streak: 1, last_active_date: '2026-11-08', total_words_seen: 0 });
    expect(result.current.userProgress.currentStreak).toBe(1);
  });

  it("hier actif : la série augmente de 1 ; le compteur de mots découverts reste inchangé", async () => {
    db.user_streaks = { current_streak: 4, last_active_date: '2026-11-07', total_words_seen: 140 };
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts.at(-1)).toEqual({ user_id: 'u1', current_streak: 5, last_active_date: '2026-11-08', total_words_seen: 140 });
  });

  it('série interrompue (dernière activité il y a plus d\'un jour) : repart à 1', async () => {
    db.user_streaks = { current_streak: 9, last_active_date: '2026-11-03', total_words_seen: 140 };
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts.at(-1)?.current_streak).toBe(1);
  });

  it("déjà compté aujourd'hui : aucune écriture (pas de double comptage)", async () => {
    db.user_streaks = { current_streak: 4, last_active_date: '2026-11-08', total_words_seen: 140 };
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts).toHaveLength(0);
    expect(result.current.userProgress.currentStreak).toBe(4);
  });

  it('deux appels de suite le même jour : une seule écriture', async () => {
    db.user_streaks = { current_streak: 4, last_active_date: '2026-11-07', total_words_seen: 140 };
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts).toHaveLength(1);
  });

  it('déconnecté : ne fait rien', async () => {
    auth.value = { user: null, isLoading: false };
    const { result } = await load();
    await act(async () => { await result.current.recordActivity(); });
    expect(db.streakUpserts).toHaveLength(0);
  });
});
