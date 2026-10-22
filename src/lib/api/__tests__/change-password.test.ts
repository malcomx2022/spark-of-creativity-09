import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('changement de mot de passe', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.unstubAllGlobals(); });
  const response = { accessToken: 'access', refreshToken: 'refresh-courant-0123456789', expiresIn: 900, tokenType: 'Bearer', user: { id: 'user', email: null, phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' } };

  it('transmet le refresh token de la session courante pour la conserver', async () => {
    const session = await import('../session');
    const { auth } = await import('../auth');
    session.setSession(response);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ changed: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(auth.changePassword('Ancien#2026', 'Nouveau#2026')).resolves.toEqual({ changed: true });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain('/auth/password/change');
    expect(JSON.parse(init.body)).toEqual({ currentPassword: 'Ancien#2026', newPassword: 'Nouveau#2026', refreshToken: 'refresh-courant-0123456789' });
  });
});
