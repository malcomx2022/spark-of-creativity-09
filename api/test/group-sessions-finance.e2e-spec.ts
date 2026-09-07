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
const NET = 6_300; // 37 % de commission, frais passerelle payés par la plateforme

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

  it('lot de reversements : réservation des fonds, traitement FedaPay, webhook transfer', async () => {
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
    expect(fedapay.payouts.get(transferId)?.input.customer).toMatchObject({ phoneNumber: '97000009' });
    const mine = await app.inject({ method: 'GET', url: '/api/finance/me/payouts', headers: auth('coach') });
    expect(mine.json()[0]).toMatchObject({ id: payoutId, status: 'sent' });

    const evt = await webhook({ id: `evt-${tag}-transfer`, name: 'transfer.approved', entity: { id: transferId, status: 'approved' } });
    expect(evt.statusCode).toBe(200);
    expect(evt.json()).toMatchObject({ handled: true, status: 'completed' });
    const done = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('practitioner_payouts').select('status').where('id', '=', payoutId).executeTakeFirstOrThrow());
    expect(done.status).toBe('completed');
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['coach']).where('title', '=', 'Reversement effectué').executeTakeFirst();
    expect(notif).toBeDefined();
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
    const ok = await app.inject({ method: 'POST', url: '/api/admin/finance/payouts', headers: auth('admin'), payload: { practitionerId: coachId, amount: NET, period: { start: futureDate(-1), end: futureDate(0) } } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ status: 'sent', amount: NET, paymentsCount: 1 });
    expect(await balance(coachId)).toMatchObject({ balance_available: 0 });
  });

  it('remboursement partiel puis total : FedaPay, écritures comptables, inscription remboursée', async () => {
    const partial = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 4000, reason: 'Geste commercial' } });
    expect(partial.statusCode).toBe(201);
    expect(partial.json()).toMatchObject({ refundAmount: 4000, status: 'completed', paymentStatus: 'partially_refunded', netRefund: 2520 });
    const tooMuch = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], refundAmount: 7000, reason: 'x' } });
    expect(tooMuch.statusCode).toBe(400);
    const rest = await app.inject({ method: 'POST', url: '/api/admin/finance/refunds', headers: auth('admin'), payload: { paymentId: paymentIds['p1'], reason: 'Séance annulée' } });
    expect(rest.json()).toMatchObject({ refundAmount: 6000, paymentStatus: 'refunded' });
    const participant = await db.db.selectFrom('group_session_participants').select('payment_status').where('id', '=', participants['p1']).executeTakeFirstOrThrow();
    expect(participant.payment_status).toBe('refunded');
    const session = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('group_sessions').select('current_participants').where('id', '=', sessionId).executeTakeFirstOrThrow());
    expect(session.current_participants).toBe(1);
    const entries = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('ledger_entries').select(['debit', 'credit']).where('reference_type', '=', 'refund').where('reference_id', '=', rest.json().refundId).execute());
    expect(entries.reduce((s, e) => s + e.debit, 0)).toBe(entries.reduce((s, e) => s + e.credit, 0));
    const list = await app.inject({ method: 'GET', url: '/api/admin/finance/refunds', headers: auth('admin') });
    expect(list.json().count).toBeGreaterThanOrEqual(2);
    const notif = await db.db.selectFrom('notifications').select('message').where('user_id', '=', userIds['p1']).where('title', '=', 'Remboursement effectué').execute();
    expect(notif.length).toBe(2);
  });

  it('réconciliation FedaPay, réparation des soldes, rejeu d’un webhook échoué', async () => {
    const rec = await app.inject({ method: 'POST', url: '/api/admin/finance/reconciliation', headers: auth('admin'), payload: {} });
    expect(rec.statusCode).toBe(201);
    expect(rec.json().summary.matched_count).toBeGreaterThanOrEqual(2);
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
