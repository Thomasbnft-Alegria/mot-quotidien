import { Word } from '@/types/word';

export const words: Word[] = [
  {
    id: '1',
    word: 'Sérendipité',
    definition: 'Capacité de faire par hasard une découverte inattendue et fructueuse.',
    exampleSentence: 'C\'est par pure sérendipité qu\'il a trouvé ce manuscrit ancien dans la brocante.',
    category: 'nom',
    register: 'soutenu'
  },
  {
    id: '2',
    word: 'Ineffable',
    definition: 'Qui ne peut être exprimé par des paroles, tant c\'est intense ou sublime.',
    exampleSentence: 'Elle ressentait une joie ineffable en contemplant le lever du soleil.',
    category: 'adjectif',
    register: 'soutenu'
  },
  {
    id: '3',
    word: 'Tergiverser',
    definition: 'User de détours, de faux-fuyants pour éviter de donner une réponse nette.',
    exampleSentence: 'Arrête de tergiverser et dis-moi clairement ce que tu veux.',
    category: 'verbe',
    register: 'courant'
  },
  {
    id: '4',
    word: 'Nonchalamment',
    definition: 'Avec nonchalance, de manière désinvolte et sans empressement.',
    exampleSentence: 'Il traversa la pièce nonchalamment, les mains dans les poches.',
    category: 'adverbe',
    register: 'courant'
  },
  {
    id: '5',
    word: 'Quintessence',
    definition: 'Ce qu\'il y a de plus raffiné, de plus pur dans quelque chose.',
    exampleSentence: 'Ce poème représente la quintessence du romantisme français.',
    category: 'nom',
    register: 'soutenu'
  },
  {
    id: '6',
    word: 'Évanescent',
    definition: 'Qui s\'évanouit, qui disparaît progressivement comme une vapeur.',
    exampleSentence: 'Les souvenirs évanescents de son enfance refaisaient surface.',
    category: 'adjectif',
    register: 'soutenu'
  },
  {
    id: '7',
    word: 'Procrastiner',
    definition: 'Remettre au lendemain, différer sans cesse ce que l\'on doit faire.',
    exampleSentence: 'Il a tendance à procrastiner quand il s\'agit de ranger sa chambre.',
    category: 'verbe',
    register: 'courant'
  },
  {
    id: '8',
    word: 'Ostensiblement',
    definition: 'De manière visible et délibérée, avec l\'intention d\'être remarqué.',
    exampleSentence: 'Elle consulta ostensiblement sa montre pour signifier son impatience.',
    category: 'adverbe',
    register: 'soutenu'
  },
  {
    id: '9',
    word: 'Palimpseste',
    definition: 'Manuscrit sur lequel on a effacé un texte ancien pour en écrire un nouveau.',
    exampleSentence: 'Cette ville est un palimpseste où chaque époque a laissé sa trace.',
    category: 'nom',
    register: 'soutenu'
  },
  {
    id: '10',
    word: 'Fringant',
    definition: 'Vif, alerte et d\'allure élégante, plein d\'entrain.',
    exampleSentence: 'Malgré son âge, il restait fringant et plein d\'énergie.',
    category: 'adjectif',
    register: 'courant'
  }
];

export const getWordById = (id: string): Word | undefined => {
  return words.find(w => w.id === id);
};

export const getWordsByCategory = (category: Word['category']): Word[] => {
  return words.filter(w => w.category === category);
};

export const getWordsByRegister = (register: Word['register']): Word[] => {
  return words.filter(w => w.register === register);
};
