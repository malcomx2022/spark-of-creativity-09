import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import type { AddressDto, CareNoteDto, ConsentDto, ConsultationReportDto, EmergencyContactDto, ListQuery, MedicalProfileDto, TriageAnswers, UpdateCareNoteDto, UpdateConsultationReportDto } from './medical.dto';
import { calculateTriageScore, TRIAGE_MAX_SCORE } from './triage';
import { withDateOnly } from '../common/utils/date-only';
import { appointmentResponse } from '../appointments/appointment-response';

/** Notes partagées : onglet « reports » du patient (PatientCareNotesSection). */
export const CARE_NOTE_LINK = '/dashboard/patient?tab=reports';

/**
 * Dossier médical — port de useProfile (profil médical, contacts d'urgence, adresses), useCareNotes /
 * usePatientCareNotes, useConsultationReports / usePatientConsultationReports, TriageForm / TriageHistory
 * et des consentements (patient-onboarding.recordTermsConsent).
 * Les règles d'accès reprennent les policies RLS d'origine (dossier visible par le praticien d'un
 * rendez-vous confirmé / en cours à ±1 jour, contacts d'urgence pendant la consultation) ; les
 * administrateurs y ont un accès lecture (les écrans admin le supposaient déjà).
 */
@Injectable()
export class MedicalService {
  private readonly logger = new Logger(MedicalService.name);

  constructor(private readonly database: DatabaseService, private readonly inApp: InAppNotificationsService) {}

  private async practitionerOf(trx: Transaction<DB>, userId: string) {
    const p = await trx.selectFrom('practitioners').select(['id', 'name', 'user_id']).where('user_id', '=', userId).executeTakeFirst();
    if (!p) throw new ForbiddenException('Compte praticien requis');
    return p;
  }

  private isAdmin(trx: Transaction<DB>, userId: string) {
    return trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst().then((r) => !!r);
  }

  // ---------------------------------------------------------------------------
  // Profil médical
  // ---------------------------------------------------------------------------
  getProfile(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, async (trx) => {
      const profile = await trx.selectFrom('medical_profiles').selectAll().where('user_id', '=', userId).executeTakeFirst();
      return this.withCompletion(profile ?? null);
    });
  }

  private withCompletion(profile: { blood_type: string | null; allergies: string | null; chronic_diseases: string | null; current_medications: string | null; primary_doctor_name: string | null } | null) {
    if (!profile) return { profile: null, completion: 0 };
    const filled = [profile.blood_type !== 'inconnu' && !!profile.blood_type, !!profile.allergies, !!profile.chronic_diseases, !!profile.current_medications, !!profile.primary_doctor_name].filter(Boolean).length;
    return { profile, completion: Math.round((filled / 5) * 100) };
  }

  /** Upsert sur user_id (contrainte unique). Les trois modes du médecin traitant sont normalisés côté serveur. */
  upsertProfile(userId: string, dto: MedicalProfileDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      let doctor: { id: string | null; name: string | null; email: string | null; phone: string | null } | undefined;
      if (dto.primaryDoctorId !== undefined || dto.primaryDoctorName !== undefined || dto.primaryDoctorEmail !== undefined || dto.primaryDoctorPhone !== undefined) {
        if (dto.primaryDoctorId) {
          const pr = await trx.selectFrom('practitioners').select(['id', 'name']).where('id', '=', dto.primaryDoctorId).where('kyc_status', '=', 'approved').executeTakeFirst();
          if (!pr) throw new NotFoundException('Praticien introuvable');
          // Praticien de la plateforme : e-mail et téléphone non exposés (messagerie interne).
          doctor = { id: pr.id, name: pr.name, email: null, phone: null };
        } else if (dto.primaryDoctorName) {
          doctor = { id: null, name: dto.primaryDoctorName, email: dto.primaryDoctorEmail ?? null, phone: dto.primaryDoctorPhone ?? null };
        } else {
          doctor = { id: null, name: null, email: null, phone: null };
        }
      }
      const values = {
        ...(dto.bloodType !== undefined ? { blood_type: dto.bloodType } : {}),
        ...(dto.allergies !== undefined ? { allergies: dto.allergies || null } : {}),
        ...(dto.chronicDiseases !== undefined ? { chronic_diseases: dto.chronicDiseases || null } : {}),
        ...(dto.currentMedications !== undefined ? { current_medications: dto.currentMedications || null } : {}),
        ...(dto.additionalNotes !== undefined ? { additional_notes: dto.additionalNotes || null } : {}),
        ...(dto.shareWithPractitioner !== undefined ? { share_with_practitioner: dto.shareWithPractitioner } : {}),
        ...(doctor ? { primary_doctor_id: doctor.id, primary_doctor_name: doctor.name, primary_doctor_email: doctor.email, primary_doctor_phone: doctor.phone } : {}),
      };
      const profile = await trx
        .insertInto('medical_profiles')
        .values({ user_id: userId, ...values })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({ ...values, updated_at: new Date() }))
        .returningAll()
        .executeTakeFirstOrThrow();
      return this.withCompletion(profile);
    });
  }

  /** Praticiens sélectionnables comme médecin traitant (MedicalSection). */
  doctorCandidates() {
    return this.database.runAs({ role: 'anon' }, (trx) =>
      trx.selectFrom('practitioners').select(['id', 'name', 'specialty', 'practitioner_type']).where('kyc_status', '=', 'approved').where('available', '=', true).where('practitioner_type', 'in', ['medecin', 'infirmier', 'sage_femme', 'autre']).orderBy('name').execute(),
    );
  }

  /**
   * Dossier d'un patient vu par un praticien : partage activé et rendez-vous confirmé / en cours
   * dans la fenêtre [aujourd'hui − 1 j, aujourd'hui + 1 j] (policy RLS d'origine) ; administrateurs en lecture.
   */
  async patientRecordForPractitioner(userId: string, patientId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const admin = await this.isAdmin(trx, userId);
      const practitioner = admin ? null : await this.practitionerOf(trx, userId);
      let inProgress = admin;
      if (practitioner) {
        const window = await sql<{ status: string }>`
          select status from public.appointments
          where practitioner_id = ${practitioner.id}::text and patient_id = ${patientId}::text
            and status in ('confirmed', 'in-progress')
            and date::date between current_date - interval '1 day' and current_date + interval '1 day'`.execute(trx);
        if (window.rows.length === 0) throw new ForbiddenException("Dossier accessible uniquement pendant un rendez-vous confirmé ou en cours (à un jour près)");
        inProgress = window.rows.some((r) => r.status === 'in-progress');
      }
      const profile = await trx.selectFrom('medical_profiles').selectAll().where('user_id', '=', patientId).executeTakeFirst();
      const shared = admin || !!profile?.share_with_practitioner;
      const contacts = inProgress ? await trx.selectFrom('emergency_contacts').selectAll().where('user_id', '=', patientId).orderBy('created_at', 'desc').execute() : [];
      const person = await trx.selectFrom('profiles').select(['id', 'full_name', 'phone', 'gender', 'date_of_birth']).where('id', '=', patientId).executeTakeFirst();
      if (!person) throw new NotFoundException('Patient introuvable');
      return { patient: withDateOnly(person, 'date_of_birth'), medical_profile: shared ? profile ?? null : null, medical_profile_shared: shared, emergency_contacts: contacts, emergency_contacts_visible: inProgress };
    });
  }

  // ---------------------------------------------------------------------------
  // Contacts d'urgence et adresses
  // ---------------------------------------------------------------------------
  listContacts(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('emergency_contacts').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute());
  }

  createContact(userId: string, dto: EmergencyContactDto) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.insertInto('emergency_contacts').values({ user_id: userId, name: dto.name, phone: dto.phone, relationship: dto.relationship ?? null }).returningAll().executeTakeFirstOrThrow());
  }

  async updateContact(userId: string, id: string, dto: Partial<EmergencyContactDto>) {
    const row = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.updateTable('emergency_contacts').set({ ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.phone !== undefined ? { phone: dto.phone } : {}), ...(dto.relationship !== undefined ? { relationship: dto.relationship } : {}) }).where('id', '=', id).where('user_id', '=', userId).returningAll().executeTakeFirst(),
    );
    if (!row) throw new NotFoundException('Contact introuvable');
    return row;
  }

  async deleteContact(userId: string, id: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.deleteFrom('emergency_contacts').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst());
    if (Number(r.numDeletedRows) === 0) throw new NotFoundException('Contact introuvable');
    return { deleted: true };
  }

  listAddresses(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('addresses').selectAll().where('user_id', '=', userId).orderBy('is_default', 'desc').orderBy('created_at', 'desc').execute());
  }

  /** Une seule adresse par défaut par utilisateur (la première adresse le devient automatiquement). */
  createAddress(userId: string, dto: AddressDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const existing = await trx.selectFrom('addresses').select('id').where('user_id', '=', userId).executeTakeFirst();
      const isDefault = dto.isDefault || !existing;
      if (isDefault) await trx.updateTable('addresses').set({ is_default: false }).where('user_id', '=', userId).execute();
      return trx.insertInto('addresses').values({ user_id: userId, label: dto.label, address: dto.address, city: dto.city ?? null, postal_code: dto.postalCode ?? null, latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, is_default: isDefault }).returningAll().executeTakeFirstOrThrow();
    });
  }

  async updateAddress(userId: string, id: string, dto: Partial<AddressDto>) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      if (dto.isDefault) await trx.updateTable('addresses').set({ is_default: false }).where('user_id', '=', userId).execute();
      const row = await trx
        .updateTable('addresses')
        .set({
          ...(dto.label !== undefined ? { label: dto.label } : {}), ...(dto.address !== undefined ? { address: dto.address } : {}), ...(dto.city !== undefined ? { city: dto.city } : {}), ...(dto.postalCode !== undefined ? { postal_code: dto.postalCode } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}), ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}), ...(dto.isDefault !== undefined ? { is_default: dto.isDefault } : {}),
        })
        .where('id', '=', id).where('user_id', '=', userId).returningAll().executeTakeFirst();
      if (!row) throw new NotFoundException('Adresse introuvable');
      return row;
    });
  }

  async deleteAddress(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const row = await trx.deleteFrom('addresses').where('id', '=', id).where('user_id', '=', userId).returning('is_default').executeTakeFirst();
      if (!row) throw new NotFoundException('Adresse introuvable');
      if (row.is_default) {
        const next = await trx.selectFrom('addresses').select('id').where('user_id', '=', userId).orderBy('created_at', 'desc').executeTakeFirst();
        if (next) await trx.updateTable('addresses').set({ is_default: true }).where('id', '=', next.id).execute();
      }
      return { deleted: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Notes de soins (SOAP)
  // ---------------------------------------------------------------------------
  private async ownCompletedAppointment(trx: Transaction<DB>, practitionerId: string, appointmentId: string) {
    const a = await trx.selectFrom('appointments').select(['id', 'patient_id', 'patient_name', 'practitioner_id', 'practitioner_name', 'date', 'status', 'specialty']).where('id', '=', appointmentId).executeTakeFirst();
    if (!a) throw new NotFoundException('Rendez-vous introuvable');
    if (a.practitioner_id !== practitionerId) throw new ForbiddenException('Vous ne pouvez documenter que vos propres consultations.');
    return a;
  }

  listCareNotes(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      return trx
        .selectFrom('care_notes')
        .leftJoin('appointments', 'appointments.id', 'care_notes.appointment_id')
        .selectAll('care_notes')
        .select(['appointments.patient_name', 'appointments.practitioner_name', 'appointments.date as appointment_date', 'appointments.specialty'])
        .where('care_notes.practitioner_id', '=', p.id)
        .orderBy('care_notes.created_at', 'desc')
        .execute();
    });
  }

  careNoteByAppointment(userId: string, appointmentId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      return (await trx.selectFrom('care_notes').selectAll().where('appointment_id', '=', appointmentId).where('practitioner_id', '=', p.id).orderBy('created_at', 'desc').executeTakeFirst()) ?? null;
    });
  }

  createCareNote(userId: string, dto: CareNoteDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const a = await this.ownCompletedAppointment(trx, p.id, dto.appointmentId);
      if (!['completed', 'awaiting_confirmation', 'in-progress'].includes(a.status)) throw new ConflictException(`La consultation n'est pas terminée (statut : ${a.status})`);
      const dup = await trx.selectFrom('care_notes').select('id').where('appointment_id', '=', dto.appointmentId).executeTakeFirst();
      if (dup) throw new ConflictException({ statusCode: 409, message: 'Une note existe déjà pour ce rendez-vous', noteId: dup.id });
      const note = await trx
        .insertInto('care_notes')
        .values({ appointment_id: dto.appointmentId, practitioner_id: p.id, subjective: dto.subjective || null, objective: dto.objective || null, assessment: dto.assessment || null, plan: dto.plan || null, attachments: dto.attachments ?? null, shared_with_patient: dto.sharedWithPatient })
        .returningAll()
        .executeTakeFirstOrThrow();
      // Le trigger de journalisation ne couvre que les mises à jour : une note créée déjà partagée est tracée ici.
      if (dto.sharedWithPatient) {
        await trx.insertInto('care_notes_sharing_log').values({ care_note_id: note.id, practitioner_id: p.id, old_shared_value: false, new_shared_value: true, changed_by: userId }).execute();
        await this.notifyCareNoteShared(trx, userId, p.name, a);
      }
      return note;
    });
  }

  updateCareNote(userId: string, id: string, dto: UpdateCareNoteDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const current = await trx.selectFrom('care_notes').selectAll().where('id', '=', id).executeTakeFirst();
      if (!current) throw new NotFoundException('Note introuvable');
      if (current.practitioner_id !== p.id) throw new ForbiddenException('Cette note ne vous appartient pas');
      const note = await trx
        .updateTable('care_notes')
        .set({
          ...(dto.subjective !== undefined ? { subjective: dto.subjective || null } : {}), ...(dto.objective !== undefined ? { objective: dto.objective || null } : {}),
          ...(dto.assessment !== undefined ? { assessment: dto.assessment || null } : {}), ...(dto.plan !== undefined ? { plan: dto.plan || null } : {}),
          ...(dto.attachments !== undefined ? { attachments: dto.attachments } : {}), ...(dto.sharedWithPatient !== undefined ? { shared_with_patient: dto.sharedWithPatient } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      if (dto.sharedWithPatient && !current.shared_with_patient) {
        const a = await this.ownCompletedAppointment(trx, p.id, current.appointment_id);
        await this.notifyCareNoteShared(trx, userId, p.name, a);
      }
      return note;
    });
  }

  /** Ex CareNotesSection.confirmShare : notification in-app + message dans la conversation du rendez-vous. */
  private async notifyCareNoteShared(trx: Transaction<DB>, senderId: string, practitionerName: string, a: { id: string; patient_id: string; date: Date | string }) {
    const date = new Date(String(a.date).slice(0, 10)).toLocaleDateString('fr-FR');
    await this.inApp.notifyUser(trx, a.patient_id, { title: 'Nouvelle note de soin', message: `Votre praticien ${practitionerName} a partagé une note de soin pour votre rendez-vous du ${date}.`, type: 'care_note', link: CARE_NOTE_LINK });
    // Message facultatif : sans point de sauvegarde, son échec annulerait la transaction et le COMMIT
    // deviendrait un ROLLBACK silencieux (partage annoncé mais jamais enregistré).
    await sql`savepoint care_note_message`.execute(trx);
    try {
      await trx.insertInto('messages').values({ appointment_id: a.id, sender_id: senderId, content: 'Une nouvelle note de soin est disponible dans votre dossier patient.', is_read: false }).execute();
      await sql`release savepoint care_note_message`.execute(trx);
    } catch (e) {
      await sql`rollback to savepoint care_note_message`.execute(trx);
      await sql`release savepoint care_note_message`.execute(trx);
      this.logger.warn(`message note de soin : ${e}`);
    }
  }

  shareCareNote(userId: string, id: string) {
    return this.updateCareNote(userId, id, { sharedWithPatient: true });
  }

  /** Notes partagées avec le patient connecté (ex usePatientCareNotes). */
  patientCareNotes(userId: string, q: ListQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const base = trx.selectFrom('care_notes').innerJoin('appointments', 'appointments.id', 'care_notes.appointment_id').where('care_notes.shared_with_patient', '=', true).where('appointments.patient_id', '=', userId);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll('care_notes').select(['appointments.practitioner_name', 'appointments.date as appointment_date', 'appointments.specialty']).orderBy('care_notes.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  // ---------------------------------------------------------------------------
  // Comptes rendus de consultation
  // ---------------------------------------------------------------------------
  listReports(userId: string, q: ListQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const base = trx.selectFrom('consultation_reports').where('consultation_reports.practitioner_id', '=', p.id);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.leftJoin('appointments', 'appointments.id', 'consultation_reports.appointment_id').selectAll('consultation_reports').select(['appointments.patient_name', 'appointments.patient_id', 'appointments.date as appointment_date']).orderBy('consultation_reports.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      const severity = await trx.selectFrom('consultation_reports').select(['severity_level', (eb) => eb.fn.countAll<string>().as('n')]).where('practitioner_id', '=', p.id).groupBy('severity_level').execute();
      return { data, count: Number(count.n), by_severity: Object.fromEntries(severity.map((s) => [s.severity_level, Number(s.n)])) };
    });
  }

  reportByAppointment(userId: string, appointmentId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      return (await trx.selectFrom('consultation_reports').selectAll().where('appointment_id', '=', appointmentId).where('practitioner_id', '=', p.id).orderBy('created_at', 'desc').executeTakeFirst()) ?? null;
    });
  }

  /** Ex ConsultationReportFormDialog + CompleteConsultationForm : un compte rendu par rendez-vous ; option de clôture atomique. */
  createReport(userId: string, dto: ConsultationReportDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const a = await this.ownCompletedAppointment(trx, p.id, dto.appointmentId);
      const dup = await trx.selectFrom('consultation_reports').select('id').where('appointment_id', '=', dto.appointmentId).executeTakeFirst();
      if (dup) throw new ConflictException({ statusCode: 409, message: 'Un compte rendu existe déjà pour ce rendez-vous', reportId: dup.id });
      if (dto.completeAppointment && !['in-progress', 'confirmed'].includes(a.status)) throw new ConflictException(`Consultation non démarrée (statut : ${a.status})`);
      if (!dto.completeAppointment && !['completed', 'awaiting_confirmation', 'in-progress'].includes(a.status)) throw new ConflictException(`La consultation n'est pas terminée (statut : ${a.status})`);
      const report = await trx
        .insertInto('consultation_reports')
        .values({
          practitioner_id: p.id, appointment_id: dto.appointmentId, consultation_date: dto.consultationDate ? new Date(dto.consultationDate) : new Date(),
          consultation_type: dto.consultationType, severity_level: dto.severityLevel, consultation_reason: dto.consultationReason || null, clinical_findings: dto.clinicalFindings, primary_diagnosis: dto.primaryDiagnosis,
          treatment_prescription: dto.treatmentPrescription || null, follow_up_recommendation: dto.followUpRecommendation || null, follow_up_timeframe: dto.followUpTimeframe || null, additional_comments: dto.additionalComments || null, share_with_doctor: dto.shareWithDoctor,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (dto.completeAppointment) {
        // Même transition que AppointmentsService.complete, dans la même transaction que le compte rendu.
        await trx.updateTable('appointments').set({ status: 'awaiting_confirmation', visit_status: 'completed', consultation_ended_at: new Date(), confirmation_requested_at: new Date(), internal_notes: sql`concat_ws(E'\\n', 'CONSULTATION_TERMINEE', internal_notes)`, updated_at: new Date() }).where('id', '=', a.id).execute();
        await this.inApp.notifyUser(trx, a.patient_id, { title: 'Consultation terminée', message: `Merci de confirmer la consultation avec ${a.practitioner_name}. Sans réponse sous 24 h, elle sera confirmée automatiquement.`, type: 'appointment', link: '/dashboard/patient' });
      }
      await this.inApp.notifyUser(trx, a.patient_id, { title: 'Compte rendu de consultation disponible', message: `${p.name} a rédigé le compte rendu de votre consultation du ${new Date(String(a.date).slice(0, 10)).toLocaleDateString('fr-FR')}.`, type: 'consultation_report', link: '/dashboard/patient?tab=reports' });
      return report;
    });
  }

  updateReport(userId: string, id: string, dto: UpdateConsultationReportDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const current = await trx.selectFrom('consultation_reports').select(['id', 'practitioner_id']).where('id', '=', id).executeTakeFirst();
      if (!current) throw new NotFoundException('Compte rendu introuvable');
      if (current.practitioner_id !== p.id) throw new ForbiddenException('Ce compte rendu ne vous appartient pas');
      const set: Record<string, unknown> = { updated_at: new Date() };
      const map: Record<string, string> = { consultationType: 'consultation_type', severityLevel: 'severity_level', consultationReason: 'consultation_reason', clinicalFindings: 'clinical_findings', primaryDiagnosis: 'primary_diagnosis', treatmentPrescription: 'treatment_prescription', followUpRecommendation: 'follow_up_recommendation', followUpTimeframe: 'follow_up_timeframe', additionalComments: 'additional_comments', shareWithDoctor: 'share_with_doctor' };
      for (const [k, col] of Object.entries(map)) {
        const v = (dto as Record<string, unknown>)[k];
        if (v !== undefined) set[col] = v === '' ? null : v;
      }
      if (dto.consultationDate) set.consultation_date = new Date(dto.consultationDate);
      return trx.updateTable('consultation_reports').set(set as never).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  }

  /** Comptes rendus du patient connecté (ex usePatientConsultationReports, pagination corrigée). */
  patientReports(userId: string, q: ListQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const base = trx.selectFrom('consultation_reports').innerJoin('appointments', 'appointments.id', 'consultation_reports.appointment_id').where('appointments.patient_id', '=', userId);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll('consultation_reports').select(['appointments.practitioner_name', 'appointments.date as appointment_date', 'appointments.specialty']).orderBy('consultation_reports.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      const severity = await base.select(['consultation_reports.severity_level', (eb) => eb.fn.countAll<string>().as('n')]).groupBy('consultation_reports.severity_level').execute();
      return { data, count: Number(count.n), by_severity: Object.fromEntries(severity.map((s) => [s.severity_level, Number(s.n)])) };
    });
  }

  /** Lecture d'un compte rendu (praticien auteur, patient du rendez-vous ou admin) journalisée dans consultation_reports_access_log. */
  getReport(userId: string, id: string, accessType: 'view' | 'download' = 'view') {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const report = await trx.selectFrom('consultation_reports').selectAll().where('id', '=', id).executeTakeFirst();
      if (!report) throw new NotFoundException('Compte rendu introuvable');
      const a = await trx.selectFrom('appointments').select(['id', 'patient_id', 'patient_name', 'practitioner_name', 'date', 'specialty']).where('id', '=', report.appointment_id).executeTakeFirst();
      const pr = await trx.selectFrom('practitioners').select(['user_id', 'name']).where('id', '=', report.practitioner_id).executeTakeFirst();
      const allowed = pr?.user_id === userId || a?.patient_id === userId || (await this.isAdmin(trx, userId));
      if (!allowed) throw new ForbiddenException('Accès non autorisé à ce compte rendu');
      await trx.insertInto('consultation_reports_access_log').values({ report_id: id, accessed_by: userId, access_type: accessType }).execute();
      return { ...report, appointment: a ?? null, practitioner_name: pr?.name ?? a?.practitioner_name ?? null };
    });
  }

  reportAccessLog(id: string) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('consultation_reports_access_log').leftJoin('profiles', 'profiles.id', 'consultation_reports_access_log.accessed_by').selectAll('consultation_reports_access_log').select('profiles.full_name as accessed_by_name').where('report_id', '=', id).orderBy('accessed_at', 'desc').execute());
  }

  // ---------------------------------------------------------------------------
  // Triage
  // ---------------------------------------------------------------------------
  /** Score calculé côté serveur ; enregistré uniquement pour un utilisateur connecté (comportement TriageForm). */
  async triage(userId: string | null, answers: TriageAnswers) {
    const result = calculateTriageScore(answers);
    let id: string | null = null;
    if (userId) {
      const row = await this.database
        .runAs({ role: 'authenticated', userId }, (trx) => trx.insertInto('triage_results').values({ user_id: userId, score: result.score, urgency_level: result.urgencyLevel, message: result.message, recommendations: result.recommendations, answers: JSON.stringify(answers) }).returning('id').executeTakeFirstOrThrow())
        .catch((e) => {
          this.logger.error(`triage non enregistré : ${e}`);
          return null;
        });
      id = row?.id ?? null;
    }
    return { id, ...result, maxScore: TRIAGE_MAX_SCORE, saved: !!id };
  }

  triageHistory(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, async (trx) => {
      const data = await trx.selectFrom('triage_results').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').limit(50).execute();
      const distribution = { immediate: 0, urgent: 0, 'semi-urgent': 0, 'non-urgent': 0 } as Record<string, number>;
      for (const t of data) distribution[t.urgency_level] = (distribution[t.urgency_level] ?? 0) + 1;
      return { data, stats: { total: data.length, distribution, avgScore: data.length ? data.reduce((s, t) => s + t.score, 0) / data.length : 0, maxScore: TRIAGE_MAX_SCORE } };
    });
  }

  async deleteTriage(userId: string, id: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.deleteFrom('triage_results').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst());
    if (Number(r.numDeletedRows) === 0) throw new NotFoundException('Évaluation introuvable');
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Consentements (table consents ; version active de consent_versions mémorisée)
  // ---------------------------------------------------------------------------
  listConsents(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('consents').selectAll().where('user_id', '=', userId).orderBy('consent_type').execute());
  }

  recordConsent(userId: string, dto: ConsentDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const active = await trx.selectFrom('consent_versions').select('version').where('consent_type', '=', dto.consentType).where('is_active', '=', true).orderBy('effective_date', 'desc').executeTakeFirst();
      const values = { is_accepted: dto.accepted, accepted_at: dto.accepted ? new Date() : null, accepted_version: dto.accepted ? active?.version ?? null : null };
      return trx.insertInto('consents').values({ user_id: userId, consent_type: dto.consentType, ...values }).onConflict((oc) => oc.columns(['user_id', 'consent_type']).doUpdateSet(values)).returningAll().executeTakeFirstOrThrow();
    });
  }

  /** Ex SupportSection.handleDataExport (RGPD) : profil, rendez-vous, profil médical + données ajoutées par l'API. */
  exportMyData(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const [user, profile, appointments, medicalProfile, contacts, addresses, consents, triage, reviews] = await Promise.all([
        trx.selectFrom('users').select(['id', 'email', 'phone', 'created_at', 'last_sign_in_at']).where('id', '=', userId).executeTakeFirst(),
        trx.selectFrom('profiles').selectAll().where('id', '=', userId).executeTakeFirst(),
        trx.selectFrom('appointments').selectAll().where('patient_id', '=', userId).orderBy('created_at', 'desc').execute(),
        trx.selectFrom('medical_profiles').selectAll().where('user_id', '=', userId).executeTakeFirst(),
        trx.selectFrom('emergency_contacts').selectAll().where('user_id', '=', userId).execute(),
        trx.selectFrom('addresses').selectAll().where('user_id', '=', userId).execute(),
        trx.selectFrom('consents').selectAll().where('user_id', '=', userId).execute(),
        trx.selectFrom('triage_results').selectAll().where('user_id', '=', userId).execute(),
        trx.selectFrom('reviews').selectAll().where('patient_id', '=', userId).execute(),
      ]);
      return { account: user ?? null, profile: profile ?? null, appointments: appointments.map((a) => appointmentResponse(a, userId)), medicalProfile: medicalProfile ?? null, emergencyContacts: contacts, addresses, consents, triageResults: triage, reviews, exportDate: new Date().toISOString() };
    });
  }
}
