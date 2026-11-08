import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string }, isLoading: false } }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { useDailyWord } from '@/hooks/useDailyWord';
import { dailyWordCacheKey } from '@/lib/reservoir';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const W = (name: string) => ({ id: 'id-' + name, word: name, definition: 'd', exampleSentence: 'e', category: 'nom', register: 'courant' });
const reply = (name: string, personal: boolean) => ({ data: { success: true, dataVersion: 'v1', date: today, word: W(name), ...(personal ? { isPersonal: true, kind: 'new' } : {}) }, error: null });

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  auth.value = { user: null, isLoading: false };
});

describe('useDailyWord — déconnecté (mot global)', () => {
  it("appelle get-daily-word sans corps et met en cache avec la clé historique", async () => {
    invoke.mockResolvedValue(reply('Global', false));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invoke).toHaveBeenCalledWith('get-daily-word', undefined);
    expect(result.current.word?.word).toBe('Global');
    expect(result.current.isPersonal).toBe(false);
    expect(localStorage.getItem(dailyWordCacheKey(null))).toBeTruthy();
  });
});

describe('useDailyWord — connecté (mot personnel)', () => {
  it("demande le mode personnel et met en cache sous la clé de l'utilisateur", async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    invoke.mockResolvedValue(reply('Perso', true));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invoke).toHaveBeenCalledWith('get-daily-word', { body: { personal: true } });
    expect(result.current.isPersonal).toBe(true);
    expect(JSON.parse(localStorage.getItem(dailyWordCacheKey('u1'))!).personal).toBe(true);
    expect(localStorage.getItem(dailyWordCacheKey(null))).toBeNull();
  });

  it("n'appelle PAS le serveur tant que l'authentification se charge (pas de flash du mot global)", async () => {
    auth.value = { user: null, isLoading: true };
    renderHook(() => useDailyWord());
    await new Promise((r) => setTimeout(r, 30));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('réutilise le cache personnel du jour sans appel serveur', async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    localStorage.setItem(dailyWordCacheKey('u1'), JSON.stringify({ word: W('Cache'), date: today, cachedAt: 1, dataVersion: 'v1', personal: true }));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.word?.word).toBe('Cache');
  });

  it("deux comptes sur le même appareil ne se voient pas le mot de l'autre", async () => {
    localStorage.setItem(dailyWordCacheKey('u1'), JSON.stringify({ word: W('MotDeU1'), date: today, cachedAt: 1, dataVersion: 'v1', personal: true }));
    auth.value = { user: { id: 'u2' }, isLoading: false };
    invoke.mockResolvedValue(reply('MotDeU2', true));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.word?.word).toBe('MotDeU2');
  });

  it("un ancien cache global (non personnel) n'est pas réutilisé pour un utilisateur connecté", async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    localStorage.setItem(dailyWordCacheKey('u1'), JSON.stringify({ word: W('Vieux'), date: today, cachedAt: 1, dataVersion: 'v1' }));
    invoke.mockResolvedValue(reply('Perso', true));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.word?.word).toBe('Perso'));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("repli sur le mot global (réponse sans isPersonal) : affiché mais NON mis en cache", async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    invoke.mockResolvedValue(reply('Repli', false));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.word?.word).toBe('Repli');
    expect(result.current.isPersonal).toBe(false);
    expect(localStorage.getItem(dailyWordCacheKey('u1'))).toBeNull();
  });

  it("cache d'un autre jour : refetch", async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    localStorage.setItem(dailyWordCacheKey('u1'), JSON.stringify({ word: W('Hier'), date: '2000-01-01', cachedAt: 1, dataVersion: 'v1', personal: true }));
    invoke.mockResolvedValue(reply('Aujourdhui', true));
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.word?.word).toBe('Aujourdhui'));
  });

  it('erreur serveur : expose le message, ne casse pas', async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    invoke.mockResolvedValue({ data: { success: false, error: 'boom' }, error: null });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDailyWord());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    spy.mockRestore();
    expect(result.current.word).toBeNull();
  });
});
