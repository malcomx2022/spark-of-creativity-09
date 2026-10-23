/**
 * DomiCares Academy, lot A3 — synchronisation du catalogue Akambi (client factice) et routes de lecture
 * praticien, sur PostgreSQL réel : contrôles d'accès, versions, retrait, formations illisibles, erreur Akambi.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { AkambiError, FakeAkambiClient, type AkambiCourse } from '../src/academy/akambi.client';
import { createApp } from '../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../src/database/database.service';
import type { KycStatus } from '../src/database/types';

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

describe('Academy — catalogue (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fake: FakeAkambiClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const courses: Record<string, AkambiCourse> = {};

  const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` });
  const get = (key: string | null, url: string) => app.inject({ method: 'GET', url, headers: key ? auth(key) : {} });
  const sync = () => app.inject({ method: 'POST', url: '/api/admin/jobs/academy.catalog.sync/run', headers: auth('admin'), payload: {} });
  const ourCourses = (list: Array<{ id: string }>) => list.filter((c) => Object.values(courses).some((o) => o.id === c.id));
  const state = () => db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_sync_state').selectAll().where('key', '=', 'courses').executeTakeFirstOrThrow());

  async function signup(key: string) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `academy-cat-${key}-${tag}@domicares.test`, password, fullName: `User ${key}` } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }

  async function practitioner(key: string, values: { kyc_status?: KycStatus; practitioner_type?: 'infirmier' | 'coach_sportif' } = {}) {
    await signup(key);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds[key], name: `Praticien ${key}`, specialty: 'Soins', practitioner_type: values.practitioner_type ?? 'infirmier', kyc_status: values.kyc_status ?? 'approved' }).execute());
  }

  /** Nouvelle version côté Akambi : date de mise à jour postérieure à celle détenue. */
  function bump(key: string, patch: Partial<AkambiCourse>) {
    courses[key] = { ...courses[key], ...patch, updatedAt: new Date(Date.parse(courses[key].updatedAt) + 60_000).toISOString() };
    fake.courses.set(courses[key].id, courses[key]);
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fake = app.get(FakeAkambiClient);
    // Catalogue factice propre à ce fichier : les formations d'autres suites n'y figurent pas.
    fake.courses.clear();
    courses.gestes = fake.seedCourse({ title: `Gestes et postures ${tag}`, publicPrice: { amount: 120, currency: 'EURO' }, moduleCount: 4, chapterCount: 18, presentationUrl: 'https://www.akambiconsulting.com/courses/gestes' });
    courses.hygiene = fake.seedCourse({ title: `Hygiène ${tag}`, type: 'VISIO_CONFERENCE', category: null });
    courses.archived = fake.seedCourse({ title: `Ancienne formation ${tag}`, status: 'ARCHIVED' });

    await signup('admin');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'super_admin' }).execute());
    await practitioner('nurse');
    await practitioner('pending', { kyc_status: 'pending' });
    await practitioner('coach', { practitioner_type: 'coach_sportif' });
    await practitioner('unverified');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('users').set({ email_verified_at: null }).where('id', '=', userIds['unverified']).execute());
    await signup('patient');
  });

  afterAll(async () => {
    if (db) {
      await db.runAs(SERVICE_CONTEXT, async (trx) => {
        const ids = Object.values(userIds);
        await trx.deleteFrom('academy_courses').where('id', 'in', Object.values(courses).map((c) => c.id)).execute();
        await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
        await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
      });
    }
    await app?.close();
    process.env.ACADEMY_ENABLED = previousAcademy.enabled;
    process.env.AKAMBI_PROVIDER = previousAcademy.provider;
    if (previousAcademy.enabled === undefined) delete process.env.ACADEMY_ENABLED;
    if (previousAcademy.provider === undefined) delete process.env.AKAMBI_PROVIDER;
  });

  it('authentification requise ; praticien validé : catalogue vide avant synchronisation', async () => {
    expect((await get(null, '/api/academy/courses')).statusCode).toBe(401);
    const res = await get('nurse', '/api/academy/courses');
    expect(res.statusCode).toBe(200);
    expect(ourCourses(res.json())).toEqual([]);
  });

  it('job admin : catalogue enregistré ; formations publiées seules exposées, champs du contrat', async () => {
    const run = await sync();
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ job: 'academy.catalog.sync', skipped: false, result: { fetched: 3, upserted: 3, invalid: 0, hidden: 0 } });
    expect(run.json().result.cursor).toBe(courses.archived.updatedAt);

    const list = ourCourses((await get('nurse', '/api/academy/courses')).json());
    expect(list.map((c) => c.id)).toEqual([courses.gestes.id, courses.hygiene.id]);
    expect(list[0]).toEqual({
      id: courses.gestes.id, title: `Gestes et postures ${tag}`, description: null, type: 'E_LEARNING',
      category: { code: 'DOMICARES-SANTE', title: 'DomiCares Santé' }, publicPrice: { amount: 120, currency: 'EURO' },
      moduleCount: 4, chapterCount: 18, coverImageUrl: null, presentationUrl: 'https://www.akambiconsulting.com/courses/gestes', updatedAt: courses.gestes.updatedAt,
    });
    expect(list[1]).toMatchObject({ type: 'VISIO_CONFERENCE', category: null, publicPrice: null });

    const detail = await get('nurse', `/api/academy/courses/${courses.gestes.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().title).toBe(`Gestes et postures ${tag}`);
    expect((await get('nurse', `/api/academy/courses/${courses.archived.id}`)).statusCode).toBe(404);
    expect((await get('nurse', '/api/academy/courses/inconnu')).statusCode).toBe(404);
    expect((await get('nurse', '/api/academy/courses/a%2F..%2Fb')).statusCode).toBe(400);
    expect(await state()).toMatchObject({ last_error: null, cursor: new Date(courses.archived.updatedAt) });
  });

  it('accès refusé : patient, coach (arbitrage en attente), dossier non validé, e-mail non vérifié', async () => {
    for (const key of ['patient', 'coach', 'pending', 'unverified']) {
      expect((await get(key, '/api/academy/courses')).statusCode).toBe(403);
      expect((await get(key, `/api/academy/courses/${courses.gestes.id}`)).statusCode).toBe(403);
    }
    expect((await get('unverified', '/api/academy/courses')).json().message).toContain('e-mail');
  });

  it('versions : une mise à jour plus récente est appliquée, une version plus ancienne ne remplace pas la locale', async () => {
    bump('gestes', { title: `Gestes et postures (v2) ${tag}` });
    expect((await sync()).json().result).toMatchObject({ upserted: 3, hidden: 0 });
    expect((await get('nurse', `/api/academy/courses/${courses.gestes.id}`)).json().title).toBe(`Gestes et postures (v2) ${tag}`);

    // Version locale plus récente que celle d'Akambi (réponse arrivée dans le désordre) : conservée.
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('academy_courses').set({ title: 'Version locale', akambi_updated_at: new Date(Date.now() + 3_600_000) }).where('id', '=', courses.hygiene.id).execute());
    expect((await sync()).json().result).toMatchObject({ upserted: 2 });
    expect((await get('nurse', `/api/academy/courses/${courses.hygiene.id}`)).json().title).toBe('Version locale');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('academy_courses').set({ akambi_updated_at: courses.hygiene.updatedAt }).where('id', '=', courses.hygiene.id).execute());
  });

  it('retrait du catalogue DomiCares : formation masquée, puis visible à nouveau à son retour', async () => {
    fake.courses.delete(courses.hygiene.id);
    expect((await sync()).json().result).toMatchObject({ fetched: 2, hidden: 1 });
    expect((await get('nurse', `/api/academy/courses/${courses.hygiene.id}`)).statusCode).toBe(404);
    expect(ourCourses((await get('nurse', '/api/academy/courses')).json()).map((c) => c.id)).toEqual([courses.gestes.id]);

    fake.courses.set(courses.hygiene.id, courses.hygiene);
    expect((await sync()).json().result).toMatchObject({ fetched: 3, hidden: 0 });
    expect((await get('nurse', `/api/academy/courses/${courses.hygiene.id}`)).statusCode).toBe(200);
  });

  it('formation illisible : écartée et signalée, les autres mises à jour, aucun masquage', async () => {
    const invalid = { ...fake.seedCourse({ title: `Illisible ${tag}` }), type: 'WEBINAIRE' } as unknown as AkambiCourse;
    courses.invalid = invalid;
    fake.courses.set(invalid.id, invalid);
    fake.courses.delete(courses.hygiene.id);
    bump('gestes', { title: `Gestes et postures (v3) ${tag}` });
    const run = (await sync()).json().result;
    expect(run).toMatchObject({ fetched: 3, invalid: 1, hidden: 0 });
    expect((await get('nurse', `/api/academy/courses/${courses.gestes.id}`)).json().title).toBe(`Gestes et postures (v3) ${tag}`);
    expect((await get('nurse', `/api/academy/courses/${courses.hygiene.id}`)).statusCode).toBe(200);
    expect((await get('nurse', `/api/academy/courses/${invalid.id}`)).statusCode).toBe(404);
    expect((await state()).last_error).toBe('1 formation(s) illisible(s) ignorée(s)');
    fake.courses.delete(invalid.id);
    fake.courses.set(courses.hygiene.id, courses.hygiene);
  });

  it('erreur Akambi : job en échec (502), code stable seul enregistré et renvoyé, catalogue local intact', async () => {
    const spy = jest.spyOn(fake, 'listCourses').mockRejectedValueOnce(new AkambiError('Erreur pour awa@example.com', 500, 'INTERNAL_ERROR'));
    const run = await sync();
    expect(run.statusCode).toBe(502);
    expect(run.body).toContain('Akambi 500 INTERNAL_ERROR');
    expect(run.body).not.toContain('awa@example.com');
    expect((await state()).last_error).toBe('Akambi 500 INTERNAL_ERROR');
    expect(ourCourses((await get('nurse', '/api/academy/courses')).json())).toHaveLength(2);
    spy.mockRestore();
    expect((await sync()).json().result).toMatchObject({ invalid: 0 });
    expect((await state()).last_error).toBeNull();
  });
});
