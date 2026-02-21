import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as any).standalone === true;

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'pwa-redirect' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pwaLink, setPwaLink] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setStatus('error');
      setError('Lien invalide ou expiré.');
      return;
    }

    if (!isStandalone()) {
      // In browser — don't set session, just offer deep link to PWA
      const pwaUrl = `https://mot-quotidien.lovable.app/auth-callback#${hash}`;
      setPwaLink(pwaUrl);
      setStatus('pwa-redirect');
      return;
    }

    // In PWA — set the session
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).then(({ error: err }) => {
      if (err) {
        setStatus('error');
        setError(err.message);
      } else {
        window.history.replaceState(null, '', '/');
        navigate('/', { replace: true });
      }
    });
  }, [navigate]);

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
              Appuyez sur le bouton ci-dessous pour ouvrir l'app et finaliser la connexion.
            </p>
            <Button asChild size="lg" className="w-full gap-2 h-14 text-base">
              <a href={pwaLink!}>
                <ExternalLink className="w-5 h-5" />
                Ouvrir Mot Quotidien
              </a>
            </Button>
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
