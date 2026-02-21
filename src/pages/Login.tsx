import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

export default function Login() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const result = await signInWithMagicLink(email.trim());
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-primary mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Mot du jour</h1>
          <p className="text-muted-foreground text-sm">
            Enrichissez votre vocabulaire, un mot à la fois
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            {sent ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4"
              >
                <div className="w-14 h-14 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-success" />
                </div>
                <p className="text-foreground font-medium mb-2">
                  Un lien vous a été envoyé par email
                </p>
                <p className="text-muted-foreground text-sm">
                  Vérifiez votre boîte de réception et cliquez sur le lien pour vous connecter.
                </p>
                <Button
                  variant="ghost"
                  className="mt-4 text-sm"
                  onClick={() => { setSent(false); setEmail(''); }}
                >
                  Renvoyer un lien
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                    Adresse email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 text-base gap-2"
                  disabled={isSubmitting || !email.trim()}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {isSubmitting ? 'Envoi en cours...' : 'Recevoir un lien de connexion'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
