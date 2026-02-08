-- Create words table with date_shown for daily word persistence
CREATE TABLE public.words (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  example_sentence TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('nom', 'adjectif', 'verbe', 'adverbe')),
  register TEXT NOT NULL CHECK (register IN ('soutenu', 'courant')),
  date_shown DATE DEFAULT NULL,
  display_order SERIAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed for this app)
CREATE POLICY "Anyone can read words" 
ON public.words 
FOR SELECT 
USING (true);

-- Index for efficient daily word lookup
CREATE INDEX idx_words_date_shown ON public.words(date_shown);
CREATE INDEX idx_words_display_order ON public.words(display_order);

-- Insert initial vocabulary data
INSERT INTO public.words (word, definition, example_sentence, category, register) VALUES
('Sérendipité', 'Capacité de faire par hasard une découverte inattendue et fructueuse.', 'C''est par pure sérendipité qu''il a trouvé ce manuscrit ancien dans la brocante.', 'nom', 'soutenu'),
('Ineffable', 'Qui ne peut être exprimé par des paroles, tant c''est intense ou sublime.', 'Elle ressentait une joie ineffable en contemplant le lever du soleil.', 'adjectif', 'soutenu'),
('Tergiverser', 'User de détours, de faux-fuyants pour éviter de donner une réponse nette.', 'Arrête de tergiverser et dis-moi clairement ce que tu veux.', 'verbe', 'courant'),
('Nonchalamment', 'Avec nonchalance, de manière désinvolte et sans empressement.', 'Il traversa la pièce nonchalamment, les mains dans les poches.', 'adverbe', 'courant'),
('Quintessence', 'Ce qu''il y a de plus raffiné, de plus pur dans quelque chose.', 'Ce poème représente la quintessence du romantisme français.', 'nom', 'soutenu'),
('Évanescent', 'Qui s''évanouit, qui disparaît progressivement comme une vapeur.', 'Les souvenirs évanescents de son enfance refaisaient surface.', 'adjectif', 'soutenu'),
('Procrastiner', 'Remettre au lendemain, différer sans cesse ce que l''on doit faire.', 'Il a tendance à procrastiner quand il s''agit de ranger sa chambre.', 'verbe', 'courant'),
('Ostensiblement', 'De manière visible et délibérée, avec l''intention d''être remarqué.', 'Elle consulta ostensiblement sa montre pour signifier son impatience.', 'adverbe', 'soutenu'),
('Palimpseste', 'Manuscrit sur lequel on a effacé un texte ancien pour en écrire un nouveau.', 'Cette ville est un palimpseste où chaque époque a laissé sa trace.', 'nom', 'soutenu'),
('Fringant', 'Vif, alerte et d''allure élégante, plein d''entrain.', 'Malgré son âge, il restait fringant et plein d''énergie.', 'adjectif', 'courant');