import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Word } from '@/types/word';
import { format } from 'date-fns';
import {
  applyAnswer,
  buildReviewSession,
  isCheckDue,
  NEW_MASTERY_STATE,
  type MasteryState,
  type ReviewOutcome,
  type SRSQuality,
  type WordStatus,
} from '@/lib/mastery';

export type { SRSQuality } from '@/lib/mastery';

interface WordReview {
  id: string;
  wordId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
  // Maîtrise (réservoir de mots)
  status: WordStatus;
  easyCount: number;
  masteredAt: string | null;
  checkStage: number;
  nextCheckDate: string | null;
}

interface WordReviewRow {
  id: string;
  word_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string;
  status?: string | null;
  easy_count?: number | null;
  mastered_at?: string | null;
  check_stage?: number | null;
  next_check_date?: string | null;
}

function rowToReview(row: WordReviewRow): WordReview {
  return {
    id: row.id,
    wordId: row.word_id,
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    nextReviewDate: row.next_review_date,
    status: (row.status as WordStatus) ?? 'active',
    easyCount: row.easy_count ?? 0,
    masteredAt: row.mastered_at ?? null,
    checkStage: row.check_stage ?? 0,
    nextCheckDate: row.next_check_date ?? null,
  };
}

function masteryOf(r: WordReview | undefined): MasteryState {
  if (!r) return { ...NEW_MASTERY_STATE };
  return {
    status: r.status,
    easyCount: r.easyCount,
    masteredAt: r.masteredAt,
    checkStage: r.checkStage,
    nextCheckDate: r.nextCheckDate,
  };
}

// SM-2 algorithm
// quality: easy=5, good=3, hard=1
function sm2(
  easeFactor: number,
  intervalDays: number,
  repetitions: number,
  quality: number
): { easeFactor: number; intervalDays: number; repetitions: number } {
  let newInterval: number;
  let newRepetitions: number;
  let newEaseFactor: number;

  if (quality < 3) {
    // Failed recall: reset
    newRepetitions = 0;
    newInterval = 1;
    newEaseFactor = easeFactor; // don't change EF on failure
  } else {
    newRepetitions = repetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(intervalDays * easeFactor);
    }
    // Update ease factor
    newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEaseFactor = Math.max(1.3, newEaseFactor);
  }

  return { easeFactor: newEaseFactor, intervalDays: newInterval, repetitions: newRepetitions };
}

const qualityMap: Record<SRSQuality, number> = { easy: 5, good: 3, hard: 1 };
const MAX_REVIEWS_PER_DAY = 5;

export function useSRS(allWords: Word[]) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Record<string, WordReview>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [tableExists, setTableExists] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) { setIsLoaded(true); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from('word_reviews')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        // Table likely doesn't exist yet — fail gracefully
        console.warn('[SRS] word_reviews table not ready:', error.message);
        setIsLoaded(true);
        return;
      }

      setTableExists(true);
      const existingReviewWordIds = new Set((data || []).map((r: { word_id: string }) => r.word_id));

      // Bootstrap: create SRS entries for words already seen but without a review entry
      // Schedule them for today so they appear immediately
      const { data: seenWords } = await supabase
        .from('user_progress')
        .select('word_id')
        .eq('user_id', user.id)
        .eq('seen', true);

      if (seenWords && seenWords.length > 0) {
        const toBootstrap = seenWords
          .filter((p: { word_id: string }) => !existingReviewWordIds.has(p.word_id))
          .map((p: { word_id: string }) => ({
            user_id: user.id,
            word_id: p.word_id,
            ease_factor: 2.5,
            interval_days: 1,
            repetitions: 0,
            next_review_date: today, // due today
            last_reviewed_at: null,
          }));

        if (toBootstrap.length > 0) {
          console.log(`[SRS] Bootstrapping ${toBootstrap.length} seen words into SRS`);
          await supabase
            .from('word_reviews')
            .insert(toBootstrap);
          // Re-fetch after bootstrap
          const { data: refreshed } = await supabase
            .from('word_reviews')
            .select('*')
            .eq('user_id', user.id);
          if (refreshed) {
            const map: Record<string, WordReview> = {};
            for (const row of refreshed) map[row.word_id] = rowToReview(row);
            setReviews(map);
          }
          setIsLoaded(true);
          return;
        }
      }

      if (data) {
        const map: Record<string, WordReview> = {};
        for (const row of data) map[row.word_id] = rowToReview(row);
        setReviews(map);
      }
      setIsLoaded(true);
    };

    load();
  }, [user]);

  // Session de révision : 5 mots maximum, dont au plus 2 "contrôles" de mots maîtrisés (+1 mois / +3 mois).
  // Le reste : mots actifs dus d'abord, puis les plus proches de leur échéance. Mots ignorés jamais proposés.
  const dueReviews = useCallback((): Word[] => {
    if (!tableExists) return [];
    const ids = buildReviewSession(
      Object.values(reviews).map((r) => ({
        wordId: r.wordId,
        status: r.status,
        nextReviewDate: r.nextReviewDate,
        checkStage: r.checkStage,
        nextCheckDate: r.nextCheckDate,
        easyCount: r.easyCount,
        masteredAt: r.masteredAt,
      })),
      today,
      allWords.map((w) => w.id),
      MAX_REVIEWS_PER_DAY,
    );
    const byId = new Map(allWords.map((w) => [w.id, w] as [string, Word]));
    return ids.map((id) => byId.get(id)).filter((w): w is Word => !!w);
  }, [reviews, allWords, today, tableExists]);

  // État de maîtrise d'un mot (pour l'affichage 1/3 – 3/3 et le libellé "Contrôle")
  const getMastery = useCallback(
    (wordId: string): MasteryState & { isCheck: boolean } => {
      const state = masteryOf(reviews[wordId]);
      return { ...state, isCheck: isCheckDue(state, today) };
    },
    [reviews, today],
  );

  // Enregistre le résultat d'une réponse en saisie libre.
  // - correct=false => compté "Difficile" automatiquement, aucun point de maîtrise
  // - seul "Facile" sur une bonne réponse donne 1 point (3 points = mot maîtrisé)
  const submitReview = useCallback(
    async (wordId: string, quality: SRSQuality, correct: boolean): Promise<ReviewOutcome | null> => {
      if (!user || !tableExists) return null;

      const existing = reviews[wordId];
      const state = masteryOf(existing);
      const outcome = applyAnswer(state, { correct, quality }, new Date());

      // Mot ignoré : jamais modifié
      if (state.status === 'ignored') return outcome;

      const keepSchedule = state.status === 'mastered' && outcome.checkPassed;
      const sm = keepSchedule
        ? {
            easeFactor: existing?.easeFactor ?? 2.5,
            intervalDays: existing?.intervalDays ?? 1,
            repetitions: existing?.repetitions ?? 0,
          }
        : sm2(
            existing?.easeFactor ?? 2.5,
            existing?.intervalDays ?? 1,
            existing?.repetitions ?? 0,
            qualityMap[outcome.effectiveQuality],
          );

      let nextReviewDate = existing?.nextReviewDate ?? today;
      if (!keepSchedule) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + sm.intervalDays);
        nextReviewDate = format(nextDate, 'yyyy-MM-dd');
      }

      const payload = {
        user_id: user.id,
        word_id: wordId,
        ease_factor: sm.easeFactor,
        interval_days: sm.intervalDays,
        repetitions: sm.repetitions,
        next_review_date: nextReviewDate,
        last_reviewed_at: new Date().toISOString(),
        status: outcome.next.status,
        easy_count: outcome.next.easyCount,
        mastered_at: outcome.next.masteredAt,
        check_stage: outcome.next.checkStage,
        next_check_date: outcome.next.nextCheckDate,
      };

      const { error } = await supabase
        .from('word_reviews')
        .upsert(payload, { onConflict: 'user_id,word_id' });

      if (error) {
        console.error('[SRS] submitReview error:', error);
        return null;
      }

      setReviews((prev) => ({
        ...prev,
        [wordId]: {
          id: existing?.id ?? '',
          wordId,
          easeFactor: sm.easeFactor,
          intervalDays: sm.intervalDays,
          repetitions: sm.repetitions,
          nextReviewDate,
          status: outcome.next.status,
          easyCount: outcome.next.easyCount,
          masteredAt: outcome.next.masteredAt,
          checkStage: outcome.next.checkStage,
          nextCheckDate: outcome.next.nextCheckDate,
        },
      }));
      return outcome;
    },
    [user, reviews, tableExists, today],
  );

  // Create initial SRS entry after seeing a new word (next review = tomorrow)
  const createReview = useCallback(async (wordId: string) => {
    if (!user || !tableExists) return;
    if (reviews[wordId]) return; // already exists

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextReviewDate = format(tomorrow, 'yyyy-MM-dd');

    const { error } = await supabase
      .from('word_reviews')
      .insert({
        user_id: user.id,
        word_id: wordId,
        ease_factor: 2.5,
        interval_days: 1,
        repetitions: 0,
        next_review_date: nextReviewDate,
        last_reviewed_at: null,
      });

    if (error && error.code !== '23505') {
      // 23505 = unique violation (already exists) — safe to ignore
      console.error('[SRS] createReview error:', error);
      return;
    }

    setReviews(prev => ({
      ...prev,
      [wordId]: {
        id: '',
        wordId,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 0,
        nextReviewDate,
        ...NEW_MASTERY_STATE,
      },
    }));
  }, [user, reviews, tableExists]);

  return { dueReviews, submitReview, createReview, getMastery, isLoaded, tableExists };
}
