import { describe, it, expect } from 'vitest';

// Reproduce maskWord logic (same as ActiveRecall.tsx)
function maskWord(sentence: string, word: string): string {
  const stemLength = Math.max(4, word.length - 3);
  const stem = word.slice(0, stemLength);
  const normStem = stem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return sentence.replace(/[a-zA-ZÀ-ÖØ-öø-ÿœŒæÆ]+/g, (token) => {
    const normToken = token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normToken.startsWith(normStem) ? '___' : token;
  });
}

describe('maskWord', () => {
  it('masque la forme conjuguée (batifoler → batifolaient)', () => {
    const result = maskWord('Les enfants batifolaient dans le jardin.', 'batifoler');
    expect(result).toBe('Les enfants ___ dans le jardin.');
  });

  it('masque le mot exact (laconique)', () => {
    const result = maskWord('Il était laconique dans ses réponses.', 'laconique');
    expect(result).toBe('Il était ___ dans ses réponses.');
  });

  it('masque le pluriel (acrimonieux)', () => {
    const result = maskWord('Ses propos acrimonieux blessèrent tout le monde.', 'acrimonieux');
    expect(result).toBe('Ses propos ___ blessèrent tout le monde.');
  });

  it('masque insensible à la casse', () => {
    const result = maskWord('Batifoler est agréable.', 'batifoler');
    expect(result).toBe('___ est agréable.');
  });

  it('masque toutes les occurrences dans la phrase', () => {
    const result = maskWord('Il batifolait et batifolera encore.', 'batifoler');
    expect(result).toBe('Il ___ et ___ encore.');
  });

  it('ne masque pas les mots sans rapport', () => {
    const result = maskWord('Le chat dort paisiblement.', 'batifoler');
    expect(result).toBe('Le chat dort paisiblement.');
  });

  it('fonctionne avec un mot court (stem = mot entier)', () => {
    const result = maskWord('Il riait franchement.', 'rire');
    expect(result).toBe('Il riait franchement.');
  });

  // Cas spécifique du bug remonté par Thomas
  it('masque une forme accentuée (Ebaudir → ébaudissaient)', () => {
    const result = maskWord(
      'Les pitreries du clown ébaudissaient les enfants.',
      'Ebaudir'
    );
    expect(result).toBe('Les pitreries du clown ___ les enfants.');
    expect(result).not.toContain('ébaud');
  });

  it('masque quand le mot lui-même a un accent (Ébaudir)', () => {
    const result = maskWord(
      'Les pitreries du clown ébaudissaient les enfants.',
      'Ébaudir'
    );
    expect(result).toBe('Les pitreries du clown ___ les enfants.');
  });

  it('masque une forme sans accent dans la phrase pour un mot accenté', () => {
    const result = maskWord('Elle ebaudissait tout le monde.', 'Ébaudir');
    expect(result).toBe('Elle ___ tout le monde.');
  });
});
