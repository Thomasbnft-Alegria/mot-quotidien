import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryBadge } from '@/components/CategoryBadge';
import { BottomNav } from '@/components/BottomNav';
import { useProgress } from '@/hooks/useProgress';
import { useDailyWord } from '@/hooks/useDailyWord';
import { Sparkles, BookOpen, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationPrompt } from '@/components/NotificationPrompt';

export default function DailyWord() {
  const navigate = useNavigate();
  const { word: todayWord, isLoading, error, refetch } = useDailyWord();
  const { markWordAsSeen, isWordSeen, isLoaded } = useProgress();
  const [hasSeenToday, setHasSeenToday] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isLoaded && todayWord) {
      setHasSeenToday(isWordSeen(todayWord.id));
      // Delay content appearance for animation
      setTimeout(() => setShowContent(true), 100);
    }
  }, [isLoaded, todayWord, isWordSeen]);

  const handleMarkSeen = () => {
    if (todayWord) {
      markWordAsSeen(todayWord.id);
      setHasSeenToday(true);
    }
  };

  if (isLoading || !isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (error || !todayWord) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center pb-20 px-6">
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Notification Prompt */}
        <NotificationPrompt />

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Mot du jour</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Découvrez un nouveau mot chaque jour
          </p>
        </motion.div>

        {/* Word Card */}
        <AnimatePresence mode="wait">
          {showContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="border-0 shadow-lg bg-card">
                <CardContent className="p-8">
                  {/* Category Badge */}
                  <div className="flex justify-center mb-6">
                    <CategoryBadge category={todayWord.category} />
                  </div>

                  {/* The Word */}
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-4xl md:text-5xl font-bold text-center text-foreground mb-6 tracking-tight"
                  >
                    {todayWord.word}
                  </motion.h1>

                  {/* Register indicator */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-sm text-muted-foreground mb-6"
                  >
                    {todayWord.register === 'soutenu' ? 'Registre soutenu' : 'Registre courant'}
                  </motion.p>

                  {/* Definition */}
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

                  {/* Example Sentence */}
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

        {/* Action Buttons */}
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
                onClick={() => navigate('/quiz')}
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
