export type WordCategory = 'nom' | 'adjectif' | 'verbe' | 'adverbe';
export type WordRegister = 'soutenu' | 'courant';
export type WordGender = 'masculin' | 'féminin';

export interface Word {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  category: WordCategory;
  register: WordRegister;
  gender?: WordGender; // uniquement pour category: 'nom'
}

export interface WordProgress {
  wordId: string;
  correctCount: number;
  incorrectCount: number;
  lastReviewed: string | null;
  seen: boolean;
  seenDate: string | null;
}

export interface UserProgress {
  currentStreak: number;
  lastActiveDate: string | null;
  totalWordsSeen: number;
}
