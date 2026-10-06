import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('session rotation', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.unstubAllGlobals(); });
  const response = (refreshToken = 'old') => ({ accessToken: 'access', refreshToken, expiresIn: 900, tokenType: 'Bearer', user: { id: 'user', email: null, phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' } });

  it('shares a rotation between all callers in the same tab', async () => {
    const session = await import('../session');
    session.setSession(response());
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response('new')), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([session.refreshSession(), session.refreshSession()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(session.getSession()?.refreshToken).toBe('new');
  });

  it('reuses the session rotated by another tab while waiting for the origin lock', async () => {
    const session = await import('../session');
    session.setSession(response());
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const request = vi.fn(async (_name, callback) => {
      localStorage.setItem('domicares.session', JSON.stringify({ ...response('other-tab'), expiresAt: Date.now() + 900_000 }));
      return callback();
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const next = await session.refreshSession();
    expect(request).toHaveBeenCalledWith('domicares-session-refresh', expect.any(Function));
    expect(fetch).not.toHaveBeenCalled();
    expect(next.refreshToken).toBe('other-tab');
  });

  it('does not resurrect a session closed while the request was running', async () => {
    const session = await import('../session');
    session.setSession(response());
    vi.stubGlobal('fetch', vi.fn(async () => { session.clearSession(); return new Response(JSON.stringify(response('new'))); }));
    await expect(session.refreshSession()).rejects.toThrow('Session fermée');
    expect(session.getSession()).toBeNull();
  });
});
