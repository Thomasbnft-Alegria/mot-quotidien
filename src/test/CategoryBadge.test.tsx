import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CategoryBadge } from '@/components/CategoryBadge';

describe('CategoryBadge — noms', () => {
  it('affiche n.m. pour un nom masculin', () => {
    render(<CategoryBadge category="nom" gender="masculin" />);
    expect(screen.getByText('n.m.')).toBeInTheDocument();
  });

  it('affiche n.f. pour un nom féminin', () => {
    render(<CategoryBadge category="nom" gender="féminin" />);
    expect(screen.getByText('n.f.')).toBeInTheDocument();
  });

  it('affiche Nom sans genre si gender est undefined', () => {
    render(<CategoryBadge category="nom" />);
    expect(screen.getByText('Nom')).toBeInTheDocument();
  });

  it('n\'affiche pas n.m. si gender est absent', () => {
    render(<CategoryBadge category="nom" />);
    expect(screen.queryByText('n.m.')).not.toBeInTheDocument();
  });
});

describe('CategoryBadge — adjectifs', () => {
  it('affiche adj. m. pour un adjectif masculin', () => {
    render(<CategoryBadge category="adjectif" gender="masculin" />);
    expect(screen.getByText('adj. m.')).toBeInTheDocument();
  });

  it('affiche adj. f. pour un adjectif féminin', () => {
    render(<CategoryBadge category="adjectif" gender="féminin" />);
    expect(screen.getByText('adj. f.')).toBeInTheDocument();
  });

  it('affiche Adj. sans genre si gender est undefined', () => {
    render(<CategoryBadge category="adjectif" />);
    expect(screen.getByText('Adj.')).toBeInTheDocument();
  });
});

describe('CategoryBadge — verbes et adverbes', () => {
  it('affiche Verbe pour un verbe', () => {
    render(<CategoryBadge category="verbe" />);
    expect(screen.getByText('Verbe')).toBeInTheDocument();
  });

  it('affiche Adv. pour un adverbe', () => {
    render(<CategoryBadge category="adverbe" />);
    expect(screen.getByText('Adv.')).toBeInTheDocument();
  });
});
