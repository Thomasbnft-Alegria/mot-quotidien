/* eslint-disable @typescript-eslint/no-explicit-any -- hooks simulés (test de page) */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';

const today = format(new Date(), 'yyyy-MM-dd');
const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  daily: { word: null as any, isLoading: false, error: null as any, refetch: vi.fn(), isPersonal: true },
  progress: {} as any,
  srs: {} as any,
  words: [] as any[],
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('sonner', () => ({ toast: m.toast }));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/NotificationPrompt', () => ({ NotificationPrompt: () => null }));
vi.mock('@/hooks/useDailyWord', () => ({ useDailyWord: () => m.daily }));
vi.mock('@/hooks/useProgress', () => ({ useProgress: () => m.progress }));
vi.mock('@/hooks/useSRS', () => ({ useSRS: () => m.srs }));
vi.mock('@/hooks/useQuizWords', () => ({ useQuizWords: () => ({ allWords: m.words, isLoading: false }) }));

import DailyWord from '@/pages/DailyWord';

const W = (id: string, word: string) => ({ id, word, definition: 'def ' + word, exampleSentence: 'ex ' + word, category: 'nom', register: 'courant', gender: 'masculin' });

function setup(opts: { seen?: boolean; seenDate?: string | null; status?: string; due?: any[]; ignoreOk?: boolean } = {}) {
  const word = W('w1', 'Laconique');
  m.words = [word, W('w2', 'Tanguer')];
  m.daily = { word, isLoading: false, error: null, refetch: vi.fn(), isPersonal: true };
  m.progress = {
    markWordAsSeen: vi.fn().mockResolvedValue(undefined),
    isWordSeen: vi.fn((id: string) => id === 'w1' && !!opts.seen),
    wordProgress: opts.seen ? { w1: { wordId: 'w1', seen: true, seenDate: opts.seenDate ?? null } } : {},
    recordActivity: vi.fn().mockResolvedValue(undefined),
    isLoaded: true,
  };
  m.srs = {
    dueReviews: vi.fn(() => opts.due ?? []),
    submitReview: vi.fn().mockResolvedValue({ justMastered: false, checkPassed: false, checkFailed: false, pointGained: false, next: { easyCount: 0 } }),
    createReview: vi.fn().mockResolvedValue(undefined),
    getMastery: vi.fn((id: string) => ({ status: id === 'w1' ? (opts.status ?? 'active') : 'active', easyCount: 0, isCheck: false, checkStage: 0, masteredAt: null, nextCheckDate: null })),
    ignoreWord: vi.fn().mockResolvedValue(opts.ignoreOk ?? true),
    isLoaded: true,
  };
  return render(<DailyWord />);
}

beforeEach(() => {
  m.navigate.mockReset();
  m.toast.mockReset(); m.toast.success.mockReset(); m.toast.error.mockReset();
  vi.restoreAllMocks();
});

describe('DailyWord — mot neuf', () => {
  it("propose « J'ai compris » ; le clic marque le mot vu et crée la révision", async () => {
    setup({ seen: false });
    const btn = await screen.findByRole('button', { name: /J'ai compris/ });
    expect(screen.queryByTestId('reinforce-message')).toBeNull();
    fireEvent.click(btn);
    await waitFor(() => expect(m.progress.markWordAsSeen).toHaveBeenCalledWith('w1'));
    expect(m.srs.createReview).toHaveBeenCalledWith('w1');
  });

  it('un mot découvert AUJOURD\'HUI reste un mot neuf (pas « à renforcer ») même après rechargement', async () => {
    setup({ seen: true, seenDate: today });
    await screen.findByTestId('learned-message');
    expect(screen.queryByTestId('reinforce-message')).toBeNull();
  });
});

describe('DailyWord — mot à renforcer (réservoir plein)', () => {
  it("un mot vu un autre jour : pas de « J'ai compris », message et bouton Réviser", async () => {
    setup({ seen: true, seenDate: '2026-10-01' });
    await screen.findByTestId('reinforce-message');
    expect(screen.getByText(/Ton réservoir est plein/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /J'ai compris/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Réviser/ })).toBeTruthy();
  });

  it("Réviser sans mot dû renvoie vers le quiz", async () => {
    setup({ seen: true, seenDate: '2026-10-01', due: [] });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    expect(m.navigate).toHaveBeenCalledWith('/quiz');
  });
});

describe('DailyWord — série de jours', () => {
  it("la fin d'une session de révision compte la journée (indispensable quand le mot du jour est déjà connu)", async () => {
    setup({ seen: true, seenDate: '2026-10-01', due: [W('w2', 'Tanguer')] });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: 'faux' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(m.progress.recordActivity).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Difficile/ }));
    await waitFor(() => expect(m.srs.submitReview).toHaveBeenCalledWith('w2', 'hard', false));
    await waitFor(() => expect(m.progress.recordActivity).toHaveBeenCalledTimes(1));
    await screen.findByTestId('reinforce-message'); // retour au mot du jour
  });
});

describe('DailyWord — ne plus me présenter ce mot (mot du jour)', () => {
  it('après confirmation : le mot est ignoré et un message de succès s\'affiche', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: false });
    fireEvent.click(await screen.findByTestId('ignore-today'));
    await waitFor(() => expect(m.srs.ignoreWord).toHaveBeenCalledWith('w1'));
    expect(m.toast.success).toHaveBeenCalledWith('Ce mot ne te sera plus présenté.');
  });

  it("ignorer le mot du jour compte la journée pour la série (même sans session de révision)", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: false });
    fireEvent.click(await screen.findByTestId('ignore-today'));
    await waitFor(() => expect(m.progress.recordActivity).toHaveBeenCalledTimes(1));
  });

  it("ignorer le mot du jour : échec ou refus => la série n'est PAS comptée", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: false, ignoreOk: false });
    fireEvent.click(await screen.findByTestId('ignore-today'));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.progress.recordActivity).not.toHaveBeenCalled();
  });

  it("sans confirmation : rien n'est enregistré", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ seen: false });
    fireEvent.click(await screen.findByTestId('ignore-today'));
    expect(m.srs.ignoreWord).not.toHaveBeenCalled();
  });

  it("échec d'enregistrement : message d'erreur, pas de faux succès", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: false, ignoreOk: false });
    fireEvent.click(await screen.findByTestId('ignore-today'));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("mot déjà ignoré : message explicite, ni « J'ai compris » ni bouton d'ignorance", async () => {
    setup({ seen: false, status: 'ignored' });
    await screen.findByTestId('ignored-message');
    expect(screen.queryByRole('button', { name: /J'ai compris/ })).toBeNull();
    expect(screen.queryByTestId('ignore-today')).toBeNull();
    expect(screen.getByRole('button', { name: /Réviser/ })).toBeTruthy();
  });
});

describe('DailyWord — ne plus me présenter ce mot (pendant une session)', () => {
  it("ignore le mot SANS enregistrer de note et passe à la suite", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: true, seenDate: '2026-10-01', due: [W('w2', 'Tanguer')] });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: 'Tanguer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(await screen.findByTestId('ignore-word'));
    await waitFor(() => expect(m.srs.ignoreWord).toHaveBeenCalledWith('w2'));
    expect(m.srs.submitReview).not.toHaveBeenCalled();
    await waitFor(() => expect(m.progress.recordActivity).toHaveBeenCalledTimes(1));
  });

  it("échec : on reste sur le mot, message d'erreur", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: true, seenDate: '2026-10-01', due: [W('w2', 'Tanguer')], ignoreOk: false });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: 'Tanguer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(await screen.findByTestId('ignore-word'));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.progress.recordActivity).not.toHaveBeenCalled();
    expect(screen.getByTestId('ignore-word')).toBeTruthy();
  });
});

describe('DailyWord — compteur de fin de session', () => {
  it("un mot ignoré n'est pas compté comme révision : 2 mots dont 1 ignoré, 1 répondu => « 1 révision faite »", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup({ seen: true, seenDate: '2026-10-01', due: [W('w2', 'Tanguer'), W('w3', 'Délation')] });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    // mot 1 : ignoré
    fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: 'Tanguer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(await screen.findByTestId('ignore-word'));
    // mot 2 : répondu
    await waitFor(() => expect(m.srs.ignoreWord).toHaveBeenCalledWith('w2'));
    fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: 'faux' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(await screen.findByRole('button', { name: /Difficile/ }));
    await waitFor(() => expect(screen.getByText(/Session complète — 1 révision faite/)).toBeTruthy());
  });

  it('2 mots répondus => « 2 révisions faites »', async () => {
    setup({ seen: true, seenDate: '2026-10-01', due: [W('w2', 'Tanguer'), W('w3', 'Délation')] });
    fireEvent.click(await screen.findByRole('button', { name: /Réviser/ }));
    for (const mot of ['x', 'y']) {
      fireEvent.change(await screen.findByPlaceholderText('Écris le mot…'), { target: { value: mot } });
      fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
      fireEvent.click(await screen.findByRole('button', { name: /Difficile/ }));
    }
    await waitFor(() => expect(screen.getByText(/Session complète — 2 révisions faites/)).toBeTruthy());
  });
});
