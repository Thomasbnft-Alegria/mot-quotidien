import { addMonths, format } from 'date-fns';

// Règles de maîtrise du réservoir de mots (module pur : aucune dépendance React/Supabase, testé avec Vitest).
// Spec : /data/.openclaw/workspace-dev/spec-reservoir.md

export type SRSQuality = 'easy' | 'good' | 'hard';
export type WordStatus = 'new' | 'active' | 'mastered' | 'ignored';

/** Nombre de "Facile" (sur bonne réponse) cumulés pour qu'un mot soit maîtrisé. */
export const MASTERY_TARGET = 3;
/** Un mot qui a raté un contrôle revient dans le réservoir avec 1 seul "Facile" à refaire. */
export const EASY_COUNT_AFTER_FAILED_CHECK = MASTERY_TARGET - 1;
/** Contrôles de mémoire après la maîtrise : +1 mois puis +3 mois (comptés depuis la date de maîtrise). */
export const CHECK_DELAYS_MONTHS = [1, 3] as const;
export const REVIEWS_PER_SESSION = 5;
export const MAX_CHECKS_PER_SESSION = 2;

export interface MasteryState {
  status: WordStatus;
  easyCount: number;
  /** Date ISO (timestamptz) de la maîtrise, null si non maîtrisé. */
  masteredAt: string | null;
  /** Nombre de contrôles réussis : 0, 1 ou 2 (2 = terminé, le mot ne revient plus). */
  checkStage: number;
  /** Date (yyyy-MM-dd) du prochain contrôle, null s'il n'y en a pas. */
  nextCheckDate: string | null;
}

export interface Answer {
  /** La saisie correspond au mot (comparaison sans accents ni casse). */
  correct: boolean;
  /** La note choisie par l'utilisateur. */
  quality: SRSQuality;
}

export interface ReviewOutcome {
  /** Qualité réellement transmise à SM-2 : une réponse fausse vaut toujours 'hard'. */
  effectiveQuality: SRSQuality;
  pointGained: boolean;
  justMastered: boolean;
  checkPassed: boolean;
  checkFailed: boolean;
  next: MasteryState;
}

export const NEW_MASTERY_STATE: MasteryState = {
  status: 'active',
  easyCount: 0,
  masteredAt: null,
  checkStage: 0,
  nextCheckDate: null,
};

const toDateString = (d: Date) => format(d, 'yyyy-MM-dd');

/** Une réponse fausse compte toujours comme "Difficile", quelle que soit la note envoyée. */
export function effectiveQualityFor(answer: Answer): SRSQuality {
  return answer.correct ? answer.quality : 'hard';
}

/** Un mot maîtrisé est "à contrôler" s'il lui reste un contrôle et que sa date est atteinte. */
export function isCheckDue(state: MasteryState, today: string): boolean {
  return (
    state.status === 'mastered' &&
    state.checkStage < CHECK_DELAYS_MONTHS.length &&
    state.nextCheckDate !== null &&
    state.nextCheckDate <= today
  );
}

/**
 * Applique une réponse (saisie libre) à l'état de maîtrise d'un mot.
 * - Réponse fausse : 'hard' automatique, aucun point.
 * - Mot actif : seul "Facile" sur bonne réponse donne 1 point ; à 3 points => maîtrisé, 1er contrôle à +1 mois.
 * - Mot maîtrisé (contrôle dû) : bonne réponse + "Facile" => contrôle réussi (prochain à +3 mois, puis terminé) ;
 *   sinon le mot repasse actif avec 1 seul "Facile" à refaire et le cycle de contrôles repart de zéro.
 * - Mot ignoré, ou contrôle pas encore dû : aucun changement.
 */
export function applyAnswer(state: MasteryState, answer: Answer, now: Date = new Date()): ReviewOutcome {
  const effectiveQuality = effectiveQualityFor(answer);
  const easyOnCorrect = answer.correct && answer.quality === 'easy';
  const unchanged: ReviewOutcome = {
    effectiveQuality,
    pointGained: false,
    justMastered: false,
    checkPassed: false,
    checkFailed: false,
    next: { ...state },
  };

  if (state.status === 'ignored') return unchanged;

  if (state.status === 'mastered') {
    const today = toDateString(now);
    if (!isCheckDue(state, today)) return unchanged;

    if (easyOnCorrect) {
      const stage = state.checkStage + 1;
      const masteredAt = state.masteredAt ? new Date(state.masteredAt) : now;
      const nextCheckDate =
        stage < CHECK_DELAYS_MONTHS.length ? toDateString(addMonths(masteredAt, CHECK_DELAYS_MONTHS[stage])) : null;
      return {
        ...unchanged,
        checkPassed: true,
        next: { ...state, checkStage: stage, nextCheckDate },
      };
    }
    return {
      ...unchanged,
      // Un contrôle raté (même avec une bonne réponse notée "Bien") remet le calendrier SM-2 à zéro :
      // le mot revient vite dans le réservoir.
      effectiveQuality: 'hard',
      checkFailed: true,
      next: {
        status: 'active',
        easyCount: EASY_COUNT_AFTER_FAILED_CHECK,
        masteredAt: null,
        checkStage: 0,
        nextCheckDate: null,
      },
    };
  }

  // 'active' ou 'new'
  const easyCount = state.easyCount + (easyOnCorrect ? 1 : 0);
  if (easyCount >= MASTERY_TARGET) {
    return {
      ...unchanged,
      pointGained: easyOnCorrect,
      justMastered: true,
      next: {
        status: 'mastered',
        easyCount,
        masteredAt: now.toISOString(),
        checkStage: 0,
        nextCheckDate: toDateString(addMonths(now, CHECK_DELAYS_MONTHS[0])),
      },
    };
  }
  return {
    ...unchanged,
    pointGained: easyOnCorrect,
    next: { ...state, status: 'active', easyCount },
  };
}

/** Progression affichée sur l'écran de réponse (ex. 1/3). */
export function masteryProgress(state: MasteryState): { current: number; target: number; mastered: boolean } {
  return {
    current: Math.min(state.easyCount, MASTERY_TARGET),
    target: MASTERY_TARGET,
    mastered: state.status === 'mastered',
  };
}

// ── Composition d'une session de révision ────────────────────────────────────────────────────────

export interface SessionCandidate {
  wordId: string;
  status: WordStatus;
  nextReviewDate: string;
  checkStage: number;
  nextCheckDate: string | null;
  easyCount?: number;
  masteredAt?: string | null;
}

/**
 * Compose la session de révision (5 mots maximum) :
 * - au plus MAX_CHECKS_PER_SESSION contrôles (mots maîtrisés dont le contrôle est dû, les plus en retard d'abord) ;
 * - le reste : mots actifs, d'abord ceux dus (next_review_date <= aujourd'hui), puis les plus proches de leur échéance.
 * Les mots ignorés ne sont jamais proposés ; les mots maîtrisés hors contrôle non plus.
 * `order` donne l'ordre d'affichage des mots pour départager les égalités.
 */
export function buildReviewSession(
  candidates: SessionCandidate[],
  today: string,
  order: string[] = [],
  max: number = REVIEWS_PER_SESSION,
  maxChecks: number = MAX_CHECKS_PER_SESSION,
): string[] {
  const pos = new Map(order.map((id, i) => [id, i] as [string, number]));
  const idx = (id: string) => pos.get(id) ?? Number.MAX_SAFE_INTEGER;

  const asState = (c: SessionCandidate): MasteryState => ({
    status: c.status,
    easyCount: c.easyCount ?? 0,
    masteredAt: c.masteredAt ?? null,
    checkStage: c.checkStage,
    nextCheckDate: c.nextCheckDate,
  });

  const checks = candidates
    .filter((c) => isCheckDue(asState(c), today))
    .sort((a, b) => (a.nextCheckDate! < b.nextCheckDate! ? -1 : a.nextCheckDate! > b.nextCheckDate! ? 1 : idx(a.wordId) - idx(b.wordId)))
    .slice(0, Math.min(maxChecks, max));

  const active = candidates.filter((c) => c.status === 'active' || c.status === 'new');
  const due = active
    .filter((c) => c.nextReviewDate <= today)
    .sort((a, b) => (a.nextReviewDate < b.nextReviewDate ? -1 : a.nextReviewDate > b.nextReviewDate ? 1 : idx(a.wordId) - idx(b.wordId)));
  const upcoming = active
    .filter((c) => c.nextReviewDate > today)
    .sort((a, b) => (a.nextReviewDate < b.nextReviewDate ? -1 : a.nextReviewDate > b.nextReviewDate ? 1 : idx(a.wordId) - idx(b.wordId)));

  const regular = [...due, ...upcoming].slice(0, Math.max(0, max - checks.length));
  return [...regular, ...checks].map((c) => c.wordId);
}
