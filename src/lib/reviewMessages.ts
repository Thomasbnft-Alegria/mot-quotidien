import { MASTERY_TARGET, type ReviewOutcome } from '@/lib/mastery';

export interface OutcomeMessage {
  type: 'success' | 'info' | 'error';
  text: string;
}

/**
 * Message à afficher après l'enregistrement d'une réponse.
 * outcome === null signifie que l'enregistrement a échoué : on le dit explicitement à l'utilisateur
 * (sinon sa progression serait perdue sans qu'il le sache).
 */
export function outcomeMessage(outcome: ReviewOutcome | null, wordName: string): OutcomeMessage | null {
  if (!outcome) {
    return { type: 'error', text: "Ta réponse n'a pas pu être enregistrée. Vérifie ta connexion et réessaie." };
  }
  if (outcome.justMastered) return { type: 'success', text: `🎉 Mot maîtrisé : ${wordName} !` };
  if (outcome.checkPassed) return { type: 'success', text: 'Contrôle réussi ✓' };
  if (outcome.checkFailed) return { type: 'info', text: 'Ce mot repart dans ton réservoir.' };
  if (outcome.pointGained) return { type: 'info', text: `Maîtrise : ${outcome.next.easyCount}/${MASTERY_TARGET}` };
  return null;
}
