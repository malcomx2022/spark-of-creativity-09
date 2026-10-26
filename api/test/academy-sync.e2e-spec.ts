/**
 * DomiCares Academy, lot A5 — webhooks Akambi signés et rapprochement par updatedSince, sur PostgreSQL réel avec le
 * client factice : signature et rotation, doublons, désordre, achèvement et attestation, annulation, événement
 * précédant la réponse d'inscription, contenus illisibles, rapprochement sans webhook, annulation découverte à l'accès.
 */
import { createHmac } from 'crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { AkambiError, FakeAkambiClient, type AkambiCourse, type AkambiEnrollment } from '../src/academy/akambi.client';
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
const saved = { enabled: process.env.ACADEMY_ENABLED, provider: process.env.AKAMBI_PROVIDER, secrets: process.env.AKAMBI_WEBHOOK_SECRETS };
process.env.ACADEMY_ENABLED = 'true';
process.env.AKAMBI_PROVIDER = 'fake';
process.env.AKAMBI_WEBHOOK_SECRETS = 'whsec_ancien_test, whsec_nouveau_test';

const tag = Date.now().toString(36);
const password = 'Motdepasse#2026';

describe('Academy — webhooks et rapprochement (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fake: FakeAkambiClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const courses: Record<string, AkambiCourse> = {};
  let eventSeq = 0;

  const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` });
  const now = () => Math.floor(Date.now() / 1000);
  const sign = (raw: string, secret = 'whsec_nouveau_test', t = now()) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
  const event = (type: string, data: Record<string, unknown>, id = `evt-${tag}-${++eventSeq}`) => ({ id, type, version: 1, createdAt: new Date().toISOString(), partnerCode: 'DOMICARES', data });
  const post = (raw: string, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: '/api/webhooks/akambi', headers: { 'content-type': 'application/json', ...headers }, payload: raw });
  const send = (body: ReturnType<typeof event>, secret?: string) => {
    const raw = JSON.stringify(body);
    return post(raw, { 'x-akambi-signature': sign(raw, secret), 'x-akambi-event-id': body.id });
  };
  const local = (courseKey: string) => db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_enrollments').selectAll().where('user_id', '=', userIds['nurse']).where('course_id', '=', courses[courseKey].id).orderBy('created_at', 'desc').executeTakeFirstOrThrow());
  const eventRow = (id: string) => db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_webhook_events').selectAll().where('event_id', '=', id).executeTakeFirstOrThrow());
  const enroll = (courseKey: string) => app.inject({ method: 'POST', url: '/api/academy/enrollments', headers: auth('nurse'), payload: { courseId: courses[courseKey].id } });
  const runJob = (name: string) => app.inject({ method: 'POST', url: `/api/admin/jobs/${name}/run`, headers: auth('admin'), payload: {} });

  async function signup(key: string) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `academy-sync-${key}-${tag}@domicares.test`, password, fullName: `Prénom${key} Nom${key}` } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fake = app.get(FakeAkambiClient);
    fake.courses.clear();
    for (const key of ['progress', 'cancel', 'early', 'reconcile', 'gone', 'stale', 'listed']) courses[key] = fake.seedCourse({ title: `${key} ${tag}` });
    await signup('admin');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'super_admin' }).execute());
    expect((await runJob('academy.catalog.sync')).statusCode).toBe(200);
    await signup('nurse');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds['nurse'], name: 'Cabinet', specialty: 'Soins', practitioner_type: 'infirmier', kyc_status: 'approved' }).execute());
    for (const key of ['progress', 'cancel', 'reconcile', 'gone', 'listed']) expect((await enroll(key)).statusCode).toBe(201);
  });

  afterAll(async () => {
    if (db) {
      await db.runAs(SERVICE_CONTEXT, async (trx) => {
        await sql`delete from public.users where id = any(${Object.values(userIds)}::uuid[])`.execute(trx);
        await trx.deleteFrom('academy_courses').where('id', 'in', Object.values(courses).map((c) => c.id)).execute();
        await trx.deleteFrom('academy_webhook_events').where('event_id', 'like', `evt-${tag}-%`).execute();
      });
    }
    await app?.close();
    for (const [key, value] of [['ACADEMY_ENABLED', saved.enabled], ['AKAMBI_PROVIDER', saved.provider], ['AKAMBI_WEBHOOK_SECRETS', saved.secrets]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('signature : absente, mauvais secret, expirée, corps modifié refusés (401) ; ancien et nouveau secret acceptés', async () => {
    const body = event('webhook.test', {});
    const raw = JSON.stringify(body);
    expect((await post(raw)).statusCode).toBe(401);
    expect((await post(raw, { 'x-akambi-signature': sign(raw, 'whsec_inconnu') })).statusCode).toBe(401);
    expect((await post(raw, { 'x-akambi-signature': sign(raw, 'whsec_nouveau_test', now() - 400) })).statusCode).toBe(401);
    expect((await post(raw.replace('webhook.test', 'progress.updated'), { 'x-akambi-signature': sign(raw) })).statusCode).toBe(401);
    expect((await send(body, 'whsec_ancien_test')).json()).toEqual({ received: true, status: 'ignored' });
    expect((await send(event('webhook.test', {}), 'whsec_nouveau_test')).statusCode).toBe(200);
    expect(await eventRow(body.id)).toMatchObject({ event_type: 'webhook.test', processing_status: 'ignored', error_message: 'événement de test' });
  });

  it('requête signée mais incohérente : identifiant d’en-tête différent ou JSON invalide (400), rien n’est enregistré', async () => {
    const body = event('webhook.test', {});
    const raw = JSON.stringify(body);
    expect((await post(raw, { 'x-akambi-signature': sign(raw), 'x-akambi-event-id': 'autre' })).statusCode).toBe(400);
    expect((await post('pas du json', { 'x-akambi-signature': sign('pas du json') })).statusCode).toBe(400);
    expect((await post('{"type":"x"}', { 'x-akambi-signature': sign('{"type":"x"}') })).statusCode).toBe(400);
    expect(await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_webhook_events').select('id').where('event_id', '=', body.id).execute())).toEqual([]);
  });

  it('progression : appliquée, doublon sans effet, événement plus ancien ignoré (aucune régression)', async () => {
    const { akambi_enrollment_id: akId } = await local('progress');
    const older = fake.setProgress(akId as string, 25);
    const newer = fake.setProgress(akId as string, 50);
    const body = event('progress.updated', { enrollment: newer });
    expect((await send(body)).json()).toEqual({ received: true, status: 'processed' });
    expect(await local('progress')).toMatchObject({ status: 'IN_PROGRESS', progress: 50 });
    expect((await send(body)).json()).toEqual({ received: true, duplicate: true });

    const late = event('progress.updated', { enrollment: older });
    expect((await send(late)).json()).toEqual({ received: true, status: 'ignored' });
    expect(await local('progress')).toMatchObject({ progress: 50 });
    expect(await eventRow(late.id)).toMatchObject({ processing_status: 'ignored', error_message: 'état plus ancien que la version détenue' });

    const list = (await app.inject({ method: 'GET', url: '/api/academy/enrollments', headers: auth('nurse') })).json() as Array<{ courseId: string; progress: number; startedAt: string | null }>;
    expect(list.find((e) => e.courseId === courses.progress.id)).toMatchObject({ progress: 50, startedAt: expect.any(String) });
  });

  it('achèvement puis attestation : statut CERTIFIED et métadonnées enregistrées, sans lien de téléchargement', async () => {
    const { akambi_enrollment_id: akId, id } = await local('progress');
    expect((await send(event('course.completed', { enrollment: fake.setProgress(akId as string, 100) }))).json().status).toBe('processed');
    expect(await local('progress')).toMatchObject({ status: 'COMPLETED', progress: 100, completed_at: expect.any(Date) });

    const certificate = fake.issueCertificate(akId as string);
    const enrollment = await fake.getEnrollment(akId as string);
    expect((await send(event('certificate.issued', { enrollment, certificate: { ...certificate, downloadUrl: undefined } }))).json().status).toBe('processed');
    expect(await local('progress')).toMatchObject({ status: 'CERTIFIED', certificate_id: certificate.id });
    const stored = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_certificates').selectAll().where('enrollment_id', '=', id).executeTakeFirstOrThrow());
    expect(stored).toMatchObject({ id: certificate.id, learner_name: 'Prénomnurse Nomnurse', score_correct: 9, score_total: 10, verification_url: certificate.verificationUrl });
    expect(Object.keys(stored)).not.toContain('download_url');

    // Praticien prévenu une fois par transition (terminée, puis attestée), vers l'onglet Academy ; pas sur un doublon.
    const notifications = () => db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('notifications').select(['title', 'message', 'type', 'link']).where('user_id', '=', userIds['nurse']).where('type', '=', 'academy').orderBy('created_at').execute());
    expect(await notifications()).toEqual([
      { title: 'Formation terminée', message: expect.stringContaining(`progress ${tag}`), type: 'academy', link: '/dashboard/practitioner?tab=academy' },
      { title: 'Attestation disponible', message: expect.stringContaining(`progress ${tag}`), type: 'academy', link: '/dashboard/practitioner?tab=academy' },
    ]);
    expect((await send(event('progress.updated', { enrollment }))).json().status).toBe('processed');
    expect(await notifications()).toHaveLength(2);
  });

  it('annulation : inscription close localement, nouvelle inscription possible ensuite', async () => {
    const { akambi_enrollment_id: akId } = await local('cancel');
    const cancelled = await fake.cancelEnrollment(akId as string);
    expect((await send(event('enrollment.cancelled', { enrollment: cancelled }))).json().status).toBe('processed');
    expect(await local('cancel')).toMatchObject({ status: 'CANCELLED' });
    const again = await enroll('cancel');
    expect(again.statusCode).toBe(201);
    expect((await local('cancel')).akambi_enrollment_id).not.toBe(akId);
  });

  it('enrollment.created reçu avant la réponse d’inscription : rattaché à la demande en attente, sans doublon', async () => {
    const original = fake.createEnrollment.bind(fake);
    let created: AkambiEnrollment | undefined;
    const spy = jest.spyOn(fake, 'createEnrollment').mockImplementationOnce(async (input, key) => {
      created = (await original(input, key)).resource;
      throw new AkambiError('coupure', 504, 'TIMEOUT');
    });
    expect((await enroll('early')).statusCode).toBe(502);
    spy.mockRestore();
    expect(await local('early')).toMatchObject({ status: 'PENDING', akambi_enrollment_id: null });

    expect((await send(event('enrollment.created', { enrollment: created }))).json().status).toBe('processed');
    expect(await local('early')).toMatchObject({ status: 'ENROLLED', akambi_enrollment_id: created?.id });
    const again = await enroll('early');
    expect(again.statusCode).toBe(200);
    expect(await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_enrollments').select('id').where('user_id', '=', userIds['nurse']).where('course_id', '=', courses.early.id).execute())).toHaveLength(1);
  });

  it('ancienne inscription annulée inconnue localement : jamais rattachée à une nouvelle demande en attente', async () => {
    const spy = jest.spyOn(fake, 'createEnrollment').mockRejectedValueOnce(new AkambiError('coupure', 504, 'TIMEOUT'));
    expect((await enroll('stale')).statusCode).toBe(502);
    spy.mockRestore();
    expect(await local('stale')).toMatchObject({ status: 'PENDING', akambi_enrollment_id: null });
    const at = new Date().toISOString();
    const old = { id: `ancienne-${tag}`, externalLearnerId: `DC-${userIds['nurse']}`, learnerId: 'learner', courseId: courses.stale.id, courseTitle: courses.stale.title, status: 'CANCELLED', progress: 0, enrolledAt: at, startedAt: null, lastActivityAt: null, completedAt: null, certificateId: null, updatedAt: at };
    const cancelled = event('enrollment.cancelled', { enrollment: old });
    expect((await send(cancelled)).json().status).toBe('ignored');
    expect(await local('stale')).toMatchObject({ status: 'PENDING', akambi_enrollment_id: null });
  });

  it('contenus non applicables : inscription inconnue ignorée, type inconnu ignoré, inscription illisible en échec (acquittés)', async () => {
    const { akambi_enrollment_id: akId } = await local('reconcile');
    const remote = await fake.getEnrollment(akId as string);
    const unknown = event('progress.updated', { enrollment: { ...remote, id: `inconnue-${tag}`, externalLearnerId: 'DC-00000000-0000-4000-8000-000000000000' } });
    expect((await send(unknown)).json().status).toBe('ignored');
    expect((await eventRow(unknown.id)).error_message).toBe('inscription inconnue de DomiCares');
    expect((await send(event('learner.updated', {}))).json().status).toBe('ignored');
    const invalid = event('progress.updated', { enrollment: { ...remote, progress: 150 } });
    expect((await send(invalid)).json()).toEqual({ received: true, status: 'failed' });
    expect((await eventRow(invalid.id)).error_message).toContain('progress');
    expect(await local('reconcile')).toMatchObject({ progress: 0 });
  });

  it('rapprochement sans webhook : progression et attestation récupérées, curseur avancé, second passage sans changement', async () => {
    const { akambi_enrollment_id: akId, id } = await local('reconcile');
    fake.setProgress(akId as string, 40);
    const first = await runJob('academy.enrollments.reconcile');
    expect(first.statusCode).toBe(200);
    expect(first.json().result).toMatchObject({ invalid: 0 });
    expect(first.json().result.applied).toBeGreaterThanOrEqual(1);
    expect(await local('reconcile')).toMatchObject({ status: 'IN_PROGRESS', progress: 40 });

    const certificate = fake.issueCertificate(akId as string);
    const second = (await runJob('academy.enrollments.reconcile')).json().result;
    expect(second).toMatchObject({ applied: 1, certificates: 1, invalid: 0 });
    expect(await local('reconcile')).toMatchObject({ status: 'CERTIFIED', certificate_id: certificate.id });
    expect(await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_certificates').select('id').where('enrollment_id', '=', id).execute())).toEqual([{ id: certificate.id }]);

    expect((await runJob('academy.enrollments.reconcile')).json().result).toMatchObject({ fetched: 0, applied: 0 });
    const state = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_sync_state').selectAll().where('key', '=', 'enrollments').executeTakeFirstOrThrow());
    expect(state).toMatchObject({ last_error: null });
    expect(state.cursor?.toISOString()).toBe((await fake.getEnrollment(akId as string)).updatedAt);
  });

  it('rapprochement : erreur Akambi en 502 sans son message, code seul enregistré', async () => {
    const spy = jest.spyOn(fake, 'listEnrollments').mockRejectedValueOnce(new AkambiError('Erreur pour prenomnurse@example.com', 500, 'INTERNAL_ERROR'));
    const res = await runJob('academy.enrollments.reconcile');
    spy.mockRestore();
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('example.com');
    expect((await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_sync_state').select('last_error').where('key', '=', 'enrollments').executeTakeFirstOrThrow())).last_error).toBe('Akambi 500 INTERNAL_ERROR');
  });

  it('accès à une inscription retirée chez Akambi sans événement reçu : 404 et inscription close localement', async () => {
    const { akambi_enrollment_id: akId, id } = await local('gone');
    await fake.cancelEnrollment(akId as string);
    const res = await app.inject({ method: 'POST', url: `/api/academy/enrollments/${id}/launch`, headers: auth('nurse') });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('ENROLLMENT_NOT_FOUND');
    expect(await local('gone')).toMatchObject({ status: 'CANCELLED', last_error_code: 'ENROLLMENT_NOT_FOUND' });
  });

  it('rapprochement : inscription annulée renvoyée par la liste (évolution annoncée par Akambi) close localement', async () => {
    const { akambi_enrollment_id: akId } = await local('listed');
    // Le client factice supprime l'inscription comme Akambi aujourd'hui ; la liste simulée renvoie l'annulation.
    const cancelled = await fake.cancelEnrollment(akId as string);
    const spy = jest.spyOn(fake, 'listEnrollments').mockResolvedValueOnce({ items: [{ ...cancelled, cancelledAt: cancelled.updatedAt } as AkambiEnrollment], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } });
    expect((await runJob('academy.enrollments.reconcile')).statusCode).toBe(200);
    spy.mockRestore();
    expect(await local('listed')).toMatchObject({ status: 'CANCELLED', akambi_enrollment_id: akId });
    expect((await enroll('listed')).statusCode).toBe(201);
  });
});
