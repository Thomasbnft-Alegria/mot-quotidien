/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase (test) */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({ value: { user: null as any, isLoading: false } }));
const calls = vi.hoisted(() => ({ list: [] as any[] }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const rec: any = { table, ops: [] };
      calls.list.push(rec);
      const q: any = {
        update: (p: any) => { rec.ops.push(['update', p]); return q; },
        eq: (k: string, v: unknown) => { rec.ops.push(['eq', k, v]); return q; },
        is: (k: string, v: unknown) => { rec.ops.push(['is', k, v]); return Promise.resolve({ error: null }); },
        select: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return q;
    },
  },
}));

import { usePushNotifications } from '@/hooks/usePushNotifications';

beforeEach(() => {
  localStorage.clear();
  calls.list = [];
  auth.value = { user: null, isLoading: false };
});

describe('usePushNotifications — liaison automatique de l\'abonnement au compte', () => {
  it("rattache l'abonnement déjà enregistré sur cet appareil, sans toucher aux abonnements d'un autre compte", async () => {
    localStorage.setItem('push_subscription_endpoint', 'https://web.push.apple.com/abc');
    auth.value = { user: { id: 'u1' }, isLoading: false };
    renderHook(() => usePushNotifications());
    await waitFor(() => expect(calls.list.some((c) => c.ops.some((o: any) => o[0] === 'update'))).toBe(true));
    const rec = calls.list.find((c) => c.ops.some((o: any) => o[0] === 'update'))!;
    expect(rec.table).toBe('push_subscriptions');
    expect(rec.ops).toEqual([
      ['update', { user_id: 'u1' }],
      ['eq', 'endpoint', 'https://web.push.apple.com/abc'],
      ['is', 'user_id', null], // seulement s'il n'a pas déjà un propriétaire
    ]);
  });

  it("ne fait rien sans utilisateur connecté", async () => {
    localStorage.setItem('push_subscription_endpoint', 'https://web.push.apple.com/abc');
    renderHook(() => usePushNotifications());
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list.some((c) => c.ops.some((o: any) => o[0] === 'update'))).toBe(false);
  });

  it("ne fait rien si aucun abonnement n'est enregistré sur cet appareil", async () => {
    auth.value = { user: { id: 'u1' }, isLoading: false };
    renderHook(() => usePushNotifications());
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.list.some((c) => c.ops.some((o: any) => o[0] === 'update'))).toBe(false);
  });
});
