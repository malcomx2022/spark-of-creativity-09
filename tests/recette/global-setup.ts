import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { API, PASSWORD, STATE_FILE, type RecetteState } from './fixtures';

/** Client minimal de `pg` (dépendance de l'API) : la recette n'ajoute aucune dépendance au front. */
interface PgClient {
  connect(): Promise<void>;
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}
const { Client } = createRequire(join(process.cwd(), 'api', 'package.json'))('pg') as { Client: new (options: { connectionString: string }) => PgClient };

const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%recette\n').toString('base64');

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Registered = { session: { accessToken: string }; user: { id: string } };

/**
 * Données de recette, créées par l'API (inscriptions, KYC, messages et donc notifications réelles)
 * et par SQL pour les seuls rendez-vous confirmés, sans passer par un paiement.
 */
export default async function globalSetup() {
  const tag = Date.now().toString(36);
  const suffix = String(Date.now()).slice(-6);
  // Les noms n'acceptent que des lettres : marqueur converti (0→a … 9→j).
  const n = tag.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
  const email = (key: string) => `recette-${key}-${tag}@domicares.test`;
  const register = (key: string, fullName: string, extra: Record<string, unknown> = {}) => post<Registered>('/auth/register', { email: email(key), password: PASSWORD, fullName, ...extra });

  const patientA = await register('patienta', `Patiente Alpha ${n}`, { phone: `+2299${suffix}1` });
  const patientB = await register('patientb', `Patient Beta ${n}`, { phone: `+2299${suffix}2` });
  const practitioner = await register('praticien', `Docteur Gamma ${n}`, { userType: 'practitioner', practitionerType: 'medecin' });
  const coach = await register('coach', `Coach Delta ${n}`, { userType: 'practitioner', practitionerType: 'coach_sportif' });
  const admin = await register('admin', `Admin ${n}`);

  const db = new Client({ connectionString: process.env.RECETTE_DATABASE_URL ?? '' });
  await db.connect();
  const asService = async <T>(fn: () => Promise<T>) => {
    await db.query('begin');
    try {
      await db.query("select set_config('app.user_role', 'service_role', true)");
      const result = await fn();
      await db.query('commit');
      return result;
    } catch (err) {
      await db.query('rollback');
      throw err;
    }
  };

  try {
    await asService(() => db.query("insert into user_roles (user_id, role) values ($1, 'super_admin')", [admin.user.id]));
    const doc = await post<{ practitioner: { id: string } }>('/practitioners/register', {
      profile: { fullName: `Docteur Gamma ${n}`, phone: `+2299${suffix}3` },
      practitioner: { name: `Docteur Gamma ${n}`, phone: `+2299${suffix}3`, specialty: 'Généraliste', practitionerType: 'medecin', latitude: 6.37, longitude: 2.39 },
      documents: { idDocument: pdf, licenseDocument: pdf },
    }, practitioner.session.accessToken);
    const coachPr = await post<{ practitioner: { id: string } }>('/practitioners/register', {
      profile: { fullName: `Coach Delta ${n}`, phone: `+2299${suffix}4` },
      practitioner: { name: `Coach Delta ${n}`, phone: `+2299${suffix}4`, specialty: 'Coaching sportif', practitionerType: 'coach_sportif', sessionTypes: ['Remise en forme'], interventionZone: 'Cotonou', interventionRadius: 10, latitude: 6.37, longitude: 2.39 },
      documents: { idDocument: pdf, diploma: pdf },
    }, coach.session.accessToken);
    for (const id of [doc.practitioner.id, coachPr.practitioner.id]) await post(`/admin/kyc/${id}/decision`, { status: 'approved' }, admin.session.accessToken);

    // 25 rendez-vous confirmés A ↔ praticien (le plus ancien créé en premier : dernier de la liste),
    // un rendez-vous A ↔ coach et un rendez-vous B ↔ praticien.
    const appointment = (patientId: string, patientName: string, practitionerId: string, practitionerName: string, daysAgo: number, status = 'confirmed') => asService(async () => {
      const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
      const { rows } = await db.query<{ id: string }>(
        `insert into appointments (patient_id, patient_name, practitioner_id, practitioner_name, specialty, date, time, address, reason, status, payment_amount, created_at)
         values ($1, $2, $3, $4, 'Généraliste', $5, '09:00', 'Cotonou', 'Recette post-livraison', $7, 15000, now() - make_interval(days => $6))
         returning id`, [patientId, patientName, practitionerId, practitionerName, date, daysAgo, status]);
      return rows[0].id;
    });
    const ids: string[] = [];
    for (let i = 25; i >= 1; i--) ids.push(await appointment(patientA.user.id, `Patiente Alpha ${n}`, doc.practitioner.id, `Docteur Gamma ${n}`, i));
    const coachAppointmentId = await appointment(patientA.user.id, `Patiente Alpha ${n}`, coachPr.practitioner.id, `Coach Delta ${n}`, 2);
    const patientBAppointmentId = await appointment(patientB.user.id, `Patient Beta ${n}`, doc.practitioner.id, `Docteur Gamma ${n}`, 3);
    // Consultation terminée la veille : le praticien y partagera une note de soin.
    const careNoteAppointmentId = await appointment(patientA.user.id, `Patiente Alpha ${n}`, doc.practitioner.id, `Docteur Gamma ${n}`, 1, 'completed');

    const state: RecetteState = {
      tag,
      accounts: {
        patientA: { email: email('patienta'), id: patientA.user.id, name: `Patiente Alpha ${n}` },
        patientB: { email: email('patientb'), id: patientB.user.id, name: `Patient Beta ${n}` },
        practitioner: { email: email('praticien'), id: practitioner.user.id, name: `Docteur Gamma ${n}` },
        coach: { email: email('coach'), id: coach.user.id, name: `Coach Delta ${n}` },
      },
      oldAppointmentId: ids[0],
      recentAppointmentId: ids[ids.length - 1],
      coachAppointmentId,
      careNoteAppointmentId,
      patientBAppointmentId,
    };

    // Messages envoyés par l'API : chaque destinataire reçoit une vraie notification avec son lien.
    await post(`/conversations/${state.oldAppointmentId}/messages`, { content: `Message du praticien ${tag} (rendez-vous ancien)` }, practitioner.session.accessToken);
    await post(`/conversations/${state.recentAppointmentId}/messages`, { content: `Message de la patiente ${tag} au praticien` }, patientA.session.accessToken);
    await post(`/conversations/${coachAppointmentId}/messages`, { content: `Message de la patiente ${tag} au coach` }, patientA.session.accessToken);
    // Note de soin partagée par l'API : notification « Nouvelle note de soin » avec son lien.
    await post('/care-notes', { appointmentId: careNoteAppointmentId, subjective: `Douleur lombaire ${tag}`, assessment: `Analyse de recette ${tag}`, plan: 'Repos et contrôle', sharedWithPatient: true }, practitioner.session.accessToken);
    // Ancienne notification de note de soin : lien /patient/appointments/:id (route inexistante).
    await asService(() => db.query(
      "insert into notifications (user_id, title, message, type, link) values ($1, $2, 'Ancien lien de note de soin', 'care_note', $3)",
      [patientA.user.id, `Ancienne note de soin ${tag}`, `/patient/appointments/${careNoteAppointmentId}`]));
    // Ancienne notification (avant le document 14) : lien générique /dashboard.
    await asService(() => db.query(
      "insert into notifications (user_id, title, message, type, link) values ($1, $2, 'Ancien format de lien', 'message', $3)",
      [patientA.user.id, `Ancienne notification ${tag}`, `/dashboard?tab=messages&appointment=${encodeURIComponent(state.oldAppointmentId)}`]));

    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } finally {
    await db.end();
  }
}
