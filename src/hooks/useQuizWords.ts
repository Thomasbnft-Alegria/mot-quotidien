// Quiz words hook - fetches words from database for review
import { useState, useEffect, useCallback } from 'react';
import { Word } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';

interface QuizWordsState {
  quizWords: Word[];      // Words to quiz on (date_shown not null)
  allWords: Word[];       // All words (for distractors)
  isLoading: boolean;
  error: string | null;
}

export function useQuizWords() {
  const [state, setState] = useState<QuizWordsState>({
    quizWords: [],
    allWords: [],
    isLoading: true,
    error: null,
  });

  const fetchQuizWords = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Fetch all words in parallel
      const [shownWordsResult, allWordsResult] = await Promise.all([
        // Words that have been shown (for quizzing)
        supabase
          .from('words')
          .select('*')
          .not('date_shown', 'is', null)
          .order('date_shown', { ascending: false }),
        // All words (for distractors)
        supabase
          .from('words')
          .select('*')
      ]);
      
      if (shownWordsResult.error) throw shownWordsResult.error;
      if (allWordsResult.error) throw allWordsResult.error;

      // Transform to Word type
      const transformWord = (w: any): Word => ({
        id: w.id,
        word: w.word,
        definition: w.definition,
        exampleSentence: w.example_sentence,
        category: w.category as Word['category'],
        register: w.register as Word['register'],
      });

      const quizWords = (shownWordsResult.data || []).map(transformWord);
      const allWords = (allWordsResult.data || []).map(transformWord);

      console.log(`[Quiz] ${quizWords.length} words for review, ${allWords.length} total words for distractors`);

      setState({
        quizWords,
        allWords,
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
