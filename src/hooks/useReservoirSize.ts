// Taille du réservoir de mots (nombre maximum de mots en cours d'apprentissage), réglable dans les Réglages.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { clampReservoirSize, RESERVOIR_DEFAULT } from '@/lib/reservoir';

export function useReservoirSize() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [size, setSizeState] = useState<number>(RESERVOIR_DEFAULT);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIsLoaded(true);
      return;
    }
    let cancelled = false;
    supabase
      .from('user_settings')
      .select('reservoir_size')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setSizeState(clampReservoirSize(data.reservoir_size));
        setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Enregistre la nouvelle taille. Renvoie false si l'écriture échoue (la valeur affichée ne change alors pas).
  const setSize = useCallback(
    async (value: unknown): Promise<boolean> => {
      if (!userId) return false;
      const next = clampReservoirSize(value);
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, reservoir_size: next }, { onConflict: 'user_id' });
      if (error) {
        console.error('[Settings] setSize error:', error);
        return false;
      }
      setSizeState(next);
      return true;
    },
    [userId],
  );

  return { size, setSize, isLoaded };
}
