import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, Settings as SettingsIcon, CheckCircle, XCircle, AlertCircle, Send, Loader2, LogOut, KeyRound, BookPlus, Search, PenLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BottomNav } from '@/components/BottomNav';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { TimePicker } from '@/components/TimePicker';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchWordDefinition, insertWordToDatabase, checkWordExists } from '@/hooks/useAddWord';

interface WordPreview {
  word: string;
  definition: string;
  category: string;
  register: string;
  example_sentence: string;
}

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
  const [swDebug, setSwDebug] = useState<string>('Chargement…');

  useEffect(() => {
    const check = async () => {
      if (!('serviceWorker' in navigator)) { setSwDebug('❌ serviceWorker non supporté'); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const controller = navigator.serviceWorker.controller;
        if (!reg) { setSwDebug('❌ Aucune registration SW'); return; }
        const state = reg.active?.state ?? reg.waiting?.state ?? reg.installing?.state ?? 'absent';
        setSwDebug(`SW: ${state} | controller: ${controller ? '✅' : '❌'} | scope: ${reg.scope}`);
      } catch (e) {
        setSwDebug(`❌ Erreur: ${String(e)}`);
      }
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Add custom word
  const [customWord, setCustomWord] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [wordPreview, setWordPreview] = useState<WordPreview | null>(null);
  const [wordError, setWordError] = useState<string | null>(null);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error('Erreur : ' + error.message);
    } else {
      toast.success('Mot de passe mis à jour !');
      setNewPassword('');
      setShowPasswordForm(false);
    }
    setIsChangingPassword(false);
  };

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
    const success = await toggleNotifications(checked);
    // Only show success toast when the operation actually succeeded.
    // toggleNotifications shows its own toast.error on failure.
    if (success && checked) {
      toast.success('Notifications activées !');
    } else if (success && !checked) {
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

  const handleSearchWord = async () => {
    if (!customWord.trim()) return;
    setIsSearching(true);
    setWordPreview(null);
    setWordError(null);
    try {
      // 1. Vérifier si le mot existe déjà en base
      const exists = await checkWordExists(customWord.trim());
      if (exists) {
        setWordError(`"${customWord.trim()}" est déjà dans ta base de révision.`);
        return;
      }
      // 2. Chercher la définition
      const wordData = await fetchWordDefinition(customWord.trim());
      setWordPreview(wordData);
    } catch (err) {
      setWordError((err as Error).message || 'Erreur lors de la recherche.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleInsertWord = async () => {
    if (!wordPreview) return;
    setIsInserting(true);
    try {
      await insertWordToDatabase(wordPreview);
      toast.success(`✅ "${wordPreview.word}" ajouté à la base !`);
      setCustomWord('');
      setWordPreview(null);
      setWordError(null);
    } catch (err) {
      toast.error((err as Error).message || 'Erreur lors de l\'ajout.');
    } finally {
      setIsInserting(false);
    }
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

        {/* SW Debug Panel */}
        <div className="mb-4 p-3 bg-muted rounded-lg text-xs text-muted-foreground font-mono break-all">
          {swDebug}
        </div>

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
        {/* Change Password */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                  <p className="font-medium text-foreground">Mot de passe</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(!showPasswordForm)}>
                  {showPasswordForm ? 'Annuler' : 'Modifier'}
                </Button>
              </div>
              {showPasswordForm && (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Nouveau mot de passe"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                    {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'OK'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Add custom word */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookPlus className="w-5 h-5" />
                Ajouter un mot
              </CardTitle>
              <CardDescription>
                Saisis un mot — je cherche sa définition et je l'ajoute à ta base de révision
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex : acrimonie, fulgurance…"
                  value={customWord}
                  onChange={e => { setCustomWord(e.target.value); setWordPreview(null); setWordError(null); }}
                  onKeyDown={e => e.key === 'Enter' && !isSearching && handleSearchWord()}
                  disabled={isSearching || isInserting}
                />
                <Button onClick={handleSearchWord} disabled={!customWord.trim() || isSearching || isInserting} className="gap-2 shrink-0">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isSearching ? 'Recherche…' : 'Chercher'}
                </Button>
              </div>

              {wordError && (
                <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                  ❌ {wordError}
                </div>
              )}

              {wordPreview && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 bg-muted/40 rounded-lg border border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-lg">{wordPreview.word}</span>
                    <Badge variant="secondary">{wordPreview.category}</Badge>
                    <Badge variant="outline">{wordPreview.register}</Badge>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><PenLine className="w-3 h-3" /> Définition</Label>
                    <Textarea
                      value={wordPreview.definition}
                      onChange={e => setWordPreview(prev => prev ? { ...prev, definition: e.target.value } : null)}
                      className="text-sm resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Exemple</Label>
                    <Textarea
                      value={wordPreview.example_sentence}
                      onChange={e => setWordPreview(prev => prev ? { ...prev, example_sentence: e.target.value } : null)}
                      className="text-sm resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Catégorie</Label>
                      <Select value={wordPreview.category} onValueChange={v => setWordPreview(prev => prev ? { ...prev, category: v } : null)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nom">nom</SelectItem>
                          <SelectItem value="verbe">verbe</SelectItem>
                          <SelectItem value="adjectif">adjectif</SelectItem>
                          <SelectItem value="adverbe">adverbe</SelectItem>
                          <SelectItem value="locution">locution</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Registre</Label>
                      <Select value={wordPreview.register} onValueChange={v => setWordPreview(prev => prev ? { ...prev, register: v } : null)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="courant">courant</SelectItem>
                          <SelectItem value="soutenu">soutenu</SelectItem>
                          <SelectItem value="familier">familier</SelectItem>
                          <SelectItem value="vieilli">vieilli</SelectItem>
                          <SelectItem value="littéraire">littéraire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button onClick={handleInsertWord} disabled={isInserting} className="w-full gap-2">
                    {isInserting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookPlus className="w-4 h-4" />}
                    {isInserting ? 'Ajout en cours…' : 'Ajouter à la base'}
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

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
