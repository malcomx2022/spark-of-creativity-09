/**
 * DomiCares Academy, lot A2 — règles portées par db/native/140_academy.sql, sur PostgreSQL réel :
 * identifiant externe dérivé, inscription active unique (y compris sous concurrence), bornes,
 * dédoublonnage des événements, cascade à la suppression du compte, updated_at.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql, Transaction } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../src/database/database.service';
import type { DB } from '../src/database/types';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.AKAMBI_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);

/** Code SQLSTATE de l'erreur levée par une promesse (23505 unicité, 23514 contrôle, 23503 clé étrangère). */
async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('Academy — schéma 140_academy.sql (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const userIds: string[] = [];
  const courseId = `course-${tag}`;
  const otherCourseId = `course-b-${tag}`;

  const run = <T>(fn: (trx: Transaction<DB>) => Promise<T>) => db.runAs(SERVICE_CONTEXT, fn);

  async function createUser(key: string): Promise<string> {
    const row = await run((trx) => trx.insertInto('users').values({ email: `academy-${key}-${tag}@domicares.test`, email_verified_at: new Date(), raw_user_meta_data: {}, raw_app_meta_data: {} }).returning('id').executeTakeFirstOrThrow());
    userIds.push(row.id);
    return row.id;
  }

  async function createLearner(userId: string) {
    await run((trx) => trx.insertInto('academy_learners').values({ user_id: userId, external_learner_id: `DC-${userId}`, email: `learner-${userId}@domicares.test` }).execute());
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    db = app.get(DatabaseService);
    const now = new Date();
    await run((trx) => trx.insertInto('academy_courses').values([
      { id: courseId, title: 'Gestes et postures', type: 'E_LEARNING', status: 'PUBLISHED', public_price_amount: 120, public_price_currency: 'EURO', akambi_updated_at: now },
      { id: otherCourseId, title: 'Premiers secours', type: 'PRESENTIEL', status: 'PUBLISHED', akambi_updated_at: now },
    ]).execute());
  });

  afterAll(async () => {
    if (!db) return;
    await run(async (trx) => {
      await sql`delete from public.users where id = any(${userIds}::uuid[])`.execute(trx);
      await trx.deleteFrom('academy_webhook_events').where('event_id', 'like', `%-${tag}`).execute();
      await trx.deleteFrom('academy_courses').where('id', 'in', [courseId, otherCourseId]).execute();
    });
    await app.close();
  });

  it('externalLearnerId : toujours DC- suivi de l’identifiant du compte, unique par compte', async () => {
    const userId = await createUser('ext');
    const other = await createUser('ext-other');
    expect(await sqlState(run((trx) => trx.insertInto('academy_learners').values({ user_id: userId, external_learner_id: `DC-${other}`, email: 'x@domicares.test' }).execute()))).toBe('23514');
    await createLearner(userId);
    const learner = await run((trx) => trx.selectFrom('academy_learners').selectAll().where('user_id', '=', userId).executeTakeFirstOrThrow());
    expect(learner).toMatchObject({ external_learner_id: `DC-${userId}`, link_status: 'pending', akambi_learner_id: null });
    expect(learner.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    // « linked » exige l'identifiant Akambi et l'origine du compte.
    expect(await sqlState(run((trx) => trx.updateTable('academy_learners').set({ link_status: 'linked' }).where('user_id', '=', userId).execute()))).toBe('23514');
    await run((trx) => trx.updateTable('academy_learners').set({ link_status: 'linked', akambi_learner_id: `akl-${tag}`, account_origin: 'EXISTING' }).where('user_id', '=', userId).execute());
    expect(await sqlState(run((trx) => trx.updateTable('academy_learners').set({ account_origin: 'OTHER' as 'CREATED' }).where('user_id', '=', userId).execute()))).toBe('23514');
  });

  it('inscription : une active par formation, même avec deux demandes simultanées ; possible après annulation', async () => {
    const userId = await createUser('enr');
    await createLearner(userId);
    // Recouvrement réel : chaque transaction insère puis attend avant de valider ; la seconde attend le verrou
    // de l'index unique partiel, puis échoue quand la première valide.
    const attempt = () => sqlState(run(async (trx) => {
      await trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: courseId }).execute();
      await sql`select pg_sleep(0.3)`.execute(trx);
    }));
    const started = Date.now();
    const outcomes = await Promise.all([attempt(), attempt()]);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(outcomes.sort()).toEqual(['23505', undefined].sort());
    const rows = await run((trx) => trx.selectFrom('academy_enrollments').selectAll().where('user_id', '=', userId).execute());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'PENDING', progress: 0, akambi_enrollment_id: null });

    await run((trx) => trx.updateTable('academy_enrollments').set({ status: 'CANCELLED', akambi_enrollment_id: `ake-1-${tag}` }).where('id', '=', rows[0].id).execute());
    await run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: courseId }).execute());
    await run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: otherCourseId }).execute());
    expect(await run((trx) => trx.selectFrom('academy_enrollments').select('id').where('user_id', '=', userId).execute())).toHaveLength(3);
  });

  it('inscription : progression 0–100, statut confirmé avec identifiant Akambi, formation et apprenant existants', async () => {
    const userId = await createUser('chk');
    await createLearner(userId);
    const { id } = await run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: courseId }).returning('id').executeTakeFirstOrThrow());
    expect(await sqlState(run((trx) => trx.updateTable('academy_enrollments').set({ progress: 101 }).where('id', '=', id).execute()))).toBe('23514');
    expect(await sqlState(run((trx) => trx.updateTable('academy_enrollments').set({ progress: -1 }).where('id', '=', id).execute()))).toBe('23514');
    expect(await sqlState(run((trx) => trx.updateTable('academy_enrollments').set({ status: 'IN_PROGRESS' }).where('id', '=', id).execute()))).toBe('23514');
    await run((trx) => trx.updateTable('academy_enrollments').set({ status: 'IN_PROGRESS', progress: 100, akambi_enrollment_id: `ake-2-${tag}` }).where('id', '=', id).execute());
    expect(await sqlState(run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: `inconnu-${tag}` }).execute()))).toBe('23503');
    const stranger = await createUser('chk-none');
    expect(await sqlState(run((trx) => trx.insertInto('academy_enrollments').values({ user_id: stranger, course_id: otherCourseId }).execute()))).toBe('23503');
  });

  it('webhooks : un événement n’est enregistré qu’une fois (dédoublonnage sur son identifiant)', async () => {
    const event = { event_id: `evt-${tag}`, event_type: 'progress.updated', event_version: 1, payload: JSON.stringify({ id: `evt-${tag}` }), signed_at: new Date() };
    const first = await run((trx) => trx.insertInto('academy_webhook_events').values(event).onConflict((oc) => oc.column('event_id').doNothing()).returning('id').executeTakeFirst());
    const second = await run((trx) => trx.insertInto('academy_webhook_events').values(event).onConflict((oc) => oc.column('event_id').doNothing()).returning('id').executeTakeFirst());
    expect(first?.id).toBeDefined();
    expect(second).toBeUndefined();
    expect(await sqlState(run((trx) => trx.insertInto('academy_webhook_events').values({ ...event, event_id: `evt-bad-${tag}`, processing_status: 'done' as 'processed' }).execute()))).toBe('23514');
  });

  it('suppression du compte : apprenant, inscriptions et attestation supprimés en cascade ; formation conservée', async () => {
    const userId = await createUser('del');
    await createLearner(userId);
    const { id } = await run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: courseId, status: 'CERTIFIED', progress: 100, akambi_enrollment_id: `ake-3-${tag}` }).returning('id').executeTakeFirstOrThrow());
    await run((trx) => trx.insertInto('academy_certificates').values({ id: `CERT-${tag}`, enrollment_id: id, learner_name: 'Awa Diallo', course_title: 'Gestes et postures', score_correct: 9, score_total: 10, issued_at: new Date(), verification_url: 'https://www.akambiconsulting.com/attestations/x?cle=y' }).execute());
    expect(await sqlState(run((trx) => trx.updateTable('academy_certificates').set({ score_correct: 11 }).where('id', '=', `CERT-${tag}`).execute()))).toBe('23514');

    await run((trx) => sql`delete from public.users where id = ${userId}::uuid`.execute(trx));
    const remaining = await run(async (trx) => ({
      learners: await trx.selectFrom('academy_learners').select('user_id').where('user_id', '=', userId).execute(),
      enrollments: await trx.selectFrom('academy_enrollments').select('id').where('id', '=', id).execute(),
      certificates: await trx.selectFrom('academy_certificates').select('id').where('id', '=', `CERT-${tag}`).execute(),
      course: await trx.selectFrom('academy_courses').select('id').where('id', '=', courseId).execute(),
    }));
    expect(remaining).toEqual({ learners: [], enrollments: [], certificates: [], course: [{ id: courseId }] });
  });

  it('updated_at mis à jour par déclencheur ; curseurs de synchronisation limités aux clés connues', async () => {
    const before = await run((trx) => trx.selectFrom('academy_courses').select('updated_at').where('id', '=', otherCourseId).executeTakeFirstOrThrow());
    await new Promise((resolve) => setTimeout(resolve, 20));
    await run((trx) => trx.updateTable('academy_courses').set({ title: 'Premiers secours (v2)' }).where('id', '=', otherCourseId).execute());
    const after = await run((trx) => trx.selectFrom('academy_courses').select(['updated_at', 'public_price_amount']).where('id', '=', otherCourseId).executeTakeFirstOrThrow());
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(await sqlState(run((trx) => trx.insertInto('academy_sync_state').values({ key: 'learners' as 'courses' }).execute()))).toBe('23514');
    expect(await sqlState(run((trx) => trx.insertInto('academy_courses').values({ id: `bad-${tag}`, title: 'x', type: 'WEBINAIRE' as 'E_LEARNING', status: 'PUBLISHED', akambi_updated_at: new Date() }).execute()))).toBe('23514');
  });
});
