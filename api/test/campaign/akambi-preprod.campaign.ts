/**
 * Campagne de recette Akambi (lot A8, docs/academy/02-RECETTE-PREPRODUCTION.md) : l'API DomiCares tourne EN LOCAL,
 * branchée sur la PRÉPRODUCTION Akambi ; aucun accès au VPS ni à la production Akambi.
 *
 *   AKAMBI_CAMPAIGN=preprod AKAMBI_API_KEY=… AKAMBI_API_SECRET=… \
 *   DATABASE_URL=<base locale dédiée> JWT_ACCESS_SECRET=<secret de test> npm run campaign:akambi
 *
 * AKAMBI_CAMPAIGN=fake rejoue la même campagne contre le client factice (validation du harnais).
 * Options : AKAMBI_CAMPAIGN_EMAIL_DOMAIN (domaine des apprenants créés, défaut domicares.test : aucune boîte réelle),
 * AKAMBI_CAMPAIGN_EXISTING_EMAIL (adresse d'un compte Akambi de test préexistant, pour le cas EXISTING).
 * Chaque scénario reprend une ligne de la grille du § 10 du guide Akambi. Les scénarios qui exigent une action
 * humaine (suivre le lien SSO, progresser, passer l'évaluation) ou une URL publique (webhooks) sont marqués
 * « manuel » ou « non couvert » : ils se jouent sur la préproduction DomiCares (document 02, § 4).
 * Résultat : tableau dans campaign-reports/ (statuts et codes uniquement, sans nom, e-mail ni lien).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { AKAMBI_CLIENT, AKAMBI_API_PREFIX, AkambiError, FakeAkambiClient, type AkambiClient } from '../../src/academy/akambi.client';
import { signAkambiRequest } from '../../src/academy/akambi.signature';
import { createApp } from '../../src/app.factory';
import { DatabaseService, SERVICE_CONTEXT } from '../../src/database/database.service';

const PREPROD_URL = 'https://preprod.akambiconsulting.com';
const MODE = process.env.AKAMBI_CAMPAIGN;
if (MODE !== 'preprod' && MODE !== 'fake') throw new Error('AKAMBI_CAMPAIGN=preprod (préproduction Akambi) ou fake (client factice) requis');
const PREPROD = MODE === 'preprod';
if (PREPROD) {
  if ((process.env.AKAMBI_BASE_URL ?? PREPROD_URL) !== PREPROD_URL) throw new Error(`AKAMBI_BASE_URL doit valoir ${PREPROD_URL} : la campagne ne touche jamais la production Akambi`);
  if (!process.env.AKAMBI_API_KEY || !process.env.AKAMBI_API_SECRET) throw new Error('AKAMBI_API_KEY et AKAMBI_API_SECRET (préproduction) requis');
}

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'campaign-secret-campaign-secret-campaign-1234';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.ACADEMY_ENABLED = 'true';
process.env.AKAMBI_PROVIDER = PREPROD ? 'akambi' : 'fake';
if (PREPROD) process.env.AKAMBI_BASE_URL = PREPROD_URL;

const tag = Date.now().toString(36);
const password = 'Campagne#2026';
const emailDomain = process.env.AKAMBI_CAMPAIGN_EMAIL_DOMAIN ?? 'domicares.test';
const existingEmail = process.env.AKAMBI_CAMPAIGN_EXISTING_EMAIL;
/** Retire adresses e-mail et URL d'un texte destiné au rapport (un lien SSO ouvre une session). */
const scrub = (text: string) => text.replace(/https?:\/\/\S+/g, '<lien>').replace(/[\w.+-]+@[\w.-]+/g, '<e-mail>').slice(0, 200);

type Row = { id: string; title: string; result: 'ok' | 'écart' | 'manuel' | 'non couvert'; observed: string; note: string };

describe(`Campagne Akambi (${MODE})`, () => {
  jest.setTimeout(10 * 60_000);
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let client: AkambiClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const rows: Row[] = [];
  const ctx: Record<string, string> = {};
  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  const record = (row: Row) => rows.push({ ...row, observed: scrub(row.observed), note: scrub(row.note) });
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, as: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: auth(as), ...(payload ? { payload } : {}) });
  const code = (err: unknown) => (err instanceof AkambiError ? `${err.status} ${err.code}` : `erreur ${err instanceof Error ? err.message : String(err)}`);

  async function signup(key: string, email: string, fullName: string) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName } });
    if (res.statusCode !== 201) throw new Error(`inscription ${key} : ${res.statusCode} ${scrub(res.body)}`);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function practitioner(key: string, email: string) {
    await signup(key, email, `Recette ${key} Akambi`);
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('practitioners').values({ user_id: userIds[key], name: `Recette ${key}`, specialty: 'Recette', practitioner_type: 'infirmier', kyc_status: 'approved' }).execute());
  }

  /** Requête signée envoyée directement (contrôles de signature) : en préproduction seulement. */
  async function raw(options: { secret?: string; timestamp?: string; nonce?: string } = {}) {
    const path = `${AKAMBI_API_PREFIX}/ping`;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString();
    const nonce = options.nonce ?? randomUUID();
    const signature = signAkambiRequest(options.secret ?? (process.env.AKAMBI_API_SECRET as string), timestamp, nonce, 'GET', path, '');
    const res = await fetch(`${PREPROD_URL}${path}`, { headers: { 'X-Partner-API-Key': process.env.AKAMBI_API_KEY as string, 'X-Partner-Timestamp': timestamp, 'X-Partner-Nonce': nonce, 'X-Partner-Signature': signature } });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    return `${res.status}${body.error?.code ? ` ${body.error.code}` : ''}`;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    client = app.get<AkambiClient>(AKAMBI_CLIENT);
    if (!PREPROD) {
      const fake = app.get(FakeAkambiClient);
      fake.courses.clear();
      fake.seedCourse({ title: 'Formation de recette' });
      if (existingEmail) fake.existingAccountEmails.add(existingEmail.toLowerCase());
    }
    await signup('admin', `recette-admin-${tag}@${emailDomain}`, 'Recette Admin');
    await db.runAs(SERVICE_CONTEXT, (trx) => trx.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'super_admin' }).execute());
    await practitioner('nurse', `recette-akambi-${tag}@${emailDomain}`);
  });

  afterAll(async () => {
    // Inscriptions de recette retirées chez Akambi (au mieux) ; les comptes apprenants restent : aucune route de suppression.
    for (const id of [ctx.akambiEnrollmentId].filter(Boolean)) await client.cancelEnrollment(id).catch(() => undefined);
    if (db) {
      await db.runAs(SERVICE_CONTEXT, async (trx) => {
        await sql`delete from public.admin_audit_logs where admin_id = any(${Object.values(userIds)}::uuid[])`.execute(trx);
        await sql`delete from public.users where id = any(${Object.values(userIds)}::uuid[])`.execute(trx);
      });
    }
    const dir = join(__dirname, '..', '..', 'campaign-reports');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `akambi-${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
    const lines = [
      `# Campagne Akambi ${MODE} — ${new Date().toISOString()}`, '',
      'Rapport généré par `npm run campaign:akambi` (docs/academy/02-RECETTE-PREPRODUCTION.md, § 3). Statuts et codes uniquement.', '',
      `Apprenants créés sur le domaine ${emailDomain} ; compte préexistant ${existingEmail ? 'fourni' : 'non fourni'}.`, '',
      '| # | Scénario (guide Akambi § 10) | Résultat | Observé | Note |', '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.id} | ${r.title} | ${r.result} | ${r.observed} | ${r.note} |`),
    ];
    writeFileSync(file, lines.join('\n') + '\n');
    console.log(lines.join('\n') + `\n\nRapport : ${file}`);
    await app?.close();
  });

  it('R0 — authentification : ping, signature fausse, nonce rejoué, horodatage décalé', async () => {
    try {
      const ping = await client.ping();
      record({ id: 'R0', title: 'Vérifier l’authentification (GET /ping)', result: 'ok', observed: `200 partenaire ${ping.partner.code}`, note: '' });
    } catch (err) {
      record({ id: 'R0', title: 'Vérifier l’authentification (GET /ping)', result: 'écart', observed: code(err), note: 'clé, secret ou horloge à vérifier' });
      throw err;
    }
    if (!PREPROD) {
      record({ id: 'R0b', title: 'Refus : signature fausse, nonce rejoué, horodatage à 400 s', result: 'non couvert', observed: '—', note: 'préproduction seulement (requêtes signées directes)' });
      return;
    }
    const nonce = randomUUID();
    const first = await raw({ nonce });
    const results = { wrongSecret: await raw({ secret: 'secret-faux' }), replayed: await raw({ nonce }), skewed: await raw({ timestamp: String(Math.floor(Date.now() / 1000) - 400) }) };
    const expected = first.startsWith('200') && results.wrongSecret === '401 INVALID_SIGNATURE' && results.replayed === '401 REPLAYED_REQUEST' && results.skewed === '401 TIMESTAMP_OUT_OF_RANGE';
    record({ id: 'R0b', title: 'Refus : signature fausse, nonce rejoué, horodatage à 400 s', result: expected ? 'ok' : 'écart', observed: `${results.wrongSecret} / ${results.replayed} / ${results.skewed}`, note: 'attendu 401 INVALID_SIGNATURE / REPLAYED_REQUEST / TIMESTAMP_OUT_OF_RANGE' });
  });

  it('R1 — catalogue privé : synchronisation, formation hors catalogue en 404', async () => {
    const run = await call('POST', '/api/admin/jobs/academy.catalog.sync/run', 'admin');
    const result = run.json().result as { fetched?: number; invalid?: number } | undefined;
    const list = await call('GET', '/api/academy/courses', 'nurse');
    const courses = list.statusCode === 200 ? (list.json() as Array<{ id: string }>) : [];
    if (courses[0]) ctx.courseId = courses[0].id;
    let outside: string;
    try {
      await client.getCourse('00000000-0000-4000-8000-000000000000');
      outside = '200 (inattendu)';
    } catch (err) {
      outside = code(err);
    }
    const ok = run.statusCode === 200 && (result?.invalid ?? 1) === 0 && courses.length > 0 && outside === '404 COURSE_NOT_FOUND';
    record({ id: 'R1', title: 'Catalogue privé', result: ok ? 'ok' : 'écart', observed: `job ${run.statusCode}, ${result?.fetched ?? '?'} lue(s), ${result?.invalid ?? '?'} illisible(s) ; ${courses.length} publiée(s) ; hors catalogue ${outside}`, note: 'vérifier à l’œil que seules les catégories DomiCares figurent' });
    expect(courses.length).toBeGreaterThan(0);
  });

  it('R2/R3 — compte créé puis inscription répétée sans doublon', async () => {
    const first = await call('POST', '/api/academy/enrollments', 'nurse', { courseId: ctx.courseId });
    const second = await call('POST', '/api/academy/enrollments', 'nurse', { courseId: ctx.courseId });
    const learner = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_learners').selectAll().where('user_id', '=', userIds['nurse']).executeTakeFirst());
    const local = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_enrollments').selectAll().where('user_id', '=', userIds['nurse']).executeTakeFirst());
    ctx.enrollmentId = local?.id ?? '';
    ctx.akambiEnrollmentId = local?.akambi_enrollment_id ?? '';
    record({ id: 'R2', title: 'Compte apprenant créé et rattaché', result: learner?.link_status === 'linked' && learner.account_origin === 'CREATED' ? 'ok' : 'écart', observed: `${learner?.link_status ?? 'absent'} / ${learner?.account_origin ?? '—'}`, note: '' });

    // Même apprenant et même formation rejoués directement chez Akambi avec une clé neuve : 200, même identifiant.
    let direct: string;
    try {
      const again = await client.createEnrollment({ externalLearnerId: `DC-${userIds['nurse']}`, courseId: ctx.courseId }, randomUUID());
      direct = `${again.created ? '201' : '200'} ${again.resource.id === ctx.akambiEnrollmentId ? 'même id' : 'id différent'}`;
    } catch (err) {
      direct = code(err);
    }
    const ok = first.statusCode === 201 && second.statusCode === 200 && second.json().enrollment.id === first.json().enrollment.id && direct === '200 même id';
    record({ id: 'R3', title: 'Inscription répétée', result: ok ? 'ok' : 'écart', observed: `DomiCares ${first.statusCode} puis ${second.statusCode} ; Akambi direct ${direct}`, note: '' });
    expect(first.statusCode).toBe(201);
  });

  it('R2b — compte Akambi préexistant (EXISTING)', async () => {
    if (!existingEmail) {
      record({ id: 'R2b', title: 'Compte déjà existant', result: 'non couvert', observed: '—', note: 'AKAMBI_CAMPAIGN_EXISTING_EMAIL non fourni (compte de test à demander à Akambi)' });
      return;
    }
    await practitioner('existing', existingEmail);
    const res = await call('POST', '/api/academy/enrollments', 'existing', { courseId: ctx.courseId });
    const learner = await db.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_learners').select(['account_origin']).where('user_id', '=', userIds['existing']).executeTakeFirst());
    const launch = res.statusCode === 201 ? await call('POST', `/api/academy/enrollments/${res.json().enrollment.id}/launch`, 'existing') : null;
    const ok = learner?.account_origin === 'EXISTING' && launch?.json().mode === 'LOGIN_REQUIRED';
    record({ id: 'R2b', title: 'Compte déjà existant', result: ok ? 'ok' : 'écart', observed: `${res.statusCode} ${learner?.account_origin ?? '—'} / accès ${launch?.json().mode ?? '—'}`, note: 'vérifier chez Akambi que le compte n’a pas été modifié' });
    if (res.statusCode === 201) await client.cancelEnrollment(res.json().enrollment.id).catch(() => undefined);
  });

  it('R4 — accès apprenant : lien SSO de 5 minutes, non mis en cache', async () => {
    const res = await call('POST', `/api/academy/enrollments/${ctx.enrollmentId}/launch`, 'nurse');
    const body = res.json() as { mode?: string; url?: string; expiresAt?: string | null };
    const ttl = body.expiresAt ? Math.round((Date.parse(body.expiresAt) - Date.now()) / 1000) : null;
    const ok = res.statusCode === 200 && body.mode === 'SSO' && body.url?.startsWith('https://') === true && ttl !== null && ttl > 0 && ttl <= 300 && res.headers['cache-control'] === 'no-store';
    record({ id: 'R4', title: 'Accès apprenant (lien)', result: ok ? 'ok' : 'écart', observed: `${res.statusCode} ${body.mode ?? '—'}, expire dans ${ttl ?? '?'} s, cache ${String(res.headers['cache-control'] ?? '—')}`, note: '' });
    record({ id: 'R4b', title: 'Bon praticien et bonne formation ; lien réutilisé ou expiré refusé', result: 'manuel', observed: '—', note: 'navigateur sur la préproduction DomiCares (document 02, § 4)' });
  });

  it('R5/R6/R7 — progression, webhooks, attestation', async () => {
    const run = await call('POST', '/api/admin/jobs/academy.enrollments.reconcile/run', 'admin');
    record({ id: 'R5', title: 'Progression et achèvement', result: 'manuel', observed: `rapprochement ${run.statusCode} (${Object.entries((run.json().result ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${String(v)}`).join(', ')})`, note: 'progresser dans le cours puis relancer le rapprochement' });
    record({ id: 'R6', title: 'Webhook répété ou hors ordre', result: 'non couvert', observed: '—', note: 'URL publique requise : préproduction DomiCares + webhook.test d’Akambi' });
    record({ id: 'R7', title: 'Attestation', result: 'manuel', observed: '—', note: 'évaluation finale à réussir (≥ 80 %), puis attestation et lien de vérification' });
    expect(run.statusCode).toBe(200);
  });

  it('R8 — nouvelle tentative : même Idempotency-Key rejouée, corps différent refusé', async () => {
    const key = randomUUID();
    const input = { externalLearnerId: `DC-${userIds['nurse']}`, courseId: ctx.courseId };
    let observed: string;
    let ok = false;
    try {
      const a = await client.createEnrollment(input, key);
      const b = await client.createEnrollment(input, key);
      let reused = '—';
      try {
        await client.createEnrollment({ ...input, courseId: '00000000-0000-4000-8000-000000000000' }, key);
        reused = 'accepté (inattendu)';
      } catch (err) {
        reused = code(err);
      }
      ok = a.resource.id === b.resource.id && b.replayed && reused === '422 IDEMPOTENCY_KEY_REUSED';
      observed = `même id ${a.resource.id === b.resource.id}, rejouée ${b.replayed} ; autre corps ${reused}`;
    } catch (err) {
      observed = code(err);
    }
    record({ id: 'R8', title: 'Erreur réseau : même clé, aucun doublon', result: ok ? 'ok' : 'écart', observed, note: '' });
  });

  it('R9 — isolation : identifiants inconnus ou d’un autre partenaire en 404', async () => {
    const results: string[] = [];
    for (const probe of [() => client.getEnrollment('00000000-0000-4000-8000-000000000000'), () => client.getLearner('DC-00000000-0000-4000-8000-000000000000')]) {
      try {
        await probe();
        results.push('200 (inattendu)');
      } catch (err) {
        results.push(code(err));
      }
    }
    const ok = results[0] === '404 ENROLLMENT_NOT_FOUND' && results[1] === '404 LEARNER_NOT_FOUND';
    record({ id: 'R9', title: 'Isolation du partenariat', result: ok ? 'ok' : 'écart', observed: results.join(' / '), note: 'identifiant réel d’un autre partenaire : à demander à Akambi' });
  });

  it('R10 — indicateurs et désinscription', async () => {
    const reports = await call('GET', '/api/admin/academy/reports', 'admin');
    const cancel = await call('DELETE', `/api/admin/academy/enrollments/${ctx.enrollmentId}`, 'admin');
    let after: string;
    try {
      await client.getEnrollment(ctx.akambiEnrollmentId);
      after = '200 (inattendu)';
    } catch (err) {
      after = code(err);
    }
    const ok = reports.statusCode === 200 && cancel.statusCode === 200 && after === '404 ENROLLMENT_NOT_FOUND';
    record({ id: 'R10', title: 'Indicateurs et désinscription', result: ok ? 'ok' : 'écart', observed: `reports ${reports.statusCode} ; désinscription ${cancel.statusCode} ; GET ensuite ${after}`, note: 'indicateurs à valider avec Gaillardo et Fawaz' });
    if (cancel.statusCode === 200) ctx.akambiEnrollmentId = '';
  });
});
