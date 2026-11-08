/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

type Row = Record<string, any>;
const db = vi.hoisted(() => ({
  word_reviews: [] as Row[],
  words: [] as Row[],
  user_settings: [] as Row[],
  upserts: [] as Array<{ table: string; row: Row }>,
  failUpsert: false,
}));
const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as any, isLoading: false } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: 'word_reviews' | 'words' | 'user_settings') => {
      const filters: Array<(r: Row) => boolean> = [];
      const run = () => ({ data: db[table].filter((r) => filters.every((f) => f(r))), error: null });
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
        maybeSingle: () => { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); },
        upsert: (row: Row) => {
          db.upserts.push({ table, row });
          if (!db.failUpsert && table === 'user_settings') {
            const i = db.user_settings.findIndex((x) => x.user_id === row.user_id);
            if (i >= 0) db.user_settings[i] = { ...db.user_settings[i], ...row }; else db.user_settings.push({ ...row });
          }
          return Promise.resolve({ error: db.failUpsert ? { message: 'boom' } : null });
        },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  },
}));

import { ReservoirSettings } from '@/components/ReservoirSettings';
import { useReservoirSize } from '@/hooks/useReservoirSize';

beforeEach(() => {
  db.word_reviews = []; db.words = []; db.user_settings = []; db.upserts = []; db.failUpsert = false;
  toast.success.mockReset(); toast.error.mockReset();
  auth.value = { user: { id: 'u1' }, isLoading: false };
});

describe('useReservoirSize', () => {
  it('défaut 20 sans réglage enregistré', async () => {
    const { result } = renderHook(() => useReservoirSize());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.size).toBe(20);
  });
  it('lit la taille enregistrée', async () => {
    db.user_settings = [{ user_id: 'u1', reservoir_size: 12 }];
    const { result } = renderHook(() => useReservoirSize());
    await waitFor(() => expect(result.current.size).toBe(12));
  });
  it('setSize enregistre une valeur bornée et met à jour l\'état', async () => {
    const { result } = renderHook(() => useReservoirSize());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.setSize(500); });
    expect(ok).toBe(true);
    expect(db.upserts.at(-1)).toEqual({ table: 'user_settings', row: { user_id: 'u1', reservoir_size: 100 } });
    expect(result.current.size).toBe(100);
  });
  it('échec d\'écriture : false et la valeur affichée ne change pas', async () => {
    const { result } = renderHook(() => useReservoirSize());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    db.failUpsert = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.setSize(30); });
    spy.mockRestore();
    expect(ok).toBe(false);
    expect(result.current.size).toBe(20);
  });
  it('déconnecté : setSize ne fait rien', async () => {
    auth.value = { user: null, isLoading: false };
    const { result } = renderHook(() => useReservoirSize());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.setSize(30); });
    expect(ok).toBe(false);
    expect(db.upserts).toHaveLength(0);
  });
});

describe('ReservoirSettings — taille', () => {
  it('affiche la taille enregistrée, le bouton est désactivé tant qu\'on ne change rien', async () => {
    db.user_settings = [{ user_id: 'u1', reservoir_size: 15 }];
    render(<ReservoirSettings />);
    await waitFor(() => expect((screen.getByTestId('reservoir-input') as HTMLInputElement).value).toBe('15'));
    expect((screen.getByTestId('reservoir-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enregistre une nouvelle taille valide', async () => {
    render(<ReservoirSettings />);
    await waitFor(() => expect((screen.getByTestId('reservoir-input') as HTMLInputElement).value).toBe('20'));
    fireEvent.change(screen.getByTestId('reservoir-input'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('reservoir-save'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Réservoir réglé à 30 mots'));
    expect(db.upserts.at(-1)?.row).toEqual({ user_id: 'u1', reservoir_size: 30 });
  });

  it.each(['0', '101', '2.5', '-3', 'abc'])('refuse la valeur invalide « %s » (message + bouton désactivé)', async (bad) => {
    render(<ReservoirSettings />);
    await waitFor(() => expect((screen.getByTestId('reservoir-input') as HTMLInputElement).value).toBe('20'));
    fireEvent.change(screen.getByTestId('reservoir-input'), { target: { value: bad } });
    // un champ type=number refuse 'abc' : la valeur devient vide, sans message
    if (bad !== 'abc') expect(screen.getByTestId('reservoir-invalid')).toBeTruthy();
    expect((screen.getByTestId('reservoir-save') as HTMLButtonElement).disabled).toBe(true);
    expect(db.upserts).toHaveLength(0);
  });

  it("échec d'enregistrement : message d'erreur", async () => {
    render(<ReservoirSettings />);
    await waitFor(() => expect((screen.getByTestId('reservoir-input') as HTMLInputElement).value).toBe('20'));
    db.failUpsert = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.change(screen.getByTestId('reservoir-input'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('reservoir-save'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    spy.mockRestore();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('ReservoirSettings — mots ignorés', () => {
  it('aucun mot ignoré : message', async () => {
    render(<ReservoirSettings />);
    await screen.findByTestId('no-ignored');
  });

  it("liste uniquement les mots IGNORÉS de l'utilisateur, triés, avec leur nom", async () => {
    db.words = [{ id: 'w1', word: 'Zèbre' }, { id: 'w2', word: 'Abricot' }, { id: 'w3', word: 'Actif' }, { id: 'w4', word: 'Autre' }];
    db.word_reviews = [
      { user_id: 'u1', word_id: 'w1', status: 'ignored' },
      { user_id: 'u1', word_id: 'w2', status: 'ignored' },
      { user_id: 'u1', word_id: 'w3', status: 'active' },
      { user_id: 'u2', word_id: 'w4', status: 'ignored' },
    ];
    render(<ReservoirSettings />);
    const list = await screen.findByTestId('ignored-list');
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent?.replace('Réactiver', '').trim())).toEqual(['Abricot', 'Zèbre']);
  });

  it('Réactiver : écrit un statut actif à 0/3, retire le mot de la liste et confirme', async () => {
    db.words = [{ id: 'w1', word: 'Zèbre' }];
    db.word_reviews = [{ user_id: 'u1', word_id: 'w1', status: 'ignored' }];
    render(<ReservoirSettings />);
    fireEvent.click(await screen.findByTestId('reactivate-w1'));
    await waitFor(() => expect(screen.queryByTestId('ignored-item-w1')).toBeNull());
    const w = db.upserts.find((u) => u.table === 'word_reviews')!;
    expect(w.row).toMatchObject({ user_id: 'u1', word_id: 'w1', status: 'active', easy_count: 0, mastered_at: null, check_stage: 0, next_check_date: null });
    expect(toast.success).toHaveBeenCalledWith('« Zèbre » est de retour dans tes révisions');
  });

  it('échec de réactivation : le mot reste dans la liste, message d\'erreur', async () => {
    db.words = [{ id: 'w1', word: 'Zèbre' }];
    db.word_reviews = [{ user_id: 'u1', word_id: 'w1', status: 'ignored' }];
    render(<ReservoirSettings />);
    const btn = await screen.findByTestId('reactivate-w1');
    db.failUpsert = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.click(btn);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    spy.mockRestore();
    expect(screen.getByTestId('ignored-item-w1')).toBeTruthy();
  });
});
