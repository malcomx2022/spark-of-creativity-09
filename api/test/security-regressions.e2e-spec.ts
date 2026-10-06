import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../src/database/database.service';
import { TokensService } from '../src/auth/tokens.service';
import { FakeStorageProvider } from '../src/storage/storage.provider';
import { sql } from 'kysely';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL ??= 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

describe('Security regressions (real PostgreSQL)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let tokens: TokensService;
  let storage: FakeStorageProvider;
  const users: string[] = [];
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'Security-test#2026';
  type Session = { accessToken: string; refreshToken: string; user: { id: string } };
  let patient: Session;
  let practitioner: Session;
  let other: Session;
  let practitionerId: string;
  const auth = (s: Session) => ({ authorization: `Bearer ${s.accessToken}` });
  async function signup(name: string, phone?: string): Promise<Session> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `${name}-${tag}@domicares.test`, password, fullName: `Security ${name}`, phone } });
    expect(res.statusCode).toBe(201);
    const session = { ...res.json().session, user: res.json().user } as Session;
    users.push(session.user.id);
    return session;
  }
  async function appointment(status: 'confirmed' | 'awaiting_confirmation') {
    return db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('appointments').values({
      patient_id: patient.user.id, patient_name: 'Security patient', practitioner_id: practitionerId,
      practitioner_name: 'Security doc', specialty: 'Généraliste', date: '2099-01-01', time: '09:00',
      address: 'Cotonou', reason: 'Test', status, internal_notes: 'PRIVATE_SENTINEL',
    }).returning('id').executeTakeFirstOrThrow());
  }
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    tokens = app.get(TokensService);
    storage = app.get(FakeStorageProvider);
    patient = await signup('patient');
    practitioner = await signup('doc');
    other = await signup('other');
    practitionerId = (await db.db.insertInto('practitioners').values({ user_id: practitioner.user.id, name: 'Security doc', specialty: 'Généraliste' }).returning('id').executeTakeFirstOrThrow()).id;
  });
  afterAll(async () => {
    if (db) await db.runAs(SERVICE_CONTEXT, async (trx) => {
      await sql`delete from file_access_logs where user_id = any(${users}::uuid[])`.execute(trx);
      await sql`delete from files where user_id = any(${users}::uuid[])`.execute(trx);
      await sql`delete from appointments where patient_id = any(${users}::text[])`.execute(trx);
      await sql`delete from practitioners where user_id = any(${users}::uuid[])`.execute(trx);
      await sql`delete from users where id = any(${users}::uuid[])`.execute(trx);
    });
    await app?.close();
  });

  it('limits password login attempts per IP, including unknown accounts', async () => {
    for (let i = 0; i < 60; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '192.0.2.10', payload: { email: 'unknown@audit.invalid', password: 'Wrong-password#2026' } });
      expect(res.statusCode).toBe(401);
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '192.0.2.10', payload: { email: 'unknown@audit.invalid', password: 'Wrong-password#2026' } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts every overlapping failed password login and locks the account', async () => {
    const session = await signup('login-race');
    const results = await Promise.all(Array.from({ length: 8 }, () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `login-race-${tag}@domicares.test`, password: 'Wrong-password#2026' } })));
    expect(results.every(r => [401, 423].includes(r.statusCode))).toBe(true);
    const account = await db.runAs(SERVICE_CONTEXT, trx => trx.selectFrom('users').select(['failed_login_attempts', 'locked_until']).where('id', '=', session.user.id).executeTakeFirstOrThrow());
    expect(account.failed_login_attempts).toBe(results.filter(r => r.statusCode === 401).length);
    expect(account.failed_login_attempts).toBeGreaterThanOrEqual(5);
    expect(account.locked_until!.getTime()).toBeGreaterThan(Date.now());
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `login-race-${tag}@domicares.test`, password } });
    expect(blocked.statusCode).toBe(423);
  });

  it('masks notes in list/detail/confirm/cancel/export while preserving practitioner access', async () => {
    const a = await appointment('awaiting_confirmation');
    const b = await appointment('confirmed');
    for (const url of ['/api/appointments', `/api/appointments/${a.id}`, '/api/medical/export']) {
      const res = await app.inject({ method: 'GET', url, headers: auth(patient) });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('PRIVATE_SENTINEL');
    }
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${a.id}`, headers: auth(practitioner) })).json().internal_notes).toBe('PRIVATE_SENTINEL');
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${a.id}`, headers: auth(other) })).statusCode).toBe(403);
    for (const [id, action] of [[a.id, 'confirm'], [b.id, 'cancel']]) {
      const res = await app.inject({ method: 'POST', url: `/api/appointments/${id}/${action}`, headers: auth(patient), payload: {} });
      expect(res.statusCode).toBe(200);
      expect(res.json().internal_notes).toBeNull();
    }
  });

  it.each(['banned_until', 'deleted_at'] as const)('refuses %s accounts on OTP, refresh, password and protected/optional routes', async (column) => {
    const phone = `+2299${String(Date.now()).slice(-7)}`;
    const session = await signup(column, phone);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('users').set({ [column]: new Date(column === 'banned_until' ? Date.now() + 3600_000 : Date.now()) }).where('id', '=', session.user.id).execute());
    const expected = column === 'banned_until' ? 403 : 401;
    const requests = [
      { method: 'POST' as const, url: '/api/auth/otp/verify', payload: { phoneNumber: phone, code: '123456' } },
      { method: 'POST' as const, url: '/api/auth/refresh', payload: { refreshToken: session.refreshToken } },
      { method: 'GET' as const, url: '/api/auth/me', headers: auth(session) },
      { method: 'GET' as const, url: '/api/practitioners', headers: auth(session) },
    ];
    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(expected);
      expect(res.cookies).toHaveLength(0);
    }
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${column}-${tag}@domicares.test`, password } });
    expect(login.statusCode).toBe(expected);
    expect(await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('refresh_tokens').select('id').where('user_id', '=', session.user.id).execute())).toHaveLength(1);
  });

  it('serializes concurrent refreshes and commits family revocation', async () => {
    const session = await signup('rotation');
    const refresh = () => app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: session.refreshToken } });
    const res = await Promise.all([refresh(), refresh()]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const live = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('refresh_tokens').selectAll().where('user_id', '=', session.user.id).where('revoked_at', 'is', null).execute());
    expect(live).toHaveLength(0);
    const success = res.find((r) => r.statusCode === 200)!;
    expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: success.json().refreshToken } })).statusCode).toBe(401);
  });

  it.each(['email_verification', 'password_reset'] as const)('consumes %s once under concurrent requests', async (kind) => {
    const token = await db.runAs(SERVICE_CONTEXT, (trx) => tokens.createOneTimeToken(trx, { userId: patient.user.id, identifier: `${kind}-${tag}`, kind, ttlSeconds: 60 }));
    const url = kind === 'email_verification' ? '/api/auth/verify-email' : '/api/auth/password/reset';
    const payload = { token, password };
    const res = await Promise.all([app.inject({ method: 'POST', url, payload }), app.inject({ method: 'POST', url, payload })]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it('validates pending bytes, publishes an immutable file and denies quarantine downloads', async () => {
    const body = Buffer.from('%PDF-1.4\nsecurity');
    const upload = await app.inject({ method: 'POST', url: '/api/files/upload-url', headers: auth(patient), payload: { fileName: 'security.pdf', fileSize: body.length, contentType: 'application/pdf', folder: 'documents' } });
    expect(upload.statusCode).toBe(200);
    const { filePath } = upload.json();
    const key = filePath.slice('documents/'.length);
    await storage.putObject('documents', `_pending/${key}`, body, 'application/pdf');
    const payload = { filePath, fileName: 'security.pdf', fileSize: body.length, fileType: 'application/pdf' };
    const registered = await app.inject({ method: 'POST', url: '/api/files', headers: auth(patient), payload });
    expect(registered.statusCode).toBe(201);
    expect(Number(registered.json().file_size)).toBe(body.length);
    await storage.putObject('documents', `_pending/${key}`, Buffer.from('%PDF-replaced'), 'application/pdf');
    expect((await app.inject({ method: 'POST', url: '/api/files', headers: auth(patient), payload })).statusCode).toBe(201);
    expect(storage.objects.get(`documents/${key}`)?.body).toEqual(body);
    expect((await app.inject({ method: 'GET', url: `/api/files/url?filePath=documents/_pending/${key}`, headers: auth(patient) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/files', headers: auth(other), payload })).statusCode).toBe(403);
  });

  it.each(['missing', 'size', 'mime'])('rejects %s uploads without publishing an object', async (failure) => {
    const upload = await app.inject({ method: 'POST', url: '/api/files/upload-url', headers: auth(patient), payload: { fileName: `${failure}.pdf`, fileSize: 10, contentType: 'application/pdf' } });
    const { filePath } = upload.json();
    const key = filePath.slice('documents/'.length);
    if (failure !== 'missing') await storage.putObject('documents', `_pending/${key}`, Buffer.from(failure === 'mime' ? 'not a pdf!' : '%PDF-too large'), 'application/pdf');
    const res = await app.inject({ method: 'POST', url: '/api/files', headers: auth(patient), payload: { filePath, fileName: 'test.pdf', fileSize: 10, fileType: 'application/pdf' } });
    expect(res.statusCode).toBe(400);
    expect(storage.objects.has(`documents/${key}`)).toBe(false);
  });

  it('accepts a valid base64 file larger than the former 1 MiB JSON limit', async () => {
    const body = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024)]);
    const res = await app.inject({ method: 'POST', url: '/api/files/upload', headers: auth(patient), payload: { fileName: 'large.pdf', fileContent: body.toString('base64'), contentType: 'application/pdf' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().filePath).toMatch(/^documents\//);
  });
});
