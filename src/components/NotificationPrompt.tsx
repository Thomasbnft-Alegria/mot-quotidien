import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useState } from 'react';

export function NotificationPrompt() {
  const { shouldShowPrompt, requestPermission, isLoading } = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!shouldShowPrompt || isDismissed) {
    return null;
  }

  const handleActivate = async () => {
    await requestPermission();
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('notification_permission_asked', 'true');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-accent border border-border rounded-lg p-4 mb-6"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground mb-1">
              Ne manquez aucun mot !
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Recevez une notification chaque jour à 12h30 pour découvrir le mot du jour.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleActivate}
                disabled={isLoading}
                className="gap-2"
              >
                <Bell className="w-4 h-4" />
                {isLoading ? 'Activation...' : 'Activer les notifications'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
              >
                Plus tard
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
