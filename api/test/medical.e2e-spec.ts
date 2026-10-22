/**
 * Étape 6 — dossier médical : profil, contacts d'urgence, adresses, notes de soins, comptes rendus,
 * triage, consentements, export RGPD ; avis et note moyenne ; moyens de paiement chiffrés.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';

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
const emails = { patient: `med-pat-${tag}@domicares.test`, other: `med-oth-${tag}@domicares.test`, nurse: `med-nurse-${tag}@domicares.test`, admin: `med-adm-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake\n').toString('base64');
const isoDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('Medical record, reviews & payment methods (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let nurseId = '';
  const appointments: Record<string, string> = {};
  let contactId = '';
  const addressIds: string[] = [];
  let noteId = '';
  let reportId = '';
  let triageId = '';
  let reviewId = '';
  const methodIds: string[] = [];

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function insertAppointment(key: string, status: string, date: string) {
    const row = await db.runAs({ role: 'service_role' }, (trx) =>
      trx
        .insertInto('appointments')
        .values({ patient_id: userIds['patient'], patient_name: 'User patient', practitioner_id: nurseId, practitioner_name: 'Infirmière Test', specialty: 'Soins infirmiers', date, time: '10:00', address: 'Cotonou', reason: 'Pansement', status: status as never, payment_amount: 8_000 } as never)
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    appointments[key] = row.id;
  }
  const notificationsOf = async (key: string) => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: auth(key) });
    return (Array.isArray(res.json()) ? res.json() : res.json().data) as { type: string; title: string }[];
  };

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    await signup('nurse', emails.nurse, { userType: 'practitioner', practitionerType: 'infirmier' });
    await signup('patient', emails.patient);
    await signup('other', emails.other);
    await signup('admin', emails.admin);
    await db.db.insertInto('user_roles').values([{ user_id: userIds['admin'], role: 'super_admin' }]).execute();
    const reg = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('nurse'),
      payload: {
        profile: { fullName: 'Infirmière Test', phone: `+2299${suffix}4` },
        practitioner: { name: 'Infirmière Test', phone: `+2299${suffix}4`, specialty: 'Soins infirmiers', practitionerType: 'infirmier', interventionZone: 'Cotonou', interventionRadius: 10, latitude: 6.37, longitude: 2.39 },
        documents: { idDocument: pdf, licenseDocument: pdf },
      },
    });
    expect(reg.statusCode).toBe(201);
    nurseId = reg.json().practitioner.id;
    const kyc = await app.inject({ method: 'POST', url: `/api/admin/kyc/${nurseId}/decision`, headers: auth('admin'), payload: { status: 'approved' } });
    expect(kyc.statusCode).toBe(200);
    await insertAppointment('completed', 'completed', isoDate(-3));
    await insertAppointment('completed2', 'completed', isoDate(-2));
    await insertAppointment('inProgress', 'in-progress', isoDate(0));
    await insertAppointment('confirmed', 'confirmed', isoDate(1));
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = Object.values(userIds);
      const apts = Object.values(appointments);
      await sql`delete from public.consultation_reports_access_log where report_id in (select id from public.consultation_reports where appointment_id = any(${apts}::text[]))`.execute(trx);
      await sql`delete from public.consultation_reports where appointment_id = any(${apts}::text[])`.execute(trx);
      await sql`delete from public.care_notes_sharing_log where care_note_id in (select id from public.care_notes where appointment_id = any(${apts}::text[]))`.execute(trx);
      await sql`delete from public.care_notes where appointment_id = any(${apts}::text[])`.execute(trx);
      await sql`delete from public.reviews where patient_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.messages where sender_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.saved_payment_methods where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.triage_results where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.consents where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.addresses where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.emergency_contacts where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.medical_profiles where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.notifications where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.admin_audit_logs where admin_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.consent_versions where created_by = any(${ids}::uuid[])`.execute(trx);
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
  // Profil médical, contacts, adresses
  // ---------------------------------------------------------------------------
  it('profil médical : création, taux de complétion, médecin traitant de la plateforme', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/medical/profile', headers: auth('patient') });
    expect(empty.json()).toEqual({ profile: null, completion: 0 });
    const bad = await app.inject({ method: 'PUT', url: '/api/medical/profile', headers: auth('patient'), payload: { bloodType: 'Z+' } });
    expect(bad.statusCode).toBe(400);
    const saved = await app.inject({ method: 'PUT', url: '/api/medical/profile', headers: auth('patient'), payload: { bloodType: 'O+', allergies: 'Pénicilline', chronicDiseases: 'Asthme', shareWithPractitioner: true, primaryDoctorId: nurseId } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().profile).toMatchObject({ blood_type: 'O+', allergies: 'Pénicilline', share_with_practitioner: true, primary_doctor_id: nurseId, primary_doctor_name: 'Infirmière Test' });
    expect(saved.json().completion).toBeGreaterThan(0);
    const unknownDoctor = await app.inject({ method: 'PUT', url: '/api/medical/profile', headers: auth('patient'), payload: { primaryDoctorId: '00000000-0000-0000-0000-000000000000' } });
    expect(unknownDoctor.statusCode).toBe(404);
    const doctors = await app.inject({ method: 'GET', url: '/api/medical/profile/doctors', headers: auth('patient') });
    expect(doctors.statusCode).toBe(200);
    expect(doctors.json().map((d: { id: string }) => d.id)).toContain(nurseId);
  });

  it('contacts d’urgence et adresses (une seule adresse par défaut)', async () => {
    const contact = await app.inject({ method: 'POST', url: '/api/medical/emergency-contacts', headers: auth('patient'), payload: { name: 'Maman', phone: '+22961000001', relationship: 'Mère' } });
    expect(contact.statusCode).toBe(201);
    contactId = contact.json().id;
    const renamed = await app.inject({ method: 'PATCH', url: `/api/medical/emergency-contacts/${contactId}`, headers: auth('patient'), payload: { relationship: 'Mère (urgence)' } });
    expect(renamed.json().relationship).toBe('Mère (urgence)');
    expect((await app.inject({ method: 'PATCH', url: `/api/medical/emergency-contacts/${contactId}`, headers: auth('other'), payload: { name: 'Pirate' } })).statusCode).toBe(404);
    const a1 = await app.inject({ method: 'POST', url: '/api/addresses', headers: auth('patient'), payload: { label: 'Maison', address: 'Rue 12, Fidjrossè, Cotonou', isDefault: true } });
    expect(a1.statusCode).toBe(201);
    const a2 = await app.inject({ method: 'POST', url: '/api/addresses', headers: auth('patient'), payload: { label: 'Bureau', address: 'Ganhi, Cotonou', isDefault: true, latitude: 6.36, longitude: 2.42 } });
    expect(a2.statusCode).toBe(201);
    addressIds.push(a1.json().id, a2.json().id);
    const list = await app.inject({ method: 'GET', url: '/api/addresses', headers: auth('patient') });
    const defaults = list.json().filter((a: { is_default: boolean }) => a.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(a2.json().id);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/addresses/${a2.json().id}`, headers: auth('patient') });
    expect(deleted.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/addresses', headers: auth('patient') });
    expect(after.json()).toHaveLength(1);
    expect(after.json()[0].is_default).toBe(true);
  });

  it('dossier patient pour le praticien : accessible pendant un rendez-vous confirmé / en cours, contacts en cours seulement', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/medical/patients/${userIds['patient']}/record`, headers: auth('other') })).statusCode).toBe(403);
    const record = await app.inject({ method: 'GET', url: `/api/medical/patients/${userIds['patient']}/record`, headers: auth('nurse') });
    expect(record.statusCode).toBe(200);
    expect(record.json().medical_profile_shared).toBe(true);
    expect(record.json().medical_profile.blood_type).toBe('O+');
    expect(record.json().emergency_contacts_visible).toBe(true);
    expect(record.json().emergency_contacts.map((c: { id: string }) => c.id)).toContain(contactId);
    const foreign = await app.inject({ method: 'GET', url: `/api/medical/patients/${userIds['other']}/record`, headers: auth('nurse') });
    expect(foreign.statusCode).toBe(403);
    await app.inject({ method: 'PUT', url: '/api/medical/profile', headers: auth('patient'), payload: { shareWithPractitioner: false } });
    const hidden = await app.inject({ method: 'GET', url: `/api/medical/patients/${userIds['patient']}/record`, headers: auth('nurse') });
    expect(hidden.json()).toMatchObject({ medical_profile: null, medical_profile_shared: false });
    const asAdmin = await app.inject({ method: 'GET', url: `/api/medical/patients/${userIds['patient']}/record`, headers: auth('admin') });
    expect(asAdmin.json().medical_profile_shared).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Notes de soins et comptes rendus
  // ---------------------------------------------------------------------------
  it('notes de soins SOAP : une par rendez-vous, partage tracé et notifié au patient', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/care-notes', headers: auth('patient'), payload: { appointmentId: appointments['completed'], subjective: 'x' } })).statusCode).toBe(403);
    const notStarted = await app.inject({ method: 'POST', url: '/api/care-notes', headers: auth('nurse'), payload: { appointmentId: appointments['confirmed'], subjective: 'x' } });
    expect(notStarted.statusCode).toBe(409);
    const created = await app.inject({ method: 'POST', url: '/api/care-notes', headers: auth('nurse'), payload: { appointmentId: appointments['completed'], subjective: 'Douleur au mollet', objective: 'Plaie propre', assessment: 'Cicatrisation normale', plan: 'Pansement tous les 2 jours' } });
    expect(created.statusCode).toBe(201);
    noteId = created.json().id;
    expect(created.json().shared_with_patient).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/api/care-notes', headers: auth('nurse'), payload: { appointmentId: appointments['completed'], subjective: 'doublon' } })).statusCode).toBe(409);
    const before = await app.inject({ method: 'GET', url: '/api/care-notes/mine', headers: auth('patient') });
    expect(before.json().count).toBe(0);
    const shared = await app.inject({ method: 'POST', url: `/api/care-notes/${noteId}/share`, headers: auth('nurse') });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().shared_with_patient).toBe(true);
    const after = await app.inject({ method: 'GET', url: '/api/care-notes/mine', headers: auth('patient') });
    expect(after.json().count).toBe(1);
    expect(after.json().data[0]).toMatchObject({ id: noteId, practitioner_name: 'Infirmière Test' });
    const log = await db.db.selectFrom('care_notes_sharing_log').select(['old_shared_value', 'new_shared_value']).where('care_note_id', '=', noteId).execute();
    expect(log).toEqual([{ old_shared_value: false, new_shared_value: true }]);
    expect((await notificationsOf('patient')).some((n) => n.type === 'care_note')).toBe(true);
    const byAppointment = await app.inject({ method: 'GET', url: `/api/care-notes/appointment/${appointments['completed']}`, headers: auth('nurse') });
    expect(byAppointment.json().id).toBe(noteId);
  });

  it('comptes rendus : vocabulaire converti, clôture atomique de la consultation, lecture journalisée', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/consultation-reports', headers: auth('nurse'), payload: { appointmentId: appointments['completed'], consultationType: 'domicile', severityLevel: 'extreme', clinicalFindings: 'x', primaryDiagnosis: 'y' } });
    expect(bad.statusCode).toBe(400);
    const created = await app.inject({ method: 'POST', url: '/api/consultation-reports', headers: auth('nurse'), payload: { appointmentId: appointments['inProgress'], consultationType: 'video', severityLevel: 'moderate', clinicalFindings: 'Tension 14/9', primaryDiagnosis: 'Hypertension légère', treatmentPrescription: 'Repos', followUpTimeframe: '1 semaine', completeAppointment: true } });
    expect(created.statusCode).toBe(201);
    reportId = created.json().id;
    expect(created.json()).toMatchObject({ consultation_type: 'teleconsultation', severity_level: 'modere' });
    const apt = await db.db.selectFrom('appointments').select(['status', 'visit_status', 'consultation_ended_at']).where('id', '=', appointments['inProgress']).executeTakeFirstOrThrow();
    expect(apt.status).toBe('awaiting_confirmation');
    expect(apt.visit_status).toBe('completed');
    expect(apt.consultation_ended_at).toBeTruthy();
    expect((await app.inject({ method: 'POST', url: '/api/consultation-reports', headers: auth('nurse'), payload: { appointmentId: appointments['inProgress'], consultationType: 'suivi', severityLevel: 'leger', clinicalFindings: 'x', primaryDiagnosis: 'y' } })).statusCode).toBe(409);
    const notCompletable = await app.inject({ method: 'POST', url: '/api/consultation-reports', headers: auth('nurse'), payload: { appointmentId: appointments['completed2'], consultationType: 'suivi', severityLevel: 'leger', clinicalFindings: 'x', primaryDiagnosis: 'y', completeAppointment: true } });
    expect(notCompletable.statusCode).toBe(409);
    const mine = await app.inject({ method: 'GET', url: '/api/consultation-reports', headers: auth('nurse') });
    expect(mine.json()).toMatchObject({ count: 1, by_severity: { modere: 1 } });
    const asPatient = await app.inject({ method: 'GET', url: `/api/consultation-reports/${reportId}?access=download`, headers: auth('patient') });
    expect(asPatient.statusCode).toBe(200);
    expect(asPatient.json().practitioner_name).toBe('Infirmière Test');
    expect((await app.inject({ method: 'GET', url: `/api/consultation-reports/${reportId}`, headers: auth('other') })).statusCode).toBe(403);
    const patientList = await app.inject({ method: 'GET', url: '/api/consultation-reports/mine', headers: auth('patient') });
    expect(patientList.json().count).toBe(1);
    const updated = await app.inject({ method: 'PATCH', url: `/api/consultation-reports/${reportId}`, headers: auth('nurse'), payload: { severityLevel: 'high', additionalComments: 'Contrôle dans une semaine' } });
    expect(updated.json()).toMatchObject({ severity_level: 'urgent', additional_comments: 'Contrôle dans une semaine' });
    expect((await app.inject({ method: 'GET', url: `/api/consultation-reports/${reportId}/access-log`, headers: auth('patient') })).statusCode).toBe(403);
    const log = await app.inject({ method: 'GET', url: `/api/consultation-reports/${reportId}/access-log`, headers: auth('admin') });
    expect(log.statusCode).toBe(200);
    expect(log.json()).toEqual([expect.objectContaining({ accessed_by: userIds['patient'], access_type: 'download' })]);
  });

  it('lectures et modification praticien : liste des notes, note modifiée sans nouveau partage, compte rendu par rendez-vous', async () => {
    const notes = await app.inject({ method: 'GET', url: '/api/care-notes', headers: auth('nurse') });
    expect(notes.statusCode).toBe(200);
    expect(notes.json()).toEqual([expect.objectContaining({ id: noteId, appointment_id: appointments['completed'], patient_name: 'User patient', practitioner_name: 'Infirmière Test' })]);
    expect((await app.inject({ method: 'GET', url: '/api/care-notes', headers: auth('patient') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/care-notes' })).statusCode).toBe(401);

    const notifBefore = (await notificationsOf('patient')).filter((n) => n.type === 'care_note').length;
    expect((await app.inject({ method: 'PATCH', url: `/api/care-notes/${noteId}`, headers: auth('patient'), payload: { plan: 'Pirate' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/api/care-notes/00000000-0000-0000-0000-000000000000', headers: auth('nurse'), payload: { plan: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/api/care-notes/pas-un-uuid', headers: auth('nurse'), payload: { plan: 'x' } })).statusCode).toBe(400);
    const updated = await app.inject({ method: 'PATCH', url: `/api/care-notes/${noteId}`, headers: auth('nurse'), payload: { plan: 'Pansement quotidien', objective: '' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: noteId, plan: 'Pansement quotidien', objective: null, subjective: 'Douleur au mollet', shared_with_patient: true });
    expect((await notificationsOf('patient')).filter((n) => n.type === 'care_note')).toHaveLength(notifBefore);

    const report = await app.inject({ method: 'GET', url: `/api/consultation-reports/appointment/${appointments['inProgress']}`, headers: auth('nurse') });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({ id: reportId, appointment_id: appointments['inProgress'] });
    const none = await app.inject({ method: 'GET', url: `/api/consultation-reports/appointment/${appointments['confirmed']}`, headers: auth('nurse') });
    expect(none.statusCode).toBe(200);
    expect(none.body === '' || none.json() === null).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/api/consultation-reports/appointment/${appointments['inProgress']}`, headers: auth('patient') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/consultation-reports/appointment/${appointments['inProgress']}` })).statusCode).toBe(401);
  });

  it('contacts d’urgence et adresses : liste limitée au propriétaire, modification et suppression', async () => {
    const own = await app.inject({ method: 'GET', url: '/api/medical/emergency-contacts', headers: auth('patient') });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual([expect.objectContaining({ id: contactId, name: 'Maman', relationship: 'Mère (urgence)' })]);
    expect((await app.inject({ method: 'GET', url: '/api/medical/emergency-contacts', headers: auth('other') })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/medical/emergency-contacts' })).statusCode).toBe(401);
    const extra = await app.inject({ method: 'POST', url: '/api/medical/emergency-contacts', headers: auth('patient'), payload: { name: 'Frère', phone: '+22961000002' } });
    expect(extra.statusCode).toBe(201);
    expect((await app.inject({ method: 'DELETE', url: `/api/medical/emergency-contacts/${extra.json().id}`, headers: auth('other') })).statusCode).toBe(404);
    const removed = await app.inject({ method: 'DELETE', url: `/api/medical/emergency-contacts/${extra.json().id}`, headers: auth('patient') });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ deleted: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/medical/emergency-contacts/${extra.json().id}`, headers: auth('patient') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/medical/emergency-contacts', headers: auth('patient') })).json().map((c: { id: string }) => c.id)).toEqual([contactId]);

    const addressId = addressIds[0];
    expect((await app.inject({ method: 'PATCH', url: `/api/addresses/${addressId}`, headers: auth('other'), payload: { label: 'Pirate' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/addresses/${addressId}`, headers: auth('patient'), payload: { address: 'x' } })).statusCode).toBe(400);
    const second = await app.inject({ method: 'POST', url: '/api/addresses', headers: auth('patient'), payload: { label: 'Clinique', address: 'Akpakpa, Cotonou' } });
    addressIds.push(second.json().id);
    const patched = await app.inject({ method: 'PATCH', url: `/api/addresses/${second.json().id}`, headers: auth('patient'), payload: { label: 'Cabinet', city: 'Cotonou', isDefault: true } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ id: second.json().id, label: 'Cabinet', city: 'Cotonou', is_default: true, address: 'Akpakpa, Cotonou' });
    const list = await app.inject({ method: 'GET', url: '/api/addresses', headers: auth('patient') });
    expect(list.json().filter((a: { is_default: boolean }) => a.is_default).map((a: { id: string }) => a.id)).toEqual([second.json().id]);
  });

  // ---------------------------------------------------------------------------
  // Triage, consentements, export
  // ---------------------------------------------------------------------------
  it('triage : score serveur, enregistré uniquement pour un utilisateur connecté, historique', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/triage', payload: { consciousness: 'conscious', breathing: 'normal', 'chest-pain': 'none', bleeding: 'none', 'pain-level': 'mild', symptoms: [] } });
    expect(anon.statusCode).toBe(201);
    // douleur légère = 1 point (barème src/types/triage.ts)
    expect(anon.json()).toMatchObject({ score: 1, urgencyLevel: 'non-urgent', saved: false, id: null, maxScore: 25 });
    expect((await app.inject({ method: 'POST', url: '/api/triage', payload: { consciousness: 'conscious' } })).statusCode).toBe(400);
    const vital = await app.inject({ method: 'POST', url: '/api/triage', headers: auth('patient'), payload: { consciousness: 'unconscious', breathing: 'severe', 'chest-pain': 'severe', bleeding: 'major', 'pain-level': 'severe', symptoms: ['paralysis', 'confusion'] } });
    expect(vital.statusCode).toBe(201);
    expect(vital.json()).toMatchObject({ urgencyLevel: 'immediate', saved: true });
    expect(vital.json().score).toBeGreaterThanOrEqual(15);
    expect(vital.json().recommendations[0]).toContain('SAMU');
    triageId = vital.json().id;
    const history = await app.inject({ method: 'GET', url: '/api/triage/history', headers: auth('patient') });
    expect(history.json().stats).toMatchObject({ total: 1, distribution: expect.objectContaining({ immediate: 1 }) });
    expect((await app.inject({ method: 'DELETE', url: `/api/triage/${triageId}`, headers: auth('other') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/triage/${triageId}`, headers: auth('patient') })).json()).toEqual({ deleted: true });
  });

  it('consentements versionnés et export RGPD', async () => {
    const previous = await db.db.selectFrom('consent_versions').select('id').where('consent_type', '=', 'partage_donnees').where('is_active', '=', true).executeTakeFirst();
    const version = await app.inject({ method: 'POST', url: '/api/admin/consent-versions', headers: auth('admin'), payload: { consentType: 'partage_donnees', version: `v-${tag}`, content: 'Partage des données médicales avec les praticiens.' } });
    expect(version.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/admin/consent-versions/${version.json().id}/activate`, headers: auth('admin') })).statusCode).toBe(200);
    const accepted = await app.inject({ method: 'POST', url: '/api/medical/consents', headers: auth('patient'), payload: { consentType: 'partage_donnees', accepted: true } });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ consent_type: 'partage_donnees', is_accepted: true, accepted_version: `v-${tag}` });
    const withdrawn = await app.inject({ method: 'POST', url: '/api/medical/consents', headers: auth('patient'), payload: { consentType: 'partage_donnees', accepted: false } });
    expect(withdrawn.json()).toMatchObject({ is_accepted: false, accepted_version: null });
    const list = await app.inject({ method: 'GET', url: '/api/medical/consents', headers: auth('patient') });
    expect(list.json()).toHaveLength(1);
    const exported = await app.inject({ method: 'GET', url: '/api/medical/export', headers: auth('patient') });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().account.email).toBe(emails.patient);
    expect(exported.json().appointments).toHaveLength(4);
    expect(exported.json().emergencyContacts).toHaveLength(1);
    expect(exported.json().consents).toHaveLength(1);
    await db.db.deleteFrom('consent_versions').where('version', '=', `v-${tag}`).execute();
    if (previous) await db.db.updateTable('consent_versions').set({ is_active: true }).where('id', '=', previous.id).execute();
  });

  // ---------------------------------------------------------------------------
  // Avis
  // ---------------------------------------------------------------------------
  it('avis : consultation terminée uniquement, un par rendez-vous, note moyenne recalculée et modération', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('patient'), payload: { appointmentId: appointments['confirmed'], rating: 5 } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('other'), payload: { appointmentId: appointments['completed'], rating: 5 } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('patient'), payload: { appointmentId: appointments['completed'], rating: 6 } })).statusCode).toBe(400);
    const r1 = await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('patient'), payload: { appointmentId: appointments['completed'], rating: 5, comment: 'Très professionnelle' } });
    expect(r1.statusCode).toBe(201);
    reviewId = r1.json().id;
    expect(r1.json().practitioner_rating).toBe(5);
    expect((await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('patient'), payload: { appointmentId: appointments['completed'], rating: 1 } })).statusCode).toBe(409);
    const r2 = await app.inject({ method: 'POST', url: '/api/reviews', headers: auth('patient'), payload: { appointmentId: appointments['completed2'], rating: 3 } });
    expect(r2.json().practitioner_rating).toBe(4);
    const pr = await db.db.selectFrom('practitioners').select('rating').where('id', '=', nurseId).executeTakeFirstOrThrow();
    expect(Number(pr.rating)).toBe(4);
    const pub = await app.inject({ method: 'GET', url: `/api/practitioners/${nurseId}/reviews` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().stats).toMatchObject({ totalReviews: 2, averageRating: 4 });
    expect(pub.json().data[0].patient_name).toBe('User patient');
    expect((await notificationsOf('nurse')).some((n) => n.title === 'Nouvel avis reçu')).toBe(true);
    const moderated = await app.inject({ method: 'POST', url: `/api/admin/operations/reviews/${reviewId}/moderate`, headers: auth('admin'), payload: { isHidden: true, reason: 'Contenu inapproprié' } });
    expect(moderated.statusCode).toBe(200);
    const afterHide = await app.inject({ method: 'GET', url: `/api/practitioners/${nurseId}/reviews` });
    expect(afterHide.json().stats).toMatchObject({ totalReviews: 1, averageRating: 3 });
    expect(Number((await db.db.selectFrom('practitioners').select('rating').where('id', '=', nurseId).executeTakeFirstOrThrow()).rating)).toBe(3);
    const mine = await app.inject({ method: 'GET', url: '/api/reviews/mine', headers: auth('patient') });
    expect(mine.json()).toHaveLength(2);
    const forMe = await app.inject({ method: 'GET', url: '/api/reviews/practitioner/me', headers: auth('nurse') });
    expect(forMe.json().stats.totalReviews).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Moyens de paiement enregistrés
  // ---------------------------------------------------------------------------
  it('moyens de paiement : numéro chiffré côté serveur, masqué en lecture, défaut unique, révélation par le propriétaire', async () => {
    const m1 = await app.inject({ method: 'POST', url: '/api/payment-methods', headers: auth('patient'), payload: { provider: 'mtn', phoneNumber: '+229 61 23 45 67' } });
    expect(m1.statusCode).toBe(201);
    expect(m1.json()).toMatchObject({ provider: 'mtn', is_default: true });
    expect(m1.json().phone_number_encrypted).toBeUndefined();
    expect(m1.json().phone_number_masked).not.toContain('2345');
    const m2 = await app.inject({ method: 'POST', url: '/api/payment-methods', headers: auth('patient'), payload: { provider: 'moov', phoneNumber: '+22964000000', setAsDefault: true } });
    expect(m2.statusCode).toBe(201);
    methodIds.push(m1.json().id, m2.json().id);
    const list = await app.inject({ method: 'GET', url: '/api/payment-methods', headers: auth('patient') });
    expect(list.json()).toHaveLength(2);
    expect(list.json().filter((m: { is_default: boolean }) => m.is_default).map((m: { id: string }) => m.id)).toEqual([m2.json().id]);
    const dup = await app.inject({ method: 'POST', url: '/api/payment-methods', headers: auth('patient'), payload: { provider: 'mtn', phoneNumber: '+22961234567' } });
    expect(dup.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/api/payment-methods', headers: auth('patient') })).json()).toHaveLength(2);
    const stored = await db.db.selectFrom('saved_payment_methods').select('phone_number_encrypted').where('id', '=', m1.json().id).executeTakeFirstOrThrow();
    expect(stored.phone_number_encrypted).not.toContain('61234567');
    expect(stored.phone_number_encrypted).toContain(':');
    const reveal = await app.inject({ method: 'GET', url: `/api/payment-methods/${m1.json().id}/phone`, headers: auth('patient') });
    expect(reveal.statusCode).toBe(200);
    expect(reveal.json().phone).toBe('+22961234567');
    expect((await app.inject({ method: 'GET', url: `/api/payment-methods/${m1.json().id}/phone`, headers: auth('other') })).statusCode).toBe(404);
    const setDefault = await app.inject({ method: 'POST', url: `/api/payment-methods/${m1.json().id}/default`, headers: auth('patient') });
    expect(setDefault.json().is_default).toBe(true);
    const removed = await app.inject({ method: 'DELETE', url: `/api/payment-methods/${m1.json().id}`, headers: auth('patient') });
    expect(removed.json()).toEqual({ deleted: true });
    const remaining = await app.inject({ method: 'GET', url: '/api/payment-methods', headers: auth('patient') });
    expect(remaining.json()).toEqual([expect.objectContaining({ id: m2.json().id, is_default: true })]);
  });
});
