import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Loader2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'pwa-redirect'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pwaLink, setPwaLink] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;

    if (accessToken && refreshToken && !isStandalone) {
      // We're in the browser, not the PWA — offer a deep link to the PWA
      const pwaUrl = `https://mot-quotidien.lovable.app/#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=recovery`;
      setPwaLink(pwaUrl);
      setStatus('pwa-redirect');
      return;
    }

    // In PWA or no tokens — let Supabase handle the hash automatically
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        // Clear hash
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error: err }) => {
      if (err) {
        setStatus('error');
        setError(err.message);
      } else if (session) {
        setStatus('success');
      }
    });

    const timeout = setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
      setError('Le lien a expiré ou est invalide.');
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Connexion en cours…</p>
          </>
        )}

        {status === 'pwa-redirect' && (
          <>
            <CheckCircle className="w-14 h-14 text-success mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Connexion réussie !</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Ouvrez l'app depuis le bouton ci-dessous pour finaliser la connexion.
            </p>
            <Button asChild size="lg" className="w-full gap-2">
              <a href={pwaLink!}>
                <ExternalLink className="w-4 h-4" />
                Ouvrir l'app
              </a>
            </Button>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-14 h-14 text-success mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Connexion réussie !</h1>
            <p className="text-muted-foreground text-sm">
              Vous pouvez retourner sur l'app depuis votre écran d'accueil.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Erreur de connexion</h1>
            <p className="text-muted-foreground text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
