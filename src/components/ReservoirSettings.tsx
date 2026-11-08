// Réglages du réservoir de mots : taille maximale + liste des mots « ne plus me présenter » (réactivables).
import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { EyeOff, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useReservoirSize } from '@/hooks/useReservoirSize';
import { RESERVOIR_MAX, RESERVOIR_MIN } from '@/lib/reservoir';
import { reactivatePayload } from '@/lib/wordStatus';

interface IgnoredWord {
  id: string;
  word: string;
}

export function ReservoirSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { size, setSize, isLoaded } = useReservoirSize();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [ignored, setIgnored] = useState<IgnoredWord[]>([]);
  const [ignoredLoaded, setIgnoredLoaded] = useState(false);

  // Le champ reprend la valeur enregistrée dès qu'elle est connue
  useEffect(() => {
    if (isLoaded) setDraft(String(size));
  }, [isLoaded, size]);

  // Mots ignorés : ids dans word_reviews, puis noms dans words
  const loadIgnored = useCallback(async () => {
    if (!userId) {
      setIgnoredLoaded(true);
      return;
    }
    const { data: rows, error } = await supabase
      .from('word_reviews')
      .select('word_id')
      .eq('user_id', userId)
      .eq('status', 'ignored');
    if (error || !rows || rows.length === 0) {
      setIgnored([]);
      setIgnoredLoaded(true);
      return;
    }
    const ids = rows.map((r) => r.word_id);
    const { data: words } = await supabase.from('words').select('id, word').in('id', ids);
    const byId = new Map((words ?? []).map((w) => [w.id, w.word] as [string, string]));
    setIgnored(
      ids
        .map((id) => ({ id, word: byId.get(id) ?? '(mot supprimé)' }))
        .sort((a, b) => a.word.localeCompare(b.word, 'fr')),
    );
    setIgnoredLoaded(true);
  }, [userId]);

  useEffect(() => {
    loadIgnored();
  }, [loadIgnored]);

  const parsed = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : NaN;
  const isValid = Number.isInteger(parsed) && parsed >= RESERVOIR_MIN && parsed <= RESERVOIR_MAX;
  const canSave = isValid && parsed !== size && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await setSize(parsed);
    setSaving(false);
    if (ok) toast.success(`Réservoir réglé à ${parsed} mots`);
    else toast.error("Impossible d'enregistrer ce réglage. Réessaie.");
  };

  const handleReactivate = async (wordId: string, word: string) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const { error } = await supabase
      .from('word_reviews')
      .upsert(reactivatePayload(userId, wordId, today), { onConflict: 'user_id,word_id' });
    if (error) {
      console.error('[Settings] reactivate error:', error);
      toast.error("Impossible de réactiver ce mot. Réessaie.");
      return;
    }
    setIgnored((prev) => prev.filter((w) => w.id !== wordId));
    toast.success(`« ${word} » est de retour dans tes révisions`);
  };

  return (
    <Card className="border-0 shadow-lg" data-testid="reservoir-settings">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Réservoir de mots
        </CardTitle>
        <CardDescription>
          Nombre maximum de mots en cours d'apprentissage. Tant qu'il est plein, aucun nouveau mot n'arrive : tu
          renforces ceux que tu maîtrises le moins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="reservoir-input" className="text-sm font-medium text-foreground">
              Taille ({RESERVOIR_MIN} à {RESERVOIR_MAX})
            </label>
            <Input
              id="reservoir-input"
              data-testid="reservoir-input"
              type="number"
              inputMode="numeric"
              min={RESERVOIR_MIN}
              max={RESERVOIR_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!isLoaded}
              className="mt-1"
            />
          </div>
          <Button data-testid="reservoir-save" onClick={handleSave} disabled={!canSave}>
            Enregistrer
          </Button>
        </div>
        {!isValid && draft !== '' && (
          <p data-testid="reservoir-invalid" className="text-sm text-destructive">
            Choisis un nombre entier entre {RESERVOIR_MIN} et {RESERVOIR_MAX}.
          </p>
        )}

        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <EyeOff className="w-4 h-4" />
            Mots que je ne veux plus voir
          </p>
          {!ignoredLoaded ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : ignored.length === 0 ? (
            <p data-testid="no-ignored" className="text-sm text-muted-foreground">
              Aucun mot ignoré.
            </p>
          ) : (
            <ul data-testid="ignored-list" className="space-y-2">
              {ignored.map((w) => (
                <li key={w.id} data-testid={`ignored-item-${w.id}`} className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{w.word}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`reactivate-${w.id}`}
                    onClick={() => handleReactivate(w.id, w.word)}
                  >
                    Réactiver
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
