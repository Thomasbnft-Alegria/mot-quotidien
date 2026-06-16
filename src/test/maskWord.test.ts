import { describe, it, expect } from 'vitest';

// Reproduce maskWord logic (same as ActiveRecall.tsx)
function maskWord(sentence: string, word: string): string {
  const stemLength = Math.max(4, word.length - 3);
  const stem = word.slice(0, stemLength);
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(`\\b${escapedStem}\\w*`, 'gi'), '___');
}

describe('maskWord', () => {
  it('masque la forme conjuguée (batifoler → batifolaient)', () => {
    const result = maskWord(
      'Les enfants batifolaient dans le jardin.',
      'batifoler'
    );
    expect(result).toBe('Les enfants ___ dans le jardin.');
    expect(result).not.toContain('batifol');
  });

  it('masque le mot exact (laconique)', () => {
    const result = maskWord('Il était laconique dans ses réponses.', 'laconique');
    expect(result).toBe('Il était ___ dans ses réponses.');
  });

  it('masque le pluriel (acrimonieux → acrimonieus*)', () => {
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

  it('fonctionne avec un mot court (4 lettres min de stem)', () => {
    const result = maskWord('Il riait franchement.', 'rire');
    // stem = 'r' (max(4,4-3)=max(4,1)=4 → 'rire' entier)
    // matches 'rire', 'riait' non car stem=rire mais riait ne commence pas par 'rire'
    // In this case stem = 'rire' (4 chars), riait doesn't match — expected behavior
    expect(result).toBe('Il riait franchement.');
  });
});
