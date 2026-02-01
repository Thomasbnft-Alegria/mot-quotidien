import { motion } from 'framer-motion';
import { Bell, BellOff, Settings as SettingsIcon, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function Settings() {
  const {
    permissionStatus,
    isSubscribed,
    isLoading,
    requestPermission,
    toggleNotifications
  } = usePushNotifications();

  const getStatusIcon = () => {
    if (permissionStatus === 'unsupported') {
      return <AlertCircle className="w-5 h-5 text-muted-foreground" />;
    }
    if (permissionStatus === 'denied') {
      return <XCircle className="w-5 h-5 text-destructive" />;
    }
    if (permissionStatus === 'granted' && isSubscribed) {
      return <CheckCircle className="w-5 h-5 text-success" />;
    }
    return <Bell className="w-5 h-5 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (permissionStatus === 'unsupported') {
      return 'Non supporté par votre navigateur';
    }
    if (permissionStatus === 'denied') {
      return 'Bloquées par le navigateur';
    }
    if (permissionStatus === 'granted' && isSubscribed) {
      return 'Activées';
    }
    if (permissionStatus === 'granted' && !isSubscribed) {
      return 'Désactivées';
    }
    return 'Non configurées';
  };

  const getStatusColor = () => {
    if (permissionStatus === 'unsupported') return 'text-muted-foreground';
    if (permissionStatus === 'denied') return 'text-destructive';
    if (permissionStatus === 'granted' && isSubscribed) return 'text-success';
    return 'text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <SettingsIcon className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Paramètres</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Gérez vos préférences
          </p>
        </motion.div>

        {/* Notifications Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Recevez une notification chaque jour pour le mot du jour
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Display */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <div>
                    <p className="font-medium text-foreground">Statut</p>
                    <p className={`text-sm ${getStatusColor()}`}>
                      {getStatusText()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions based on status */}
              {permissionStatus === 'default' && (
                <Button
                  onClick={requestPermission}
                  disabled={isLoading}
                  className="w-full gap-2"
                >
                  <Bell className="w-4 h-4" />
                  {isLoading ? 'Activation...' : 'Activer les notifications'}
                </Button>
              )}

              {permissionStatus === 'granted' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isSubscribed ? (
                      <Bell className="w-5 h-5 text-primary" />
                    ) : (
                      <BellOff className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        Notifications quotidiennes
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Rappel à 12h30 chaque jour
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isSubscribed}
                    onCheckedChange={toggleNotifications}
                    disabled={isLoading}
                  />
                </div>
              )}

              {permissionStatus === 'denied' && (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="text-sm text-destructive">
                    Les notifications ont été bloquées. Pour les réactiver, modifiez les paramètres de votre navigateur.
                  </p>
                </div>
              )}

              {permissionStatus === 'unsupported' && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Votre navigateur ne supporte pas les notifications push. Essayez avec Chrome, Firefox ou Safari.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Schedule Info */}
        {permissionStatus === 'granted' && isSubscribed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6"
          >
            <Card className="border-0 shadow-lg bg-accent/30">
              <CardContent className="p-4">
                <h4 className="font-medium text-foreground mb-2">📅 Calendrier des notifications</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Mot du jour : tous les jours à 12h30</li>
                  <li>• Révision hebdomadaire : dimanche à 20h00</li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
