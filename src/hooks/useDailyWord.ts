import { useState, useEffect, useCallback } from 'react';
import { Word } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';

interface DailyWordState {
  word: Word | null;
  date: string | null;
  isLoading: boolean;
  error: string | null;
}

const CACHE_KEY = 'mot-du-jour-daily-word-cache';

interface CachedWord {
  word: Word;
  date: string;
  cachedAt: number;
}

// Get current Paris date for cache validation
function getParisDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export function useDailyWord() {
  const [state, setState] = useState<DailyWordState>({
    word: null,
    date: null,
    isLoading: true,
    error: null,
  });

  const fetchDailyWord = useCallback(async () => {
    const todayParis = getParisDateString();
    
    // Check local cache first
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      try {
        const cached: CachedWord = JSON.parse(cachedData);
        // If cache is for today (Paris time), use it immediately
        if (cached.date === todayParis) {
          console.log('Using cached daily word for', todayParis);
          setState({
            word: cached.word,
            date: cached.date,
            isLoading: false,
            error: null,
          });
          return;
        }
      } catch (e) {
        console.warn('Failed to parse cached daily word:', e);
      }
    }

    // Fetch from server
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { data, error } = await supabase.functions.invoke('get-daily-word');
      
      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch daily word');
      }

      const word: Word = data.word;
      const date: string = data.date;

      // Cache the result
      const cacheData: CachedWord = {
        word,
        date,
        cachedAt: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setState({
        word,
        date,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching daily word:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    fetchDailyWord();
  }, [fetchDailyWord]);

  return {
    ...state,
    refetch: fetchDailyWord,
  };
}
