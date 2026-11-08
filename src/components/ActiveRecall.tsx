import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryBadge } from '@/components/CategoryBadge';
import { Word } from '@/types/word';
import { SRSQuality } from '@/hooks/useSRS';
import { CheckCircle, XCircle, Lightbulb, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MASTERY_TARGET, CHECK_DELAYS_MONTHS } from '@/lib/mastery';

export interface RecallMastery {
  /** Nombre de "Facile" cumulés (0 à 3). */
  easyCount: number;
  /** Ce mot est un contrôle de mémoire (mot déjà maîtrisé revu à +1 mois / +3 mois). */
  isCheck: boolean;
  /** Nombre de contrôles déjà réussis (0 ou 1 quand un contrôle est dû). */
  checkStage: number;
}

interface ActiveRecallProps {
  word: Word;
  current: number;
  total: number;
  mastery?: RecallMastery;
  /** correct = la saisie correspond au mot. Une réponse fausse est toujours transmise avec 'hard'. */
  onResult: (quality: SRSQuality, correct: boolean) => void;
  /** « Ne plus me présenter ce mot » (mot trop facile). Le bouton n'apparaît que si cette fonction est fournie. */
  onIgnore?: () => void;
}

function MasteryProgress({ mastery }: { mastery: RecallMastery }) {
  if (mastery.isCheck) {
    return (
      <p data-testid="mastery-progress" className="text-xs text-center text-muted-foreground">
        Contrôle de mémoire {mastery.checkStage + 1}/{CHECK_DELAYS_MONTHS.length}
      </p>
    );
  }
  const current = Math.min(mastery.easyCount, MASTERY_TARGET);
  return (
    <div data-testid="mastery-progress" className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <span>Maîtrise</span>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: MASTERY_TARGET }).map((_, i) => (
          <span key={i} className={cn('h-2 w-2 rounded-full', i < current ? 'bg-primary' : 'bg-muted')} />
        ))}
      </span>
      <span className="font-semibold text-foreground">{current}/{MASTERY_TARGET}</span>
    </div>
  );
}

// Normalize: lowercase, remove accents, trim
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Mask all forms of the word in a sentence (handles conjugations, accents, plurals, etc.)
// Strategy: normalize stem + each token to compare without accents
function maskWord(sentence: string, word: string): string {
  const stemLength = Math.max(4, word.length - 3);
  const stem = word.slice(0, stemLength);

  // Normalize for accent-insensitive comparison
  const normStem = stem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Match sequences of letters including accented French characters
  return sentence.replace(/[a-zA-ZÀ-ÖØ-öø-ÿœŒæÆ]+/g, (token) => {
    const normToken = token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normToken.startsWith(normStem) ? '___' : token;
  });
}

export function ActiveRecall({ word, current, total, mastery, onResult, onIgnore }: ActiveRecallProps) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset state when word changes
    setInput('');
    setSubmitted(false);
    setIsCorrect(false);
    setShowHint(false);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [word.id]);

  const handleSubmit = () => {
    if (!input.trim() || submitted) return;
    const correct = normalize(input) === normalize(word.word);
    setIsCorrect(correct);
    setSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitted) handleSubmit();
  };

  const hint = `${word.word[0].toUpperCase()} · ${word.word.length} lettres`;

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < current - 1 ? 'bg-primary' :
                i === current - 1 ? 'bg-primary/60' :
                'bg-muted'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{current}/{total}</span>
      </div>

      {/* Header */}
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {mastery?.isCheck ? 'Contrôle de mémoire' : 'Révision'}
        </p>
        <p className="text-lg font-bold text-foreground mt-1">Quel est ce mot ?</p>
      </div>

      {/* Definition card */}
      <Card className="border-0 shadow-md bg-card">
        <CardContent className="p-6">
          <div className="flex justify-center mb-4">
            <CategoryBadge category={word.category} gender={word.gender} />
          </div>
          <p className="text-base text-center text-foreground leading-relaxed italic">
            « {word.definition} »
          </p>
          {word.exampleSentence && (
            <p className="text-sm text-center text-muted-foreground mt-3">
              Ex. : {maskWord(word.exampleSentence, word.word)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Hint */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-center"
          >
            <span className="inline-block bg-muted text-muted-foreground text-sm px-3 py-1.5 rounded-full font-mono tracking-wide">
              {hint}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      {!submitted ? (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écris le mot…"
            className={cn(
              'w-full border-2 rounded-xl px-4 py-3 text-center text-lg font-semibold tracking-wide',
              'bg-background text-foreground placeholder:text-muted-foreground',
              'outline-none transition-colors focus:border-primary'
            )}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="w-full h-12"
          >
            Valider
          </Button>
          {!showHint && (
            <button
              onClick={() => setShowHint(true)}
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Indice
            </button>
          )}
        </div>
      ) : (
        /* Result + difficulty buttons */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          {/* Feedback */}
          <div className={cn(
            'flex items-center gap-3 p-4 rounded-xl border-2',
            isCorrect
              ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
              : 'border-red-400 bg-red-50 dark:bg-red-950/20'
          )}>
            {isCorrect
              ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
            }
            <div>
              {isCorrect ? (
                <p className="font-semibold text-green-700 dark:text-green-400">Bravo !</p>
              ) : (
                <>
                  <p className="font-semibold text-red-600 dark:text-red-400">La réponse était :</p>
                  <p className="text-lg font-bold text-foreground">
                    {word.word}
                    {word.gender && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground italic">
                        ({word.gender === 'masculin' ? 'm.' : 'f.'})
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {mastery && <MasteryProgress mastery={mastery} />}

          {/* Difficulty rating */}
          {isCorrect ? (
            <>
              <p className="text-sm text-center text-muted-foreground">C'était…</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onResult('hard', true)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 hover:border-red-400 transition-colors"
                >
                  <span className="text-xl">😓</span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">Difficile</span>
                </button>
                <button
                  onClick={() => onResult('good', true)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 hover:border-yellow-400 transition-colors"
                >
                  <span className="text-xl">🙂</span>
                  <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Bien</span>
                </button>
                <button
                  onClick={() => onResult('easy', true)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-green-200 bg-green-50 dark:bg-green-950/20 hover:border-green-400 transition-colors"
                >
                  <span className="text-xl">😎</span>
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">Facile</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Mauvaise réponse : ce mot compte comme difficile.
              </p>
              <button
                onClick={() => onResult('hard', false)}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 hover:border-red-400 transition-colors"
              >
                <span className="text-xl">😓</span>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Difficile</span>
              </button>
            </>
          )}

          {onIgnore && (
            <button
              type="button"
              onClick={onIgnore}
              data-testid="ignore-word"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ne plus me présenter ce mot
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
