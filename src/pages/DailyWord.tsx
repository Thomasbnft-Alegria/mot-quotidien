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
import { Sparkles, BookOpen, RefreshCw, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { isReinforceWord } from '@/lib/reservoir';
import { useNavigate } from 'react-router-dom';
import { NotificationPrompt } from '@/components/NotificationPrompt';
import { toast } from 'sonner';
import { outcomeMessage } from '@/lib/reviewMessages';

type Phase = 'loading' | 'word' | 'srs' | 'done';

export default function DailyWord() {
  const navigate = useNavigate();
  const { word: todayWord, isLoading: wordLoading, error, refetch } = useDailyWord();
  const { markWordAsSeen, isWordSeen, wordProgress, recordActivity, isLoaded: progressLoaded } = useProgress();
  const { allWords, isLoading: wordsLoading } = useQuizWords();
  const { dueReviews, submitReview, createReview, getMastery, ignoreWord, isLoaded: srsLoaded } = useSRS(allWords);

  const [phase, setPhase] = useState<Phase>('loading');
  const [reviewQueue, setReviewQueue] = useState<typeof allWords>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [hasSeenToday, setHasSeenToday] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [srsSessionDone, setSrsSessionDone] = useState(false);
  // Nombre de mots réellement révisés dans la session (un mot ignoré n'est pas une révision)
  const [reviewedCount, setReviewedCount] = useState(0);

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

  // Mot déjà connu (vu un autre jour) : réservoir plein, on renforce le mot le moins assimilé.
  // Un mot découvert aujourd'hui reste un mot neuf, même après rechargement de la page.
  const todayLocal = format(new Date(), 'yyyy-MM-dd');
  const todayParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const isReinforce = !!todayWord && isReinforceWord(wordProgress[todayWord.id], todayLocal, todayParis);
  const isIgnored = !!todayWord && getMastery(todayWord.id).status === 'ignored';

  // Passe au mot suivant de la session ; à la fin, retour au mot du jour et la journée compte pour la série.
  const advanceSession = () => {
    const nextIndex = reviewIndex + 1;
    if (nextIndex < reviewQueue.length) {
      setReviewIndex(nextIndex);
    } else {
      // All reviews done → back to word of the day
      setSrsSessionDone(true);
      setHasSeenToday(true);
      setPhase('word');
      void recordActivity();
    }
  };

  const confirmIgnore = (wordName: string) =>
    window.confirm(`Ne plus te présenter « ${wordName} » ? Tu pourras le réactiver dans les Réglages.`);

  const handleIgnoreInSession = async () => {
    const currentWord = reviewQueue[reviewIndex];
    if (!confirmIgnore(currentWord.word)) return;
    const ok = await ignoreWord(currentWord.id);
    if (!ok) {
      toast.error("Impossible d'enregistrer ce choix. Réessaie.");
      return;
    }
    toast.success('Ce mot ne te sera plus présenté.');
    advanceSession();
  };

  const handleIgnoreToday = async () => {
    if (!todayWord || !confirmIgnore(todayWord.word)) return;
    const ok = await ignoreWord(todayWord.id);
    if (ok) {
      toast.success('Ce mot ne te sera plus présenté.');
      // Ouvrir l'app et traiter le mot du jour compte pour la série, même sans lancer de session de révision
      void recordActivity();
    } else {
      toast.error("Impossible d'enregistrer ce choix. Réessaie.");
    }
  };

  const startReview = () => {
    const due = dueReviews();
    if (due.length > 0) {
      setReviewQueue(due);
      setReviewIndex(0);
      setReviewedCount(0);
      setSrsSessionDone(false);
      setPhase('srs');
    } else {
      navigate('/quiz');
    }
  };

  const handleSRSResult = async (quality: SRSQuality, correct: boolean) => {
    const currentWord = reviewQueue[reviewIndex];
    const outcome = await submitReview(currentWord.id, quality, correct);
    setReviewedCount((n) => n + 1);

    // Messages de progression (maîtrise du mot) ou erreur d'enregistrement
    const msg = outcomeMessage(outcome, currentWord.word);
    if (msg?.type === 'success') toast.success(msg.text);
    else if (msg?.type === 'error') toast.error(msg.text);
    else if (msg) toast(msg.text);

    advanceSession();
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
                  mastery={(() => {
                    const m = getMastery(currentWord.id);
                    return { easyCount: m.easyCount, isCheck: m.isCheck, checkStage: m.checkStage };
                  })()}
                  onResult={handleSRSResult}
                  onIgnore={handleIgnoreInSession}
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
              ✓ Session complète — {reviewedCount} révision{reviewedCount > 1 ? 's' : ''} faite{reviewedCount > 1 ? 's' : ''}
            </motion.div>
          )}
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Mot du jour</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {isReinforce
              ? 'Ton réservoir est plein : on renforce le mot que tu maîtrises le moins'
              : 'Découvrez un nouveau mot chaque jour'}
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
          {isIgnored ? (
            <>
              <div data-testid="ignored-message" className="text-center text-muted-foreground font-medium mb-2">
                Ce mot ne te sera plus présenté. Un nouveau mot arrive demain.
              </div>
              <Button size="lg" variant="outline" onClick={startReview} className="w-full h-14 text-lg font-medium gap-2">
                <BookOpen className="w-5 h-5" />
                Réviser
              </Button>
            </>
          ) : !hasSeenToday && !isReinforce ? (
            <Button
              size="lg"
              onClick={handleMarkSeen}
              className="w-full h-14 text-lg font-medium"
            >
              J'ai compris ✓
            </Button>
          ) : (
            <>
              <div
                data-testid={isReinforce ? 'reinforce-message' : 'learned-message'}
                className={isReinforce ? 'text-center text-primary font-medium mb-2' : 'text-center text-success font-medium mb-2'}
              >
                {isReinforce ? 'À renforcer aujourd\'hui' : '✓ Mot appris aujourd\'hui'}
              </div>
              <Button size="lg" variant="outline" onClick={startReview} className="w-full h-14 text-lg font-medium gap-2">
                <BookOpen className="w-5 h-5" />
                Réviser
              </Button>
            </>
          )}

          {!isIgnored && todayWord && (
            <button
              type="button"
              onClick={handleIgnoreToday}
              data-testid="ignore-today"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ne plus me présenter ce mot
            </button>
          )}
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
