/**
 * Tests e2e sur une vraie base PostgreSQL native (db/native/schema.native.sql + 120 + 020).
 * Variables : DATABASE_URL (rôle domicares_app). Voir api/README.md.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { FakeOtpProvider } from '../src/notifications/otp.provider';
import { TokensService } from '../src/auth/tokens.service';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION ?? 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const unique = Date.now().toString(36);
const email = `e2e-${unique}@domicares.test`;
const password = 'Motdepasse#2026';
const phone = `+2299${String(Date.now()).slice(-7)}`;

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let accessToken = '';
  let refreshToken = '';
  let userId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    // Nettoyage : les FK ON DELETE CASCADE suppriment profils, tokens, etc.
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      await sql`delete from public.users where email = ${email} or phone = ${phone}`.execute(trx);
      await sql`delete from public.otp_rate_limits where phone_number = ${phone}`.execute(trx);
      await sql`delete from public.otp_attempts where phone_number = ${phone}`.execute(trx);
    });
    await app.close();
  });

  it('GET /api/health répond ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('POST /api/auth/register crée le compte et le profil (trigger handle_new_user_safe)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password, fullName: 'Patient E2E', phone, userType: 'patient', pendingOnboarding: { profile: { fullName: 'Patient E2E' } } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.metadata.pending_onboarding).toBeDefined();
    userId = body.user.id;
    const profile = await db.db.selectFrom('profiles').selectAll().where('id', '=', userId).executeTakeFirst();
    expect(profile?.full_name).toBe('Patient E2E');
    expect(profile?.phone).toBe(phone);
  });

  it('refuse un doublon d’e-mail (409)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: 'Doublon' } });
    expect(res.statusCode).toBe(409);
  });

  it('rejette un corps invalide (400 + détails zod)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'pas-un-email', password: '123', fullName: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.length).toBeGreaterThan(0);
  });

  it('POST /api/auth/login renvoie une session + cookies httpOnly', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'mauvais' } });
    expect(bad.statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
    const cookies = res.cookies.map((c) => c.name);
    expect(cookies).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
  });

  it('GET /api/auth/me résout le rôle patient par défaut', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anon.statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'patient', source: 'default', adminRoles: [] });
    expect(res.json().profile.full_name).toBe('Patient E2E');
  });

  it('rôle admin dès qu’une ligne user_roles existe ; guard AdminOnly', async () => {
    await db.db.insertInto('user_roles').values({ user_id: userId, role: 'finance' }).execute();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.json()).toMatchObject({ role: 'admin', adminRoles: ['finance'] });
    await db.db.deleteFrom('user_roles').where('user_id', '=', userId).execute();
  });

  it('PATCH /api/profile met à jour le profil ; PATCH /api/auth/me/metadata fusionne', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/profile', headers: { authorization: `Bearer ${accessToken}` }, payload: { fullName: 'Patient Modifié', gender: 'femme' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ full_name: 'Patient Modifié', gender: 'femme' });

    // date_of_birth est un `date` : rendu en objet Date par node-postgres, il repart en chaîne
    // ISO complète. ProfileSection alimente un <input type="date"> avec cette valeur ; le champ
    // resterait vide et un enregistrement effacerait la date de naissance. Voir date-only.
    const avecDate = await app.inject({ method: 'PATCH', url: '/api/profile', headers: { authorization: `Bearer ${accessToken}` }, payload: { dateOfBirth: '1990-03-17' } });
    expect(avecDate.statusCode).toBe(200);
    expect(avecDate.json().date_of_birth).toBe('1990-03-17');
    const relu = await app.inject({ method: 'GET', url: '/api/profile', headers: { authorization: `Bearer ${accessToken}` } });
    expect(relu.json().date_of_birth).toBe('1990-03-17');
    const meta = await app.inject({ method: 'PATCH', url: '/api/auth/me/metadata', headers: { authorization: `Bearer ${accessToken}` }, payload: { metadata: { pending_onboarding: null, onboarding_done: true } } });
    expect(meta.statusCode).toBe(200);
    expect(meta.json().metadata).toMatchObject({ full_name: 'Patient E2E', onboarding_done: true, pending_onboarding: null });
  });

  it('POST /api/auth/refresh tourne le jeton et détecte la réutilisation', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    expect(res.statusCode).toBe(200);
    const rotated = res.json().refreshToken as string;
    expect(rotated).not.toBe(refreshToken);
    const reuse = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    expect(reuse.statusCode).toBe(401);
    // La famille entière est révoquée : le jeton tourné ne fonctionne plus non plus.
    const afterReuse = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: rotated } });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('mot de passe oublié → reset → ancien mot de passe refusé', async () => {
    const forgot = await app.inject({ method: 'POST', url: '/api/auth/password/forgot', payload: { email } });
    expect(forgot.statusCode).toBe(200);
    // auth_tokens reste protégée par RLS : lecture uniquement avec app.user_role = service_role.
    const row = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('auth_tokens').select(['id']).where('identifier', '=', email).where('kind', '=', 'password_reset').where('consumed_at', 'is', null).executeTakeFirst());
    const hidden = await db.db.selectFrom('auth_tokens').select(['id']).where('identifier', '=', email).executeTakeFirst();
    expect(hidden).toBeUndefined();
    expect(row).toBeDefined();
    // Le jeton en clair n'est pas stocké : on en crée un que l'on connaît pour le test.
    const tokens = app.get((await import('../src/auth/tokens.service')).TokensService);
    const known = await db.runAs({ role: 'service_role' }, (trx) => tokens.createOneTimeToken(trx, { userId, identifier: email, kind: 'password_reset', ttlSeconds: 60 }));
    const reset = await app.inject({ method: 'POST', url: '/api/auth/password/reset', payload: { token: known, password: 'NouveauMdp#2026' } });
    expect(reset.statusCode).toBe(200);
    const old = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    expect(old.statusCode).toBe(401);
    const fresh = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'NouveauMdp#2026' } });
    expect(fresh.statusCode).toBe(200);
    accessToken = fresh.json().accessToken;
  });

  it('verrouille le compte après 5 échecs (423)', async () => {
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'faux' } });
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'NouveauMdp#2026' } });
    expect(locked.statusCode).toBe(423);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('users').set({ failed_login_attempts: 0, locked_until: null }).where('id', '=', userId).execute());
  });

  it('OTP : envoi (rate limit SQL) puis vérification connecte le compte existant par téléphone', async () => {
    const send = await app.inject({ method: 'POST', url: '/api/auth/otp/send', payload: { phoneNumber: phone } });
    expect(send.statusCode).toBe(200);
    expect(app.get(FakeOtpProvider).sent.at(-1)?.phone).toBe(phone);
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { phoneNumber: phone, code: '000000' } });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { phoneNumber: phone, code: FakeOtpProvider.CODE } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.id).toBe(userId);
    expect(ok.json().isNewUser).toBe(false);
    expect(ok.json().user.phoneVerified).toBe(true);
  });

  it('OTP : numéro inconnu → nouveau compte + profil créé par trigger', async () => {
    const newPhone = `+2296${String(Date.now()).slice(-7)}`;
    await app.inject({ method: 'POST', url: '/api/auth/otp/send', payload: { phoneNumber: newPhone } });
    const res = await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { phoneNumber: newPhone, code: FakeOtpProvider.CODE } });
    expect(res.statusCode).toBe(200);
    expect(res.json().isNewUser).toBe(true);
    const profile = await db.db.selectFrom('profiles').selectAll().where('id', '=', res.json().user.id).executeTakeFirst();
    expect(profile?.phone).toBe(newPhone);
    await db.runAs({ role: 'service_role' }, (trx) => sql`delete from public.users where phone = ${newPhone}`.execute(trx));
    await sql`delete from public.otp_rate_limits where phone_number = ${newPhone}`.execute(db.db);
    await sql`delete from public.otp_attempts where phone_number = ${newPhone}`.execute(db.db);
  });

  it('POST /api/auth/logout révoque et vide les cookies', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'NouveauMdp#2026' } });
    const { accessToken: at, refreshToken: rt } = login.json();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${at}` }, payload: { refreshToken: rt } });
    expect(res.statusCode).toBe(200);
    const reuse = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: rt } });
    expect(reuse.statusCode).toBe(401);
  });

  it('POST /api/auth/verify-email/resend : réponse neutre et jeton créé seulement pour un compte non vérifié', async () => {
    const countTokens = () => db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('auth_tokens').select((eb) => eb.fn.countAll<string>().as('n')).where('identifier', '=', email).where('kind', '=', 'email_verification').executeTakeFirstOrThrow()).then((r) => Number(r.n));
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify-email/resend', payload: { email: 'pas-un-email' } })).statusCode).toBe(400);
    const unknown = await app.inject({ method: 'POST', url: '/api/auth/verify-email/resend', payload: { email: `inconnu-${unique}@domicares.test` } });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual({ sent: true });
    const original = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('users').select('email_verified_at').where('id', '=', userId).executeTakeFirstOrThrow());
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('users').set({ email_verified_at: new Date() }).where('id', '=', userId).execute());
    const before = await countTokens();
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify-email/resend', payload: { email } })).json()).toEqual({ sent: true });
    expect(await countTokens()).toBe(before);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('users').set({ email_verified_at: null }).where('id', '=', userId).execute());
    expect((await app.inject({ method: 'POST', url: '/api/auth/verify-email/resend', payload: { email } })).json()).toEqual({ sent: true });
    expect(await countTokens()).toBe(before + 1);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('users').set({ email_verified_at: original.email_verified_at }).where('id', '=', userId).execute());
  });

  it('POST /api/auth/password/change : mot de passe actuel exigé, session courante conservée, autres sessions révoquées', async () => {
    const loginAs = async (pwd: string) => (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: pwd } })).json() as { accessToken: string; refreshToken: string };
    const refresh = (refreshToken: string) => app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    const current = await loginAs('NouveauMdp#2026');
    const otherDevice = await loginAs('NouveauMdp#2026');
    const headers = { authorization: `Bearer ${current.accessToken}` };
    expect((await app.inject({ method: 'POST', url: '/api/auth/password/change', payload: { currentPassword: 'NouveauMdp#2026', newPassword: 'ChangeMdp#2026' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/password/change', headers, payload: { currentPassword: 'faux', newPassword: 'ChangeMdp#2026' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/password/change', headers, payload: { currentPassword: 'NouveauMdp#2026', newPassword: 'court' } })).statusCode).toBe(400);
    // Les refus ne révoquent rien.
    const stillValid = await refresh(otherDevice.refreshToken);
    expect(stillValid.statusCode).toBe(200);
    const otherRotated = stillValid.json().refreshToken as string;

    // Client mobile : refresh token dans le corps.
    const changed = await app.inject({ method: 'POST', url: '/api/auth/password/change', headers, payload: { currentPassword: 'NouveauMdp#2026', newPassword: 'ChangeMdp#2026', refreshToken: current.refreshToken } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ changed: true });
    expect((await refresh(otherRotated)).statusCode).toBe(401);
    const kept = await refresh(current.refreshToken);
    expect(kept.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'NouveauMdp#2026' } })).statusCode).toBe(401);

    // Navigateur : refresh token lu dans le cookie httpOnly (chemin /api/auth).
    const browser = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'ChangeMdp#2026' } }));
    const browserRefresh = browser.json().refreshToken as string;
    const another = await loginAs('ChangeMdp#2026');
    const viaCookie = await app.inject({ method: 'POST', url: '/api/auth/password/change', headers: { authorization: `Bearer ${browser.json().accessToken}`, cookie: `refresh_token=${browserRefresh}` }, payload: { currentPassword: 'ChangeMdp#2026', newPassword: 'CookieMdp#2026' } });
    expect(viaCookie.statusCode).toBe(200);
    expect((await refresh(browserRefresh)).statusCode).toBe(200);
    expect((await refresh(another.refreshToken)).statusCode).toBe(401);
    expect((await refresh(kept.json().refreshToken)).statusCode).toBe(401);

    // Sans session identifiable (ni corps ni cookie) : toutes les sessions sont révoquées.
    const last = await loginAs('CookieMdp#2026');
    const blind = await app.inject({ method: 'POST', url: '/api/auth/password/change', headers: { authorization: `Bearer ${last.accessToken}` }, payload: { currentPassword: 'CookieMdp#2026', newPassword: 'ChangeMdp#2026' } });
    expect(blind.statusCode).toBe(200);
    const active = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('refresh_tokens').select('id').where('user_id', '=', userId).where('revoked_at', 'is', null).execute());
    expect(active).toHaveLength(0);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'ChangeMdp#2026' } })).statusCode).toBe(200);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('users').set({ failed_login_attempts: 0, locked_until: null }).where('id', '=', userId).execute());
  });

  it('DELETE /api/auth/sessions révoque toutes les sessions et vide les cookies', async () => {
    const first = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'ChangeMdp#2026' } })).json();
    const second = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'ChangeMdp#2026' } })).json();
    expect((await app.inject({ method: 'DELETE', url: '/api/auth/sessions' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/sessions', headers: { authorization: `Bearer ${first.accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ loggedOut: true });
    expect(String(res.headers['set-cookie'] ?? '')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    for (const rt of [first.refreshToken, second.refreshToken]) {
      expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: rt } })).statusCode).toBe(401);
    }
    const active = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('refresh_tokens').select('id').where('user_id', '=', userId).where('revoked_at', 'is', null).execute());
    expect(active).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Concurrence : rotation d'un autre appareil pendant une révocation globale
  // ---------------------------------------------------------------------------
  describe('rotation concurrente d’un autre appareil pendant une révocation', () => {
    let password = 'ChangeMdp#2026';
    const login = async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect(res.statusCode).toBe(200);
      return res.json() as { accessToken: string; refreshToken: string };
    };
    const within = <T>(promise: Promise<T>, label: string) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} non atteint`)), 5000))]);
    const refresh = (refreshToken: string) => app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });

    /** Attend qu'une connexion PostgreSQL soit bloquée sur un verrou (recouvrement réel des transactions). */
    async function waitForLockWaiter() {
      for (let i = 0; i < 250; i++) {
        const r = await sql<{ n: number }>`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(db.db);
        if (r.rows[0].n > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('aucune transaction en attente de verrou');
    }

    /**
     * La rotation de l'autre appareil est suspendue après l'émission de son nouveau jeton, avant COMMIT.
     * La révocation démarre, se bloque sur un verrou, puis la rotation est libérée : le jeton émis
     * pendant la révocation doit être révoqué lui aussi.
     */
    async function raceRotation(revoke: () => Promise<{ statusCode: number }>) {
      const otherDevice = await login();
      const tokens = app.get(TokensService);
      const original = tokens.issueSession.bind(tokens);
      let release!: () => void;
      let reached!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const paused = new Promise<void>((resolve) => { reached = resolve; });
      const spy = jest.spyOn(tokens, 'issueSession').mockImplementationOnce(async (...args: Parameters<TokensService['issueSession']>) => {
        const session = await original(...args);
        reached();
        await gate;
        return session;
      });
      try {
        const rotating = refresh(otherDevice.refreshToken);
        await within(paused, 'point de suspension de la rotation');
        const revoking = revoke();
        await waitForLockWaiter();
        release();
        const [rotated, revoked] = await Promise.all([rotating, revoking]);
        expect(revoked.statusCode).toBe(200);
        expect(rotated.statusCode).toBe(200);
        expect((await refresh(rotated.json().refreshToken)).statusCode).toBe(401);
      } finally {
        release();
        spy.mockRestore();
      }
    }

    it('changement de mot de passe : le jeton tourné pendant le changement est révoqué, la session courante conservée', async () => {
      const current = await login();
      await raceRotation(async () => {
        const res = await app.inject({ method: 'POST', url: '/api/auth/password/change', headers: { authorization: `Bearer ${current.accessToken}` }, payload: { currentPassword: password, newPassword: 'RaceMdp#2026', refreshToken: current.refreshToken } });
        if (res.statusCode === 200) password = 'RaceMdp#2026';
        return res;
      });
      expect((await refresh(current.refreshToken)).statusCode).toBe(200);
    });

    it('révocation de toutes les sessions : le jeton tourné pendant la révocation est révoqué', async () => {
      const current = await login();
      await raceRotation(() => app.inject({ method: 'DELETE', url: '/api/auth/sessions', headers: { authorization: `Bearer ${current.accessToken}` } }));
    });

    it('réinitialisation du mot de passe : le jeton tourné pendant la réinitialisation est révoqué', async () => {
      const tokens = app.get(TokensService);
      const known = await db.runAs({ role: 'service_role' }, (trx) => tokens.createOneTimeToken(trx, { userId, identifier: email, kind: 'password_reset', ttlSeconds: 60 }));
      await raceRotation(async () => {
        const res = await app.inject({ method: 'POST', url: '/api/auth/password/reset', payload: { token: known, password: 'ResetMdp#2026' } });
        if (res.statusCode === 200) password = 'ResetMdp#2026';
        return res;
      });
    });

    it('changement de mot de passe avec un jeton déjà tourné par un tiers : la session du tiers est révoquée', async () => {
      const victim = await login();
      const stolen = await refresh(victim.refreshToken);
      expect(stolen.statusCode).toBe(200);
      const res = await app.inject({ method: 'POST', url: '/api/auth/password/change', headers: { authorization: `Bearer ${victim.accessToken}` }, payload: { currentPassword: password, newPassword: 'VolMdp#2026', refreshToken: victim.refreshToken } });
      expect(res.statusCode).toBe(200);
      password = 'VolMdp#2026';
      expect((await refresh(stolen.json().refreshToken)).statusCode).toBe(401);
    });
  });
});

