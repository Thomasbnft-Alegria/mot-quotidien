import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CategoryBadge } from '@/components/CategoryBadge';
import { BottomNav } from '@/components/BottomNav';
import { useProgress } from '@/hooks/useProgress';
import { useQuizWords } from '@/hooks/useQuizWords';
import { Word } from '@/types/word';
import { Calendar, Trophy, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewResult {
  wordId: string;
  knew: boolean;
}

export default function WeeklyReview() {
  const { allWords, isLoading: wordsLoading } = useQuizWords();
  const {
    getWeeklyWords,
    getWeeklyReviewStatus,
    recordWeeklyReviewCompletion,
    recordQuizAnswer,
    isLoaded,
  } = useProgress();

  const [reviewStarted, setReviewStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showDefinition, setShowDefinition] = useState(false);
  const [weeklyWords, setWeeklyWords] = useState<Word[]>([]);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [weeklyStatus, setWeeklyStatus] = useState<{ completed: boolean; score: number }>({ completed: false, score: 0 });

  useEffect(() => {
    if (isLoaded) {
      setWeeklyStatus(getWeeklyReviewStatus());
    }
  }, [isLoaded, getWeeklyReviewStatus]);

  const startReview = useCallback(() => {
    const words = getWeeklyWords(allWords);
    if (words.length > 0) {
      setWeeklyWords(words);
      setReviewStarted(true);
      setCurrentIndex(0);
      setUserAnswer('');
      setShowDefinition(false);
      setResults([]);
    }
  }, [getWeeklyWords, allWords]);

  const currentWord = weeklyWords[currentIndex];

  const handleReveal = () => {
    setShowDefinition(true);
  };

  const handleSelfAssess = (knew: boolean) => {
    recordQuizAnswer(currentWord.id, knew);
    const newResults = [...results, { wordId: currentWord.id, knew }];
    setResults(newResults);

    if (currentIndex < weeklyWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer('');
      setShowDefinition(false);
    }
  };

  const isReviewComplete = results.length === weeklyWords.length && weeklyWords.length > 0;
  const knewCount = results.filter(r => r.knew).length;

  // Save completion when review finishes
  useEffect(() => {
    if (isReviewComplete && weeklyWords.length > 0) {
      const percentage = Math.round((knewCount / weeklyWords.length) * 100);
      recordWeeklyReviewCompletion(percentage);
      setWeeklyStatus({ completed: true, score: percentage });
    }
  }, [isReviewComplete]);

  if (!isLoaded || wordsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  // Already done this week with 100% — locked
  if (weeklyStatus.completed && weeklyStatus.score === 100 && !reviewStarted) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-yellow-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Semaine parfaite !</h1>
            <p className="text-muted-foreground">
              Tu as obtenu 100% à la révision de cette semaine.
              <br /><br />
              Reviens lundi pour de nouveaux mots à réviser !
            </p>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Not started yet (or can retry because score < 100%)
  if (!reviewStarted) {
    const availableWords = getWeeklyWords(allWords);
    const hasWords = availableWords.length > 0;
    const isRetry = weeklyStatus.completed && weeklyStatus.score < 100;

    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Révision hebdomadaire</h1>

            {hasWords ? (
              <>
                {isRetry && (
                  <p className="text-sm text-muted-foreground mb-3">
                    Dernier score : <span className="font-semibold text-foreground">{weeklyStatus.score}%</span> — tu peux réessayer !
                  </p>
                )}
                <p className="text-muted-foreground mb-8">
                  Révisez les {availableWords.length} mot{availableWords.length > 1 ? 's' : ''} découvert{availableWords.length > 1 ? 's' : ''} cette semaine.
                  Écrivez votre définition, puis vérifiez !
                </p>
                <Button size="lg" onClick={startReview} className="h-14 px-8 text-lg gap-2">
                  {isRetry && <RefreshCw className="w-5 h-5" />}
                  {isRetry ? 'Réessayer' : 'Commencer la révision'}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                Aucun mot découvert cette semaine.<br />
                Découvrez des mots du jour pour les réviser !
              </p>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Review complete
  if (isReviewComplete) {
    const percentage = Math.round((knewCount / weeklyWords.length) * 100);
    const isPerfect = percentage === 100;

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
              isPerfect ? "bg-yellow-100" : percentage >= 80 ? "bg-success/10" : percentage >= 50 ? "bg-primary/10" : "bg-destructive/10"
            )}>
              {isPerfect
                ? <Trophy className="w-10 h-10 text-yellow-500" />
                : <span className="text-4xl font-bold text-foreground">{percentage}%</span>
              }
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              {isPerfect ? 'Parfait ! 🎉' : 'Révision terminée !'}
            </h1>
            <p className="text-muted-foreground mb-6">
              {isPerfect
                ? 'Tu connaissais tous les mots. Bravo !'
                : `Tu connaissais ${knewCount} mot${knewCount > 1 ? 's' : ''} sur ${weeklyWords.length}`
              }
            </p>

            <div className="space-y-3 mb-8">
              {results.map((result, idx) => {
                const word = weeklyWords[idx];
                return (
                  <div
                    key={result.wordId}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      result.knew ? "bg-success/10" : "bg-destructive/10"
                    )}
                  >
                    <span className="font-medium">{word.word}</span>
                    {result.knew ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                );
              })}
            </div>

            {!isPerfect && (
              <Button size="lg" onClick={startReview} className="h-14 px-8 text-lg gap-2">
                <RefreshCw className="w-5 h-5" />
                Réessayer
              </Button>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Quiz in progress
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Progress indicator */}
        <div className="text-center mb-6">
          <span className="text-sm text-muted-foreground">
            Mot {currentIndex + 1} sur {weeklyWords.length}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            {/* Word Card */}
            <Card className="border-0 shadow-lg mb-6">
              <CardContent className="p-6">
                <div className="flex justify-center mb-4">
                  <CategoryBadge category={currentWord.category} />
                </div>
                <h2 className="text-3xl font-bold text-center text-foreground mb-4">
                  {currentWord.word}
                </h2>

                {/* User's answer area */}
                <Textarea
                  placeholder="Écrivez votre définition..."
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  disabled={showDefinition}
                  className="min-h-[100px] text-base"
                />
              </CardContent>
            </Card>

            {/* Reveal button or definition */}
            {!showDefinition ? (
              <Button
                size="lg"
                onClick={handleReveal}
                variant="outline"
                className="w-full h-14 text-lg gap-2"
              >
                <Eye className="w-5 h-5" />
                Vérifier
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-primary/30 bg-primary/5 mb-6">
                  <CardContent className="p-6">
                    <p className="text-sm font-medium text-primary mb-2">Définition correcte :</p>
                    <p className="text-foreground">{currentWord.definition}</p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => handleSelfAssess(false)}
                    className="h-14 text-lg border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="w-5 h-5 mr-2" />
                    Je ne savais pas
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => handleSelfAssess(true)}
                    className="h-14 text-lg bg-success hover:bg-success/90"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Je savais
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
}
