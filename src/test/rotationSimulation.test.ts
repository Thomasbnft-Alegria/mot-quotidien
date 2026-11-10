import { describe, it, expect } from 'vitest';
import { selectPersonalWord, type WordRow, type ReviewRow } from '../../supabase/functions/get-daily-word/personal';

const words = (n: number): WordRow[] => Array.from({ length: n }, (_, i) => ({ id: 'w' + (i + 1), display_order: i + 1 }));
const rev = (id: string, easy = 0, ease = 2.5): ReviewRow => ({ word_id: id, status: 'active', last_reviewed_at: null, easy_count: easy, ease_factor: ease });

// Simule N jours consécutifs : chaque jour le mot choisi est ajouté à l'historique (le plus récent en premier).
function simulate(actives: number, days: number, tweak?: (day: number, reviews: ReviewRow[]) => void): string[] {
  const reviews = Array.from({ length: actives }, (_, i) => rev('w' + (i + 1)));
  const history: string[] = [];
  const shown: string[] = [];
  for (let d = 0; d < days; d++) {
    tweak?.(d, reviews);
    const s = selectPersonalWord({ words: words(actives + 5), reviews, progress: [], reservoirSize: actives, recentWordIds: [...history] });
    shown.push(s.wordId as string);
    history.unshift(s.wordId as string);
  }
  return shown;
}

describe('rotation du mot du jour sur plusieurs jours (réservoir plein, sans réponse de l\'utilisateur)', () => {
  it('2 mots actifs : alternent, jamais deux jours de suite le même', () => {
    const s = simulate(2, 8);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });

  it('3 mots actifs : jamais deux jours de suite le même, les 3 tournent (cas du QA : w1 revenait 4 jours de suite)', () => {
    const s = simulate(3, 9);
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
    expect(new Set(s)).toEqual(new Set(['w1', 'w2', 'w3']));
  });

  it('5 mots actifs : chaque mot revient exactement tous les 5 jours', () => {
    const s = simulate(5, 15);
    expect(s.slice(0, 5)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(s.slice(5, 10)).toEqual(s.slice(0, 5));
    expect(s.slice(10, 15)).toEqual(s.slice(0, 5));
  });

  it('6 mots actifs : 5 jours de pause avant de revoir un mot', () => {
    const s = simulate(6, 12);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < Math.min(s.length, i + 6); j++) expect(s[j]).not.toBe(s[i]);
  });

  it('20 mots actifs : tous les mots sont montrés, pas seulement les 6 premiers (cas du QA)', () => {
    const s = simulate(20, 20);
    expect(new Set(s).size).toBe(20);
  });

  it('20 mots actifs : aucun mot ne revient avant 5 jours', () => {
    const s = simulate(20, 30);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= Math.min(s.length - 1, i + 5); j++) expect(s[j]).not.toBe(s[i]);
  });

  it("un mot que l'utilisateur rate (facilité qui baisse) revient plus souvent, sans jamais bloquer la rotation", () => {
    const s = simulate(10, 20, (d, reviews) => { if (d === 0) reviews.find((r) => r.word_id === 'w7')!.ease_factor = 1.3; });
    expect(s[0]).toBe('w7'); // le plus faible passe en premier
    const again = s.indexOf('w7', 1);
    expect(again).toBeGreaterThanOrEqual(5); // ...mais pas avant 5 jours
    for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
  });

  it("peu d'historique (utilisateur qui n'ouvre pas l'app certains jours) : la rotation reste valable", () => {
    const reviews = Array.from({ length: 8 }, (_, i) => rev('w' + (i + 1)));
    const s = selectPersonalWord({ words: words(10), reviews, progress: [], reservoirSize: 8, recentWordIds: ['w3', 'w1'] });
    expect(['w3', 'w1']).not.toContain(s.wordId);
  });

  it('un seul mot actif : toujours ce mot, sans erreur', () => {
    const s = simulate(1, 5);
    expect(new Set(s)).toEqual(new Set(['w1']));
  });

  it("peu de mots + un mot très faible déjà montré hier : il ne revient PAS le lendemain (la fenêtre est bornée par le nombre de mots actifs)", () => {
    // 3 mots actifs, w1 est de loin le plus faible ET a été montré hier. Sans fenêtre bornée, tous les mots seraient
    // « récents » et on retomberait sur le plus faible (w1) deux jours de suite.
    const reviews = [rev('w1', 0, 1.3), rev('w2'), rev('w3')];
    const s = selectPersonalWord({ words: words(8), reviews, progress: [], reservoirSize: 3, recentWordIds: ['w1', 'w2', 'w3'] });
    expect(s.wordId).not.toBe('w1');
    expect(s.wordId).toBe('w3'); // le plus anciennement montré
  });
});
