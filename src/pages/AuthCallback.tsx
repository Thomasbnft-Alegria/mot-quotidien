import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

export default function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase JS automatically picks up the token from the URL hash
    // when the client is initialised. We just need to wait for the session.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
      }
    });

    // Also check if a session already exists (token already exchanged)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus('error');
        setError(error.message);
      } else if (session) {
        setStatus('success');
      }
    });

    // Timeout fallback
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
