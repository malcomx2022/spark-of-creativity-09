/**
 * Étape 3 — rendez-vous, paiements FedaPay (client factice), webhook signé, jobs.
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
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const emails = { patient: `pay-pat-${tag}@domicares.test`, other: `pay-oth-${tag}@domicares.test`, practitioner: `pay-prat-${tag}@domicares.test`, admin: `pay-adm-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const patientPhone = `+2299${suffix}3`;
const practitionerPhone = `+2299${suffix}4`;
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake\n').toString('base64');
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sign = (body: string) => createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');

describe('Appointments & payments (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let fedapay: FakeFedaPayClient;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let practitionerId = '';
  let appointmentId = '';
  let paymentId = '';
  let transactionId = '';

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function webhook(body: Record<string, unknown>, signature?: string) {
    const raw = JSON.stringify(body);
    return app.inject({ method: 'POST', url: '/api/webhooks/fedapay', headers: { 'content-type': 'application/json', 'x-fedapay-signature': signature ?? sign(raw) }, payload: raw });
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    fedapay = app.get(FakeFedaPayClient);
    await signup('patient', emails.patient, { phone: patientPhone });
    await signup('other', emails.other);
    await signup('practitioner', emails.practitioner, { userType: 'practitioner', practitionerType: 'medecin' });
    await signup('admin', emails.admin);
    await db.db.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'finance' }).execute();
    const reg = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('practitioner'),
      payload: { profile: { fullName: 'Doc Pay', phone: practitionerPhone }, practitioner: { name: 'Doc Pay', phone: practitionerPhone, specialty: `Généraliste ${tag}`, practitionerType: 'medecin', latitude: 6.37, longitude: 2.39 }, documents: { idDocument: pdf, licenseDocument: pdf } },
    });
    practitionerId = reg.json().practitioner.id;
    await db.db.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'compliance' }).execute();
    const kyc = await app.inject({ method: 'POST', url: `/api/admin/kyc/${practitionerId}/decision`, headers: auth('admin'), payload: { status: 'approved' } });
    expect(kyc.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = Object.values(userIds);
      await sql`delete from public.ledger_entries where reference_id in (select id::text from public.payments where patient_id = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.ledger_accounts where owner_id = any(${ids}::uuid[]) or owner_id::text = ${practitionerId}`.execute(trx);
      await sql`delete from public.payment_events where payment_id in (select id from public.payments where patient_id = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.payment_attempts where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.payments where patient_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.appointments where patient_id = any(${ids.map(String)}::text[])`.execute(trx);
      await sql`delete from public.practitioner_balances where practitioner_id::text = ${practitionerId}`.execute(trx);
      await sql`delete from public.file_access_logs where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.files where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.admin_audit_logs where admin_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
    });
    await app.close();
  });

  it('le patient demande un rendez-vous → awaiting_practitioner, praticien notifié', async () => {
    const past = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: '2020-01-01', time: '10:00', reason: 'Fièvre' } });
    expect(past.statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(7), time: '10:00', reason: 'Fièvre persistante', address: 'Rue 12, Cotonou' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'awaiting_practitioner', practitioner_name: 'Doc Pay', payment_amount: null });
    appointmentId = res.json().id;
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['practitioner']).where('type', '=', 'appointment').executeTakeFirst();
    expect(notif?.title).toBe('Nouvelle demande de rendez-vous');
    const forbidden = await app.inject({ method: 'GET', url: `/api/appointments/${appointmentId}`, headers: auth('other') });
    expect(forbidden.statusCode).toBe(403);
    const mine = await app.inject({ method: 'GET', url: '/api/appointments?status=active', headers: auth('practitioner') });
    expect(mine.json().some((a: { id: string }) => a.id === appointmentId)).toBe(true);
  });

  it('le praticien accepte → pending_payment, paiement FedaPay initié avec les frais officiels', async () => {
    const notMine = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/respond`, headers: auth('patient'), payload: { action: 'accept' } });
    expect(notMine.statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/respond`, headers: auth('practitioner'), payload: { action: 'accept' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'pending_payment', amount: 15000 });
    expect(res.json().paymentUrl).toContain('fedapay.fake');
    paymentId = res.json().paymentId;
    transactionId = res.json().transactionId;
    const again = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/respond`, headers: auth('practitioner'), payload: { action: 'accept' } });
    expect(again.statusCode).toBe(409);

    const payment = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow());
    expect(payment).toMatchObject({ status: 'initiated', payout_status: 'pending', amount: 15000, commission_amount: 5550, net_amount: 9450, gateway_fees_amount: 325, payment_method: 'mtn', currency: 'XOF' });
    expect(payment.fedapay_transaction_id).toBe(transactionId);
    const appt = await app.inject({ method: 'GET', url: `/api/appointments/${appointmentId}`, headers: auth('patient') });
    expect(appt.json()).toMatchObject({ status: 'pending_payment', payment_amount: 15000 });
    expect(appt.json().payment_expires_at).not.toBeNull();
    // Un second paiement immédiat est refusé tant que le premier est en cours (2 min).
    const dup = await app.inject({ method: 'POST', url: '/api/payments', headers: auth('patient'), payload: { appointmentId, paymentMethod: 'moov', phoneNumber: patientPhone, payerName: 'User patient' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('PAYMENT_IN_PROGRESS');
  });

  it('webhook FedaPay : signature vérifiée, idempotence, paiement → paid, rendez-vous confirmé, ledger et solde', async () => {
    const body = { id: `evt-${tag}-1`, name: 'transaction.approved', entity: { id: transactionId, status: 'approved' } };
    const unsigned = await app.inject({ method: 'POST', url: '/api/webhooks/fedapay', payload: body });
    expect(unsigned.statusCode).toBe(401);
    const bad = await webhook(body, 'deadbeef');
    expect(bad.statusCode).toBe(401);
    const ok = await webhook(body);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ received: true, status: 'paid', changed: true });
    const dup = await webhook(body);
    expect(dup.json()).toMatchObject({ received: true, duplicate: true });
    // Format FedaPay « t=…,s=… » accepté aussi.
    const raw = JSON.stringify({ id: `evt-${tag}-1b`, name: 'transaction.approved', entity: { id: transactionId, status: 'approved' } });
    const ts = String(Math.floor(Date.now() / 1000));
    const stripe = await app.inject({ method: 'POST', url: '/api/webhooks/fedapay', headers: { 'content-type': 'application/json', 'x-fedapay-signature': `t=${ts},s=${createHmac('sha256', 'test-webhook-secret').update(`${ts}.${raw}`).digest('hex')}` }, payload: raw });
    expect(stripe.statusCode).toBe(200);
    expect(stripe.json().changed).toBe(false);

    const payment = await app.inject({ method: 'GET', url: `/api/payments/${paymentId}`, headers: auth('patient') });
    expect(payment.json()).toMatchObject({ status: 'paid', payout_status: 'held' });
    expect(payment.json().hold_until).not.toBeNull();
    expect(payment.json().invoice_number).toMatch(/^INV-\d{6}-\d{6}$/);
    const appt = await app.inject({ method: 'GET', url: `/api/appointments/${appointmentId}`, headers: auth('practitioner') });
    expect(appt.json().status).toBe('confirmed');
    const entries = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('ledger_entries').selectAll().where('reference_id', '=', paymentId).execute());
    expect(entries.length).toBe(5);
    expect(entries.reduce((s, e) => s + e.debit, 0)).toBe(15000);
    expect(entries.reduce((s, e) => s + e.credit, 0)).toBe(15000 + 9450 + 5550 + 325);
    const balance = await db.db.selectFrom('practitioner_balances').selectAll().where('practitioner_id', '=', practitionerId).executeTakeFirstOrThrow();
    expect(balance.balance_on_hold).toBe(9450);
    const events = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('webhook_events').select(['processing_status']).where('event_id', '=', `evt-${tag}-1`).executeTakeFirstOrThrow());
    expect(events.processing_status).toBe('success');
    const pNotif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['practitioner']).where('title', 'like', '%paiement reçu%').executeTakeFirst();
    expect(pNotif).toBeDefined();
    const other = await app.inject({ method: 'GET', url: `/api/payments/${paymentId}`, headers: auth('other') });
    expect(other.statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/api/payments', headers: auth('practitioner') });
    expect(list.json().some((p: { id: string }) => p.id === paymentId)).toBe(true);
  });

  it('cycle de consultation : en_route (GPS) → in_progress → complete → confirmation patient', async () => {
    const enRoute = await app.inject({ method: 'PATCH', url: `/api/appointments/${appointmentId}/practitioner-status`, headers: auth('practitioner'), payload: { status: 'en_route', latitude: 6.36, longitude: 2.38 } });
    expect(enRoute.statusCode).toBe(200);
    expect(enRoute.json()).toMatchObject({ practitioner_status: 'en_route', visit_status: 'en_route' });
    expect(Number(enRoute.json().practitioner_latitude)).toBeCloseTo(6.36);
    const started = await app.inject({ method: 'PATCH', url: `/api/appointments/${appointmentId}/practitioner-status`, headers: auth('practitioner'), payload: { status: 'in_progress' } });
    expect(started.json()).toMatchObject({ status: 'in-progress', practitioner_status: 'in_progress' });
    expect(started.json().consultation_started_at).not.toBeNull();
    const tooEarly = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/confirm`, headers: auth('patient') });
    expect(tooEarly.statusCode).toBe(409);
    const done = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/complete`, headers: auth('practitioner'), payload: { notes: 'RAS' } });
    expect(done.json()).toMatchObject({ status: 'awaiting_confirmation' });
    const patientView = await app.inject({ method: 'GET', url: `/api/appointments/${appointmentId}`, headers: auth('patient') });
    expect(patientView.json().internal_notes).toBeNull();
    const confirmed = await app.inject({ method: 'POST', url: `/api/appointments/${appointmentId}/confirm`, headers: auth('patient') });
    expect(confirmed.json().status).toBe('completed');
    expect(confirmed.json().patient_confirmed_at).not.toBeNull();
  });

  it('demande sans praticien : affectation du praticien validé le plus proche (type ou spécialité), 400 sans position, 404 sans candidat', async () => {
    await app.inject({ method: 'PATCH', url: '/api/practitioners/me', headers: auth('practitioner'), payload: { available: true } });
    const none = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { specialty: 'kinesitherapeute', date: futureDate(12), time: '10:00', reason: 'Sans praticien', latitude: 6.37, longitude: 2.39 } });
    expect(none.statusCode).toBe(404);
    const noPoint = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('other'), payload: { specialty: 'medecin', date: futureDate(12), time: '10:00', reason: 'Sans position' } });
    expect(noPoint.statusCode).toBe(400);
    // Spécialité propre à cette exécution : le praticien affecté est bien celui de la suite (la base locale peut contenir d'autres médecins).
    const bySpecialty = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { specialty: `Généraliste ${tag}`, date: futureDate(12), time: '10:00', reason: 'Sans praticien', latitude: 6.37, longitude: 2.39 } });
    expect(bySpecialty.statusCode).toBe(201);
    expect(bySpecialty.json()).toMatchObject({ status: 'awaiting_practitioner', practitioner_name: 'Doc Pay', practitioner_id: practitionerId });
    // Sans créneau déclaré, l'affectation est « hors créneau » : les administrateurs sont prévenus.
    const adminNotif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['admin']).where('title', '=', 'Demande affectée hors créneau').executeTakeFirst();
    expect(adminNotif).toBeDefined();
  });

  it('annulation d’un paiement en attente, nouvelle tentative, puis job de nettoyage', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(8), time: '11:00', reason: 'Contrôle' } });
    const id2 = created.json().id;
    const accepted = await app.inject({ method: 'POST', url: `/api/appointments/${id2}/respond`, headers: auth('practitioner'), payload: { action: 'accept', paymentMethod: 'moov' } });
    const p2 = accepted.json().paymentId as string;
    const cancel = await app.inject({ method: 'POST', url: `/api/payments/${p2}/cancel`, headers: auth('patient') });
    expect(cancel.statusCode).toBe(200);
    const after = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select(['status', 'payout_status']).where('id', '=', p2).executeTakeFirstOrThrow());
    expect(after).toMatchObject({ status: 'canceled', payout_status: 'failed' });
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${id2}`, headers: auth('patient') })).json().status).toBe('confirmed');

    const retry = await app.inject({ method: 'POST', url: '/api/payments', headers: auth('patient'), payload: { appointmentId: id2, paymentMethod: 'mtn', phoneNumber: patientPhone, payerName: 'User patient' } });
    expect(retry.statusCode).toBe(201);
    const p3 = retry.json().paymentId as string;
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${id2}`, headers: auth('patient') })).json().status).toBe('pending_payment');

    const forbidden = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.cleanup/run', headers: auth('patient'), payload: {} });
    expect(forbidden.statusCode).toBe(403);
    const dry = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.cleanup/run', headers: auth('admin'), payload: { expirationMinutes: 0, dryRun: true } });
    expect(dry.json().result.count).toBeGreaterThanOrEqual(1);
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.cleanup/run', headers: auth('admin'), payload: { expirationMinutes: 0 } });
    expect(job.statusCode).toBe(200);
    expect(job.json().result.cleaned.some((c: { paymentId: string }) => c.paymentId === p3)).toBe(true);
    const cleaned = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('payments').select('status').where('id', '=', p3).executeTakeFirstOrThrow());
    expect(cleaned.status).toBe('canceled');
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${id2}`, headers: auth('patient') })).json().status).toBe('confirmed');
  });

  it('job payments.sync : statut approuvé côté FedaPay récupéré sans webhook ; sync manuel', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(9), time: '09:00', reason: 'Suivi' } });
    const id3 = created.json().id;
    const accepted = await app.inject({ method: 'POST', url: `/api/appointments/${id3}/respond`, headers: auth('practitioner'), payload: { action: 'accept' } });
    fedapay.setStatus(accepted.json().transactionId, 'approved');
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/payments.sync/run', headers: auth('admin'), payload: { staleMinutes: 0 } });
    expect(job.json().result.updated).toBeGreaterThanOrEqual(1);
    const paid = await app.inject({ method: 'GET', url: `/api/payments/${accepted.json().paymentId}`, headers: auth('patient') });
    expect(paid.json().status).toBe('paid');
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${id3}`, headers: auth('patient') })).json().status).toBe('confirmed');
    const manual = await app.inject({ method: 'POST', url: `/api/payments/${accepted.json().paymentId}/sync`, headers: auth('patient') });
    expect(manual.json()).toMatchObject({ synced: false, status: 'paid' });
    const balance = await db.db.selectFrom('practitioner_balances').select('balance_on_hold').where('practitioner_id', '=', practitionerId).executeTakeFirstOrThrow();
    expect(balance.balance_on_hold).toBe(9450 * 2);
  });

  it('job consultations.tick : créneau non payé expiré → cancelled_unpaid', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(10), time: '14:00', reason: 'Expiration' } });
    const id4 = created.json().id;
    await app.inject({ method: 'POST', url: `/api/appointments/${id4}/respond`, headers: auth('practitioner'), payload: { action: 'accept' } });
    await db.runAs({ role: 'service_role' }, (trx) => trx.updateTable('appointments').set({ payment_expires_at: new Date(Date.now() - 60_000) }).where('id', '=', id4).execute());
    const job = await app.inject({ method: 'POST', url: '/api/admin/jobs/consultations.tick/run', headers: auth('admin'), payload: {} });
    expect(job.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/appointments/${id4}`, headers: auth('patient') })).json().status).toBe('cancelled_unpaid');
  });

  it('refus du praticien sans remplaçant → rejected, patient notifié ; annulation par le patient', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(11), time: '16:00', reason: 'Refus' } });
    const id5 = created.json().id;
    const rejected = await app.inject({ method: 'POST', url: `/api/appointments/${id5}/respond`, headers: auth('practitioner'), payload: { action: 'reject', reason: 'Indisponible' } });
    expect(rejected.json()).toMatchObject({ status: 'rejected', reassignedTo: null });
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['patient']).where('title', 'like', '%refusé%').executeTakeFirst();
    expect(notif).toBeDefined();

    const created2 = await app.inject({ method: 'POST', url: '/api/appointments', headers: auth('patient'), payload: { practitionerId, specialty: 'Généraliste', date: futureDate(12), time: '16:00', reason: 'Annulation' } });
    const cancel = await app.inject({ method: 'POST', url: `/api/appointments/${created2.json().id}/cancel`, headers: auth('patient'), payload: { reason: 'Empêchement' } });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ status: 'cancelled', refundRequired: false });
  });
});
