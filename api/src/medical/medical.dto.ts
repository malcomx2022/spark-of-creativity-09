import { z } from 'zod';

const page = { page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) };
const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Numéro attendu au format international (ex. +22912345678)');
const nullable = (max: number) => z.string().trim().max(max).nullable().optional();

// --- Profil médical (MedicalSection) -----------------------------------------------------------
export const bloodTypeEnum = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu']);
export const medicalProfileSchema = z.object({
  bloodType: bloodTypeEnum.optional(),
  allergies: nullable(2000),
  chronicDiseases: nullable(2000),
  currentMedications: nullable(2000),
  additionalNotes: nullable(4000),
  shareWithPractitioner: z.boolean().optional(),
  /** Médecin traitant : praticien de la plateforme (primaryDoctorId) ou saisie libre. */
  primaryDoctorId: z.string().guid().nullable().optional(),
  primaryDoctorName: nullable(120),
  primaryDoctorEmail: z.string().trim().email().nullable().optional().or(z.literal('').transform(() => null)),
  primaryDoctorPhone: nullable(30),
});
export type MedicalProfileDto = z.infer<typeof medicalProfileSchema>;

// --- Contacts d'urgence -------------------------------------------------------------------------
export const emergencyContactSchema = z.object({ name: z.string().trim().min(1, 'Nom requis').max(120), phone, relationship: nullable(80) });
export type EmergencyContactDto = z.infer<typeof emergencyContactSchema>;
export const updateEmergencyContactSchema = emergencyContactSchema.partial();

// --- Adresses -------------------------------------------------------------------------------------
// zod 4 applique un .default() même dans un champ rendu facultatif par .partial() : les schémas de
// mise à jour partent donc des champs sans valeur par défaut, sinon un PATCH écraserait le champ omis.
const addressFields = z.object({
  label: z.string().trim().min(1, 'Libellé requis').max(60),
  address: z.string().trim().min(5, 'Adresse requise').max(300),
  city: nullable(100),
  postalCode: nullable(20),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean(),
});
export const addressSchema = addressFields.extend({ isDefault: addressFields.shape.isDefault.default(false) });
export type AddressDto = z.infer<typeof addressSchema>;
export const updateAddressSchema = addressFields.partial();

// --- Notes de soins (SOAP) ----------------------------------------------------------------------
const careNoteFields = z.object({
  appointmentId: z.string().min(1).max(255),
  subjective: nullable(4000),
  objective: nullable(4000),
  assessment: nullable(4000),
  plan: nullable(4000),
  attachments: z.array(z.string().max(1024)).max(10).optional(),
  sharedWithPatient: z.boolean(),
});
export const careNoteSchema = careNoteFields.extend({ sharedWithPatient: careNoteFields.shape.sharedWithPatient.default(false) });
export type CareNoteDto = z.infer<typeof careNoteSchema>;
export const updateCareNoteSchema = careNoteFields.omit({ appointmentId: true }).partial();
export type UpdateCareNoteDto = z.infer<typeof updateCareNoteSchema>;
export const listQuerySchema = z.object(page);
export type ListQuery = z.infer<typeof listQuerySchema>;

// --- Comptes rendus de consultation --------------------------------------------------------------
/** Vocabulaire canonique (ConsultationReportFormDialog) ; les valeurs de CompleteConsultationForm sont acceptées et converties. */
const CONSULTATION_TYPES: Record<string, string> = { domicile: 'domicile', teleconsultation: 'teleconsultation', suivi: 'suivi', video: 'teleconsultation', urgence: 'domicile' };
const SEVERITIES: Record<string, string> = { leger: 'leger', modere: 'modere', urgent: 'urgent', low: 'leger', moderate: 'modere', high: 'urgent', critical: 'urgent' };
const mapped = (table: Record<string, string>, label: string) => z.string().trim().transform((v, ctx) => {
  const m = table[v];
  if (!m) ctx.addIssue({ code: 'custom', message: `${label} invalide (${Object.keys(table).join(', ')})` });
  return m ?? v;
});
const consultationReportFields = z.object({
  appointmentId: z.string().min(1).max(255),
  consultationType: mapped(CONSULTATION_TYPES, 'Type de consultation'),
  severityLevel: mapped(SEVERITIES, 'Niveau de gravité'),
  consultationReason: nullable(2000),
  clinicalFindings: z.string().trim().min(1, 'Veuillez remplir au moins les observations cliniques et le diagnostic.').max(8000),
  primaryDiagnosis: z.string().trim().min(1, 'Veuillez remplir au moins les observations cliniques et le diagnostic.').max(2000),
  treatmentPrescription: nullable(8000),
  followUpRecommendation: nullable(4000),
  followUpTimeframe: nullable(100),
  additionalComments: nullable(4000),
  shareWithDoctor: z.boolean(),
  consultationDate: z.string().datetime().optional(),
  /** Ex CompleteConsultationForm : termine aussi la consultation (rendez-vous → awaiting_confirmation). */
  completeAppointment: z.boolean(),
});
export const consultationReportSchema = consultationReportFields.extend({
  shareWithDoctor: consultationReportFields.shape.shareWithDoctor.default(false),
  completeAppointment: consultationReportFields.shape.completeAppointment.default(false),
});
export type ConsultationReportDto = z.infer<typeof consultationReportSchema>;
export const updateConsultationReportSchema = consultationReportFields.omit({ appointmentId: true, completeAppointment: true }).partial();
export type UpdateConsultationReportDto = z.infer<typeof updateConsultationReportSchema>;

// --- Triage (src/types/triage.ts) ---------------------------------------------------------------
export const triageAnswersSchema = z.object({
  consciousness: z.enum(['conscious', 'confused', 'unconscious'], { error: 'Veuillez sélectionner une option' }),
  breathing: z.enum(['normal', 'mild', 'severe'], { error: 'Veuillez sélectionner une option' }),
  'chest-pain': z.enum(['none', 'moderate', 'severe'], { error: 'Veuillez sélectionner une option' }),
  bleeding: z.enum(['none', 'minor', 'major'], { error: 'Veuillez sélectionner une option' }),
  'pain-level': z.enum(['mild', 'moderate', 'severe'], { error: 'Veuillez sélectionner une option' }),
  symptoms: z.array(z.enum(['fever', 'vomiting', 'dizzy', 'confusion', 'paralysis'])).default([]),
});
export type TriageAnswers = z.infer<typeof triageAnswersSchema>;

// --- Consentements -------------------------------------------------------------------------------
export const consentSchema = z.object({ consentType: z.enum(['cgu', 'charte', 'partage_donnees', 'marketing']), accepted: z.boolean() });
export type ConsentDto = z.infer<typeof consentSchema>;
