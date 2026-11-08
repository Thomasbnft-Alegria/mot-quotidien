/* eslint-disable @typescript-eslint/no-explicit-any -- faux client Supabase en mémoire (test) */
import { describe, it, expect } from 'vitest';
import { saveSubscriptionRecord, linkSubscriptionToUser } from '@/lib/pushSubscription';

type Row = Record<string, any>;

function makeClient(rows: Row[]) {
  const ops: string[] = [];
  const client: any = {
    from: (table: string) => {
      if (table !== 'push_subscriptions') throw new Error('table inattendue ' + table);
      const filters: Array<(r: Row) => boolean> = [];
      let action: 'select' | 'update' | 'delete' | 'insert' = 'select';
      let patch: Row = {};
      const exec = () => {
        if (action === 'update') rows.filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, patch));
        if (action === 'delete') { const keep = rows.filter((r) => !filters.every((f) => f(r))); rows.length = 0; rows.push(...keep); }
        return { data: null, error: null };
      };
      const q: any = {
        select: () => { action = 'select'; return q; },
        update: (p: Row) => { action = 'update'; patch = p; ops.push('update'); return q; },
        delete: () => { action = 'delete'; ops.push('delete'); return q; },
        insert: (r: Row) => { ops.push('insert'); rows.push({ id: 'new-' + rows.length, user_id: null, ...r }); return Promise.resolve({ error: null }); },
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
        is: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return q;
    },
  };
  return { client, ops };
}

const base = { p256dh: 'k', auth: 'a', preferredTime: '12:30:00' };

describe('saveSubscriptionRecord', () => {
  it('nouvel abonnement : inséré avec le user_id de l\'utilisateur', async () => {
    const rows: Row[] = [];
    const { client } = makeClient(rows);
    expect(await saveSubscriptionRecord(client, { ...base, endpoint: 'e1', userId: 'u1' })).toBe('inserted');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ endpoint: 'e1', user_id: 'u1', enabled: true, preferred_time: '12:30:00' });
  });

  it("NE SUPPRIME PAS les abonnements des autres comptes (ancien comportement : tous effacés)", async () => {
    const rows: Row[] = [
      { id: 'a', endpoint: 'ami-device', user_id: 'ami' },
      { id: 'b', endpoint: 'orphelin', user_id: null },
    ];
    const { client } = makeClient(rows);
    await saveSubscriptionRecord(client, { ...base, endpoint: 'e1', userId: 'u1' });
    expect(rows.map((r) => r.endpoint).sort()).toEqual(['ami-device', 'e1', 'orphelin']);
  });

  it("remplace les anciens abonnements du MÊME utilisateur (pas de notification en double)", async () => {
    const rows: Row[] = [
      { id: 'a', endpoint: 'ancien-u1', user_id: 'u1' },
      { id: 'b', endpoint: 'ami-device', user_id: 'ami' },
    ];
    const { client } = makeClient(rows);
    await saveSubscriptionRecord(client, { ...base, endpoint: 'nouveau-u1', userId: 'u1' });
    expect(rows.map((r) => r.endpoint).sort()).toEqual(['ami-device', 'nouveau-u1']);
  });

  it('abonnement existant : mis à jour et rattaché à l\'utilisateur', async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: null, enabled: false, preferred_time: '08:00:00' }];
    const { client, ops } = makeClient(rows);
    expect(await saveSubscriptionRecord(client, { ...base, endpoint: 'e1', userId: 'u1' })).toBe('updated');
    expect(rows[0]).toMatchObject({ user_id: 'u1', enabled: true, preferred_time: '12:30:00' });
    expect(ops).not.toContain('delete');
    expect(ops).not.toContain('insert');
  });

  it('utilisateur inconnu (null) : insertion non rattachée, aucune suppression', async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'x', user_id: 'ami' }];
    const { client, ops } = makeClient(rows);
    await saveSubscriptionRecord(client, { ...base, endpoint: 'e1', userId: null });
    expect(ops).not.toContain('delete');
    expect(rows.find((r) => r.endpoint === 'e1')?.user_id).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it("mise à jour sans utilisateur : n'efface PAS un user_id existant", async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: 'u1' }];
    const { client } = makeClient(rows);
    await saveSubscriptionRecord(client, { ...base, endpoint: 'e1', userId: null });
    expect(rows[0].user_id).toBe('u1');
  });
});

describe('linkSubscriptionToUser', () => {
  it('rattache un abonnement sans propriétaire', async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: null }];
    const { client } = makeClient(rows);
    await linkSubscriptionToUser(client, 'e1', 'u1');
    expect(rows[0].user_id).toBe('u1');
  });

  it("ne vole JAMAIS l'abonnement d'un autre compte", async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: 'ami' }];
    const { client } = makeClient(rows);
    await linkSubscriptionToUser(client, 'e1', 'u1');
    expect(rows[0].user_id).toBe('ami');
  });

  it('ne touche pas les autres abonnements', async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: null }, { id: 'b', endpoint: 'e2', user_id: null }];
    const { client } = makeClient(rows);
    await linkSubscriptionToUser(client, 'e1', 'u1');
    expect(rows.find((r) => r.endpoint === 'e2')?.user_id).toBeNull();
  });

  it('endpoint inconnu : rien ne se passe, pas d\'erreur', async () => {
    const rows: Row[] = [{ id: 'a', endpoint: 'e1', user_id: null }];
    const { client } = makeClient(rows);
    await expect(linkSubscriptionToUser(client, 'inconnu', 'u1')).resolves.toBeUndefined();
    expect(rows[0].user_id).toBeNull();
  });
});
