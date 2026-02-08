import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CategoryBadge } from '@/components/CategoryBadge';
import { BottomNav } from '@/components/BottomNav';
import { useQuizWords } from '@/hooks/useQuizWords';
import { Word } from '@/types/word';
import { Brain, CheckCircle, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Quiz() {
  const { words: allAvailableWords, isLoading, refetch } = useQuizWords();
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [quizWords, setQuizWords] = useState<Word[]>([]);
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);

  const startQuiz = useCallback(() => {
    // Shuffle and take up to 5 words for the quiz
    const shuffled = [...allAvailableWords].sort(() => Math.random() - 0.5);
    const wordsForQuiz = shuffled.slice(0, Math.min(5, shuffled.length));
    
    if (wordsForQuiz.length > 0) {
      setQuizWords(wordsForQuiz);
      setQuizStarted(true);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setShowResult(false);
      setResults([]);
    }
  }, [allAvailableWords]);

  const currentWord = quizWords[currentIndex];

  // Generate answer choices for current word using all available words as distractors
  const answerChoices = useMemo(() => {
    if (!currentWord) return [];

    // Get distractors from all available words (preferably same category)
    const sameCategory = allAvailableWords.filter(
      w => w.id !== currentWord.id && w.category === currentWord.category
    );
    const otherWords = allAvailableWords.filter(
      w => w.id !== currentWord.id && w.category !== currentWord.category
    );

    let distractors: Word[] = [];
    
    // Try to get at least 2 from same category
    const shuffledSameCategory = [...sameCategory].sort(() => Math.random() - 0.5);
    const shuffledOther = [...otherWords].sort(() => Math.random() - 0.5);
    
    distractors = [...shuffledSameCategory.slice(0, 2), ...shuffledOther.slice(0, 1)];
    
    if (distractors.length < 3) {
      const remaining = [...shuffledSameCategory, ...shuffledOther]
        .filter(w => !distractors.includes(w))
        .slice(0, 3 - distractors.length);
      distractors = [...distractors, ...remaining];
    }

    // Combine with correct answer and shuffle
    const allChoices = [
      { id: currentWord.id, definition: currentWord.definition, isCorrect: true },
      ...distractors.slice(0, 3).map(w => ({ id: w.id, definition: w.definition, isCorrect: false }))
    ].sort(() => Math.random() - 0.5);

    return allChoices;
  }, [currentWord, allAvailableWords]);

  const handleAnswer = (answerId: string, isCorrect: boolean) => {
    if (showResult) return;
    
    setSelectedAnswer(answerId);
    setShowResult(true);
    setResults(prev => [...prev, { wordId: currentWord.id, correct: isCorrect }]);
  };

  const handleNext = () => {
    if (currentIndex < quizWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const isQuizComplete = currentIndex === quizWords.length - 1 && showResult;
  const correctCount = results.filter(r => r.correct).length;
  const progress = ((currentIndex + (showResult ? 1 : 0)) / quizWords.length) * 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  // No words available for quiz
  if (!quizStarted) {
    const hasWords = allAvailableWords.length > 0;

    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Brain className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Quiz de révision</h1>
            
            {hasWords ? (
              <>
                <p className="text-muted-foreground mb-8">
                  Révisez vos mots avec un quiz de {Math.min(5, allAvailableWords.length)} question{allAvailableWords.length > 1 ? 's' : ''}.
                  Les mots sont choisis parmi les {allAvailableWords.length} mot{allAvailableWords.length > 1 ? 's' : ''} découvert{allAvailableWords.length > 1 ? 's' : ''}.
                </p>
                <Button size="lg" onClick={startQuiz} className="h-14 px-8 text-lg">
                  Commencer le quiz
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Vous n'avez pas encore de mots à réviser.<br />
                  Découvrez d'abord quelques mots du jour !
                </p>
                <Button variant="outline" onClick={refetch} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Actualiser
                </Button>
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Quiz complete screen
  if (isQuizComplete) {
    const percentage = Math.round((correctCount / quizWords.length) * 100);
    
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-6 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6",
              percentage >= 80 ? "bg-success/10" : percentage >= 50 ? "bg-primary/10" : "bg-destructive/10"
            )}>
              <span className="text-4xl font-bold text-foreground">{percentage}%</span>
            </div>
            
            <h1 className="text-2xl font-bold text-foreground mb-2">Quiz terminé !</h1>
            <p className="text-muted-foreground mb-6">
              {correctCount} bonne{correctCount > 1 ? 's' : ''} réponse{correctCount > 1 ? 's' : ''} sur {quizWords.length}
            </p>

            <div className="space-y-3 mb-8">
              {results.map((result, idx) => {
                const word = quizWords[idx];
                return (
                  <div
                    key={result.wordId}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      result.correct ? "bg-success/10" : "bg-destructive/10"
                    )}
                  >
                    <span className="font-medium">{word.word}</span>
                    {result.correct ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                );
              })}
            </div>

            <Button size="lg" onClick={startQuiz} className="h-14 px-8 text-lg">
              Recommencer
            </Button>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Question {currentIndex + 1}/{quizWords.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-0 shadow-lg mb-6">
              <CardContent className="p-6">
                <div className="flex justify-center mb-4">
                  <CategoryBadge category={currentWord.category} />
                </div>
                <h2 className="text-3xl font-bold text-center text-foreground">
                  {currentWord.word}
                </h2>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  Quelle est la définition ?
                </p>
              </CardContent>
            </Card>

            {/* Answer choices */}
            <div className="space-y-3">
              {answerChoices.map((choice) => {
                const isSelected = selectedAnswer === choice.id;
                const showCorrect = showResult && choice.isCorrect;
                const showIncorrect = showResult && isSelected && !choice.isCorrect;

                return (
                  <motion.button
                    key={choice.id}
                    onClick={() => handleAnswer(choice.id, choice.isCorrect)}
                    disabled={showResult}
                    className={cn(
                      "w-full p-4 text-left rounded-xl border-2 transition-all",
                      !showResult && "hover:border-primary hover:bg-accent/50",
                      !showResult && !isSelected && "border-border bg-card",
                      showCorrect && "border-success bg-success/10",
                      showIncorrect && "border-destructive bg-destructive/10",
                      showResult && !showCorrect && !showIncorrect && "border-border bg-card opacity-50"
                    )}
                    whileTap={{ scale: showResult ? 1 : 0.98 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5",
                        showCorrect && "bg-success text-success-foreground",
                        showIncorrect && "bg-destructive text-destructive-foreground",
                        !showResult && "border-2 border-muted-foreground/30"
                      )}>
                        {showCorrect && <CheckCircle className="w-4 h-4" />}
                        {showIncorrect && <XCircle className="w-4 h-4" />}
                      </div>
                      <p className="text-foreground">{choice.definition}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Next button */}
            {showResult && !isQuizComplete && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6"
              >
                <Button
                  size="lg"
                  onClick={handleNext}
                  className="w-full h-14 text-lg gap-2"
                >
                  Question suivante
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
}
