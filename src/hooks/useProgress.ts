import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Word } from '@/types/word';
import { format, isToday, parseISO, differenceInDays, isSunday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

interface WordProgressData {
  wordId: string;
  seen: boolean;
  seenDate: string | null;
  correctCount: number;
  incorrectCount: number;
  lastReviewed: string | null;
}

export interface UserProgressData {
  currentStreak: number;
  lastActiveDate: string | null;
  totalWordsSeen: number;
}

export function useProgress() {
  const { user } = useAuth();
  const [wordProgress, setWordProgress] = useState<Record<string, WordProgressData>>({});
  const [userProgress, setUserProgress] = useState<UserProgressData>({
    currentStreak: 0,
    lastActiveDate: null,
    totalWordsSeen: 0,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from Supabase
  useEffect(() => {
    if (!user) { setIsLoaded(true); return; }

    const load = async () => {
      const [progressRes, streakRes] = await Promise.all([
        supabase.from('user_progress').select('*').eq('user_id', user.id),
        supabase.from('user_streaks').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (progressRes.data) {
        const map: Record<string, WordProgressData> = {};
        for (const row of progressRes.data) {
          map[row.word_id] = {
            wordId: row.word_id,
            seen: row.seen,
            seenDate: row.seen_date,
            correctCount: row.correct_count,
            incorrectCount: row.incorrect_count,
            lastReviewed: row.last_reviewed,
          };
        }
        setWordProgress(map);
      }

      if (streakRes.data) {
        setUserProgress({
          currentStreak: streakRes.data.current_streak,
          lastActiveDate: streakRes.data.last_active_date,
          totalWordsSeen: streakRes.data.total_words_seen,
        });
      }

      setIsLoaded(true);
    };

    load();
  }, [user]);

  const isWordSeen = useCallback((wordId: string) => {
    return wordProgress[wordId]?.seen || false;
  }, [wordProgress]);

  const markWordAsSeen = useCallback(async (wordId: string) => {
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const alreadySeen = wordProgress[wordId]?.seen;

    // Upsert word progress
    await supabase.from('user_progress').upsert({
      user_id: user.id,
      word_id: wordId,
      seen: true,
      seen_date: wordProgress[wordId]?.seenDate || today,
      correct_count: wordProgress[wordId]?.correctCount || 0,
      incorrect_count: wordProgress[wordId]?.incorrectCount || 0,
    }, { onConflict: 'user_id,word_id' });

    // Update local state
    setWordProgress(prev => ({
      ...prev,
      [wordId]: {
        wordId,
        seen: true,
        seenDate: prev[wordId]?.seenDate || today,
        correctCount: prev[wordId]?.correctCount || 0,
        incorrectCount: prev[wordId]?.incorrectCount || 0,
        lastReviewed: prev[wordId]?.lastReviewed || null,
      },
    }));

    // Update streak
    const lastActive = userProgress.lastActiveDate ? parseISO(userProgress.lastActiveDate) : null;
    const wasActiveYesterday = lastActive && differenceInDays(new Date(), lastActive) === 1;
    const isActiveToday = lastActive && isToday(lastActive);

    let newStreak = userProgress.currentStreak;
    if (!isActiveToday) {
      newStreak = wasActiveYesterday ? userProgress.currentStreak + 1 : 1;
    }

    const newTotalSeen = alreadySeen ? userProgress.totalWordsSeen : userProgress.totalWordsSeen + 1;

    const streakData = {
      user_id: user.id,
      current_streak: newStreak,
      last_active_date: today,
      total_words_seen: newTotalSeen,
    };

    await supabase.from('user_streaks').upsert(streakData, { onConflict: 'user_id' });

    setUserProgress({
      currentStreak: newStreak,
      lastActiveDate: today,
      totalWordsSeen: newTotalSeen,
    });
  }, [user, wordProgress, userProgress]);

  const recordQuizAnswer = useCallback(async (wordId: string, correct: boolean) => {
    if (!user) return;
    const now = new Date().toISOString();

    const prev = wordProgress[wordId];
    const newCorrect = (prev?.correctCount || 0) + (correct ? 1 : 0);
    const newIncorrect = (prev?.incorrectCount || 0) + (correct ? 0 : 1);

    await supabase.from('user_progress').upsert({
      user_id: user.id,
      word_id: wordId,
      seen: prev?.seen || false,
      seen_date: prev?.seenDate || null,
      correct_count: newCorrect,
      incorrect_count: newIncorrect,
      last_reviewed: now,
    }, { onConflict: 'user_id,word_id' });

    setWordProgress(prev2 => ({
      ...prev2,
      [wordId]: {
        wordId,
        seen: prev2[wordId]?.seen || false,
        seenDate: prev2[wordId]?.seenDate || null,
        correctCount: newCorrect,
        incorrectCount: newIncorrect,
        lastReviewed: now,
      },
    }));
  }, [user, wordProgress]);

  const getQuizWords = useCallback((allWords: Word[], count: number = 5) => {
    const seenWords = allWords.filter(w => wordProgress[w.id]?.seen);
    if (seenWords.length === 0) return [];

    // Assign a priority score to each word:
    // higher incorrectCount = higher priority, older lastReviewed = higher priority
    // Then add randomness so the same 5 words don't always appear
    const now = Date.now();
    const scored = seenWords.map(w => {
      const p = wordProgress[w.id];
      const incorrectCount = p?.incorrectCount || 0;
      const lastReviewed = p?.lastReviewed ? parseISO(p.lastReviewed).getTime() : 0;
      const daysSinceReview = (now - lastReviewed) / (1000 * 60 * 60 * 24);
      // Score: errors weighted heavily + time since review + random noise for variety
      const score = incorrectCount * 10 + daysSinceReview + Math.random() * 2;
      return { word: w, score };
    });

    // Sort by score descending (highest priority first), pick top `count`
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(count, scored.length)).map(s => s.word);
  }, [wordProgress]);

  const getWeeklyWords = useCallback((allWords: Word[]) => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    return allWords.filter(w => {
      const progress = wordProgress[w.id];
      if (!progress?.seenDate) return false;
      const seenDate = parseISO(progress.seenDate);
      return isWithinInterval(seenDate, { start: weekStart, end: weekEnd });
    });
  }, [wordProgress]);

  const isWeeklyReviewAvailable = useCallback(() => true, []);

  const [weeklyReviewStatus, setWeeklyReviewStatus] = useState<{ completed: boolean; score: number }>({ completed: false, score: 0 });

  // Load weekly review status from Supabase
  useEffect(() => {
    if (!user) return;
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    supabase
      .from('weekly_reviews')
      .select('score')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWeeklyReviewStatus({ completed: true, score: data.score });
        }
      });
  }, [user]);

  const getWeeklyReviewStatus = useCallback(() => weeklyReviewStatus, [weeklyReviewStatus]);

  const recordWeeklyReviewCompletion = useCallback(async (score: number) => {
    if (!user) return;
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    await supabase.from('weekly_reviews').upsert({
      user_id: user.id,
      week_start: weekStart,
      score,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_start' });
    setWeeklyReviewStatus({ completed: true, score });
  }, [user]);

  const getMasteredCount = useCallback(() => {
    return Object.values(wordProgress).filter(p =>
      p.correctCount > 3 && p.incorrectCount === 0
    ).length;
  }, [wordProgress]);

  return {
    wordProgress,
    userProgress,
    isLoaded,
    markWordAsSeen,
    recordQuizAnswer,
    getQuizWords,
    getWeeklyWords,
    isWeeklyReviewAvailable,
    getWeeklyReviewStatus,
    recordWeeklyReviewCompletion,
    getMasteredCount,
    isWordSeen,
  };
}
