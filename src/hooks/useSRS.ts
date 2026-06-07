import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Word } from '@/types/word';
import { format } from 'date-fns';

export type SRSQuality = 'easy' | 'good' | 'hard';

interface WordReview {
  id: string;
  wordId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
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
            for (const row of refreshed) {
              map[row.word_id] = {
                id: row.id,
                wordId: row.word_id,
                easeFactor: row.ease_factor,
                intervalDays: row.interval_days,
                repetitions: row.repetitions,
                nextReviewDate: row.next_review_date,
              };
            }
            setReviews(map);
          }
          setIsLoaded(true);
          return;
        }
      }

      if (data) {
        const map: Record<string, WordReview> = {};
        for (const row of data) {
          map[row.word_id] = {
            id: row.id,
            wordId: row.word_id,
            easeFactor: row.ease_factor,
            intervalDays: row.interval_days,
            repetitions: row.repetitions,
            nextReviewDate: row.next_review_date,
          };
        }
        setReviews(map);
      }
      setIsLoaded(true);
    };

    load();
  }, [user]);

  // Always return MAX_REVIEWS_PER_DAY words:
  // 1. Strictly due today (next_review_date <= today) first
  // 2. Fill remaining slots with other seen words (oldest reviewed first)
  const dueReviews = useCallback((): Word[] => {
    if (!tableExists) return [];

    const allReviews = Object.values(reviews);

    // Words strictly due today
    const dueIds = new Set(
      allReviews
        .filter(r => r.nextReviewDate <= today)
        .map(r => r.wordId)
    );

    // All other seen words (not yet due), sorted by oldest last review
    const notDueReviews = allReviews
      .filter(r => r.nextReviewDate > today)
      .sort((a, b) => {
        const aTime = a.nextReviewDate < today ? 0 : new Date(a.nextReviewDate).getTime();
        const bTime = b.nextReviewDate < today ? 0 : new Date(b.nextReviewDate).getTime();
        return aTime - bTime; // soonest upcoming first
      });

    const dueWords = allWords.filter(w => dueIds.has(w.id));
    const fillIds = new Set(dueWords.map(w => w.id));

    // Fill up to MAX with not-yet-due words
    const fillWords: Word[] = [];
    for (const r of notDueReviews) {
      if (fillWords.length + dueWords.length >= MAX_REVIEWS_PER_DAY) break;
      const word = allWords.find(w => w.id === r.wordId && !fillIds.has(w.id));
      if (word) { fillWords.push(word); fillIds.add(word.id); }
    }

    return [...dueWords, ...fillWords].slice(0, MAX_REVIEWS_PER_DAY);
  }, [reviews, allWords, today, tableExists]);

  // Submit a review result and update SRS schedule
  const submitReview = useCallback(async (wordId: string, quality: SRSQuality) => {
    if (!user || !tableExists) return;

    const existing = reviews[wordId];
    const q = qualityMap[quality];

    const { easeFactor, intervalDays, repetitions } = sm2(
      existing?.easeFactor ?? 2.5,
      existing?.intervalDays ?? 1,
      existing?.repetitions ?? 0,
      q
    );

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);
    const nextReviewDate = format(nextDate, 'yyyy-MM-dd');

    const payload = {
      user_id: user.id,
      word_id: wordId,
      ease_factor: easeFactor,
      interval_days: intervalDays,
      repetitions,
      next_review_date: nextReviewDate,
      last_reviewed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('word_reviews')
      .upsert(payload, { onConflict: 'user_id,word_id' });

    if (error) {
      console.error('[SRS] submitReview error:', error);
      return;
    }

    setReviews(prev => ({
      ...prev,
      [wordId]: {
        id: existing?.id ?? '',
        wordId,
        easeFactor,
        intervalDays,
        repetitions,
        nextReviewDate,
      },
    }));
  }, [user, reviews, tableExists]);

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
      },
    }));
  }, [user, reviews, tableExists]);

  return { dueReviews, submitReview, createReview, isLoaded, tableExists };
}
