import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveRecall } from '@/components/ActiveRecall';
import type { Word } from '@/types/word';

const word = {
  id: 'w1',
  word: 'Ébaudir',
  definition: 'Rendre joyeux.',
  exampleSentence: 'Le clown ébaudissait les enfants.',
  category: 'verbe',
  register: 'soutenu',
} as unknown as Word;

function setup(props: Partial<React.ComponentProps<typeof ActiveRecall>> = {}) {
  const onResult = vi.fn();
  render(<ActiveRecall word={word} current={1} total={5} onResult={onResult} {...props} />);
  return onResult;
}

function answer(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Écris le mot…'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
}

describe('ActiveRecall — réponse fausse = Difficile automatique', () => {
  it("n'affiche que le bouton Difficile et transmet (hard, false)", () => {
    const onResult = setup();
    answer('mauvais');
    expect(screen.getByText('La réponse était :')).toBeTruthy();
    expect(screen.getByText(/Mauvaise réponse : ce mot compte comme difficile/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Facile/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bien/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Difficile/ }));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('hard', false);
  });
});

describe('ActiveRecall — bonne réponse', () => {
  it('propose Difficile / Bien / Facile et transmet la note choisie avec correct=true', () => {
    const onResult = setup();
    answer('Ébaudir');
    expect(screen.getByText('Bravo !')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Difficile/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bien/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Facile/ }));
    expect(onResult).toHaveBeenCalledWith('easy', true);
  });

  it('accepte la saisie sans accent ni majuscule', () => {
    const onResult = setup();
    answer('  ebaudir ');
    fireEvent.click(screen.getByRole('button', { name: /Bien/ }));
    expect(onResult).toHaveBeenCalledWith('good', true);
  });
});

describe('ActiveRecall — progression de maîtrise', () => {
  it('affiche n/3 sur l\'écran de réponse (bonne ou mauvaise réponse)', () => {
    setup({ mastery: { easyCount: 2, isCheck: false, checkStage: 0 } });
    answer('mauvais');
    expect(screen.getByTestId('mastery-progress').textContent).toContain('2/3');
  });

  it("n'affiche aucune progression sans information de maîtrise", () => {
    setup();
    answer('Ébaudir');
    expect(screen.queryByTestId('mastery-progress')).toBeNull();
  });

  it('plafonne la progression à 3/3', () => {
    setup({ mastery: { easyCount: 9, isCheck: false, checkStage: 0 } });
    answer('Ébaudir');
    expect(screen.getByTestId('mastery-progress').textContent).toContain('3/3');
  });

  it("n'affiche pas la progression avant la validation de la réponse", () => {
    setup({ mastery: { easyCount: 1, isCheck: false, checkStage: 0 } });
    expect(screen.queryByTestId('mastery-progress')).toBeNull();
  });
});

describe('ActiveRecall — contrôle de mémoire', () => {
  it('affiche le libellé Contrôle et le numéro du contrôle (1/2 puis 2/2)', () => {
    const { unmount } = render(
      <ActiveRecall word={word} current={1} total={5} onResult={vi.fn()} mastery={{ easyCount: 3, isCheck: true, checkStage: 0 }} />,
    );
    expect(screen.getByText('Contrôle de mémoire')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Écris le mot…'), { target: { value: 'Ébaudir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(screen.getByTestId('mastery-progress').textContent).toContain('Contrôle de mémoire 1/2');
    unmount();

    render(
      <ActiveRecall word={word} current={1} total={5} onResult={vi.fn()} mastery={{ easyCount: 3, isCheck: true, checkStage: 1 }} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Écris le mot…'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(screen.getByTestId('mastery-progress').textContent).toContain('Contrôle de mémoire 2/2');
  });

  it('un mot normal affiche "Révision" et pas "Contrôle"', () => {
    setup({ mastery: { easyCount: 0, isCheck: false, checkStage: 0 } });
    expect(screen.getByText('Révision')).toBeTruthy();
    expect(screen.queryByText('Contrôle de mémoire')).toBeNull();
  });
});
