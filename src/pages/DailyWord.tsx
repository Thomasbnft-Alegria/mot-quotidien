// Daily Word Page - with SRS active recall before the word of the day
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryBadge } from '@/components/CategoryBadge';
import { BottomNav } from '@/components/BottomNav';
import { ActiveRecall } from '@/components/ActiveRecall';
import { useProgress } from '@/hooks/useProgress';
import { useDailyWord } from '@/hooks/useDailyWord';
import { useSRS, SRSQuality } from '@/hooks/useSRS';
import { useQuizWords } from '@/hooks/useQuizWords';
import { Sparkles, BookOpen, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationPrompt } from '@/components/NotificationPrompt';

type Phase = 'loading' | 'word' | 'srs' | 'done';

export default function DailyWord() {
  const navigate = useNavigate();
  const { word: todayWord, isLoading: wordLoading, error, refetch } = useDailyWord();
  const { markWordAsSeen, isWordSeen, isLoaded: progressLoaded } = useProgress();
  const { allWords, isLoading: wordsLoading } = useQuizWords();
  const { dueReviews, submitReview, createReview, isLoaded: srsLoaded } = useSRS(allWords);

  const [phase, setPhase] = useState<Phase>('loading');
  const [reviewQueue, setReviewQueue] = useState<typeof allWords>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [hasSeenToday, setHasSeenToday] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [srsSessionDone, setSrsSessionDone] = useState(false);

  // Once everything loaded, always show the word of the day first
  useEffect(() => {
    const isReady = progressLoaded && srsLoaded && !wordLoading && !wordsLoading;
    if (!isReady || phase !== 'loading') return;

    setPhase('word');
    setTimeout(() => setShowContent(true), 100);
  }, [progressLoaded, srsLoaded, wordLoading, wordsLoading]);

  useEffect(() => {
    if (progressLoaded && todayWord) {
      setHasSeenToday(isWordSeen(todayWord.id));
    }
  }, [progressLoaded, todayWord, isWordSeen]);

  const handleSRSResult = async (quality: SRSQuality) => {
    const currentWord = reviewQueue[reviewIndex];
    await submitReview(currentWord.id, quality);

    const nextIndex = reviewIndex + 1;
    if (nextIndex < reviewQueue.length) {
      setReviewIndex(nextIndex);
    } else {
      // All reviews done → back to word of the day (already seen)
      setSrsSessionDone(true);
      setHasSeenToday(true);
      setPhase('word');
    }
  };

  const handleMarkSeen = async () => {
    if (todayWord) {
      await markWordAsSeen(todayWord.id);
      await createReview(todayWord.id); // Schedule first SRS review for tomorrow

      // After marking seen, check if there are SRS reviews due
      const due = dueReviews();
      if (due.length > 0) {
        setReviewQueue(due);
        setReviewIndex(0);
        setPhase('srs');
      } else {
        setHasSeenToday(true);
      }
    }
  };

  // Loading state
  if (phase === 'loading' || wordLoading) {
    return (
      <div className="page-scroll bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  // Error state
  if (phase === 'word' && (error || !todayWord)) {
    return (
      <div className="page-scroll bg-background flex flex-col items-center justify-center pb-20 px-6">
        <p className="text-muted-foreground mb-4 text-center">
          {error || 'Impossible de charger le mot du jour'}
        </p>
        <Button onClick={refetch} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Réessayer
        </Button>
        <BottomNav />
      </div>
    );
  }

  // SRS phase: active recall
  if (phase === 'srs' && reviewQueue.length > 0) {
    const currentWord = reviewQueue[reviewIndex];
    return (
      <div className="page-fixed bg-background">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-6 py-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentWord.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
              >
                <ActiveRecall
                  word={currentWord}
                  current={reviewIndex + 1}
                  total={reviewQueue.length}
                  onResult={handleSRSResult}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Word of the day phase
  return (
    <div className="page-scroll bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        <NotificationPrompt />

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          {srsSessionDone && reviewQueue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 inline-flex items-center gap-2 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-sm font-medium px-3 py-1.5 rounded-full"
            >
              ✓ Session complète — {reviewQueue.length} révision{reviewQueue.length > 1 ? 's' : ''} faite{reviewQueue.length > 1 ? 's' : ''}
            </motion.div>
          )}
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Mot du jour</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Découvrez un nouveau mot chaque jour
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {showContent && todayWord && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="border-0 shadow-lg bg-card">
                <CardContent className="p-8">
                  <div className="flex justify-center mb-6">
                    <CategoryBadge category={todayWord.category} gender={todayWord.gender} />
                  </div>

                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-4xl md:text-5xl font-bold text-center text-foreground mb-6 tracking-tight"
                  >
                    {todayWord.word}
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-sm text-muted-foreground mb-6"
                  >
                    {todayWord.register === 'soutenu' ? 'Registre soutenu' : 'Registre courant'}
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="mb-6"
                  >
                    <p className="text-lg text-center text-foreground leading-relaxed">
                      {todayWord.definition}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-muted/50 rounded-lg p-4"
                  >
                    <p className="text-muted-foreground italic text-center">
                      « {todayWord.exampleSentence} »
                    </p>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-8 flex flex-col gap-3"
        >
          {!hasSeenToday ? (
            <Button
              size="lg"
              onClick={handleMarkSeen}
              className="w-full h-14 text-lg font-medium"
            >
              J'ai compris ✓
            </Button>
          ) : (
            <>
              <div className="text-center text-success font-medium mb-2">
                ✓ Mot appris aujourd'hui
              </div>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  const due = dueReviews();
                  if (due.length > 0) {
                    setReviewQueue(due);
                    setReviewIndex(0);
                    setSrsSessionDone(false);
                    setPhase('srs');
                  } else {
                    navigate('/quiz');
                  }
                }}
                className="w-full h-14 text-lg font-medium gap-2"
              >
                <BookOpen className="w-5 h-5" />
                Réviser
              </Button>
            </>
          )}
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
