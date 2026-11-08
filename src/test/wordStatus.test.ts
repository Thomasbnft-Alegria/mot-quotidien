import { describe, it, expect } from 'vitest';
import { ignorePayload, reactivatePayload } from '@/lib/wordStatus';

describe('ignorePayload', () => {
  it("n'envoie que 4 colonnes : les compteurs SM-2 ne sont jamais écrasés", () => {
    const p = ignorePayload('u1', 'w1', '2026-11-08');
    expect(p).toEqual({ user_id: 'u1', word_id: 'w1', status: 'ignored', next_review_date: '2026-11-08' });
    expect(Object.keys(p)).not.toContain('ease_factor');
    expect(Object.keys(p)).not.toContain('repetitions');
  });
});

describe('reactivatePayload', () => {
  it('remet le mot actif à 0/3, sans date de maîtrise ni contrôle', () => {
    expect(reactivatePayload('u1', 'w1', '2026-11-08')).toEqual({
      user_id: 'u1', word_id: 'w1', status: 'active', easy_count: 0, mastered_at: null, check_stage: 0, next_check_date: null, next_review_date: '2026-11-08',
    });
  });
});
