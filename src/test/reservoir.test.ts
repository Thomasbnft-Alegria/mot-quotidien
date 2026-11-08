import { describe, it, expect } from 'vitest';
import {
  clampReservoirSize, dailyWordCacheKey, isCacheUsable, isReinforceWord, countByStatus,
  RESERVOIR_DEFAULT, RESERVOIR_MIN, RESERVOIR_MAX, GLOBAL_CACHE_KEY,
} from '@/lib/reservoir';

describe('clampReservoirSize', () => {
  it('garde une valeur valide', () => expect(clampReservoirSize(12)).toBe(12));
  it('borne entre 1 et 100', () => {
    expect(clampReservoirSize(0)).toBe(RESERVOIR_MIN);
    expect(clampReservoirSize(-5)).toBe(RESERVOIR_MIN);
    expect(clampReservoirSize(500)).toBe(RESERVOIR_MAX);
  });
  it('arrondit à l\'entier inférieur', () => expect(clampReservoirSize(7.9)).toBe(7));
  it('valeur inexploitable => 20', () => {
    expect(clampReservoirSize(undefined)).toBe(RESERVOIR_DEFAULT);
    expect(clampReservoirSize(null)).toBe(RESERVOIR_DEFAULT);
    expect(clampReservoirSize('')).toBe(RESERVOIR_DEFAULT);
    expect(clampReservoirSize('  ')).toBe(RESERVOIR_DEFAULT);
    expect(clampReservoirSize('abc')).toBe(RESERVOIR_DEFAULT);
    expect(clampReservoirSize(NaN)).toBe(RESERVOIR_DEFAULT);
  });
  it('accepte une chaîne numérique', () => expect(clampReservoirSize('25')).toBe(25));
});

describe('dailyWordCacheKey', () => {
  it('clé par utilisateur, deux utilisateurs ne partagent pas le cache', () => {
    expect(dailyWordCacheKey('u1')).toBe(GLOBAL_CACHE_KEY + ':u1');
    expect(dailyWordCacheKey('u1')).not.toBe(dailyWordCacheKey('u2'));
  });
  it('déconnecté => clé historique', () => {
    expect(dailyWordCacheKey(null)).toBe(GLOBAL_CACHE_KEY);
    expect(dailyWordCacheKey(undefined)).toBe(GLOBAL_CACHE_KEY);
  });
});

describe('isCacheUsable', () => {
  const ok = { date: '2026-11-08', dataVersion: 'v1', personal: true };
  it('même jour + personnel => utilisable', () => expect(isCacheUsable(ok, '2026-11-08', true)).toBe(true));
  it('autre jour => non', () => expect(isCacheUsable(ok, '2026-11-09', true)).toBe(false));
  it('sans dataVersion => non (ancien format)', () => expect(isCacheUsable({ date: '2026-11-08', personal: true }, '2026-11-08', true)).toBe(false));
  it('connecté mais cache non personnel (repli global) => non', () => {
    expect(isCacheUsable({ date: '2026-11-08', dataVersion: 'v1' }, '2026-11-08', true)).toBe(false);
  });
  it('déconnecté : un cache global sans drapeau personnel reste utilisable', () => {
    expect(isCacheUsable({ date: '2026-11-08', dataVersion: 'v1' }, '2026-11-08', false)).toBe(true);
  });
  it('pas de cache => non', () => expect(isCacheUsable(null, '2026-11-08', false)).toBe(false));
});

describe('isReinforceWord', () => {
  const today = '2026-11-08';
  it('mot vu un autre jour => à renforcer', () => expect(isReinforceWord({ seen: true, seenDate: '2026-10-01' }, today)).toBe(true));
  it('mot découvert aujourd\'hui => reste un mot neuf (même après rechargement)', () => {
    expect(isReinforceWord({ seen: true, seenDate: today }, today)).toBe(false);
  });
  it('mot jamais vu => neuf', () => {
    expect(isReinforceWord({ seen: false, seenDate: null }, today)).toBe(false);
    expect(isReinforceWord(undefined, today)).toBe(false);
  });
  it('vu mais sans date (donnée ancienne) => on ne le traite pas comme à renforcer', () => {
    expect(isReinforceWord({ seen: true, seenDate: null }, today)).toBe(false);
  });
});

describe('countByStatus', () => {
  it('compte chaque statut, null = actif', () => {
    expect(countByStatus(['active', 'mastered', 'ignored', null, undefined, 'mastered', 'new'])).toEqual({
      active: 3, mastered: 2, ignored: 1, other: 1,
    });
  });
  it('liste vide', () => expect(countByStatus([])).toEqual({ active: 0, mastered: 0, ignored: 0, other: 0 }));
});
