import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, Settings as SettingsIcon, CheckCircle, XCircle, AlertCircle, Send, Loader2, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { TimePicker } from '@/components/TimePicker';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function Settings() {
  const { user, signOut } = useAuth();
  const {
    permissionStatus,
    isSubscribed,
    isLoading,
    preferredTime,
    requestPermission,
    toggleNotifications,
    sendTestNotification,
    updatePreferredTime
  } = usePushNotifications();

  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestNotification = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    const result = await sendTestNotification();
    if (result.success && result.data) {
      setTestResult(result.data);
      toast.success(`Test terminé : ${result.data.sent ?? 0} notification(s) envoyée(s)`);
    } else {
      setTestError(result.error || 'Erreur inconnue');
      toast.error('Erreur lors du test');
    }
    setIsTesting(false);
  };

  const handleToggle = async (checked: boolean) => {
    await toggleNotifications(checked);
    if (checked) {
      toast.success('Notifications activées !');
    } else {
      toast.info('Notifications désactivées');
    }
  };

  const handleTimeChange = async (time: string) => {
    const success = await updatePreferredTime(time);
    if (success) {
      toast.success(`Heure de notification mise à jour : ${time}`);
    } else {
      toast.error('Erreur lors de la mise à jour');
    }
  };

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
                <>
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
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Rappel à</span>
                          <TimePicker 
                            value={preferredTime} 
                            onChange={handleTimeChange}
                            disabled={isLoading || !isSubscribed}
                          />
                          <span>chaque jour</span>
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={isSubscribed}
                      onCheckedChange={handleToggle}
                      disabled={isLoading}
                    />
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleTestNotification}
                    disabled={isLoading || isTesting}
                    className="w-full gap-2"
                  >
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {isTesting ? 'Test en cours...' : 'Tester le flux complet'}
                  </Button>

                  {/* Test Result Display */}
                  {testResult && (
                    <div className="p-4 bg-success/10 rounded-lg space-y-1 text-sm">
                      <p className="font-medium text-success">✅ Résultat du test</p>
                      <p className="text-foreground">Envoyées : <strong>{String(testResult.sent ?? 0)}</strong> / {String(testResult.total ?? 0)}</p>
                      {testResult.failed ? <p className="text-destructive">Échouées : {String(testResult.failed)}</p> : null}
                      <p className="text-muted-foreground">Heure serveur (Paris) : {String(testResult.currentTime ?? '—')}</p>
                      {testResult.results && Array.isArray(testResult.results) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Détails</summary>
                          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(testResult.results, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {testError && (
                    <div className="p-4 bg-destructive/10 rounded-lg text-sm">
                      <p className="font-medium text-destructive">❌ Erreur</p>
                      <p className="text-destructive/80">{testError}</p>
                    </div>
                  )}
                </>
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
                  <li>• Mot du jour : tous les jours à {preferredTime}</li>
                  <li>• Révision hebdomadaire : dimanche à 20h00</li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {/* Logout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-6"
        >
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Connecté en tant que</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => { await signOut(); }}
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4" />
                  Se déconnecter
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
