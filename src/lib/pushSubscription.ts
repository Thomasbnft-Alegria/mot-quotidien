// Enregistrement d'un abonnement aux notifications push, rattaché au compte de l'utilisateur.
// Module sans React : le client Supabase est injecté, ce qui permet de le tester avec un faux client.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Client = SupabaseClient<Database>;

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Heure choisie au format HH:MM:SS */
  preferredTime: string;
  /** null = utilisateur non identifié : l'abonnement reste « non rattaché » (comportement historique). */
  userId: string | null;
}

/**
 * Crée ou met à jour l'abonnement identifié par son endpoint.
 * - Il est rattaché à l'utilisateur connecté (user_id) pour que la notification annonce SON mot du jour.
 * - Un nouvel endpoint pour le MÊME utilisateur remplace ses anciens abonnements (évite les notifications en double).
 *   Les abonnements des AUTRES comptes ne sont JAMAIS touchés (l'ancien code effaçait tous les autres abonnements).
 */
export async function saveSubscriptionRecord(client: Client, input: SubscriptionInput): Promise<'updated' | 'inserted'> {
  const { endpoint, p256dh, auth, preferredTime, userId } = input;

  const { data: existing } = await client
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .maybeSingle();

  if (existing) {
    await client
      .from('push_subscriptions')
      .update({ p256dh, auth, enabled: true, preferred_time: preferredTime, ...(userId ? { user_id: userId } : {}) })
      .eq('endpoint', endpoint);
    return 'updated';
  }

  if (userId) {
    await client.from('push_subscriptions').delete().eq('user_id', userId).neq('endpoint', endpoint);
  }
  await client
    .from('push_subscriptions')
    .insert({ endpoint, p256dh, auth, enabled: true, preferred_time: preferredTime, user_id: userId });
  return 'inserted';
}

/**
 * Rattache automatiquement un abonnement existant (créé avant que les abonnements soient liés aux comptes) à
 * l'utilisateur connecté. Ne touche QUE les abonnements sans propriétaire : jamais celui d'un autre compte.
 */
export async function linkSubscriptionToUser(client: Client, endpoint: string, userId: string): Promise<void> {
  const { error } = await client
    .from('push_subscriptions')
    .update({ user_id: userId })
    .eq('endpoint', endpoint)
    .is('user_id', null);
  if (error) console.warn('[Push] link subscription to user failed:', error);
}
