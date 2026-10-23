/**
 * DomiCares Academy, lot A6 — attestations côté praticien et supervision administrateur, sur PostgreSQL réel avec le
 * client Akambi factice : propriété des attestations, lien de téléchargement non mis en cache, rôles administrateurs,
 * indicateurs, listes filtrées et paginées, événements sans corps, désinscription journalisée.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { FakeAkambiClient, type AkambiCourse } from '../src/academy/akambi.client';
import { createApp } from '../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../src/database/database.service';
import type { AdminRole } from '../src/common/decorators/roles.decorator';

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
const saved = { enabled: process.env.ACADEMY_ENABLED, provider: process.env.AKAMBI_PROVIDER };
process.env.ACADEMY_ENABLED = 'true';
process.env.AKAMBI_PROVIDER = 'fake';

const tag = Date.now().toString(36);
const password = 'Motdepasse#2026';

describe('Academy — attestations et supervision (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fake: FakeAkambiClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const courses: Record<string, AkambiCourse> = {};
  const enrollmentIds: Record<string, string> = {};

  const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` });
  const call = (key: string, method: 'GET' | 'POST' | 'DELETE', url: string) => app.inject({ method, url, headers: auth(key) });
  const akambiId = (key: string) => db.runAs(SERVICE_CONTEXT, async (trx) => (await trx.selectFrom('academy_enrollments').select('akambi_enrollment_id').where('id', '=', enrollmentIds[key]).executeTakeFirstOrThrow()).akambi_enrollment_id as string);

  async function signup(key: string, fullName = `Prénom${key} Nom${key}`) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `academy-adm-${key}-${tag}@domicares.test`, password, fullName } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function admin(key: string, role: AdminRole) {
    await signup(key);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('user_roles').values({ user_id: userIds[key], role }).execute());
  }
  async function practitioner(key: string, fullName?: string) {
    await signup(key, fullName);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds[key], name: 'Cabinet', specialty: 'Soins', practitioner_type: 'infirmier', kyc_status: 'approved' }).execute());
  }
  async function enroll(userKey: string, courseKey: string) {
    const res = await app.inject({ method: 'POST', url: '/api/academy/enrollments', headers: auth(userKey), payload: { courseId: courses[courseKey].id } });
    expect(res.statusCode).toBe(201);
    enrollmentIds[`${userKey}:${courseKey}`] = res.json().enrollment.id;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fake = app.get(FakeAkambiClient);
    fake.courses.clear();
    for (const key of ['gestes', 'hygiene', 'secours']) courses[key] = fake.seedCourse({ title: `${key} ${tag}` });
    await admin('root', 'super_admin');
    await admin('ops', 'ops');
    await admin('analyst', 'analyst');
    await admin('finance', 'finance');
    expect((await call('root', 'POST', '/api/admin/jobs/academy.catalog.sync/run')).statusCode).toBe(200);
    await practitioner('nurse', `Awa Diallo${tag}`);
    await practitioner('other');
    await signup('patient');
    await enroll('nurse', 'gestes');
    await enroll('nurse', 'hygiene');
    await enroll('nurse', 'secours');
    await enroll('other', 'gestes');
  });

  afterAll(async () => {
    if (db) {
      await db.runAs(SERVICE_CONTEXT, async (trx) => {
        const ids = Object.values(userIds);
        await trx.deleteFrom('admin_audit_logs').where('admin_id', 'in', ids).execute();
        await trx.deleteFrom('academy_webhook_events').where('event_id', 'like', `evt-adm-${tag}-%`).execute();
        await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
        await trx.deleteFrom('academy_courses').where('id', 'in', Object.values(courses).map((c) => c.id)).execute();
      });
    }
    await app?.close();
    for (const [key, value] of [['ACADEMY_ENABLED', saved.enabled], ['AKAMBI_PROVIDER', saved.provider]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('attestation : 404 avant délivrance, métadonnées après rapprochement, lien de téléchargement non mis en cache', async () => {
    const id = enrollmentIds['nurse:gestes'];
    const before = await call('nurse', 'GET', `/api/academy/enrollments/${id}/certificate`);
    expect(before.statusCode).toBe(404);
    expect(before.json().error).toBe('CERTIFICATE_NOT_FOUND');
    expect((await call('nurse', 'POST', `/api/academy/enrollments/${id}/certificate/download`)).statusCode).toBe(404);

    const certificate = fake.issueCertificate(await akambiId('nurse:gestes'), { correctAnswers: 8, totalQuestions: 10 });
    expect((await call('root', 'POST', '/api/admin/jobs/academy.enrollments.reconcile/run')).json().result).toMatchObject({ certificates: 1 });

    const meta = await call('nurse', 'GET', `/api/academy/enrollments/${id}/certificate`);
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toEqual({ id: certificate.id, courseTitle: `gestes ${tag}`, learnerName: `Awa Diallo${tag}`, score: { correctAnswers: 8, totalQuestions: 10 }, completionDate: expect.any(String), issuedAt: expect.any(String), verificationUrl: certificate.verificationUrl });

    const download = await call('nurse', 'POST', `/api/academy/enrollments/${id}/certificate/download`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.json()).toEqual({ url: expect.stringContaining(certificate.id), expiresAt: expect.any(String) });
    expect((await db.runAs(SERVICE_CONTEXT, (trx) => sql<{ n: string }>`select count(*) as n from information_schema.columns where table_name = 'academy_certificates' and column_name like 'download%'`.execute(trx))).rows[0].n).toBe('0');
  });

  it('attestation d’autrui : 404 pour un autre praticien, 403 pour un patient', async () => {
    const id = enrollmentIds['nurse:gestes'];
    expect((await call('other', 'GET', `/api/academy/enrollments/${id}/certificate`)).statusCode).toBe(404);
    expect((await call('other', 'POST', `/api/academy/enrollments/${id}/certificate/download`)).statusCode).toBe(404);
    expect((await call('patient', 'GET', `/api/academy/enrollments/${id}/certificate`)).statusCode).toBe(403);
  });

  it('indicateurs : réservés aux administrateurs, chiffres Akambi et décompte local', async () => {
    for (const key of ['patient', 'nurse', 'finance']) expect((await call(key, 'GET', '/api/admin/academy/reports')).statusCode).toBe(403);
    const res = await call('analyst', 'GET', '/api/admin/academy/reports');
    expect(res.statusCode).toBe(200);
    expect(res.json().akambi).toMatchObject({ totals: { enrollments: 4, certified: 1 } });
    expect(res.json().local.enrollmentsByStatus.CERTIFIED).toBeGreaterThanOrEqual(1);
    expect(res.json().local.learnersByLinkStatus.linked).toBeGreaterThanOrEqual(2);
  });

  it('inscriptions : filtres statut, formation et recherche, pagination sur le même périmètre', async () => {
    const certified = (await call('analyst', 'GET', `/api/admin/academy/enrollments?status=CERTIFIED&search=Diallo${tag}`)).json();
    expect(certified).toMatchObject({ total: 1, items: [{ id: enrollmentIds['nurse:gestes'], learnerName: `Awa Diallo${tag}`, courseTitle: `gestes ${tag}`, status: 'CERTIFIED', hasCertificate: true, linkStatus: 'linked', accountOrigin: 'CREATED' }] });
    const byCourse = (await call('analyst', 'GET', `/api/admin/academy/enrollments?courseId=${courses.gestes.id}`)).json();
    expect(byCourse.total).toBe(2);
    const paged = (await call('analyst', 'GET', `/api/admin/academy/enrollments?search=${tag}&limit=2&page=1`)).json();
    expect(paged).toMatchObject({ total: 4, page: 1, limit: 2 });
    expect(paged.items).toHaveLength(2);
    expect((await call('analyst', 'GET', '/api/admin/academy/enrollments?status=INCONNU')).statusCode).toBe(400);
    expect((await call('analyst', 'GET', '/api/admin/academy/enrollments?search=100%25_x')).json().total).toBe(0);
  });

  it('événements reçus : liste sans corps, décompte par statut ; état des synchronisations', async () => {
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('academy_webhook_events').values({ event_id: `evt-adm-${tag}-1`, event_type: 'progress.updated', payload: JSON.stringify({ secret: 'ne-doit-pas-sortir' }), signed_at: new Date(), processing_status: 'failed', error_message: 'inscription illisible (progress)' }).execute());
    const res = await call('analyst', 'GET', '/api/admin/academy/webhook-events?status=failed&type=progress.updated');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('ne-doit-pas-sortir');
    expect(res.json().items.find((e: { eventId: string }) => e.eventId === `evt-adm-${tag}-1`)).toMatchObject({ type: 'progress.updated', status: 'failed', message: 'inscription illisible (progress)' });
    expect(res.json().counts.failed).toBeGreaterThanOrEqual(1);

    const state = (await call('analyst', 'GET', '/api/admin/academy/sync-state')).json() as Array<{ key: string; lastSuccessAt: string | null }>;
    expect(state.map((s) => s.key)).toEqual(['courses', 'enrollments']);
    expect(state.every((s) => s.lastSuccessAt !== null)).toBe(true);
  });

  it('désinscription : réservée à ops/super_admin, accès retiré chez Akambi, journalisée ; refus codés', async () => {
    const id = enrollmentIds['nurse:hygiene'];
    const remoteId = await akambiId('nurse:hygiene');
    expect((await call('analyst', 'DELETE', `/api/admin/academy/enrollments/${id}`)).statusCode).toBe(403);
    expect((await call('nurse', 'DELETE', `/api/admin/academy/enrollments/${id}`)).statusCode).toBe(403);

    const res = await call('ops', 'DELETE', `/api/admin/academy/enrollments/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: 'CANCELLED' });
    expect(fake.enrollments.has(remoteId)).toBe(false);
    const audit = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('admin_audit_logs').selectAll().where('admin_id', '=', userIds['ops']).where('entity_id', '=', id).executeTakeFirstOrThrow());
    expect(audit).toMatchObject({ action: 'academy_cancel_enrollment', entity_type: 'academy_enrollment' });
    expect((await call('nurse', 'POST', `/api/academy/enrollments/${id}/launch`)).statusCode).toBe(404);

    expect((await call('ops', 'DELETE', `/api/admin/academy/enrollments/${id}`)).json().error).toBe('ALREADY_CANCELLED');
    const certified = await call('root', 'DELETE', `/api/admin/academy/enrollments/${enrollmentIds['nurse:gestes']}`);
    expect(certified.statusCode).toBe(409);
    expect(certified.json().error).toBe('CERTIFICATE_ISSUED');
    expect((await call('ops', 'DELETE', '/api/admin/academy/enrollments/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('désinscription d’une inscription déjà absente chez Akambi : close localement et journalisée', async () => {
    const id = enrollmentIds['nurse:secours'];
    fake.enrollments.delete(await akambiId('nurse:secours'));
    const res = await call('root', 'DELETE', `/api/admin/academy/enrollments/${id}`);
    expect(res.statusCode).toBe(200);
    const row = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_enrollments').select(['status', 'last_error_code']).where('id', '=', id).executeTakeFirstOrThrow());
    expect(row).toEqual({ status: 'CANCELLED', last_error_code: 'ENROLLMENT_NOT_FOUND' });
    const audit = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('admin_audit_logs').select('details').where('entity_id', '=', id).executeTakeFirstOrThrow());
    expect(audit.details).toMatchObject({ akambi_found: false });
  });
});
