/**
 * Campagne sandbox FedaPay automatisée (document 09) : l'API Domicares tourne EN LOCAL, branchée
 * sur le vrai FedaPay en mode test ; aucun accès au VPS ni à la production.
 *
 *   FEDAPAY_CAMPAIGN=sandbox FEDAPAY_SANDBOX_SECRET_KEY=sk_sandbox_… FEDAPAY_SANDBOX_PUBLIC_KEY=pk_sandbox_… \
 *   DATABASE_URL=<base de recette dédiée> JWT_ACCESS_SECRET=<secret de test> npm run campaign:fedapay
 *
 * FEDAPAY_CAMPAIGN=fake rejoue la même campagne contre le client factice (validation du harnais).
 * Le client « paie » sans redirection par POST /v1/{mode}. En sandbox, FedaPay ouvre le mode de test
 * `momo_test` (centre d'aide FedaPay) et refuse mtn_open/moov (« Opération non autorisée ») :
 * FEDAPAY_CAMPAIGN_PAY_MODE=momo_test (défaut) ou operateur (mtn_open/moov, si FedaPay les ouvre).
 * Numéros du paiement en momo_test, en attendant ceux du support : FEDAPAY_MOMO_TEST_APPROVED et
 * FEDAPAY_MOMO_TEST_DECLINED (défaut : les numéros de test ci-dessous). La transaction est toujours créée
 * par l'API avec son mode opérateur. L'API locale ne reçoit pas de webhook : l'état final est lu par le
 * job payments.sync.
 * Résultat : tableau du §4 du document 09 (statuts et codes HTTP uniquement, sans nom ni numéro)
 * dans campaign-reports/. S13 (rejeu d'un webhook) exige une URL publique : non couvert ici.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/app.factory';
import { DatabaseService } from '../../src/database/database.service';
import { FakeFedaPayClient, FEDAPAY_CLIENT, type FedaPayClient } from '../../src/payments/fedapay.client';

const MODE = process.env.FEDAPAY_CAMPAIGN;
if (MODE !== 'sandbox' && MODE !== 'fake') throw new Error('FEDAPAY_CAMPAIGN=sandbox (vrai FedaPay en mode test) ou fake (client factice) requis');
const SANDBOX = MODE === 'sandbox';
const SECRET = process.env.FEDAPAY_SANDBOX_SECRET_KEY ?? '';
if (SANDBOX) {
  if (!SECRET.startsWith('sk_sandbox_')) throw new Error('FEDAPAY_SANDBOX_SECRET_KEY doit commencer par sk_sandbox_ : la campagne ne touche jamais le mode live');
  if (!(process.env.FEDAPAY_SANDBOX_PUBLIC_KEY ?? '').startsWith('pk_sandbox_')) throw new Error('FEDAPAY_SANDBOX_PUBLIC_KEY doit commencer par pk_sandbox_');
}

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'campaign-secret-campaign-secret-campaign-1234';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.FEDAPAY_PROVIDER = SANDBOX ? 'fedapay' : 'fake';
process.env.FEDAPAY_MODE = 'sandbox';
if (SANDBOX) {
  process.env.FEDAPAY_SECRET_KEY = SECRET;
  process.env.FEDAPAY_PUBLIC_KEY = process.env.FEDAPAY_SANDBOX_PUBLIC_KEY;
  // Aucun webhook n'atteint une API locale ; valeur requise par la configuration seulement.
  process.env.FEDAPAY_WEBHOOK_SECRET = 'campagne-locale-sans-webhook';
}

const SANDBOX_API = 'https://sandbox-api.fedapay.com/v1';
const APPROVED_MTN = '+22966000001';
const APPROVED_MOOV = '+22964000001';
const DECLINED_MTN = '+22966000000';
const PAY_MODE = process.env.FEDAPAY_CAMPAIGN_PAY_MODE ?? 'momo_test';
if (PAY_MODE !== 'momo_test' && PAY_MODE !== 'operateur') throw new Error('FEDAPAY_CAMPAIGN_PAY_MODE=momo_test ou operateur');
const MOMO_TEST_APPROVED = process.env.FEDAPAY_MOMO_TEST_APPROVED;
const MOMO_TEST_DECLINED = process.env.FEDAPAY_MOMO_TEST_DECLINED;
const ATTEMPTS = SANDBOX ? 12 : 2;
const DELAY_MS = SANDBOX ? 5000 : 0;
const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const password = 'Campagne#2026';
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%campagne\n').toString('base64');
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Retire tout numéro ou adresse e-mail d'un texte destiné au rapport. */
const scrub = (text: string) => text.replace(/\+?\d{8,}/g, '<numéro>').replace(/[\w.+-]+@[\w.-]+/g, '<e-mail>').slice(0, 200);

type Row = { id: string; title: string; result: 'ok' | 'écart' | 'non couvert' | 'sans objet'; domicares: string; fedapay: string; note: string };

describe(`Campagne FedaPay (${MODE})`, () => {
  jest.setTimeout(10 * 60_000);
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let client: FedaPayClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const rows: Row[] = [];
  const ctx: Record<string, string> = {};
  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });

  async function signup(key: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `campagne-${key}-${tag}@domicares.test`, password, fullName: `Recette ${key}`, ...extra } });
    if (res.statusCode !== 201) throw new Error(`inscription ${key} : ${res.statusCode} ${scrub(res.body)}`);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function call(method: 'GET' | 'POST' | 'PUT', url: string, as: string, payload?: Record<string, unknown>) {
    return app.inject({ method, url, headers: auth(as), ...(payload ? { payload } : {}) });
  }
  const runJob = (name: string, options: Record<string, unknown> = {}) => call('POST', `/api/admin/jobs/${name}/run`, 'admin', options);
  const payment = (id: string) => db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select(['status', 'payout_status', 'net_amount', 'amount']).where('id', '=', id).executeTakeFirstOrThrow());
  const balance = (practitionerId: string) => db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_balances').select(['balance_on_hold', 'balance_available']).where('practitioner_id', '=', practitionerId).executeTakeFirst());
  async function remote(transactionId: string) {
    try {
      const t = (await client.getTransaction(transactionId)) as { status?: string; mode?: string | null };
      return `${t.status ?? '?'}${t.mode ? ` (mode ${t.mode})` : ''}`;
    } catch (err) {
      return `lecture impossible : ${scrub(err instanceof Error ? err.message : String(err))}`;
    }
  }

  /** Le patient paie avec un numéro de test : paiement sans redirection FedaPay (ou état factice). */
  async function customerPays(transactionId: string, mode: 'mtn_open' | 'moov', phone: string): Promise<string> {
    if (!SANDBOX) {
      app.get(FakeFedaPayClient).setStatus(transactionId, phone.endsWith('0') ? 'declined' : 'approved');
      return 'paiement simulé';
    }
    const { token } = await client.generateToken(transactionId);
    // Paiement sans redirection : POST /v1/{mode} avec le jeton de la transaction (vérifié sur le sandbox :
    // /v1/transactions/{mode} n'existe pas, 404). En momo_test, le numéro décide approuvé ou refusé.
    const path = PAY_MODE === 'momo_test' ? 'momo_test' : mode;
    const number = PAY_MODE === 'momo_test' ? ((phone === DECLINED_MTN ? MOMO_TEST_DECLINED : MOMO_TEST_APPROVED) ?? phone) : phone;
    const res = await fetch(`${SANDBOX_API}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, phone_number: { number, country: 'bj' } }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: unknown; 'v1/payment_intent'?: { status?: unknown } };
    // momo_test répond 200 même pour un paiement refusé : l'état de l'intention est reporté.
    const detail = res.ok ? (body['v1/payment_intent']?.status ? `, intention ${String(body['v1/payment_intent'].status)}` : '') : ` (${scrub(String(body.message ?? ''))})`;
    return `POST /${path} → HTTP ${res.status}${detail}`;
  }

  /** Routes du sandbox appelées par la campagne et fedapay.client.ts : 404 = route absente (avant authentification). */
  async function sandboxRoutes(): Promise<string[]> {
    const routes: [string, string][] = [['POST', '/transactions'], ['POST', '/transactions/0/token'], ['GET', '/transactions/0'], ['DELETE', '/transactions/0'], ['POST', '/mtn_open'], ['POST', '/moov'], ['POST', '/momo_test'], ['POST', '/payouts'], ['PUT', '/payouts/start'], ['GET', '/payouts/0'], ['POST', '/refunds'], ['GET', '/refunds/0']];
    const missing: string[] = [];
    for (const [method, path] of routes) {
      // Sans clé : une route existante répond 401 (ou 400 pour /{mode}), une route absente 404.
      const res = await fetch(`${SANDBOX_API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      if (res.status === 404) missing.push(`${method} ${path}`);
    }
    return missing;
  }

  /** Attend un état final en relançant payments.sync (aucun webhook n'atteint l'API locale). */
  async function settle(paymentId: string, wanted: string[]) {
    let p = await payment(paymentId);
    for (let i = 0; i < ATTEMPTS && !wanted.includes(p.status); i++) {
      await runJob('payments.sync', { staleMinutes: 0 });
      p = await payment(paymentId);
      if (!wanted.includes(p.status)) await sleep(DELAY_MS);
    }
    return p;
  }

  async function scenario(id: string, title: string, body: (row: Row) => Promise<void>) {
    const row: Row = { id, title, result: 'ok', domicares: '', fedapay: '', note: '' };
    try {
      await body(row);
    } catch (err) {
      row.result = 'écart';
      row.note = `exception : ${scrub(err instanceof Error ? err.message : String(err))}`;
    }
    rows.push(row);
  }
  const expectThat = (row: Row, condition: boolean, why: string) => {
    if (!condition) { row.result = 'écart'; row.note = [row.note, why].filter(Boolean).join(' ; '); }
  };

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    client = app.get<FedaPayClient>(FEDAPAY_CLIENT);
    // Campagne rejouée : les numéros de test restent uniques ; on les retire des comptes de recette précédents.
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const previous = trx.selectFrom('users').select('id').where('email', 'like', 'campagne-%@domicares.test');
      await trx.updateTable('users').set({ phone: null }).where('id', 'in', previous).where('phone', 'in', [APPROVED_MTN, DECLINED_MTN]).execute();
      await trx.updateTable('profiles').set({ phone: null }).where('id', 'in', previous).where('phone', 'in', [APPROVED_MTN, DECLINED_MTN]).execute();
    });
    await signup('patient', { phone: APPROVED_MTN });
    await signup('patient2', { phone: DECLINED_MTN });
    await signup('practitioner', { userType: 'practitioner', practitionerType: 'medecin' });
    await signup('coach', { userType: 'practitioner', practitionerType: 'coach_sportif' });
    await signup('admin');
    await db.db.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'super_admin' }).execute();
    const doc = await call('POST', '/api/practitioners/register', 'practitioner', {
      profile: { fullName: 'Recette Praticien', phone: `+2299${suffix}1` },
      practitioner: { name: 'Recette Praticien', phone: `+2299${suffix}1`, specialty: 'Généraliste', practitionerType: 'medecin', latitude: 6.37, longitude: 2.39 },
      documents: { idDocument: pdf, licenseDocument: pdf },
    });
    const coach = await call('POST', '/api/practitioners/register', 'coach', {
      profile: { fullName: 'Recette Coach', phone: `+2299${suffix}2` },
      practitioner: { name: 'Recette Coach', phone: `+2299${suffix}2`, specialty: 'Coaching sportif', practitionerType: 'coach_sportif', sessionTypes: ['Remise en forme'], interventionZone: 'Cotonou', interventionRadius: 10, latitude: 6.37, longitude: 2.39 },
      documents: { idDocument: pdf, diploma: pdf },
    });
    ctx.practitionerId = doc.json().practitioner.id;
    ctx.coachId = coach.json().practitioner.id;
    for (const id of [ctx.practitionerId, ctx.coachId]) {
      const kyc = await call('POST', `/api/admin/kyc/${id}/decision`, 'admin', { status: 'approved' });
      if (kyc.statusCode !== 200) throw new Error(`KYC ${kyc.statusCode}`);
    }
    await call('PUT', '/api/finance/me/payment-info', 'practitioner', { paymentMethod: 'mtn', accountHolderName: 'Recette Praticien', phoneNumber: APPROVED_MTN, verify: true });
    // Reversement refusé (S8) : le coach reçoit sur le numéro de test « refusé ».
    await call('PUT', '/api/finance/me/payment-info', 'coach', { paymentMethod: 'mtn', accountHolderName: 'Recette Coach', phoneNumber: DECLINED_MTN, verify: true });
    const session = await call('POST', '/api/group-sessions', 'coach', { sessionName: `Recette ${tag}`, sessionType: 'groupe', maxParticipants: 5, minParticipants: 1, scheduledDate: futureDate(6), startTime: '08:00', endTime: '09:00', pricePerPerson: 10_000, location: 'Cotonou' });
    ctx.sessionId = session.json().id;
  });

  afterAll(async () => {
    const dir = join(__dirname, '..', '..', 'campaign-reports');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `fedapay-${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
    const lines = [
      `# Campagne FedaPay ${MODE} — ${new Date().toISOString()}`, '',
      'Rapport généré par `npm run campaign:fedapay` (document 09, §4). Statuts et codes HTTP uniquement.', '',
      ...(SANDBOX ? [`Paiement client : ${PAY_MODE === 'momo_test' ? `momo_test (numéros ${MOMO_TEST_APPROVED || MOMO_TEST_DECLINED ? 'fournis par l’environnement' : 'de test par défaut'})` : 'opérateur (mtn_open / moov)'}.`, ''] : []),
      '| # | Scénario | Résultat | Statut Domicares | Statut FedaPay | Note |', '|---|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.id} | ${r.title} | ${r.result} | ${r.domicares} | ${r.fedapay} | ${r.note} |`),
    ];
    writeFileSync(file, lines.join('\n') + '\n');
    console.log(lines.join('\n') + `\n\nRapport : ${file}`);
    await app?.close();
  });

  const newAppointment = async (patient: string, days: number) => {
    const appt = await call('POST', '/api/appointments', patient, { practitionerId: ctx.practitionerId, specialty: 'Généraliste', date: futureDate(days), time: '10:00', reason: 'Recette paiement', address: 'Cotonou' });
    if (appt.statusCode !== 201) throw new Error(`rendez-vous ${appt.statusCode} ${scrub(appt.body)}`);
    const accepted = await call('POST', `/api/appointments/${appt.json().id}/respond`, 'practitioner', { action: 'accept', paymentMethod: 'mtn' });
    if (accepted.statusCode !== 200) throw new Error(`acceptation ${accepted.statusCode} ${scrub(accepted.body)}`);
    return { appointmentId: appt.json().id as string, paymentId: accepted.json().paymentId as string, transactionId: accepted.json().transactionId as string };
  };

  it('S1 à S13', async () => {
    if (SANDBOX) {
      const missing = await sandboxRoutes();
      rows.push({ id: 'S0', title: 'Routes du sandbox', result: missing.length ? 'écart' : 'ok', domicares: '', fedapay: missing.length ? `absentes : ${missing.join(', ')}` : 'toutes présentes', note: '' });
      if (missing.length) throw new Error(`routes FedaPay absentes : ${missing.join(', ')}`);
    }
    await scenario('S1', 'Paiement MTN approuvé', async (row) => {
      const a = await newAppointment('patient', 3);
      ctx.s1Payment = a.paymentId;
      const sent = await customerPays(a.transactionId, 'mtn_open', APPROVED_MTN);
      const p = await settle(a.paymentId, ['paid', 'failed', 'canceled']);
      const appt = await call('GET', `/api/appointments/${a.appointmentId}`, 'patient');
      const bal = await balance(ctx.practitionerId);
      row.domicares = `paiement ${p.status}/${p.payout_status}, rendez-vous ${appt.json().status}, retenu ${bal?.balance_on_hold ?? 0}`;
      row.fedapay = await remote(a.transactionId);
      row.note = sent;
      expectThat(row, p.status === 'paid' && p.payout_status === 'held', 'paiement non payé/retenu');
      expectThat(row, appt.json().status === 'confirmed', 'rendez-vous non confirmé');
      expectThat(row, Number(bal?.balance_on_hold ?? 0) >= Number(p.net_amount ?? 0), 'solde retenu incomplet');
    });

    await scenario('S2', 'Paiement Moov approuvé (séance)', async (row) => {
      const reg = await call('POST', `/api/group-sessions/${ctx.sessionId}/register`, 'patient', { paymentMethod: 'moov', phoneNumber: APPROVED_MOOV });
      if (reg.statusCode !== 201) throw new Error(`inscription ${reg.statusCode} ${scrub(reg.body)}`);
      ctx.s2Payment = reg.json().paymentId;
      const sent = await customerPays(reg.json().transactionId, 'moov', APPROVED_MOOV);
      const p = await settle(reg.json().paymentId, ['paid', 'failed', 'canceled']);
      const part = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('group_session_participants').select('payment_status').where('id', '=', reg.json().participantId).executeTakeFirstOrThrow());
      row.domicares = `paiement ${p.status}/${p.payout_status}, inscription ${part.payment_status}`;
      row.fedapay = await remote(reg.json().transactionId);
      row.note = sent;
      expectThat(row, p.status === 'paid' && part.payment_status === 'paid', 'inscription non payée');
    });

    await scenario('S3', 'Paiement refusé', async (row) => {
      const before = await balance(ctx.practitionerId);
      const a = await newAppointment('patient2', 4);
      const sent = await customerPays(a.transactionId, 'mtn_open', DECLINED_MTN);
      const p = await settle(a.paymentId, ['failed', 'paid', 'canceled']);
      const appt = await call('GET', `/api/appointments/${a.appointmentId}`, 'patient2');
      const after = await balance(ctx.practitionerId);
      row.domicares = `paiement ${p.status}, rendez-vous ${appt.json().status}`;
      row.fedapay = await remote(a.transactionId);
      row.note = sent;
      expectThat(row, p.status === 'failed', 'paiement non refusé');
      expectThat(row, Number(after?.balance_on_hold ?? 0) === Number(before?.balance_on_hold ?? 0), 'solde modifié par un refus');
    });

    await scenario('S4', 'Abandon puis nettoyage', async (row) => {
      const a = await newAppointment('patient', 5);
      ctx.s4Appointment = a.appointmentId;
      ctx.s4Payment = a.paymentId;
      const job = await runJob('payments.cleanup', { expirationMinutes: 0 });
      const p = await payment(a.paymentId);
      row.domicares = `paiement ${p.status} (job ${job.statusCode})`;
      row.fedapay = await remote(a.transactionId);
      row.note = 'DELETE /transactions/{id} : voir l’état FedaPay';
      expectThat(row, p.status === 'canceled', 'paiement abandonné non annulé');
    });

    await scenario('S5', 'Reprise après abandon', async (row) => {
      const retry = await call('POST', '/api/payments', 'patient', { appointmentId: ctx.s4Appointment, paymentMethod: 'mtn', phoneNumber: APPROVED_MTN, payerName: 'Recette patient' });
      if (retry.statusCode !== 201 && retry.statusCode !== 200) throw new Error(`nouveau paiement ${retry.statusCode} ${scrub(retry.body)}`);
      ctx.s5Payment = retry.json().paymentId;
      const sent = await customerPays(retry.json().transactionId, 'mtn_open', APPROVED_MTN);
      const p = await settle(retry.json().paymentId, ['paid', 'failed', 'canceled']);
      const old = await payment(ctx.s4Payment);
      row.domicares = `nouveau ${p.status}, ancien ${old.status}`;
      row.fedapay = await remote(retry.json().transactionId);
      row.note = sent;
      expectThat(row, p.status === 'paid' && old.status === 'canceled', 'reprise incohérente');
    });

    await scenario('S9', 'Remboursement partiel par l’API (POST /v1/refunds)', async (row) => {
      const p = await payment(ctx.s1Payment);
      const res = await call('POST', '/api/admin/finance/refunds', 'admin', { paymentId: ctx.s1Payment, refundAmount: Math.floor(Number(p.amount) / 2), reason: 'Recette remboursement partiel', channel: 'fedapay' });
      const body = res.json();
      ctx.s9Refund = body.refundId ?? body.refund?.id ?? body.id ?? '';
      ctx.s9Status = String(body.status ?? body.refund?.status ?? body.error ?? res.statusCode);
      row.domicares = `HTTP ${res.statusCode}, ${ctx.s9Status}, paiement ${(await payment(ctx.s1Payment)).status}`;
      if (res.statusCode >= 400) row.note = `motif : ${scrub(String(body.message ?? ''))}`;
      if (ctx.s9Refund) {
        // Contrat relevé dans le tableau de bord FedaPay : l'état se relit par GET /v1/refunds/{id}.
        const ref = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payment_refunds').select('provider_refund_id').where('id', '=', ctx.s9Refund).executeTakeFirst());
        if (SANDBOX && ref?.provider_refund_id) {
          const r = await fetch(`${SANDBOX_API}/refunds/${ref.provider_refund_id}`, { headers: { Authorization: `Bearer ${SECRET}` } });
          const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          const rec = (json['v1/refund'] ?? json.refund ?? json) as Record<string, unknown>;
          row.fedapay = `remboursement ${ref.provider_refund_id} : HTTP ${r.status}, ${String(rec.status ?? '?')}`;
        } else {
          row.fedapay = `remboursement ${ref?.provider_refund_id ?? '?'}`;
        }
      }
      // 502 FEDAPAY_REFUND_UNAVAILABLE : /v1/refunds absent ; 502 FEDAPAY_REFUND : refus (motif ci-dessus, MTN uniquement).
      expectThat(row, [200, 201].includes(res.statusCode) && ['completed', 'pending'].includes(ctx.s9Status), `réponse inattendue : ${scrub(res.body)}`);
    });

    await scenario('S10', 'Remboursement manuel du reste', async (row) => {
      const res = await call('POST', '/api/admin/finance/refunds', 'admin', { paymentId: ctx.s1Payment, reason: 'Recette remboursement manuel', channel: 'manual', providerReference: `RECETTE-${tag}` });
      const p = await payment(ctx.s1Payment);
      row.domicares = `HTTP ${res.statusCode}, paiement ${p.status}`;
      row.note = SANDBOX ? 'enregistrement seul : le remboursement réel se fait dans le tableau de bord FedaPay' : '';
      expectThat(row, p.status === 'refunded' || res.statusCode === 409, `paiement ${p.status} après remboursement manuel`);
    });

    await scenario('S11', 'Confirmation d’un remboursement en attente', async (row) => {
      if (ctx.s9Status !== 'pending' || !ctx.s9Refund) { row.result = 'sans objet'; row.note = `S9 : ${ctx.s9Status}`; return; }
      // Le job relit GET /v1/refunds/{id} ; à défaut de confirmation FedaPay, l'administrateur confirme.
      const job = await runJob('payouts.sync');
      const refunds = job.json()?.result?.refunds ?? {};
      const state = async () => (await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payment_refunds').select('status').where('id', '=', ctx.s9Refund).executeTakeFirstOrThrow())).status;
      const afterJob = await state();
      row.fedapay = `job : confirmés ${refunds.confirmed ?? '?'}, refusés ${refunds.failed ?? '?'}, en attente ${refunds.still_pending ?? '?'}`;
      if (afterJob !== 'pending') {
        row.domicares = `remboursement ${afterJob} par le job`;
        expectThat(row, afterJob === 'completed', `remboursement ${afterJob} chez FedaPay`);
        return;
      }
      const res = await call('POST', `/api/admin/finance/refunds/${ctx.s9Refund}/confirm`, 'admin', { providerReference: `RECETTE-${tag}-conf` });
      const again = await call('POST', `/api/admin/finance/refunds/${ctx.s9Refund}/confirm`, 'admin', {});
      row.domicares = `toujours en attente après le job ; confirmation HTTP ${res.statusCode}, seconde ${again.statusCode}`;
      expectThat(row, res.statusCode < 300 && again.statusCode === 400, 'confirmation incohérente');
    });

    await scenario('S6', 'Libération des fonds', async (row) => {
      await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('payments').set({ hold_until: new Date(Date.now() - 60_000) }).where('id', 'in', [ctx.s5Payment, ctx.s2Payment]).execute());
      const job = await runJob('funds.release');
      const p5 = await payment(ctx.s5Payment);
      const p2 = await payment(ctx.s2Payment);
      row.domicares = `job ${job.statusCode}, rendez-vous ${p5.payout_status}, séance ${p2.payout_status}`;
      expectThat(row, p5.payout_status === 'ready' && p2.payout_status === 'ready', 'fonds non libérés');
    });

    const payout = async (row: Row, practitionerId: string, failing: boolean) => {
      const res = await call('POST', '/api/admin/finance/payouts', 'admin', { practitionerId, description: `Recette ${tag}` });
      const payoutId = res.json().payoutId ?? res.json().payout?.id ?? res.json().id;
      if (!payoutId) { row.domicares = `HTTP ${res.statusCode}`; row.note = scrub(res.body); return { status: `HTTP ${res.statusCode}` }; }
      let detail = (await call('GET', `/api/admin/finance/payouts/${payoutId}`, 'admin')).json();
      if (!SANDBOX && detail.transaction_ids?.[0] && detail.status === 'sent') app.get(FakeFedaPayClient).setPayoutStatus(detail.transaction_ids[0], failing ? 'failed' : 'sent');
      for (let i = 0; i < ATTEMPTS && detail.status === 'sent'; i++) {
        await runJob('payouts.sync');
        detail = (await call('GET', `/api/admin/finance/payouts/${payoutId}`, 'admin')).json();
        if (detail.status === 'sent') await sleep(DELAY_MS);
      }
      row.domicares = `création HTTP ${res.statusCode}, reversement ${detail.status}`;
      row.fedapay = String(detail.account_details?.fedapay_status ?? detail.account_details?.error ?? '');
      return detail;
    };

    await scenario('S7', 'Reversement (dépôt démarré)', async (row) => {
      const d = await payout(row, ctx.practitionerId, false);
      expectThat(row, ['sent', 'completed'].includes(d.status), 'reversement non démarré');
      row.note = [row.note, 'corps de /payouts/start accepté si le dépôt est démarré'].filter(Boolean).join(' ; ');
    });

    await scenario('S8', 'Reversement refusé', async (row) => {
      const d = await payout(row, ctx.coachId, true);
      const p2 = await payment(ctx.s2Payment);
      row.domicares = `${row.domicares}, paiement séance ${p2.payout_status}`;
      expectThat(row, d.status === 'failed' && p2.payout_status === 'ready', 'échec non traité ou fonds non relibérés');
    });

    await scenario('S12', 'Réconciliation', async (row) => {
      const res = await call('POST', '/api/admin/finance/reconciliation', 'admin', {});
      const body = res.json();
      // La période couvre aussi d'autres paiements de la base (campagnes précédentes) : seuls ceux
      // des patients de cette campagne sont jugés ici, les autres sont comptés à part.
      const mine = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select(['id', 'fedapay_transaction_id']).where('patient_id', 'in', [userIds['patient'], userIds['patient2']]).execute());
      const ids = new Set(mine.flatMap((p) => [p.id, p.fedapay_transaction_id].filter(Boolean)));
      type Anomaly = { type: string; db_payment_id?: string; fedapay_transaction_id?: string; fedapay_status?: string; db_status?: string };
      const all: Anomaly[] = Array.isArray(body.anomalies) ? body.anomalies : [];
      const own = all.filter((a) => ids.has(a.db_payment_id ?? '') || ids.has(a.fedapay_transaction_id ?? ''));
      // Écart expliqué (§3, S12) : le reste de S1 est remboursé par le canal manuel (S10) sans
      // passer par FedaPay, qui garde donc la transaction « approved ».
      const explained = (a: Anomaly) => a.type === 'status_mismatch' && a.db_payment_id === ctx.s1Payment && a.db_status === 'refunded' && a.fedapay_status === 'approved';
      const unexplained = own.filter((a) => !explained(a));
      row.domicares = `HTTP ${res.statusCode}, rapprochées ${body.summary?.matched_count ?? '?'}, anomalies campagne ${own.length} dont expliquées ${own.length - unexplained.length} (hors campagne ${all.length - own.length})`;
      row.note = scrub([...unexplained.map((a) => `${a.type} (FedaPay ${a.fedapay_status ?? '-'}, Domicares ${a.db_status ?? '-'})`), ...(own.length > unexplained.length ? ['S1 : reste remboursé hors FedaPay (S10)'] : [])].join(', '));
      expectThat(row, res.statusCode === 201 && unexplained.length === 0, 'anomalies à expliquer');
    });

    rows.push({ id: 'S13', title: 'Rejeu d’un webhook', result: 'non couvert', domicares: '', fedapay: '', note: 'exige une URL publique : à faire depuis le tableau de bord vers l’environnement de recette' });

    const deviations = rows.filter((r) => r.result === 'écart').map((r) => r.id);
    expect(deviations).toEqual([]);
  });
});
