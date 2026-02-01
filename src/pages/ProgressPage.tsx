import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useProgress } from '@/hooks/useProgress';
import { BarChart3, Flame, Star, BookOpen } from 'lucide-react';

export default function ProgressPage() {
  const { userProgress, getMasteredCount, wordProgress, isLoaded } = useProgress();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  const masteredCount = getMasteredCount();
  const totalReviewed = Object.values(wordProgress).filter(p => p.lastReviewed).length;

  const stats = [
    {
      icon: BookOpen,
      label: 'Mots découverts',
      value: userProgress.totalWordsSeen,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      icon: Flame,
      label: 'Série actuelle',
      value: `${userProgress.currentStreak} jour${userProgress.currentStreak > 1 ? 's' : ''}`,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      icon: Star,
      label: 'Mots maîtrisés',
      value: masteredCount,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      icon: BarChart3,
      label: 'Mots révisés',
      value: totalReviewed,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">Vos progrès</h1>
          <p className="text-muted-foreground">
            Suivez votre apprentissage du vocabulaire
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-md">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-4`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-1">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Encouragement message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Card className="border-0 bg-gradient-to-br from-primary/10 to-accent">
            <CardContent className="p-6 text-center">
              {userProgress.currentStreak > 0 ? (
                <>
                  <p className="text-lg font-medium text-foreground mb-2">
                    🔥 Continuez comme ça !
                  </p>
                  <p className="text-muted-foreground">
                    Vous êtes sur une série de {userProgress.currentStreak} jour{userProgress.currentStreak > 1 ? 's' : ''}.
                    {userProgress.currentStreak >= 7 && " Impressionnant !"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium text-foreground mb-2">
                    👋 Bienvenue !
                  </p>
                  <p className="text-muted-foreground">
                    Découvrez votre premier mot du jour pour commencer votre apprentissage.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
}
