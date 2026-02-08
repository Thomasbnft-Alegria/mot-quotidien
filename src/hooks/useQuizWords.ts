// Quiz words hook - fetches words from database for review
import { useState, useEffect, useCallback } from 'react';
import { Word } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';

interface QuizWordsState {
  words: Word[];
  isLoading: boolean;
  error: string | null;
}

export function useQuizWords() {
  const [state, setState] = useState<QuizWordsState>({
    words: [],
    isLoading: true,
    error: null,
  });

  const fetchQuizWords = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Get all words that have been shown (date_shown is not null)
      const { data, error } = await supabase
        .from('words')
        .select('*')
        .not('date_shown', 'is', null)
        .order('date_shown', { ascending: false });
      
      if (error) {
        throw error;
      }

      // Transform to Word type
      const words: Word[] = (data || []).map(w => ({
        id: w.id,
        word: w.word,
        definition: w.definition,
        exampleSentence: w.example_sentence,
        category: w.category as Word['category'],
        register: w.register as Word['register'],
      }));

      console.log(`[Quiz] Found ${words.length} words available for review`);

      setState({
        words,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching quiz words:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    fetchQuizWords();
  }, [fetchQuizWords]);

  return {
    ...state,
    refetch: fetchQuizWords,
  };
}
