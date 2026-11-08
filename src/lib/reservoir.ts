// Réservoir de mots : helpers purs (aucune dépendance React/Supabase), testés avec Vitest.

export const RESERVOIR_DEFAULT = 20;
export const RESERVOIR_MIN = 1;
export const RESERVOIR_MAX = 100; // bornes identiques à la contrainte CHECK de user_settings.reservoir_size

export const GLOBAL_CACHE_KEY = 'mot-du-jour-daily-word-cache';

/** Taille de réservoir valide : entier entre RESERVOIR_MIN et RESERVOIR_MAX, 20 si la valeur est inexploitable. */
export function clampReservoirSize(value: unknown): number {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return RESERVOIR_DEFAULT;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return RESERVOIR_DEFAULT;
  return Math.min(RESERVOIR_MAX, Math.max(RESERVOIR_MIN, Math.floor(n)));
}

/** Clé de cache du mot du jour : une par utilisateur connecté (le mot est personnel), la clé historique sinon. */
export function dailyWordCacheKey(userId: string | null | undefined): string {
  return userId ? `${GLOBAL_CACHE_KEY}:${userId}` : GLOBAL_CACHE_KEY;
}

export interface CachedDailyWord {
  date: string;
  dataVersion?: string;
  personal?: boolean;
}

/**
 * Un mot en cache est réutilisable si : même jour, version de données connue et, pour un utilisateur connecté,
 * il s'agit bien d'un mot PERSONNEL (un repli sur le mot global ne doit jamais être réutilisé comme tel).
 */
export function isCacheUsable(cached: CachedDailyWord | null | undefined, today: string, wantPersonal: boolean): boolean {
  if (!cached || cached.date !== today || !cached.dataVersion) return false;
  return wantPersonal ? cached.personal === true : true;
}

export interface SeenInfo {
  seen: boolean;
  seenDate: string | null;
}

/**
 * Mot « à renforcer » : le mot du jour est un mot que l'utilisateur a déjà vu un autre jour
 * (réservoir plein => on revoit le mot le moins assimilé). Un mot découvert AUJOURD'HUI reste un mot neuf,
 * même après rechargement de la page.
 */
export function isReinforceWord(progress: SeenInfo | null | undefined, today: string): boolean {
  return !!progress && progress.seen && progress.seenDate !== null && progress.seenDate !== today;
}

export interface StatusCounts {
  active: number;
  mastered: number;
  ignored: number;
  other: number;
}

export function countByStatus(statuses: Array<string | null | undefined>): StatusCounts {
  const c: StatusCounts = { active: 0, mastered: 0, ignored: 0, other: 0 };
  for (const s of statuses) {
    const status = s ?? 'active';
    if (status === 'active') c.active++;
    else if (status === 'mastered') c.mastered++;
    else if (status === 'ignored') c.ignored++;
    else c.other++;
  }
  return c;
}
