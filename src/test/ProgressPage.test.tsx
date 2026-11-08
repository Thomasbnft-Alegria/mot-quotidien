/* eslint-disable @typescript-eslint/no-explicit-any -- hooks simulés (test de page) */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const m = vi.hoisted(() => ({ progress: {} as any, size: 20 }));
vi.mock('@/hooks/useProgress', () => ({ useProgress: () => m.progress }));
vi.mock('@/hooks/useReservoirSize', () => ({ useReservoirSize: () => ({ size: m.size, setSize: vi.fn(), isLoaded: true }) }));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));

import ProgressPage from '@/pages/ProgressPage';

function setup(statuses: Record<string, string>, size = 20) {
  m.size = size;
  m.progress = {
    userProgress: { currentStreak: 3, lastActiveDate: null, totalWordsSeen: 140 },
    getMasteredCount: () => Object.values(statuses).filter((s) => s === 'mastered').length,
    wordProgress: {},
    isLoaded: true,
    reviewStatus: statuses,
  };
  return render(<ProgressPage />);
}

describe('ProgressPage — réservoir', () => {
  it('affiche X / N mots actifs (les maîtrisés et ignorés ne comptent pas)', () => {
    setup({ a: 'active', b: 'active', c: 'mastered', d: 'ignored', e: 'active' }, 20);
    expect(screen.getByTestId('reservoir-count').textContent?.replace(/\s+/g, ' ').trim()).toBe('3 / 20');
    expect(screen.getByText('Mots actifs')).toBeTruthy();
  });

  it('utilise la taille choisie dans les Réglages', () => {
    setup({ a: 'active' }, 5);
    expect(screen.getByTestId('reservoir-count').textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 5');
  });

  it('la barre est bornée à 100 % quand le réservoir déborde (mots réactivés)', () => {
    setup({ a: 'active', b: 'active', c: 'active' }, 2);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
  });

  it('« Mots maîtrisés » suit le nombre de mots au statut maîtrisé', () => {
    setup({ a: 'mastered', b: 'mastered', c: 'active' });
    expect(screen.getByText('Mots maîtrisés').previousElementSibling?.textContent).toBe('2');
  });

  it('réservoir vide : 0 / 20 et barre à 0 %', () => {
    setup({});
    expect(screen.getByTestId('reservoir-count').textContent?.replace(/\s+/g, ' ').trim()).toBe('0 / 20');
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('0%');
  });
});
