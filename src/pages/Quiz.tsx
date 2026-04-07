import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CategoryBadge } from '@/components/CategoryBadge';
import { BottomNav } from '@/components/BottomNav';
import { useQuizWords } from '@/hooks/useQuizWords';
import { useProgress } from '@/hooks/useProgress';
import { Word } from '@/types/word';
import { Brain, CheckCircle, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Quiz() {
  const { allWords: allWordsForDistractors, isLoading: wordsLoading, refetch } = useQuizWords();
  const { getQuizWords, recordQuizAnswer, isLoaded } = useProgress();
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [quizWords, setQuizWords] = useState<Word[]>([]);
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);

  const availableQuizWords = useMemo(() => {
    return getQuizWords(allWordsForDistractors);
  }, [getQuizWords, allWordsForDistractors]);

  const startQuiz = useCallback(() => {
    const shuffled = [...availableQuizWords].sort(() => Math.random() - 0.5);
    const wordsForQuiz = shuffled.slice(0, Math.min(5, shuffled.length));
    
    if (wordsForQuiz.length > 0) {
      setQuizWords(wordsForQuiz);
      setQuizStarted(true);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setShowResult(false);
      setResults([]);
    }
  }, [availableQuizWords]);

  const currentWord = quizWords[currentIndex];

  const answerChoices = useMemo(() => {
    if (!currentWord) return [];

    const distractors: Word[] = [];
    const usedIds = new Set<string>([currentWord.id]);

    const sameCategoryAndRegister = allWordsForDistractors.filter(
      w => w.id !== currentWord.id && w.category === currentWord.category && w.register === currentWord.register
    );
    const shuffledSameCR = [...sameCategoryAndRegister].sort(() => Math.random() - 0.5);
    for (const word of shuffledSameCR) {
      if (distractors.length >= 3) break;
      if (!usedIds.has(word.id)) { distractors.push(word); usedIds.add(word.id); }
    }

    if (distractors.length < 3) {
      const sameCategory = allWordsForDistractors.filter(w => !usedIds.has(w.id) && w.category === currentWord.category);
      for (const word of [...sameCategory].sort(() => Math.random() - 0.5)) {
        if (distractors.length >= 3) break;
        distractors.push(word); usedIds.add(word.id);
      }
    }

    if (distractors.length < 3) {
      const anyOther = allWordsForDistractors.filter(w => !usedIds.has(w.id));
      for (const word of [...anyOther].sort(() => Math.random() - 0.5)) {
        if (distractors.length >= 3) break;
        distractors.push(word); usedIds.add(word.id);
      }
    }

    return [
      { id: currentWord.id, definition: currentWord.definition, isCorrect: true },
      ...distractors.map(w => ({ id: w.id, definition: w.definition, isCorrect: false }))
    ].sort(() => Math.random() - 0.5);
  }, [currentWord, allWordsForDistractors]);

  const handleAnswer = (answerId: string, isCorrect: boolean) => {
    if (showResult) return;
    setSelectedAnswer(answerId);
    setShowResult(true);
    setResults(prev => [...prev, { wordId: currentWord.id, correct: isCorrect }]);
    recordQuizAnswer(currentWord.id, isCorrect);
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

  if (wordsLoading || !isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!quizStarted) {
    const hasWords = availableQuizWords.length > 0;

    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-lg mx-auto px-4 py-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Quiz de révision</h1>
            {hasWords ? (
              <>
                <p className="text-muted-foreground mb-6">
                  Révisez vos mots avec un quiz de {Math.min(5, availableQuizWords.length)} question{availableQuizWords.length > 1 ? 's' : ''}.
                </p>
                <Button size="lg" onClick={startQuiz} className="h-12 px-8 text-lg">Commencer le quiz</Button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Vous n'avez pas encore de mots à réviser.<br />Découvrez d'abord quelques mots du jour !
                </p>
                <Button variant="outline" onClick={refetch} className="gap-2">
                  <RefreshCw className="w-4 h-4" />Actualiser
                </Button>
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (isQuizComplete) {
    const percentage = Math.round((correctCount / quizWords.length) * 100);
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-lg mx-auto px-4 py-6">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4", percentage >= 80 ? "bg-success/10" : percentage >= 50 ? "bg-primary/10" : "bg-destructive/10")}>
              <span className="text-3xl font-bold text-foreground">{percentage}%</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Quiz terminé !</h1>
            <p className="text-muted-foreground mb-4">{correctCount} bonne{correctCount > 1 ? 's' : ''} réponse{correctCount > 1 ? 's' : ''} sur {quizWords.length}</p>
            <div className="space-y-2 mb-6">
              {results.map((result, idx) => {
                const word = quizWords[idx];
                return (
                  <div key={result.wordId} className={cn("flex items-center justify-between p-3 rounded-lg", result.correct ? "bg-success/10" : "bg-destructive/10")}>
                    <span className="font-medium">{word.word}</span>
                    {result.correct ? <CheckCircle className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                );
              })}
            </div>
            <Button size="lg" onClick={startQuiz} className="h-12 px-8 text-lg">Recommencer</Button>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Question {currentIndex + 1}/{quizWords.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentIndex} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.3 }}>
            <Card className="border-0 shadow-lg mb-4">
              <CardContent className="p-5">
                <div className="flex justify-center mb-4"><CategoryBadge category={currentWord.category} /></div>
                <h2 className="text-3xl font-bold text-center text-foreground">{currentWord.word}</h2>
                <p className="text-center text-sm text-muted-foreground mt-2">Quelle est la définition ?</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
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
                      "w-full p-3 text-left rounded-xl border-2 transition-all",
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

            {showResult && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
                {selectedAnswer && !answerChoices.find(c => c.id === selectedAnswer)?.isCorrect && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-success/10 border-2 border-success">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-success mb-1">Bonne réponse :</p>
                      <p className="text-foreground text-sm">{answerChoices.find(c => c.isCorrect)?.definition}</p>
                    </div>
                  </div>
                )}
                {!isQuizComplete && (
                  <Button size="lg" onClick={handleNext} className="w-full h-12 text-lg gap-2">
                    Question suivante
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
}
