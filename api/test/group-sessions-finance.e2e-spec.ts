/**
 * Étape 5 — séances de groupe (coach, inscription + paiement, temps réel des soldes) et finance
 * (libération des fonds, lots de reversements, webhook transfer, remboursements, réconciliation, jobs).
 */
import { createHmac } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { FakeFedaPayClient } from '../src/payments/fedapay.client';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.FEDAPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const emails = { coach: `gs-coach-${tag}@domicares.test`, p1: `gs-p1-${tag}@domicares.test`, p2: `gs-p2-${tag}@domicares.test`, p3: `gs-p3-${tag}@domicares.test`, admin: `gs-adm-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake\n').toString('base64');
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sign = (body: string) => createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
const PRICE = 10_000;
const NET = 9_500; // configuration de production : 5 % de commission, 2 % de frais passerelle payés par la plateforme

describe('Group sessions & finance (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fedapay: FakeFedaPayClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let coachId = '';
  let sessionId = '';
  const participants: Record<string, string> = {};
  const transactions: Record<string, string> = {};
  const paymentIds: Record<string, string> = {};
  let batchId = '';
  let payoutId = '';
  let transferId = '';

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function webhook(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    return app.inject({ method: 'POST', url: '/api/webhooks/fedapay', headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(raw) }, payload: raw });
  }
  const balance = (id: string) => db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_balances').selectAll().where('practitioner_id', '=', id).executeTakeFirst());

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fedapay = app.get(FakeFedaPayClient);
    await signup('coach', emails.coach, { userType: 'practitioner', practitionerType: 'coach_sportif' });
    await signup('p1', emails.p1, { phone: `+2299${suffix}6` });
    await signup('p2', emails.p2);
    await signup('p3', emails.p3);
    await signup('admin', emails.admin);
    await db.db.insertInto('user_roles').values([{ user_id: userIds['admin'], role: 'super_admin' }]).execute();
    const reg = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('coach'),
      payload: {
        profile: { fullName: 'Coach Fit', phone: `+2299${suffix}7` },
        practitioner: { name: 'Coach Fit', phone: `+2299${suffix}7`, specialty: 'Coaching sportif', practitionerType: 'coach_sportif', sessionTypes: ['Remise en forme'], interventionZone: 'Cotonou', interventionRadius: 10, latitude: 6.37, longitude: 2.39 },
        documents: { idDocument: pdf, diploma: pdf },
      },
    });
    expect(reg.statusCode).toBe(201);
    coachId = reg.json().practitioner.id;
    const kyc = await app.inject({ method: 'POST', url: `/api/admin/kyc/${coachId}/decision`, headers: auth('admin'), payload: { status: 'approved' } });
    expect(kyc.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = Object.values(userIds);
      await sql`delete from public.payout_payments where payout_id in (select id from public.practitioner_payouts where practitioner_id = ${coachId}::uuid)`.execute(trx);
      await sql`delete from public.practitioner_payouts where practitioner_id = ${coachId}::uuid`.execute(trx);
      await sql`delete from public.payout_batches where created_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.ledger_entries where reference_id in (select id::text from public.payments where patient_id = any(${ids}::uuid[])) or reference_id in (select id::text from public.payment_refunds where refunded_by = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.ledger_entries where account_id in (select id from public.ledger_accounts where owner_id = any(${ids}::uuid[]) or owner_id = ${coachId}::uuid)`.execute(trx);
      await sql`delete from public.ledger_accounts where owner_id = any(${ids}::uuid[]) or owner_id = ${coachId}::uuid`.execute(trx);
      await sql`delete from public.payment_refunds where payment_id in (select id from public.payments where patient_id = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.payment_events where payment_id in (select id from public.payments where patient_id = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.payment_attempts where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.webhook_events where payload::text like ${'%' + tag + '%'} or event_id like ${'sim-%'}`.execute(trx);
      await sql`delete from public.payments where patient_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.group_session_participants where patient_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.group_sessions where coach_id = ${coachId}::uuid`.execute(trx);
      await sql`delete from public.practitioner_balances where practitioner_id = ${coachId}::uuid`.execute(trx);
      await sql`delete from public.reconciliation_reports where created_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.admin_audit_logs where admin_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.file_access_logs where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.files where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
    });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Séances de groupe
  // ---------------------------------------------------------------------------
  it('le coach crée une séance ; conflit de créneau et non-coach refusés', async () => {
    const payload = { sessionName: 'Remise en forme matinale', sessionType: 'groupe', maxParticipants: 2, minParticipants: 1, scheduledDate: futureDate(5), startTime: '08:00', endTime: '09:00', pricePerPerson: PRICE, location: 'Stade de l’Amitié, Cotonou' };
    const forbidden = await app.inject({ method: 'POST', url: '/api/group-sessions', headers: auth('p1'), payload });
    expect(forbidden.statusCode).toBe(403);
    const bad = await app.inject({ method: 'POST', url: '/api/group-sessions', headers: auth('coach'), payload: { ...payload, startTime: '10:00', endTime: '09:00' } });
    expect(bad.statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/group-sessions', headers: auth('coach'), payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ coach_id: coachId, status: 'planifiee', current_participants: 0, price_per_person: PRICE });
    sessionId = res.json().id;
    const conflict = await app.inject({ method: 'POST', url: '/api/group-sessions', headers: auth('coach'), payload });
    expect(conflict.statusCode).toBe(409);
    const list = await app.inject({ method: 'GET', url: `/api/group-sessions?coachId=${coachId}` });
    expect(list.json().count).toBe(1);
    expect(list.json().data[0].coach.name).toBe('Coach Fit');
    const one = await app.inject({ method: 'GET', url: `/api/group-sessions/${sessionId}`, headers: auth('p1') });
    expect(one.json()).toMatchObject({ spots_remaining: 2, my_registration: null, coach: { verified: true } });
    const mine = await app.inject({ method: 'GET', url: '/api/group-sessions/coach', headers: auth('coach') });
    expect(mine.json().data[0]).toMatchObject({ id: sessionId, participants_paid: 0 });

    // La colonne `scheduled_date` est un `date` : node-postgres la rend en objet Date, qui
    // devient une chaîne ISO complète une fois sérialisée. Le front concatène la date avec
    // l'heure et alimente des <input type="date"> : il lui faut « yyyy-MM-dd », sur les quatre
    // sorties. Voir common/utils/date-only.
    const attendu = payload.scheduledDate;
    expect(res.json().scheduled_date).toBe(attendu);
    expect(list.json().data[0].scheduled_date).toBe(attendu);
    expect(one.json().scheduled_date).toBe(attendu);
    expect(mine.json().data[0].scheduled_date).toBe(attendu);
  });

  it('inscription avec paiement : place réservée, montant de la séance, doublon et séance complète refusés', async () => {
    const body = { paymentMethod: 'mtn', phoneNumber: '+22997000001' };
    const r1 = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p1'), payload: body });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ success: true, amount: PRICE });
    expect(r1.json().paymentUrl).toContain('fedapay.fake');
    participants['p1'] = r1.json().participantId;
    transactions['p1'] = r1.json().transactionId;
    paymentIds['p1'] = r1.json().paymentId;
    const dup = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p1'), payload: body });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('REGISTRATION_PENDING');
    const r2 = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p2'), payload: body });
    expect(r2.statusCode).toBe(201);
    participants['p2'] = r2.json().participantId;
    const full = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p3'), payload: body });
    expect(full.statusCode).toBe(409);
    expect(full.json().message).toContain('complète');
    const coachNotif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['coach']).where('title', 'like', '%Nouvelle inscription%').executeTakeFirst();
    expect(coachNotif).toBeDefined();
    const mine = await app.inject({ method: 'GET', url: '/api/group-sessions/mine', headers: auth('p1') });
    expect(mine.json().data[0]).toMatchObject({ payment_status: 'pending', session: { id: sessionId, coach: { name: 'Coach Fit' } } });
  });

  it('webhook FedaPay approuvé → inscription payée, compteur et solde du coach en rétention', async () => {
    fedapay.setStatus(transactions['p1'], 'approved');
    const res = await webhook({ id: `evt-${tag}-p1`, name: 'transaction.approved', entity: { id: transactions['p1'], status: 'approved' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'paid', changed: true });
    const participant = await db.db.selectFrom('group_session_participants').select('payment_status').where('id', '=', participants['p1']).executeTakeFirstOrThrow();
    expect(participant.payment_status).toBe('paid');
    const session = await app.inject({ method: 'GET', url: `/api/group-sessions/${sessionId}`, headers: auth('coach') });
    expect(session.json()).toMatchObject({ current_participants: 1, participants_paid: 1, participants_pending: 1, spots_remaining: 0 });
    expect(await balance(coachId)).toMatchObject({ balance_on_hold: NET, balance_available: 0 });
    const own = await app.inject({ method: 'GET', url: '/api/payments', headers: auth('coach') });
    expect(own.json().some((p: { id: string }) => p.id === paymentIds['p1'])).toBe(true);
    const ledger = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('ledger_entries').select('id').where('reference_id', '=', paymentIds['p1']).execute());
    expect(ledger.length).toBe(5);
  });

  it('désinscription d’une place non payée, puis nouvelle inscription et nouvelle tentative de paiement', async () => {
    const paidWithdraw = await app.inject({ method: 'DELETE', url: `/api/group-sessions/registrations/${participants['p1']}`, headers: auth('p1') });
    expect(paidWithdraw.statusCode).toBe(400);
    const notMine = await app.inject({ method: 'DELETE', url: `/api/group-sessions/registrations/${participants['p2']}`, headers: auth('p3') });
    expect(notMine.statusCode).toBe(403);
    const withdraw = await app.inject({ method: 'DELETE', url: `/api/group-sessions/registrations/${participants['p2']}`, headers: auth('p2') });
    expect(withdraw.json()).toMatchObject({ success: true, paymentsCanceled: 1 });
    const r3 = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p3'), payload: { paymentMethod: 'moov', phoneNumber: '+22995000002' } });
    expect(r3.statusCode).toBe(201);
    participants['p3'] = r3.json().participantId;
    transactions['p3'] = r3.json().transactionId;
    const retry = await app.inject({ method: 'POST', url: `/api/group-sessions/registrations/${participants['p3']}/retry-payment`, headers: auth('p3'), payload: { paymentMethod: 'moov', phoneNumber: '+22995000002' } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ reused: true, transactionId: transactions['p3'] });
    const paidRetry = await app.inject({ method: 'POST', url: `/api/group-sessions/registrations/${participants['p1']}/retry-payment`, headers: auth('p1'), payload: { paymentMethod: 'mtn', phoneNumber: '+22997000001' } });
    expect(paidRetry.statusCode).toBe(400);
  });

  it('le coach confirme la séance (minimum atteint) ; modification de capacité sous les inscrits refusée', async () => {
    const shrink = await app.inject({ method: 'PATCH', url: `/api/group-sessions/${sessionId}`, headers: auth('coach'), payload: { maxParticipants: 1 } });
    expect(shrink.statusCode).toBe(400);
    const edit = await app.inject({ method: 'PATCH', url: `/api/group-sessions/${sessionId}`, headers: auth('coach'), payload: { location: 'Plage de Fidjrossè, Cotonou', maxParticipants: 3 } });
    expect(edit.statusCode).toBe(200);
    const confirm = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/confirm`, headers: auth('coach') });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().status).toBe('confirmee');
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['p1']).where('title', 'like', '%Séance confirmée%').executeTakeFirst();
    expect(notif).toBeDefined();
    const participantsList = await app.inject({ method: 'GET', url: `/api/group-sessions/${sessionId}/participants`, headers: auth('coach') });
    expect(participantsList.json().map((p: { payment_status: string }) => p.payment_status).sort()).toEqual(['paid', 'pending']);
    expect((await app.inject({ method: 'GET', url: `/api/group-sessions/${sessionId}/participants`, headers: auth('p1') })).statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Finance
  // ---------------------------------------------------------------------------
  it('informations de reversement du coach et solde ; libération des fonds à l’échéance', async () => {
    const invalid = await app.inject({ method: 'PUT', url: '/api/finance/me/payment-info', headers: auth('coach'), payload: { paymentMethod: 'mtn', accountHolderName: 'Coach Fit', phoneNumber: '0102030405' } });
    expect(invalid.statusCode).toBe(400);
    const info = await app.inject({ method: 'PUT', url: '/api/finance/me/payment-info', headers: auth('coach'), payload: { paymentMethod: 'mtn', accountHolderName: 'Coach Fit', phoneNumber: '+22997000009', verify: true } });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({ payment_method: 'mtn', is_verified: true, phone_number: '+22997000009' });
    const bal = await app.inject({ method: 'GET', url: '/api/finance/me/balance', headers: auth('coach') });
    expect(bal.json()).toMatchObject({ balance_on_hold: NET, balance_available: 0 });
    expect((await app.inject({ method: 'GET', url: '/api/admin/finance/stats', headers: auth('p1') })).statusCode).toBe(403);

    const none = await app.inject({ method: 'POST', url: '/api/admin/finance/held-funds/release', headers: auth('admin') });
    expect(none.json().results.released).toBe(0);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('payments').set({ hold_until: new Date(Date.now() - 60_000) }).where('id', '=', paymentIds['p1']).execute());
    const held = await app.inject({ method: 'GET', url: '/api/admin/finance/held-funds', headers: auth('admin') });
    expect(held.json().ready_count).toBeGreaterThanOrEqual(1);
    const release = await app.inject({ method: 'POST', url: '/api/admin/finance/held-funds/release', headers: auth('admin') });
    expect(release.json().results.released).toBeGreaterThanOrEqual(1);
    expect(await balance(coachId)).toMatchObject({ balance_on_hold: 0, balance_available: NET });
    const stats = await app.inject({ method: 'GET', url: '/api/admin/finance/stats', headers: auth('admin') });
    expect(stats.json().available_amount).toBeGreaterThanOrEqual(NET);
  });

  it('lot de reversements : réservation des fonds, dépôt créé et démarré chez FedaPay, suivi par le job payouts.sync', async () => {
    const empty = await app.inject({ method: 'POST', url: '/api/admin/finance/payout-batches', headers: auth('admin'), payload: { practitionerIds: [userIds['admin']], paymentMethod: 'momo' } });
    expect(empty.statusCode).toBe(400);
    const batch = await app.inject({ method: 'POST', url: '/api/admin/finance/payout-batches', headers: auth('admin'), payload: { practitionerIds: [coachId], paymentMethod: 'momo' } });
    expect(batch.statusCode).toBe(201);
    expect(batch.json()).toMatchObject({ totalAmount: NET, practitionersCount: 1 });
    batchId = batch.json().batchId;
    expect(await balance(coachId)).toMatchObject({ balance_available: 0 });
    const detail = await app.inject({ method: 'GET', url: `/api/admin/finance/payout-batches/${batchId}`, headers: auth('admin') });
    expect(detail.json().payouts[0]).toMatchObject({ status: 'planned', amount: NET, practitioner_name: 'Coach Fit' });
    payoutId = detail.json().payouts[0].id;

    const processed = await app.inject({ method: 'POST', url: `/api/admin/finance/payout-batches/${batchId}/process`, headers: auth('admin') });
    expect(processed.statusCode).toBe(200);
    expect(processed.json()).toMatchObject({ status: 'sent', results: { successCount: 1, failedCount: 0, skippedCount: 0 } });
    const again = await app.inject({ method: 'POST', url: `/api/admin/finance/payout-batches/${batchId}/process`, headers: auth('admin') });
    expect(again.statusCode).toBe(400);
    const payout = await app.inject({ method: 'GET', url: `/api/admin/finance/payouts/${payoutId}`, headers: auth('admin') });
    expect(payout.json()).toMatchObject({ status: 'sent', payment_method: 'mtn' });
    expect(payout.json().payments[0]).toMatchObject({ id: paymentIds['p1'], payout_status: 'paid' });
    transferId = payout.json().transaction_ids[0];
    // Dépôt créé avec le numéro international et le mode FedaPay documenté, puis démarré (PUT /payouts/start).
    expect(fedapay.payouts.get(transferId)?.input).toMatchObject({ mode: 'mtn_open', customer: { phoneNumber: '+22997000009', country: 'bj' } });
    expect(fedapay.payouts.get(transferId)?.status).toBe('started');
    expect(payout.json().account_details).toMatchObject({ fedapay_status: 'started' });
    const mine = await app.inject({ method: 'GET', url: '/api/finance/me/payouts', headers: auth('coach') });
    expect(mine.json()[0]).toMatchObject({ id: payoutId, status: 'sent' });

    // Aucun événement payout.* n'est documenté : l'état est interrogé. Encore en cours → rien ne change.
    const inFlight = await app.inject({ method: 'POST', url: '/api/admin/jobs/payouts.sync/run', headers: auth('admin') });
    expect(inFlight.statusCode).toBe(200);
    expect(inFlight.json().result.payouts).toMatchObject({ completed: 0, failed: 0 });
    expect(inFlight.json().result.payouts.in_flight).toBeGreaterThanOrEqual(1);
    expect((await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select('status').where('id', '=', payoutId).executeTakeFirstOrThrow())).status).toBe('sent');
    fedapay.setPayoutStatus(transferId, 'sent');
    const synced = await app.inject({ method: 'POST', url: '/api/admin/jobs/payouts.sync/run', headers: auth('admin') });
    expect(synced.json().result.payouts.completed).toBeGreaterThanOrEqual(1);
    const done = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select(['status', 'account_details']).where('id', '=', payoutId).executeTakeFirstOrThrow());
    expect(done.status).toBe('completed');
    expect(done.account_details).toMatchObject({ fedapay_status: 'sent' });
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['coach']).where('title', '=', 'Reversement effectué').executeTakeFirst();
    expect(notif).toBeDefined();
    // Un « failed » tardif sur un reversement terminé est ignoré : les fonds versés ne sont pas relibérés.
    const lateFail = await webhook({ id: `evt-${tag}-transfer-late`, name: 'transfer.failed', entity: { id: transferId, status: 'failed' } });
    expect(lateFail.json()).toMatchObject({ handled: true, status: 'completed', changed: false });
    expect((await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select('status').where('id', '=', payoutId).executeTakeFirstOrThrow())).status).toBe('completed');
  });

  it('reversement individuel échoué côté FedaPay : fonds libérés et journal d’audit', async () => {
    fedapay.setStatus(transactions['p3'], 'approved');
    await webhook({ id: `evt-${tag}-p3`, name: 'transaction.approved', entity: { id: transactions['p3'], status: 'approved' } });
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('payments').set({ hold_until: new Date(Date.now() - 60_000) }).where('appointment_id', 'like', `group_session_${sessionId}_%`).execute());
    await app.inject({ method: 'POST', url: '/api/admin/jobs/funds.release/run', headers: auth('admin') });
    expect(await balance(coachId)).toMatchObject({ balance_available: NET });
    fedapay.failNextPayout = true;
    const res = await app.inject({ method: 'POST', url: '/api/admin/finance/payouts', headers: auth('admin'), payload: { practitionerId: coachId, description: 'Test échec' } });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: 'FEDAPAY_PAYOUT', status: 'failed', amount: NET });
    expect(await balance(coachId)).toMatchObject({ balance_available: NET });
    const audit = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('admin_audit_logs').select(['action', 'details']).where('admin_id', '=', userIds['admin']).where('action', '=', 'create_payout').executeTakeFirst());
    expect(audit?.details).toMatchObject({ transfer_status: 'failed' });

    // Dépôt créé mais démarrage refusé : échec, fonds libérés, dépôt supprimé chez FedaPay (rien ne partira plus tard).
    fedapay.failNextPayoutStart = true;
    const notStarted = await app.inject({ method: 'POST', url: '/api/admin/finance/payouts', headers: auth('admin'), payload: { practitionerId: coachId, description: 'Test démarrage' } });
    expect(notStarted.statusCode).toBe(502);
    expect(notStarted.json().message).toContain('non démarré');
    expect(await balance(coachId)).toMatchObject({ balance_available: NET });
    expect([...fedapay.payouts.values()].some((p) => p.status === 'pending')).toBe(false);

    const ok = await app.inject({ method: 'POST', url: '/api/admin/finance/payouts', headers: auth('admin'), payload: { practitionerId: coachId, amount: NET, period: { start: futureDate(-1), end: futureDate(0) } } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ status: 'sent', fedapayStatus: 'started', amount: NET, paymentsCount: 1 });
    expect(await balance(coachId)).toMatchObject({ balance_available: 0 });

    // Échec après démarrage (webhook transfer.failed, ou le job) : le paiement réservé redevient « prêt ».
    fedapay.setPayoutStatus(ok.json().transferId, 'failed');
    const failedEvt = await webhook({ id: `evt-${tag}-transfer-failed`, name: 'transfer.failed', entity: { id: ok.json().transferId, status: 'failed' } });
    expect(failedEvt.json()).toMatchObject({ handled: true, status: 'failed', changed: true });
    expect(await balance(coachId)).toMatchObject({ balance_available: NET });
    const p3 = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select('payout_status').where('appointment_id', '=', `group_session_${sessionId}_${participants['p3']}`).executeTakeFirstOrThrow());
    expect(p3.payout_status).toBe('ready');

    // Nouveau reversement possible ; FedaPay peut répondre « sent » dès le démarrage → terminé d'emblée.
    const again = await app.inject({ method: 'POST', url: '/api/admin/finance/payouts', headers: auth('admin'), payload: { practitionerId: coachId, amount: NET, period: { start: futureDate(-1), end: futureDate(0) } } });
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ status: 'sent', amount: NET });
    expect(await balance(coachId)).toMatchObject({ balance_available: 0 });
    fedapay.setPayoutStatus(again.json().transferId, 'sent');
    await app.inject({ method: 'POST', url: '/api/admin/jobs/payouts.sync/run', headers: auth('admin') });
    expect((await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select('status').where('id', '=', again.json().payoutId).executeTakeFirstOrThrow())).status).toBe('completed');
    // M5 : le dépôt FedaPay est tracé sur le reversement dès sa création, avant le démarrage.
    const traced = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select(['transaction_ids', 'account_details']).where('id', '=', again.json().payoutId).executeTakeFirstOrThrow());
    expect(traced.transaction_ids).toEqual([again.json().transferId]);
  });

  it('M5 : un transfert interrompu entre la création du dépôt et l’enregistrement du résultat est rattrapé par payouts.sync', async () => {
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const plant = async (remoteStatus: string) => {
      const deposit = await fedapay.createPayout({ amount: 1000, customer: { firstname: 'Coach', lastname: 'Fit', phoneNumber: '+22997000009' } });
      if (remoteStatus !== 'pending') fedapay.setPayoutStatus(deposit.id, remoteStatus);
      const row = await db.runAs({ role: 'service_role' }, (trx) =>
        trx
          .insertInto('practitioner_payouts')
          .values({ practitioner_id: coachId, amount: 1000, net_amount: 1000, currency: 'XOF', payment_method: 'mtn', status: 'planned', period_start: futureDate(-3), period_end: futureDate(-2), transaction_ids: [deposit.id], account_details: JSON.stringify({ fedapay_status: 'pending', transfer_started_at: startedAt }) })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      return { payoutId: row.id, transferId: deposit.id };
    };
    const neverStarted = await plant('pending');
    const sentMeanwhile = await plant('sent');
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/payouts.sync/run', headers: auth('admin') });
    expect(job.json().result.recovered).toMatchObject({ checked: 2, released: 1, sent: 1, errors: [] });
    const rows = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select(['id', 'status']).where('id', 'in', [neverStarted.payoutId, sentMeanwhile.payoutId]).execute());
    // Jamais démarré : dépôt supprimé chez FedaPay, reversement échoué (fonds libérés) ; envoyé entre-temps : reversement terminé.
    expect(rows.find((r) => r.id === neverStarted.payoutId)?.status).toBe('failed');
    expect(fedapay.payouts.has(neverStarted.transferId)).toBe(false);
    expect(rows.find((r) => r.id === sentMeanwhile.payoutId)?.status).toBe('completed');
    const released = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select('account_details').where('id', '=', neverStarted.payoutId).executeTakeFirstOrThrow());
    expect(String((released.account_details as { error?: string })?.error)).toContain('Transfert interrompu');
    const notified = await db.db.selectFrom('notifications').select('message').where('user_id', '=', userIds['coach']).where('message', 'like', '%Transfert interrompu%').executeTakeFirst();
    expect(notified).toBeDefined();
  });

  it('remboursements : API FedaPay confirmée ou en attente puis confirmée, canal manuel, écritures, inscription remboursée', async () => {
    // FedaPay répond « pending » : rien n'est comptabilisé tant que le remboursement n'est pas confirmé.
    fedapay.pendingNextRefund = true;
    const pending = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 2000, reason: 'Geste commercial' } });
    expect(pending.statusCode).toBe(201);
    expect(pending.json()).toMatchObject({ refundAmount: 2000, status: 'pending', paymentStatus: 'paid', netRefund: 0 });
    const blocked = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 1000, reason: 'Autre' } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: 'REFUND_PENDING' });
    // Le job ne confirme pas un partiel (la transaction FedaPay reste « approved ») ; l'administrateur le fait.
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/payouts.sync/run', headers: auth('admin') });
    expect(job.json().result.refunds.still_pending).toBeGreaterThanOrEqual(1);
    expect((await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select('status').where('id', '=', paymentIds['p1']).executeTakeFirstOrThrow())).status).toBe('paid');
    const confirmed = await app.inject({ method: 'POST', url: `/api/admin/finance/refunds/${pending.json().refundId}/confirm`, headers: auth('admin'), payload: { providerReference: 'FP-RB-0001' } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ refundId: pending.json().refundId, refundAmount: 2000, status: 'completed', paymentStatus: 'partially_refunded', netRefund: 1900 });
    const twice = await app.inject({ method: 'POST', url: `/api/admin/finance/refunds/${pending.json().refundId}/confirm`, headers: auth('admin'), payload: {} });
    expect(twice.statusCode).toBe(400);

    // FedaPay confirme dans la réponse : comptabilisé immédiatement.
    const partial = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 2000, reason: 'Geste commercial' } });
    expect(partial.statusCode).toBe(201);
    expect(partial.json()).toMatchObject({ refundAmount: 2000, status: 'completed', paymentStatus: 'partially_refunded', netRefund: 1900 });
    // Un webhook « refunded » reçu après un remboursement partiel ne passe pas le paiement en remboursement intégral.
    const refundedEvt = await webhook({ id: `evt-${tag}-refunded-partial`, name: 'transaction.refunded', entity: { id: transactions['p1'], status: 'refunded' } });
    expect(refundedEvt.json()).toMatchObject({ status: 'partially_refunded', changed: false });
    const tooMuch = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 7000, reason: 'x' } });
    expect(tooMuch.statusCode).toBe(400);
    // Canal manuel (remboursement fait depuis le tableau de bord FedaPay) : référence obligatoire, aucun appel API.
    const noRef = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], reason: 'Séance annulée', channel: 'manual' } });
    expect(noRef.statusCode).toBe(400);
    const rest = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], reason: 'Séance annulée', channel: 'manual', providerReference: 'FP-DASH-4242' } });
    expect(rest.statusCode).toBe(201);
    expect(rest.json()).toMatchObject({ refundAmount: 6000, status: 'completed', paymentStatus: 'refunded' });
    expect(fedapay.transactions.get(transactions['p1'])?.refunded).toBe(4000);
    const manualRow = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payment_refunds').select(['provider_refund_id', 'status']).where('id', '=', rest.json().refundId).executeTakeFirstOrThrow());
    expect(manualRow).toMatchObject({ provider_refund_id: 'FP-DASH-4242', status: 'completed' });
    const participant = await db.db.selectFrom('group_session_participants').select('payment_status').where('id', '=', participants['p1']).executeTakeFirstOrThrow();
    expect(participant.payment_status).toBe('refunded');
    const session = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('group_sessions').select('current_participants').where('id', '=', sessionId).executeTakeFirstOrThrow());
    expect(session.current_participants).toBe(1);
    const entries = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('ledger_entries').select(['debit', 'credit']).where('reference_type', '=', 'refund').where('reference_id', '=', rest.json().refundId).execute());
    expect(entries.reduce((s, e) => s + e.debit, 0)).toBe(entries.reduce((s, e) => s + e.credit, 0));
    const list = await app.inject({ method: 'GET', url: '/api/admin/finance/refunds', headers: auth('admin') });
    expect(list.json().count).toBeGreaterThanOrEqual(3);
    const notif = await db.db.selectFrom('notifications').select('message').where('user_id', '=', userIds['p1']).where('title', '=', 'Remboursement effectué').execute();
    expect(notif.length).toBe(3);
  });

  it('réconciliation FedaPay, réparation des soldes, rejeu d’un webhook échoué', async () => {
    const rec = await app.inject({ method: 'POST', url: '/api/admin/finance/reconciliation', headers: auth('admin'), payload: {} });
    expect(rec.statusCode).toBe(201);
    expect(rec.json().summary.matched_count).toBeGreaterThanOrEqual(2);
    // M5 : les dépôts FedaPay sont réconciliés avec les reversements ; aucun écart attendu ici.
    expect(rec.json().summary.payouts_matched_count).toBeGreaterThanOrEqual(2);
    expect(rec.json().anomalies.filter((a: { type: string }) => a.type.startsWith('payout_'))).toEqual([]);
    const report = await app.inject({ method: 'GET', url: `/api/admin/finance/reconciliation/${rec.json().report_id}`, headers: auth('admin') });
    expect(report.json().status).toBe('completed');
    const repair = await app.inject({ method: 'POST', url: '/api/admin/finance/balances/repair', headers: auth('admin') });
    expect(repair.json().success).toBe(true);

    const failed = await webhook({ id: `evt-${tag}-unknown`, name: 'transaction.approved', entity: { id: 'tx-unknown-' + tag, status: 'approved' } });
    expect(failed.statusCode).toBe(404);
    const events = await app.inject({ method: 'GET', url: '/api/admin/finance/webhook-events?status=failed', headers: auth('admin') });
    const evt = events.json().data.find((e: { event_id: string }) => e.event_id === `evt-${tag}-unknown`);
    expect(evt).toBeDefined();
    const retry = await app.inject({ method: 'POST', url: `/api/admin/finance/webhook-events/${evt.id}/retry`, headers: auth('admin') });
    expect(retry.json().status).toBe('failed');
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/webhooks.retry/run', headers: auth('admin'), payload: { force: true } });
    expect(job.json().result.total_processed).toBeGreaterThanOrEqual(1);
  });

  it('lectures finance : informations de reversement du praticien et listes admin filtrées, réservées aux rôles finance', async () => {
    const info = await app.inject({ method: 'GET', url: '/api/finance/me/payment-info', headers: auth('coach') });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toEqual([expect.objectContaining({ payment_method: 'mtn', phone_number: '+22997000009', is_verified: true })]);
    expect((await app.inject({ method: 'GET', url: '/api/finance/me/payment-info', headers: auth('p1') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/finance/me/payment-info' })).statusCode).toBe(401);

    const adminReads = ['payments', 'balances', 'payouts', 'payout-batches', 'reconciliation', 'payment-events'];
    for (const path of adminReads) {
      expect((await app.inject({ method: 'GET', url: `/api/admin/finance/${path}`, headers: auth('coach') })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: `/api/admin/finance/${path}` })).statusCode).toBe(401);
    }

    const payments = await app.inject({ method: 'GET', url: '/api/admin/finance/payments?limit=100', headers: auth('admin') });
    expect(payments.statusCode).toBe(200);
    expect(payments.json().count).toBeGreaterThanOrEqual(1);
    expect(payments.json().data.find((p: { id: string }) => p.id === paymentIds['p1'])).toMatchObject({ payout_status: 'paid', group_session_name: expect.any(String), appointment_practitioner_name: 'Coach Fit' });
    const paid = await app.inject({ method: 'GET', url: '/api/admin/finance/payments?payoutStatus=paid&limit=100', headers: auth('admin') });
    expect(paid.json().data.every((p: { payout_status: string }) => p.payout_status === 'paid')).toBe(true);
    const future = await app.inject({ method: 'GET', url: `/api/admin/finance/payments?from=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`, headers: auth('admin') });
    expect(future.json()).toEqual({ data: [], count: 0 });
    expect((await app.inject({ method: 'GET', url: '/api/admin/finance/payments?payoutStatus=inconnu', headers: auth('admin') })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/admin/finance/payments?limit=1001', headers: auth('admin') })).statusCode).toBe(400);

    const balances = await app.inject({ method: 'GET', url: '/api/admin/finance/balances', headers: auth('admin') });
    expect(balances.statusCode).toBe(200);
    expect(balances.json().find((b: { practitioner_id: string }) => b.practitioner_id === coachId)).toMatchObject({ name: 'Coach Fit', kyc_status: 'approved' });

    const payouts = await app.inject({ method: 'GET', url: `/api/admin/finance/payouts?batchId=${batchId}`, headers: auth('admin') });
    expect(payouts.json()).toMatchObject({ count: 1, data: [expect.objectContaining({ id: payoutId, practitioner_name: 'Coach Fit', status: 'completed' })] });
    const coachPayouts = await app.inject({ method: 'GET', url: `/api/admin/finance/payouts?practitionerId=${coachId}&status=completed`, headers: auth('admin') });
    expect(coachPayouts.json().data.every((p: { practitioner_id: string; status: string }) => p.practitioner_id === coachId && p.status === 'completed')).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/admin/finance/payouts?practitionerId=pas-un-uuid', headers: auth('admin') })).statusCode).toBe(400);

    const batches = await app.inject({ method: 'GET', url: '/api/admin/finance/payout-batches?limit=100', headers: auth('admin') });
    expect(batches.json().count).toBeGreaterThanOrEqual(1);
    expect(batches.json().data.find((b: { id: string }) => b.id === batchId)).toMatchObject({ batch_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

    const reports = await app.inject({ method: 'GET', url: '/api/admin/finance/reconciliation?limit=100', headers: auth('admin') });
    expect(reports.statusCode).toBe(200);
    expect(reports.json().some((r: { created_by: string; status: string }) => r.created_by === userIds['admin'] && r.status === 'completed')).toBe(true);

    const events = await app.inject({ method: 'GET', url: '/api/admin/finance/payment-events?limit=100', headers: auth('admin') });
    expect(events.statusCode).toBe(200);
    expect(events.json().some((e: { payment_id: string; event_type: string }) => e.payment_id === paymentIds['p1'] && e.event_type === 'funds_released')).toBe(true);
  });

  it('clôture d’une séance passée par son coach ; séance future, autre compte et séance terminée refusés', async () => {
    const pastDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const [past, upcoming] = await db.runAs({ role: 'service_role' }, (trx) => trx.insertInto('group_sessions').values([
      { coach_id: coachId, session_name: `Passée ${tag}`, session_type: 'groupe', scheduled_date: pastDate, start_time: '07:00', end_time: '08:00', price_per_person: PRICE, location: 'Cotonou', status: 'confirmee' },
      { coach_id: coachId, session_name: `Future ${tag}`, session_type: 'groupe', scheduled_date: futureDate, start_time: '07:00', end_time: '08:00', price_per_person: PRICE, location: 'Cotonou', status: 'planifiee' },
    ]).returning('id').execute());
    expect((await app.inject({ method: 'POST', url: `/api/group-sessions/${past.id}/complete` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/group-sessions/${past.id}/complete`, headers: auth('p1') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/group-sessions/${upcoming.id}/complete`, headers: auth('coach') })).statusCode).toBe(400);
    const done = await app.inject({ method: 'POST', url: `/api/group-sessions/${past.id}/complete`, headers: auth('coach') });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ id: past.id, status: 'terminee', scheduled_date: pastDate });
    expect((await app.inject({ method: 'POST', url: `/api/group-sessions/${past.id}/complete`, headers: auth('coach') })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/group-sessions/00000000-0000-0000-0000-000000000000/complete', headers: auth('coach') })).statusCode).toBe(404);
  });

  it('rappels de paiement (un par 24 h) et annulation de la séance par le coach', async () => {
    const r2 = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/register`, headers: auth('p2'), payload: { paymentMethod: 'mtn', phoneNumber: '+22997000001' } });
    expect(r2.statusCode).toBe(201);
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('group_session_participants').set({ joined_at: new Date(Date.now() - 2 * 86_400_000) }).where('id', '=', r2.json().participantId).execute());
    const first = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.reminders/run', headers: auth('admin') });
    expect(first.json().result.reminders_sent).toBe(1);
    const second = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.reminders/run', headers: auth('admin') });
    expect(second.json().result.reminders_sent).toBe(0);

    const cancel = await app.inject({ method: 'POST', url: `/api/group-sessions/${sessionId}/cancel`, headers: auth('coach'), payload: { reason: 'Intempéries' } });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ status: 'annulee', payments_canceled: 1, refunds_to_process: 1 });
    const canceled = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select('status').where('id', '=', r2.json().paymentId).executeTakeFirstOrThrow());
    expect(canceled.status).toBe('canceled');
    const adminNotif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['admin']).where('title', 'like', '%remboursements à traiter%').executeTakeFirst();
    expect(adminNotif).toBeDefined();
    expect((await app.inject({ method: 'GET', url: `/api/group-sessions/${sessionId}` })).statusCode).toBe(404);
  });
});
