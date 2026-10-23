/**
 * DomiCares Academy, lot A4 — compte de formation, inscription idempotente et accès au cours, sur PostgreSQL
 * réel avec le client Akambi factice : appartenance, reprise après coupure, demandes simultanées, refus
 * définitifs, comptes Akambi préexistants, lien d'accès non mis en cache.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { AkambiError, FakeAkambiClient, type AkambiCourse } from '../src/academy/akambi.client';
import { createApp } from '../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../src/database/database.service';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';
const previousAcademy = { enabled: process.env.ACADEMY_ENABLED, provider: process.env.AKAMBI_PROVIDER };
process.env.ACADEMY_ENABLED = 'true';
process.env.AKAMBI_PROVIDER = 'fake';

const tag = Date.now().toString(36);
const password = 'Motdepasse#2026';
const email = (key: string) => `academy-enr-${key}-${tag}@domicares.test`;

describe('Academy — inscriptions et accès (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fake: FakeAkambiClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const courses: Record<string, AkambiCourse> = {};

  const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` });
  const enroll = (key: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/academy/enrollments', headers: auth(key), payload });
  const launch = (key: string, id: string) => app.inject({ method: 'POST', url: `/api/academy/enrollments/${id}/launch`, headers: auth(key) });
  const rows = (key: string, courseId?: string) => db.runAs(SERVICE_CONTEXT, (trx) => {
    let q = trx.selectFrom('academy_enrollments').selectAll().where('user_id', '=', userIds[key]);
    if (courseId) q = q.where('course_id', '=', courseId);
    return q.execute();
  });
  const learner = (key: string) => db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_learners').selectAll().where('user_id', '=', userIds[key]).executeTakeFirst());
  const remoteFor = (key: string, courseId: string) => [...fake.enrollments.values()].filter((e) => e.externalLearnerId === `DC-${userIds[key]}` && e.courseId === courseId);

  async function signup(key: string, fullName = `Prénom${key} Nom${key}`) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: email(key), password, fullName } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }

  async function practitioner(key: string, fullName?: string) {
    await signup(key, fullName);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds[key], name: 'Cabinet', specialty: 'Soins', practitioner_type: 'infirmier', kyc_status: 'approved' }).execute());
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fake = app.get(FakeAkambiClient);
    fake.courses.clear();
    for (const key of ['gestes', 'hygiene', 'secours', 'nutrition', 'ergonomie']) courses[key] = fake.seedCourse({ title: `${key} ${tag}` });

    await signup('admin');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'super_admin' }).execute());
    expect((await app.inject({ method: 'POST', url: '/api/admin/jobs/academy.catalog.sync/run', headers: auth('admin'), payload: {} })).statusCode).toBe(200);

    await practitioner('nurse', 'Awa Diallo');
    await practitioner('other');
    await practitioner('kofi');
    fake.existingAccountEmails.add(email('kofi'));
    await practitioner('mono', 'Madonna');
    await practitioner('trainer');
    fake.nonLinkableEmails.add(email('trainer'));
    await signup('patient');
  });

  afterAll(async () => {
    if (db) {
      await db.runAs(SERVICE_CONTEXT, async (trx) => {
        const ids = Object.values(userIds);
        await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
        await trx.deleteFrom('academy_courses').where('id', 'in', Object.values(courses).map((c) => c.id)).execute();
      });
    }
    await app?.close();
    if (previousAcademy.enabled === undefined) delete process.env.ACADEMY_ENABLED; else process.env.ACADEMY_ENABLED = previousAcademy.enabled;
    if (previousAcademy.provider === undefined) delete process.env.AKAMBI_PROVIDER; else process.env.AKAMBI_PROVIDER = previousAcademy.provider;
  });

  it('refus : non connecté 401, patient 403, corps invalide 400, formation inconnue 404', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/academy/enrollments', payload: { courseId: courses.gestes.id } })).statusCode).toBe(401);
    expect((await enroll('patient', { courseId: courses.gestes.id })).statusCode).toBe(403);
    expect((await enroll('nurse', { courseId: '../x' })).statusCode).toBe(400);
    expect((await enroll('nurse', { courseId: courses.gestes.id, firstName: 'Awa' })).statusCode).toBe(400);
    const unknown = await enroll('nurse', { courseId: 'inconnu' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error).toBe('COURSE_NOT_FOUND');
    expect(await learner('patient')).toBeUndefined();
  });

  it('première inscription : compte de formation créé (nom du profil), 201 ; la seconde rend la même, sans appel à Akambi', async () => {
    const first = await enroll('nurse', { courseId: courses.gestes.id });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ created: true, enrollment: { courseId: courses.gestes.id, courseTitle: `gestes ${tag}`, status: 'ENROLLED', progress: 0, hasCertificate: false } });
    expect(first.json().enrollment.enrolledAt).toEqual(expect.any(String));
    expect(first.json().enrollment).not.toHaveProperty('akambiEnrollmentId');

    expect(await learner('nurse')).toMatchObject({ link_status: 'linked', account_origin: 'CREATED', external_learner_id: `DC-${userIds['nurse']}`, last_error_code: null });
    expect(fake.learners.get(`DC-${userIds['nurse']}`)).toMatchObject({ firstName: 'Awa', lastName: 'Diallo', email: email('nurse') });

    const spy = jest.spyOn(fake, 'createEnrollment');
    const again = await enroll('nurse', { courseId: courses.gestes.id });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, enrollment: { id: first.json().enrollment.id } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(remoteFor('nurse', courses.gestes.id)).toHaveLength(1);
  });

  it('deux demandes simultanées : une seule inscription locale et une seule chez Akambi', async () => {
    const [a, b] = await Promise.all([enroll('nurse', { courseId: courses.hygiene.id }), enroll('nurse', { courseId: courses.hygiene.id })]);
    expect([a.statusCode, b.statusCode].every((s) => s === 200 || s === 201)).toBe(true);
    expect(a.json().enrollment.id).toBe(b.json().enrollment.id);
    expect(await rows('nurse', courses.hygiene.id)).toHaveLength(1);
    expect(remoteFor('nurse', courses.hygiene.id)).toHaveLength(1);
  });

  it('coupure réseau : 502 sans message Akambi, ligne en attente, reprise avec la même clé sans doublon', async () => {
    const spy = jest.spyOn(fake, 'createEnrollment').mockRejectedValueOnce(new AkambiError('Délai pour awa@example.com', 504, 'TIMEOUT'));
    const failed = await enroll('nurse', { courseId: courses.secours.id });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toBe('AKAMBI_UNAVAILABLE');
    expect(failed.body).not.toContain('awa@example.com');
    expect(await rows('nurse', courses.secours.id)).toMatchObject([{ status: 'PENDING', last_error_code: 'TIMEOUT', akambi_enrollment_id: null }]);

    const retried = await enroll('nurse', { courseId: courses.secours.id });
    expect(retried.statusCode).toBe(201);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][1]).toBe(spy.mock.calls[1][1]);
    spy.mockRestore();
    expect(await rows('nurse', courses.secours.id)).toMatchObject([{ status: 'ENROLLED', last_error_code: null }]);
    expect(remoteFor('nurse', courses.secours.id)).toHaveLength(1);
  });

  it('refus définitif (inscrit hors partenariat) : 409 codé, aucune ligne locale conservée', async () => {
    fake.outsideEnrollments.add(`${email('nurse')}|${courses.nutrition.id}`);
    const res = await enroll('nurse', { courseId: courses.nutrition.id });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'ENROLLMENT_EXISTS_OUTSIDE_PARTNER' });
    expect(await rows('nurse', courses.nutrition.id)).toEqual([]);
    fake.outsideEnrollments.clear();
    expect((await enroll('nurse', { courseId: courses.nutrition.id })).statusCode).toBe(201);
  });

  it('nom d’un seul mot : 400 tant que prénom et nom ne sont pas fournis, puis transmis tels quels', async () => {
    const missing = await enroll('mono', { courseId: courses.gestes.id });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toBe('LEARNER_NAME_REQUIRED');
    expect(await rows('mono')).toEqual([]);
    expect((await enroll('mono', { courseId: courses.gestes.id, firstName: 'Madonna', lastName: 'Ciccone' })).statusCode).toBe(201);
    expect(fake.learners.get(`DC-${userIds['mono']}`)).toMatchObject({ firstName: 'Madonna', lastName: 'Ciccone' });
  });

  it('compte formateur Akambi : 409 ACCOUNT_NOT_LINKABLE, compte de formation en échec, aucune inscription', async () => {
    const res = await enroll('trainer', { courseId: courses.gestes.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('ACCOUNT_NOT_LINKABLE');
    expect(await learner('trainer')).toMatchObject({ link_status: 'failed', last_error_code: 'ACCOUNT_NOT_LINKABLE', akambi_learner_id: null });
    expect(await rows('trainer')).toEqual([]);
  });

  it('clé d’idempotence déjà employée avec un autre corps : renouvelée une fois, compte rattaché', async () => {
    await signup('rotate');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds['rotate'], name: 'Cabinet', specialty: 'Soins', practitioner_type: 'infirmier', kyc_status: 'approved' }).execute());
    const spy = jest.spyOn(fake, 'upsertLearner').mockRejectedValueOnce(new AkambiError('Clé réutilisée', 422, 'IDEMPOTENCY_KEY_REUSED'));
    expect((await enroll('rotate', { courseId: courses.gestes.id })).statusCode).toBe(201);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][1]).not.toBe(spy.mock.calls[1][1]);
    expect((await learner('rotate'))?.idempotency_key).toBe(spy.mock.calls[1][1]);
    spy.mockRestore();
  });

  it('accès : lien SSO non mis en cache pour la bonne personne et la bonne formation ; compte préexistant : connexion Akambi', async () => {
    const [mine] = await rows('nurse', courses.gestes.id);
    const res = await launch('nurse', mine.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ mode: 'SSO', url: expect.stringContaining('token='), expiresAt: expect.any(String) });
    expect(fake.launches.at(-1)).toMatchObject({ externalLearnerId: `DC-${userIds['nurse']}`, courseId: courses.gestes.id });

    const kofi = await enroll('kofi', { courseId: courses.ergonomie.id });
    expect(kofi.statusCode).toBe(201);
    expect(await learner('kofi')).toMatchObject({ account_origin: 'EXISTING' });
    expect((await launch('kofi', kofi.json().enrollment.id)).json()).toMatchObject({ mode: 'LOGIN_REQUIRED', expiresAt: null });
  });

  it('accès refusé : inscription d’un autre praticien, en attente, inconnue (404) ; identifiant invalide (400)', async () => {
    const [mine] = await rows('nurse', courses.gestes.id);
    const before = fake.launches.length;
    expect((await launch('other', mine.id)).statusCode).toBe(404);
    expect((await launch('patient', mine.id)).statusCode).toBe(403);
    expect((await launch('nurse', '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await launch('nurse', 'pas-un-uuid')).statusCode).toBe(400);

    const spy = jest.spyOn(fake, 'createEnrollment').mockRejectedValueOnce(new AkambiError('x', 500, 'INTERNAL_ERROR'));
    expect((await enroll('other', { courseId: courses.gestes.id })).statusCode).toBe(502);
    spy.mockRestore();
    const [pending] = await rows('other', courses.gestes.id);
    expect(pending.status).toBe('PENDING');
    expect((await launch('other', pending.id)).statusCode).toBe(404);
    expect(fake.launches.length).toBe(before);
  });

  it('mes inscriptions : seulement les miennes, avec le titre de la formation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/academy/enrollments', headers: auth('nurse') });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ courseId: string; courseTitle: string; status: string }>;
    expect(list.map((e) => e.courseId).sort()).toEqual([courses.gestes.id, courses.hygiene.id, courses.secours.id, courses.nutrition.id].sort());
    expect(list.every((e) => e.status === 'ENROLLED' && e.courseTitle.endsWith(tag))).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/academy/enrollments', headers: auth('patient') })).statusCode).toBe(403);
  });
});
