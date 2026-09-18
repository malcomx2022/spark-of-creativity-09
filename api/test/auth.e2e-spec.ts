/**
 * Tests e2e sur une vraie base PostgreSQL native (db/native/schema.native.sql + 120 + 020).
 * Variables : DATABASE_URL (rôle domicares_app). Voir api/README.md.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { FakeOtpProvider } from '../src/notifications/otp.provider';

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
    await db.db.updateTable('users').set({ failed_login_attempts: 0, locked_until: null }).where('id', '=', userId).execute();
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
});
