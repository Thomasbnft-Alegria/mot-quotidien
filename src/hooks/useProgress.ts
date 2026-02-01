import { useState, useEffect, useCallback } from 'react';
import { WordProgress, UserProgress } from '@/types/word';
import { words } from '@/data/words';
import { format, isToday, parseISO, differenceInDays, isSunday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

const WORD_PROGRESS_KEY = 'mot-du-jour-word-progress';
const USER_PROGRESS_KEY = 'mot-du-jour-user-progress';
const DAILY_WORD_KEY = 'mot-du-jour-daily-word';

interface DailyWordState {
  wordId: string;
  date: string;
}

export function useProgress() {
  const [wordProgress, setWordProgress] = useState<Record<string, WordProgress>>({});
  const [userProgress, setUserProgress] = useState<UserProgress>({
    currentStreak: 0,
    lastActiveDate: null,
    totalWordsSeen: 0,
  });
  const [dailyWord, setDailyWord] = useState<DailyWordState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const storedWordProgress = localStorage.getItem(WORD_PROGRESS_KEY);
    const storedUserProgress = localStorage.getItem(USER_PROGRESS_KEY);
    const storedDailyWord = localStorage.getItem(DAILY_WORD_KEY);

    if (storedWordProgress) {
      setWordProgress(JSON.parse(storedWordProgress));
    }
    if (storedUserProgress) {
      setUserProgress(JSON.parse(storedUserProgress));
    }
    if (storedDailyWord) {
      setDailyWord(JSON.parse(storedDailyWord));
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(WORD_PROGRESS_KEY, JSON.stringify(wordProgress));
    }
  }, [wordProgress, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(USER_PROGRESS_KEY, JSON.stringify(userProgress));
    }
  }, [userProgress, isLoaded]);

  useEffect(() => {
    if (isLoaded && dailyWord) {
      localStorage.setItem(DAILY_WORD_KEY, JSON.stringify(dailyWord));
    }
  }, [dailyWord, isLoaded]);

  // Get or assign today's word
  const getTodayWord = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // If we already have a word for today, return it
    if (dailyWord && dailyWord.date === today) {
      return words.find(w => w.id === dailyWord.wordId);
    }

    // Find words not yet shown
    const seenWordIds = Object.keys(wordProgress).filter(id => wordProgress[id]?.seen);
    const unseenWords = words.filter(w => !seenWordIds.includes(w.id));
    
    // Pick a random unseen word, or cycle back if all seen
    const availableWords = unseenWords.length > 0 ? unseenWords : words;
    const randomIndex = Math.floor(Math.random() * availableWords.length);
    const selectedWord = availableWords[randomIndex];

    setDailyWord({ wordId: selectedWord.id, date: today });
    return selectedWord;
  }, [dailyWord, wordProgress]);

  // Mark a word as seen
  const markWordAsSeen = useCallback((wordId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    setWordProgress(prev => ({
      ...prev,
      [wordId]: {
        wordId,
        correctCount: prev[wordId]?.correctCount || 0,
        incorrectCount: prev[wordId]?.incorrectCount || 0,
        lastReviewed: prev[wordId]?.lastReviewed || null,
        seen: true,
        seenDate: prev[wordId]?.seenDate || today,
      },
    }));

    // Update streak
    setUserProgress(prev => {
      const lastActive = prev.lastActiveDate ? parseISO(prev.lastActiveDate) : null;
      const wasActiveYesterday = lastActive && differenceInDays(new Date(), lastActive) === 1;
      const isActiveToday = lastActive && isToday(lastActive);

      let newStreak = prev.currentStreak;
      if (!isActiveToday) {
        newStreak = wasActiveYesterday ? prev.currentStreak + 1 : 1;
      }

      const alreadySeen = wordProgress[wordId]?.seen;

      return {
        currentStreak: newStreak,
        lastActiveDate: today,
        totalWordsSeen: alreadySeen ? prev.totalWordsSeen : prev.totalWordsSeen + 1,
      };
    });
  }, [wordProgress]);

  // Record quiz answer
  const recordQuizAnswer = useCallback((wordId: string, correct: boolean) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    setWordProgress(prev => ({
      ...prev,
      [wordId]: {
        ...prev[wordId],
        wordId,
        correctCount: (prev[wordId]?.correctCount || 0) + (correct ? 1 : 0),
        incorrectCount: (prev[wordId]?.incorrectCount || 0) + (correct ? 0 : 1),
        lastReviewed: today,
        seen: prev[wordId]?.seen || false,
        seenDate: prev[wordId]?.seenDate || null,
      },
    }));
  }, []);

  // Get words for quiz (prioritized by errors and time since review)
  const getQuizWords = useCallback((count: number = 5) => {
    const seenWords = words.filter(w => wordProgress[w.id]?.seen);
    
    if (seenWords.length === 0) return [];

    // Sort by: highest incorrect count, then longest since review
    const sorted = seenWords.sort((a, b) => {
      const progressA = wordProgress[a.id];
      const progressB = wordProgress[b.id];
      
      // Prioritize words with more errors
      const errorDiff = (progressB?.incorrectCount || 0) - (progressA?.incorrectCount || 0);
      if (errorDiff !== 0) return errorDiff;

      // Then by longest time since review
      const lastA = progressA?.lastReviewed ? parseISO(progressA.lastReviewed).getTime() : 0;
      const lastB = progressB?.lastReviewed ? parseISO(progressB.lastReviewed).getTime() : 0;
      return lastA - lastB;
    });

    return sorted.slice(0, Math.min(count, sorted.length));
  }, [wordProgress]);

  // Get this week's words for weekly review
  const getWeeklyWords = useCallback(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    return words.filter(w => {
      const progress = wordProgress[w.id];
      if (!progress?.seenDate) return false;
      
      const seenDate = parseISO(progress.seenDate);
      return isWithinInterval(seenDate, { start: weekStart, end: weekEnd });
    });
  }, [wordProgress]);

  // Check if it's Sunday (weekly review available)
  const isWeeklyReviewAvailable = useCallback(() => {
    return isSunday(new Date());
  }, []);

  // Get mastered words count (>3 correct, 0 recent incorrect)
  const getMasteredCount = useCallback(() => {
    return Object.values(wordProgress).filter(p => 
      p.correctCount > 3 && p.incorrectCount === 0
    ).length;
  }, [wordProgress]);

  // Check if today's word has been seen
  const isTodayWordSeen = useCallback(() => {
    if (!dailyWord) return false;
    return wordProgress[dailyWord.wordId]?.seen || false;
  }, [dailyWord, wordProgress]);

  return {
    wordProgress,
    userProgress,
    isLoaded,
    getTodayWord,
    markWordAsSeen,
    recordQuizAnswer,
    getQuizWords,
    getWeeklyWords,
    isWeeklyReviewAvailable,
    getMasteredCount,
    isTodayWordSeen,
    dailyWord,
  };
}
