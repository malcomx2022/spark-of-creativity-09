import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_KEY = 'domicares.session';
const user = { id: 'u1', email: 'u@test.com', phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('client API', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envoie le jeton Bearer et lit la session depuis le stockage local', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 600_000, user }));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { api, auth } = await import('..');

    expect(auth.getUser()?.id).toBe('u1');
    const res = await api.get<{ ok: boolean }>('/profile', { query: { page: 1, empty: '' } });

    expect(res).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/profile?page=1');
    expect((init as RequestInit).credentials).toBe('include');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('rejoue la requête après une rotation du refresh token sur 401', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'old', refreshToken: 'ref', expiresAt: Date.now() + 600_000, user }));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new', refreshToken: 'ref2', expiresIn: 900, tokenType: 'Bearer', user }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }));
    const { api, auth } = await import('..');
    const events: string[] = [];
    auth.onAuthStateChange((event) => events.push(event));

    const res = await api.get<{ id: string }>('/profile');

    expect(res).toEqual({ id: 'u1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer new' });
    expect(auth.getSession()?.accessToken).toBe('new');
    expect(events).toEqual(['TOKEN_REFRESHED']);
  });

  it('efface la session et signale SIGNED_OUT quand le refresh échoue', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'old', refreshToken: 'ref', expiresAt: Date.now() + 600_000, user }));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' })).mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }));
    const { api, auth, ApiError } = await import('..');
    const events: string[] = [];
    auth.onAuthStateChange((event) => events.push(event));

    await expect(api.get('/profile')).rejects.toBeInstanceOf(ApiError);
    expect(auth.getSession()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('expose les erreurs de validation de l’API', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { statusCode: 400, message: 'Validation échouée', details: { email: ['Adresse e-mail invalide'] } }));
    const { api, ApiError, errorMessage } = await import('..');

    const error = await api.post('/auth/register', { email: 'x' }, { auth: false }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.detailMessages).toEqual(['Adresse e-mail invalide']);
    expect(errorMessage(error)).toBe('Validation échouée : Adresse e-mail invalide');
  });

  it('ouvre une session à la connexion et la ferme à la déconnexion', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'tok', refreshToken: 'ref', expiresIn: 900, tokenType: 'Bearer', user }))
      .mockResolvedValueOnce(jsonResponse(200, { loggedOut: true }));
    const { auth } = await import('..');
    const events: string[] = [];
    auth.onAuthStateChange((event) => events.push(event));

    const session = await auth.signInWithPassword({ email: 'U@Test.com', password: 'secret' });
    expect(session.user.id).toBe('u1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ email: 'u@test.com', password: 'secret' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')?.accessToken).toBe('tok');

    await auth.signOut();
    expect(auth.getSession()).toBeNull();
    expect(events).toEqual(['SIGNED_IN', 'SIGNED_OUT']);
  });
});
