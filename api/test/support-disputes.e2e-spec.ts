/**
 * Étape 6 — support (tickets, FAQ), litiges (SLA, messages, traitement admin) et statistiques des tableaux de bord.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { DisputesService } from '../src/disputes/disputes.service';

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

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const emails = { patient: `sup-pat-${tag}@domicares.test`, other: `sup-oth-${tag}@domicares.test`, coach: `sup-coach-${tag}@domicares.test`, support: `sup-adm-${tag}@domicares.test`, finance: `sup-fin-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake\n').toString('base64');
const isoDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('Support, disputes & stats (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let coachId = '';
  const appointments: Record<string, string> = {};
  let ticketId = '';
  let faqId = '';
  let disputeId = '';

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function insertAppointment(key: string, status: string, date: string, extra: Record<string, unknown> = {}) {
    const row = await db.runAs({ role: 'service_role' }, (trx) =>
      trx
        .insertInto('appointments')
        .values({ patient_id: userIds['patient'], patient_name: 'User patient', practitioner_id: coachId, practitioner_name: 'Coach Fit', specialty: 'Coaching sportif', date, time: '09:00', address: 'Cotonou', reason: 'Séance', status: status as never, payment_amount: 10_000, ...extra } as never)
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    appointments[key] = row.id;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    await signup('coach', emails.coach, { userType: 'practitioner', practitionerType: 'coach_sportif' });
    await signup('patient', emails.patient);
    await signup('other', emails.other);
    await signup('support', emails.support);
    await signup('finance', emails.finance);
    await db.db.insertInto('user_roles').values([{ user_id: userIds['support'], role: 'support' }, { user_id: userIds['finance'], role: 'finance' }]).execute();
    const reg = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('coach'),
      payload: {
        profile: { fullName: 'Coach Fit', phone: `+2299${suffix}3` },
        practitioner: { name: 'Coach Fit', phone: `+2299${suffix}3`, specialty: 'Coaching sportif', practitionerType: 'coach_sportif', sessionTypes: ['Remise en forme'], interventionZone: 'Cotonou', interventionRadius: 10, latitude: 6.37, longitude: 2.39 },
        documents: { idDocument: pdf, diploma: pdf },
      },
    });
    expect(reg.statusCode).toBe(201);
    coachId = reg.json().practitioner.id;
    const month = isoDate(0).slice(0, 7);
    await insertAppointment('completed', 'completed', `${month}-01`, { consultation_started_at: new Date('2026-01-01T09:00:00Z'), consultation_ended_at: new Date('2026-01-01T09:45:00Z') });
    await insertAppointment('completed2', 'completed', `${month}-02`);
    await insertAppointment('confirmed', 'confirmed', isoDate(3));
    await insertAppointment('awaiting', 'awaiting_practitioner', isoDate(4));
    await insertAppointment('pending', 'pending_payment', isoDate(5));
    await insertAppointment('cancelled', 'cancelled', isoDate(-10));
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = Object.values(userIds);
      const apts = Object.values(appointments);
      await sql`delete from public.dispute_messages where dispute_id in (select id from public.disputes where raised_by = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.disputes where raised_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.support_tickets where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.faqs where created_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.notifications where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.admin_audit_logs where admin_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.appointments where id = any(${apts}::text[])`.execute(trx);
      await sql`delete from public.file_access_logs where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.files where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.user_roles where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
    });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Tickets de support
  // ---------------------------------------------------------------------------
  it('un utilisateur ouvre un ticket (rendez-vous vérifié), le support est notifié, un tiers ne le voit pas', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/support/tickets', headers: auth('patient'), payload: { subject: '', description: 'x' } });
    expect(bad.statusCode).toBe(400);
    const foreign = await app.inject({ method: 'POST', url: '/api/support/tickets', headers: auth('other'), payload: { subject: 'Problème', description: 'RDV pas à moi', appointmentId: appointments['completed'] } });
    expect(foreign.statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/support/tickets', headers: auth('patient'), payload: { subject: 'Coach en retard', description: 'Le coach est arrivé 30 minutes en retard.', priority: 'high', appointmentId: appointments['completed'] } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'ouvert', priority: 'high', user_id: userIds['patient'] });
    ticketId = created.json().id;
    const mine = await app.inject({ method: 'GET', url: '/api/support/tickets', headers: auth('patient') });
    expect(mine.json().map((t: { id: string }) => t.id)).toContain(ticketId);
    expect((await app.inject({ method: 'GET', url: `/api/support/tickets/${ticketId}`, headers: auth('other') })).statusCode).toBe(403);
    const notif = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth('support') });
    expect(notif.statusCode).toBe(200);
    const list = Array.isArray(notif.json()) ? notif.json() : notif.json().data;
    expect(list.some((n: { type: string }) => n.type === 'support_ticket_created')).toBe(true);
  });

  it('le support traite le ticket (réponse, statut résolu) ; rôle finance refusé ; statistiques', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/support/tickets', headers: auth('finance') })).statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/api/admin/support/tickets?status=ouvert&search=retard', headers: auth('support') });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.map((t: { id: string }) => t.id)).toContain(ticketId);
    const updated = await app.inject({ method: 'PATCH', url: `/api/admin/support/tickets/${ticketId}`, headers: auth('support'), payload: { status: 'resolu', response: 'Nous avons contacté le coach, un geste commercial a été appliqué.', tags: ['retard'] } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ status: 'resolu', tags: ['retard'] });
    expect(updated.json().resolved_at).toBeTruthy();
    const stats = await app.inject({ method: 'GET', url: '/api/admin/support/tickets/stats', headers: auth('support') });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().resolved).toBeGreaterThanOrEqual(1);
    const notif = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth('patient') });
    const list2 = Array.isArray(notif.json()) ? notif.json() : notif.json().data;
    expect(list2.some((n: { type: string }) => n.type === 'support_ticket_updated')).toBe(true);
    const audit = await db.db.selectFrom('admin_audit_logs').select('action').where('admin_id', '=', userIds['support']).where('entity_id', '=', ticketId).execute();
    expect(audit.map((a) => a.action)).toContain('update_ticket_status');
    const closed = await app.inject({ method: 'POST', url: `/api/support/tickets/${ticketId}/close`, headers: auth('patient') });
    expect(closed.json().status).toBe('ferme');
  });

  // ---------------------------------------------------------------------------
  // FAQ
  // ---------------------------------------------------------------------------
  it('FAQ : création par le support, publication, version incrémentée, filtrage public par audience', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/admin/support/faqs', headers: auth('support'), payload: { question: `Comment annuler une séance ? ${tag}`, answer: 'Depuis votre tableau de bord.', category: 'Séances', targetAudience: 'patients' } });
    expect(created.statusCode).toBe(201);
    faqId = created.json().id;
    expect(created.json().is_published).toBe(false);
    const hidden = await app.inject({ method: 'GET', url: '/api/faqs?audience=patients' });
    expect(hidden.json().map((f: { id: string }) => f.id)).not.toContain(faqId);
    const published = await app.inject({ method: 'PATCH', url: `/api/admin/support/faqs/${faqId}`, headers: auth('support'), payload: { isPublished: true, answer: 'Depuis votre tableau de bord, onglet Séances (au moins 24 h avant).' } });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ is_published: true, version: 2 });
    const patients = await app.inject({ method: 'GET', url: '/api/faqs?audience=patients' });
    expect(patients.json().map((f: { id: string }) => f.id)).toContain(faqId);
    const practitioners = await app.inject({ method: 'GET', url: '/api/faqs?audience=practitioners' });
    expect(practitioners.json().map((f: { id: string }) => f.id)).not.toContain(faqId);
    const audit = await db.db.selectFrom('admin_audit_logs').select('action').where('admin_id', '=', userIds['support']).where('entity_id', '=', faqId).execute();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['create_faq', 'publish_faq']));
    const draft = await app.inject({ method: 'POST', url: '/api/admin/support/faqs', headers: auth('support'), payload: { question: `Brouillon interne ? ${tag}`, answer: 'Réponse non publiée.', category: 'Séances', targetAudience: 'patients' } });
    expect((await app.inject({ method: 'GET', url: '/api/admin/support/faqs', headers: auth('patient') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/support/faqs', headers: auth('finance') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/admin/support/faqs' })).statusCode).toBe(401);
    const adminList = await app.inject({ method: 'GET', url: '/api/admin/support/faqs', headers: auth('support') });
    expect(adminList.statusCode).toBe(200);
    const listed = adminList.json().filter((f: { id: string }) => f.id === faqId || f.id === draft.json().id);
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: faqId, is_published: true }), expect.objectContaining({ id: draft.json().id, is_published: false })]));
    expect((await app.inject({ method: 'GET', url: '/api/faqs?audience=patients' })).json().map((f: { id: string }) => f.id)).not.toContain(draft.json().id);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/support/faqs/${draft.json().id}`, headers: auth('support') })).statusCode).toBe(200);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/admin/support/faqs/${faqId}`, headers: auth('support') });
    expect(deleted.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Litiges
  // ---------------------------------------------------------------------------
  it('litige : ouverture par une partie du rendez-vous, sujet par défaut, SLA, messages', async () => {
    const foreign = await app.inject({ method: 'POST', url: '/api/disputes', headers: auth('other'), payload: { appointmentId: appointments['completed'], description: 'Pas mon RDV' } });
    expect(foreign.statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/disputes', headers: auth('patient'), payload: { appointmentId: appointments['completed'], description: 'La séance a été écourtée de moitié.', priority: 'medium' } });
    expect(created.statusCode).toBe(201);
    disputeId = created.json().id;
    expect(created.json()).toMatchObject({ status: 'open', priority: 'medium', subject: 'Problème avec la consultation - Coach Fit' });
    const sla = new Date(created.json().sla_deadline).getTime() - Date.now();
    expect(sla).toBeGreaterThan(71 * 3_600_000);
    expect(sla).toBeLessThanOrEqual(72 * 3_600_000);
    const msg = await app.inject({ method: 'POST', url: `/api/disputes/${disputeId}/messages`, headers: auth('patient'), payload: { message: 'Voici la capture de l’heure de fin.' } });
    expect(msg.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/disputes/${disputeId}/messages`, headers: auth('other'), payload: { message: 'intrus' } })).statusCode).toBe(403);
    const messages = await app.inject({ method: 'GET', url: `/api/disputes/${disputeId}/messages`, headers: auth('support') });
    expect(messages.statusCode).toBe(200);
    expect(messages.json()).toHaveLength(1);
    const mine = await app.inject({ method: 'GET', url: '/api/disputes', headers: auth('patient') });
    expect(mine.json().data.map((d: { id: string }) => d.id)).toContain(disputeId);
    const notif = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth('support') });
    const list = Array.isArray(notif.json()) ? notif.json() : notif.json().data;
    expect(list.some((n: { type: string }) => n.type === 'dispute_created')).toBe(true);
  });

  it('litige : traitement admin (investigating → resolved), escalade SLA, journal d’audit', async () => {
    expect((await app.inject({ method: 'PATCH', url: `/api/admin/disputes/${disputeId}`, headers: auth('finance'), payload: { status: 'investigating' } })).statusCode).toBe(403);
    const investigating = await app.inject({ method: 'PATCH', url: `/api/admin/disputes/${disputeId}`, headers: auth('support'), payload: { status: 'investigating' } });
    expect(investigating.statusCode).toBe(200);
    expect(investigating.json()).toMatchObject({ status: 'investigating', assigned_to: userIds['support'] });
    const noResolution = await app.inject({ method: 'PATCH', url: `/api/admin/disputes/${disputeId}`, headers: auth('support'), payload: { status: 'resolved' } });
    expect(noResolution.statusCode).toBe(400);
    // SLA dépassé → escalade automatique (job disputes.sla)
    await db.db.updateTable('disputes').set({ sla_deadline: new Date(Date.now() - 3_600_000) }).where('id', '=', disputeId).execute();
    const escalated = await app.get(DisputesService).escalateOverdue();
    expect(escalated.escalated).toBeGreaterThanOrEqual(1);
    const overdue = await app.inject({ method: 'GET', url: '/api/admin/disputes?overdue=true', headers: auth('support') });
    expect(overdue.statusCode).toBe(200);
    expect(overdue.json().data.map((d: { id: string }) => d.id)).toContain(disputeId);
    expect(overdue.json().data.find((d: { id: string }) => d.id === disputeId).priority).toBe('high');
    const resolved = await app.inject({ method: 'PATCH', url: `/api/admin/disputes/${disputeId}`, headers: auth('support'), payload: { status: 'resolved', resolution: 'Remboursement de 50 % accordé.' } });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ status: 'resolved', resolution: 'Remboursement de 50 % accordé.' });
    expect(resolved.json().resolved_at).toBeTruthy();
    const audit = await db.db.selectFrom('admin_audit_logs').select('action').where('admin_id', '=', userIds['support']).where('entity_id', '=', disputeId).execute();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['Dispute investigating', 'Dispute resolved']));
    const detail = await app.inject({ method: 'GET', url: `/api/disputes/${disputeId}`, headers: auth('patient') });
    expect(detail.json().status).toBe('resolved');
    const stats = await app.inject({ method: 'GET', url: '/api/admin/disputes', headers: auth('support') });
    expect(stats.json().stats).toMatchObject({ open: expect.any(Number), investigating: expect.any(Number), overdue: expect.any(Number) });
  });

  // ---------------------------------------------------------------------------
  // Statistiques des tableaux de bord
  // ---------------------------------------------------------------------------
  it('statistiques praticien : compteurs par statut, minutes réelles du mois, patient : à venir / passés', async () => {
    const pr = await app.inject({ method: 'GET', url: '/api/stats/practitioner', headers: auth('coach') });
    expect(pr.statusCode).toBe(200);
    expect(pr.json()).toMatchObject({ awaiting: 1, pendingPayment: 1, confirmed: 1, completed: 2, completedThisMonth: 2, grossThisMonth: 20_000 });
    // 45 min chronométrées + 60 min planifiées (durée par défaut) pour la seconde consultation
    expect(pr.json().totalMinutesThisMonth).toBe(105);
    expect((await app.inject({ method: 'GET', url: '/api/stats/practitioner?month=2020-13', headers: auth('coach') })).statusCode).toBe(400);
    const old = await app.inject({ method: 'GET', url: '/api/stats/practitioner?month=2020-01', headers: auth('coach') });
    expect(old.json()).toMatchObject({ completed: 2, completedThisMonth: 0, totalMinutesThisMonth: 0 });
    expect((await app.inject({ method: 'GET', url: '/api/stats/practitioner', headers: auth('patient') })).statusCode).toBe(404);
    const pa = await app.inject({ method: 'GET', url: '/api/stats/patient', headers: auth('patient') });
    expect(pa.statusCode).toBe(200);
    expect(pa.json()).toMatchObject({ upcoming: 3, past: 3, completed: 2, awaitingPayment: 1 });
    const coach = await app.inject({ method: 'GET', url: '/api/stats/coach', headers: auth('coach') });
    expect(coach.statusCode).toBe(200);
    // 2 consultations terminées à 10 000 → 95 % pour le coach (5 % de commission, configuration de production)
    expect(coach.json()).toMatchObject({ upcomingAppointments: 2, upcomingSessions: 0, revenueRate: 0.95, appointmentsRevenue: 19_000, totalRevenue: 19_000 });
  });
});
