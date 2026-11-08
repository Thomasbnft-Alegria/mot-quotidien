// Daily word hook - fetches the daily word from the server.
// Utilisateur connecté : mot PERSONNEL (réservoir), fixé pour la journée côté serveur, cache propre à chaque compte.
// Déconnecté : mot global historique.
import { useState, useEffect, useCallback } from 'react';
import { Word } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { dailyWordCacheKey, isCacheUsable } from '@/lib/reservoir';

interface DailyWordState {
  word: Word | null;
  date: string | null;
  isLoading: boolean;
  error: string | null;
  isPersonal: boolean;
}

interface CachedWord {
  word: Word;
  date: string;
  cachedAt: number;
  dataVersion?: string;
  personal?: boolean;
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
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<DailyWordState>({
    word: null,
    date: null,
    isLoading: true,
    error: null,
    isPersonal: false,
  });

  const fetchDailyWord = useCallback(async () => {
    // On attend de savoir si l'utilisateur est connecté : sinon on chargerait d'abord le mot global.
    if (authLoading) return;

    const todayParis = getParisDateString();
    const wantPersonal = !!userId;
    const cacheKey = dailyWordCacheKey(userId);

    // Check local cache first (clé propre à l'utilisateur)
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const cached: CachedWord = JSON.parse(cachedData);
        if (isCacheUsable(cached, todayParis, wantPersonal)) {
          console.log('Using cached daily word for', todayParis);
          setState({
            word: cached.word,
            date: cached.date,
            isLoading: false,
            error: null,
            isPersonal: cached.personal === true,
          });
          return;
        }
        // Date changed, old cache format, or non-personal cache for a logged-in user → clear and re-fetch
        localStorage.removeItem(cacheKey);
      } catch (e) {
        console.warn('Failed to parse cached daily word:', e);
        localStorage.removeItem(cacheKey);
      }
    }

    // Fetch from server
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke(
        'get-daily-word',
        wantPersonal ? { body: { personal: true } } : undefined,
      );

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch daily word');
      }

      const word: Word = data.word;
      const date: string = data.date;
      const dataVersion: string | undefined = data.dataVersion;
      const isPersonal = data.isPersonal === true;

      // On ne met en cache que ce qui correspond à ce qu'on a demandé : pour un utilisateur connecté,
      // un repli sur le mot global (serveur en difficulté) ne doit pas être figé pour la journée.
      if (!wantPersonal || isPersonal) {
        const cacheData: CachedWord = {
          word,
          date,
          cachedAt: Date.now(),
          dataVersion,
          personal: isPersonal,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      }

      setState({
        word,
        date,
        isLoading: false,
        error: null,
        isPersonal,
      });
    } catch (error) {
      console.error('Error fetching daily word:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [authLoading, userId]);

  useEffect(() => {
    fetchDailyWord();
  }, [fetchDailyWord]);

  return {
    ...state,
    refetch: fetchDailyWord,
  };
}
