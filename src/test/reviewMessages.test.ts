import { describe, it, expect } from 'vitest';
import { outcomeMessage } from '@/lib/reviewMessages';
import { applyAnswer, NEW_MASTERY_STATE, type MasteryState } from '@/lib/mastery';

const mastered = (over: Partial<MasteryState> = {}): MasteryState => ({
  status: 'mastered', easyCount: 3, masteredAt: '2026-01-10T10:00:00.000Z', checkStage: 0, nextCheckDate: '2026-02-10', ...over,
});

describe('outcomeMessage', () => {
  it("échec d'enregistrement (null) : message d'erreur explicite", () => {
    const m = outcomeMessage(null, 'Laconique');
    expect(m?.type).toBe('error');
    expect(m?.text).toContain("n'a pas pu être enregistrée");
  });

  it('1er point : Maîtrise 1/3', () => {
    const o = applyAnswer({ ...NEW_MASTERY_STATE }, { correct: true, quality: 'easy' }, new Date('2026-02-01T10:00:00Z'));
    expect(outcomeMessage(o, 'Laconique')).toEqual({ type: 'info', text: 'Maîtrise : 1/3' });
  });

  it('3e point : mot maîtrisé avec le nom du mot', () => {
    const o = applyAnswer({ ...NEW_MASTERY_STATE, easyCount: 2 }, { correct: true, quality: 'easy' }, new Date('2026-02-01T10:00:00Z'));
    expect(outcomeMessage(o, 'Laconique')).toEqual({ type: 'success', text: '🎉 Mot maîtrisé : Laconique !' });
  });

  it('contrôle réussi', () => {
    const o = applyAnswer(mastered(), { correct: true, quality: 'easy' }, new Date('2026-02-10T10:00:00Z'));
    expect(outcomeMessage(o, 'x')).toEqual({ type: 'success', text: 'Contrôle réussi ✓' });
  });

  it('contrôle raté : le mot repart dans le réservoir', () => {
    const o = applyAnswer(mastered(), { correct: false, quality: 'easy' }, new Date('2026-02-10T10:00:00Z'));
    expect(outcomeMessage(o, 'x')).toEqual({ type: 'info', text: 'Ce mot repart dans ton réservoir.' });
  });

  it('réponse fausse ou "Bien" sur un mot actif : aucun message (pas de point gagné)', () => {
    expect(outcomeMessage(applyAnswer({ ...NEW_MASTERY_STATE }, { correct: false, quality: 'easy' }), 'x')).toBeNull();
    expect(outcomeMessage(applyAnswer({ ...NEW_MASTERY_STATE }, { correct: true, quality: 'good' }), 'x')).toBeNull();
  });
});
