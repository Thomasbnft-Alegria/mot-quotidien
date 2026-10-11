import { describe, it, expect } from 'vitest';
import {
  selectPersonalWord,
  normalizeReservoirSize,
  DEFAULT_RESERVOIR_SIZE,
  type WordRow,
  type ReviewRow,
  type ProgressRow,
} from '../../supabase/functions/get-daily-word/personal';

const words = (n: number): WordRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'w' + (i + 1), display_order: i + 1 }));
const review = (id: string, status: string | null = 'active', last: string | null = null): ReviewRow => ({
  word_id: id, status, last_reviewed_at: last,
});
const prog = (id: string, c: number, i: number, seen = true, last: string | null = null): ProgressRow => ({
  word_id: id, seen, correct_count: c, incorrect_count: i, last_reviewed: last,
});

describe('normalizeReservoirSize', () => {
  it('garde une taille valide', () => expect(normalizeReservoirSize(5)).toBe(5));
  it('retombe sur 20 si invalide', () => {
    expect(normalizeReservoirSize(undefined)).toBe(DEFAULT_RESERVOIR_SIZE);
    expect(normalizeReservoirSize(0)).toBe(DEFAULT_RESERVOIR_SIZE);
    expect(normalizeReservoirSize(null)).toBe(DEFAULT_RESERVOIR_SIZE);
    expect(normalizeReservoirSize('12')).toBe(DEFAULT_RESERVOIR_SIZE);
  });
});

describe('selectPersonalWord', () => {
  it('propose le premier mot (display_order) pour un nouvel utilisateur', () => {
    const s = selectPersonalWord({ words: words(5), reviews: [], progress: [], reservoirSize: 20 });
    expect(s).toMatchObject({ kind: 'new', wordId: 'w1', activeCount: 0, reservoirSize: 20 });
  });

  it('respecte display_order même si la liste est désordonnée', () => {
    const w: WordRow[] = [
      { id: 'b', display_order: 2 }, { id: 'a', display_order: 1 }, { id: 'c', display_order: null },
    ];
    expect(selectPersonalWord({ words: w, reviews: [], progress: [], reservoirSize: 20 }).wordId).toBe('a');
  });

  it('saute les mots déjà connus (ligne de révision, quel que soit le statut, ou vus)', () => {
    const s = selectPersonalWord({
      words: words(6),
      reviews: [review('w1', 'active'), review('w2', 'mastered'), review('w3', 'ignored')],
      progress: [prog('w4', 0, 0, true)],
      reservoirSize: 20,
    });
    expect(s).toMatchObject({ kind: 'new', wordId: 'w5', activeCount: 1 });
  });

  it("un mot non vu avec progress.seen=false n'est pas connu", () => {
    const s = selectPersonalWord({ words: words(2), reviews: [], progress: [prog('w1', 0, 0, false)], reservoirSize: 20 });
    expect(s.wordId).toBe('w1');
  });

  it('un statut null compte comme actif', () => {
    const s = selectPersonalWord({ words: words(3), reviews: [review('w1', null)], progress: [], reservoirSize: 20 });
    expect(s.activeCount).toBe(1);
  });

  it('réservoir plein : renvoie le mot actif le moins assimilé (pire ratio)', () => {
    const s = selectPersonalWord({
      words: words(6),
      reviews: [review('w1'), review('w2'), review('w3')],
      progress: [prog('w1', 3, 1), prog('w2', 1, 3), prog('w3', 2, 2)],
      reservoirSize: 3,
    });
    expect(s).toMatchObject({ kind: 'reservoir', wordId: 'w2', activeCount: 3, reservoirSize: 3 });
  });

  it("ne propose pas de mot neuf quand le réservoir est plein", () => {
    const s = selectPersonalWord({
      words: words(10), reviews: [review('w1'), review('w2')], progress: [], reservoirSize: 2,
    });
    expect(s.kind).toBe('reservoir');
  });

  it('égalité de ratio : la révision la plus ancienne gagne, jamais révisé = le plus ancien', () => {
    const s = selectPersonalWord({
      words: words(4),
      reviews: [review('w1'), review('w2'), review('w3')],
      progress: [
        prog('w1', 1, 1, true, '2026-10-05T10:00:00Z'),
        prog('w2', 1, 1, true, '2026-10-01T10:00:00Z'),
        prog('w3', 1, 1, true, '2026-10-09T10:00:00Z'),
      ],
      reservoirSize: 3,
    });
    expect(s.wordId).toBe('w2');
    const s2 = selectPersonalWord({
      words: words(3),
      reviews: [review('w1'), review('w2')],
      progress: [prog('w1', 0, 0, true, '2026-10-05T10:00:00Z')],
      reservoirSize: 2,
    });
    expect(s2.wordId).toBe('w2'); // w2 jamais révisé = le plus ancien
  });

  it("sans stats, un mot actif jamais répondu compte comme ratio 0 (le moins assimilé)", () => {
    const s = selectPersonalWord({
      words: words(3),
      reviews: [review('w1'), review('w2')],
      progress: [prog('w1', 2, 0)],
      reservoirSize: 2,
    });
    expect(s.wordId).toBe('w2');
  });

  it('plus aucun mot neuf : retombe sur le moins assimilé du réservoir', () => {
    const s = selectPersonalWord({
      words: words(2),
      reviews: [review('w1'), review('w2')],
      progress: [prog('w1', 3, 0), prog('w2', 0, 3)],
      reservoirSize: 20,
    });
    expect(s).toMatchObject({ kind: 'reservoir', wordId: 'w2' });
  });

  it('rien à proposer : aucun mot neuf et aucun actif => none', () => {
    const s = selectPersonalWord({
      words: words(2), reviews: [review('w1', 'mastered'), review('w2', 'ignored')], progress: [], reservoirSize: 20,
    });
    expect(s).toEqual({ kind: 'none', wordId: null, activeCount: 0, reservoirSize: 20 });
  });

  it("les mots maîtrisés ou ignorés ne comptent pas dans le réservoir et ne sont jamais proposés comme 'réservoir'", () => {
    const s = selectPersonalWord({
      words: words(4),
      reviews: [review('w1', 'mastered'), review('w2', 'ignored'), review('w3', 'active')],
      progress: [],
      reservoirSize: 1,
    });
    expect(s).toMatchObject({ kind: 'reservoir', wordId: 'w3', activeCount: 1 });
  });

  it('taille invalide => 20 par défaut', () => {
    const s = selectPersonalWord({ words: words(3), reviews: [], progress: [], reservoirSize: undefined });
    expect(s.reservoirSize).toBe(20);
  });
});
