import { describe, expect, it } from 'vitest';
import { describeTestPush } from '../push-notifications';

describe('describeTestPush', () => {
  const base = { attempted: true, success: true, sent: 0, removed: 0, provider: 'webpush' as const };
  it.each([
    [{ ...base, sent: 1 }, true, '1 appareil(s)'],
    [{ ...base, sent: 1, removed: 2 }, true, '2 abonnement(s) expiré(s)'],
    [{ ...base, sent: 3, provider: 'console' as const }, false, 'mode console'],
    [{ ...base, attempted: false, success: false, error: 'vapid_mismatch' }, false, 'VAPID'],
    [{ ...base, attempted: false, success: false, error: 'no_subscription' }, false, 'Aucun appareil'],
    [{ ...base, success: false, removed: 1 }, false, 'expirés supprimés'],
    [{ ...base, success: false }, false, 'aucun envoi'],
  ])('%o → ok=%s', (result, ok, text) => {
    const described = describeTestPush(result);
    expect(described.ok).toBe(ok);
    expect(described.message).toContain(text);
  });
});
