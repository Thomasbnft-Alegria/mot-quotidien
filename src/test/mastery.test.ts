import { describe, it, expect } from 'vitest';
import {
  applyAnswer, effectiveQualityFor, isCheckDue, masteryProgress, buildReviewSession,
  NEW_MASTERY_STATE, MASTERY_TARGET, EASY_COUNT_AFTER_FAILED_CHECK,
  type MasteryState, type SessionCandidate,
} from '../lib/mastery';

const D = (s: string) => new Date(s + 'T10:00:00Z');
const active = (easyCount = 0): MasteryState => ({ ...NEW_MASTERY_STATE, easyCount });
const mastered = (over: Partial<MasteryState> = {}): MasteryState => ({
  status: 'mastered', easyCount: 3, masteredAt: '2026-01-10T10:00:00.000Z', checkStage: 0, nextCheckDate: '2026-02-10', ...over,
});

describe('effectiveQualityFor', () => {
  it('une réponse fausse vaut toujours hard, même si "easy" est envoyé', () => {
    expect(effectiveQualityFor({ correct: false, quality: 'easy' })).toBe('hard');
    expect(effectiveQualityFor({ correct: false, quality: 'good' })).toBe('hard');
  });
  it('une réponse juste garde la note choisie', () => {
    expect(effectiveQualityFor({ correct: true, quality: 'good' })).toBe('good');
    expect(effectiveQualityFor({ correct: true, quality: 'easy' })).toBe('easy');
  });
});

describe('applyAnswer — mot actif', () => {
  it('Facile sur bonne réponse = +1 point', () => {
    const o = applyAnswer(active(0), { correct: true, quality: 'easy' }, D('2026-01-01'));
    expect(o.pointGained).toBe(true);
    expect(o.next.easyCount).toBe(1);
    expect(o.next.status).toBe('active');
  });
  it('Bien et Difficile sur bonne réponse : aucun point, rien ne se perd', () => {
    expect(applyAnswer(active(2), { correct: true, quality: 'good' }).next.easyCount).toBe(2);
    expect(applyAnswer(active(2), { correct: true, quality: 'hard' }).next.easyCount).toBe(2);
  });
  it('réponse fausse : 0 point, aucun point retiré, qualité effective hard', () => {
    const o = applyAnswer(active(2), { correct: false, quality: 'easy' });
    expect(o.pointGained).toBe(false);
    expect(o.effectiveQuality).toBe('hard');
    expect(o.next.easyCount).toBe(2);
  });
  it('points cumulés (non consécutifs) : une erreur entre deux Facile ne remet pas à zéro', () => {
    let s = active(0);
    s = applyAnswer(s, { correct: true, quality: 'easy' }).next;
    s = applyAnswer(s, { correct: false, quality: 'easy' }).next;
    s = applyAnswer(s, { correct: true, quality: 'easy' }).next;
    expect(s.easyCount).toBe(2);
  });
  it('3e Facile => maîtrisé, date de maîtrise, 1er contrôle à +1 mois', () => {
    const o = applyAnswer(active(2), { correct: true, quality: 'easy' }, D('2026-01-31'));
    expect(o.justMastered).toBe(true);
    expect(o.next.status).toBe('mastered');
    expect(o.next.easyCount).toBe(MASTERY_TARGET);
    expect(o.next.masteredAt).toBe('2026-01-31T10:00:00.000Z');
    expect(o.next.checkStage).toBe(0);
    expect(o.next.nextCheckDate).toBe('2026-02-28'); // fin de mois bornée
  });
  it('plusieurs points le même jour pour un même mot sont possibles', () => {
    let s = active(0);
    for (let i = 0; i < 3; i++) s = applyAnswer(s, { correct: true, quality: 'easy' }, D('2026-03-01')).next;
    expect(s.status).toBe('mastered');
  });
  it('un statut "new" se comporte comme actif', () => {
    const o = applyAnswer({ ...NEW_MASTERY_STATE, status: 'new' }, { correct: true, quality: 'easy' });
    expect(o.next.status).toBe('active');
    expect(o.next.easyCount).toBe(1);
  });
});

describe('applyAnswer — contrôles à +1 mois puis +3 mois (dates simulées)', () => {
  it('contrôle pas encore dû : aucun changement', () => {
    const s = mastered();
    const o = applyAnswer(s, { correct: true, quality: 'easy' }, D('2026-02-09'));
    expect(o.checkPassed).toBe(false);
    expect(o.next).toEqual(s);
  });
  it('1er contrôle réussi à +1 mois => stage 1, prochain contrôle à +3 mois après la maîtrise', () => {
    const o = applyAnswer(mastered(), { correct: true, quality: 'easy' }, D('2026-02-10'));
    expect(o.checkPassed).toBe(true);
    expect(o.next.status).toBe('mastered');
    expect(o.next.checkStage).toBe(1);
    expect(o.next.nextCheckDate).toBe('2026-04-10');
  });
  it('2e contrôle réussi à +3 mois => stage 2, terminé, plus aucun retour', () => {
    const s = mastered({ checkStage: 1, nextCheckDate: '2026-04-10' });
    const o = applyAnswer(s, { correct: true, quality: 'easy' }, D('2026-04-10'));
    expect(o.next.checkStage).toBe(2);
    expect(o.next.nextCheckDate).toBeNull();
    expect(isCheckDue(o.next, '2030-01-01')).toBe(false);
  });
  it('contrôle en retard : réussi quand même, prochain contrôle toujours calé sur la date de maîtrise', () => {
    const o = applyAnswer(mastered(), { correct: true, quality: 'easy' }, D('2026-03-20'));
    expect(o.next.nextCheckDate).toBe('2026-04-10');
  });
  it.each([
    ['bonne réponse mais Bien', { correct: true, quality: 'good' as const }],
    ['bonne réponse mais Difficile', { correct: true, quality: 'hard' as const }],
    ['réponse fausse (même avec Facile)', { correct: false, quality: 'easy' as const }],
  ])('contrôle raté (%s) : retour dans le réservoir avec 1 Facile à refaire', (_l, answer) => {
    const o = applyAnswer(mastered(), answer, D('2026-02-10'));
    expect(o.checkFailed).toBe(true);
    expect(o.next).toEqual({
      status: 'active', easyCount: EASY_COUNT_AFTER_FAILED_CHECK, masteredAt: null, checkStage: 0, nextCheckDate: null,
    });
  });
  it('contrôle raté avec une bonne réponse notée Bien : la qualité effective passe à hard (SM-2 remis à zéro)', () => {
    const o = applyAnswer(mastered(), { correct: true, quality: 'good' }, D('2026-02-10'));
    expect(o.checkFailed).toBe(true);
    expect(o.effectiveQuality).toBe('hard');
  });
  it('un mot revenu après un contrôle raté est re-maîtrisé avec 1 seul Facile, et le cycle +1/+3 mois repart', () => {
    const failed = applyAnswer(mastered(), { correct: false, quality: 'hard' }, D('2026-02-10')).next;
    const o = applyAnswer(failed, { correct: true, quality: 'easy' }, D('2026-02-15'));
    expect(o.justMastered).toBe(true);
    expect(o.next.checkStage).toBe(0);
    expect(o.next.nextCheckDate).toBe('2026-03-15');
  });
  it('mot ignoré : jamais modifié', () => {
    const s: MasteryState = { ...NEW_MASTERY_STATE, status: 'ignored', easyCount: 1 };
    const o = applyAnswer(s, { correct: true, quality: 'easy' });
    expect(o.next).toEqual(s);
    expect(o.pointGained).toBe(false);
  });
});

describe('masteryProgress', () => {
  it('affiche n/3 et plafonne à 3', () => {
    expect(masteryProgress(active(1))).toEqual({ current: 1, target: 3, mastered: false });
    expect(masteryProgress(mastered())).toEqual({ current: 3, target: 3, mastered: true });
    expect(masteryProgress(active(7)).current).toBe(3);
  });
});

const cand = (wordId: string, over: Partial<SessionCandidate> = {}): SessionCandidate => ({
  wordId, status: 'active', nextReviewDate: '2026-01-01', checkStage: 0, nextCheckDate: null, ...over,
});

describe('buildReviewSession', () => {
  const today = '2026-02-10';
  it('5 mots actifs dus => 5 mots, du plus en retard au moins en retard', () => {
    const c = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => cand(id, { nextReviewDate: '2026-02-0' + (i + 1) }));
    expect(buildReviewSession(c, today)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('complète avec les mots non dus les plus proches (comportement historique)', () => {
    const c = [cand('a', { nextReviewDate: today }), cand('b', { nextReviewDate: '2026-02-12' }), cand('c', { nextReviewDate: '2026-02-11' })];
    expect(buildReviewSession(c, today)).toEqual(['a', 'c', 'b']);
  });
  it('au plus 2 contrôles, même s\'il y en a plus de dus', () => {
    const chk = (id: string, d: string) => cand(id, { status: 'mastered', nextCheckDate: d, nextReviewDate: '2099-01-01' });
    const c = [chk('m1', '2026-02-01'), chk('m2', '2026-02-02'), chk('m3', '2026-02-03'), cand('a'), cand('b'), cand('c'), cand('d')];
    const s = buildReviewSession(c, today);
    expect(s).toHaveLength(5);
    expect(s.filter((id) => id.startsWith('m'))).toEqual(['m1', 'm2']);
    expect(s).not.toContain('m3');
  });
  it('contrôles en file d\'attente : les plus en retard passent d\'abord', () => {
    const chk = (id: string, d: string) => cand(id, { status: 'mastered', nextCheckDate: d });
    const s = buildReviewSession([chk('late', '2026-01-05'), chk('recent', '2026-02-09')], today);
    expect(s).toEqual(['late', 'recent']);
  });
  it('les contrôles ne prennent pas la place d\'un mot actif au-delà de la session : 3 actifs + 2 contrôles = 5', () => {
    const chk = (id: string) => cand(id, { status: 'mastered', nextCheckDate: '2026-02-01' });
    const s = buildReviewSession([cand('a'), cand('b'), cand('c'), cand('d'), chk('m1'), chk('m2')], today);
    expect(s.filter((id) => id.startsWith('m'))).toHaveLength(2);
    expect(s).toHaveLength(5);
  });
  it('pas assez de mots actifs : session plus courte, jamais plus de 2 contrôles', () => {
    const chk = (id: string) => cand(id, { status: 'mastered', nextCheckDate: '2026-02-01' });
    const s = buildReviewSession([cand('a'), chk('m1'), chk('m2'), chk('m3')], today);
    expect(s).toEqual(['a', 'm1', 'm2']);
  });
  it('mots ignorés, maîtrisés hors contrôle et contrôles terminés ne sont jamais proposés', () => {
    const c = [
      cand('ign', { status: 'ignored' }),
      cand('m-futur', { status: 'mastered', nextCheckDate: '2026-03-01' }),
      cand('m-fini', { status: 'mastered', checkStage: 2, nextCheckDate: null }),
      cand('ok'),
    ];
    expect(buildReviewSession(c, today)).toEqual(['ok']);
  });
  it("l'ordre des mots départage les égalités", () => {
    const c = [cand('b'), cand('a')];
    expect(buildReviewSession(c, today, ['a', 'b'])).toEqual(['a', 'b']);
  });
});
