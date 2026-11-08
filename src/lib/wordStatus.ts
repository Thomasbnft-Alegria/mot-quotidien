// Écritures de statut d'un mot dans word_reviews, partagées entre la révision (useSRS) et les Réglages.
// Fonctions pures : elles ne font que construire la charge utile à envoyer à Supabase (upsert user_id,word_id).
// Seules les colonnes listées sont modifiées : les compteurs SM-2 (ease_factor, repetitions...) ne sont jamais écrasés.

export function ignorePayload(userId: string, wordId: string, today: string) {
  return { user_id: userId, word_id: wordId, status: 'ignored', next_review_date: today };
}

export function reactivatePayload(userId: string, wordId: string, today: string) {
  return {
    user_id: userId,
    word_id: wordId,
    status: 'active',
    easy_count: 0,
    mastered_at: null,
    check_stage: 0,
    next_check_date: null,
    next_review_date: today,
  };
}
