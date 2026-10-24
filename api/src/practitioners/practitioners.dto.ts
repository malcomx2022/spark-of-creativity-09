import { z } from 'zod';

export const practitionerTypeEnum = z.enum(['medecin', 'infirmier', 'kinesitherapeute', 'nutritionniste', 'sage_femme', 'psychologue', 'coach_sportif', 'autre']);
const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Numéro de téléphone invalide (format : +229XXXXXXXX)');
const dataUrl = z.string().regex(/^data:[A-Za-z-+/.]+;base64,/, 'Document attendu en data-URL base64');

/** Port de validatePractitionerData() + des règles coach de create-practitioner-account. */
export const registerPractitionerSchema = z
  .object({
    profile: z.object({
      fullName: z.string().trim().min(2).max(100).regex(nameRegex, 'Nom contient des caractères invalides'),
      phone: phoneSchema,
      gender: z.enum(['homme', 'femme', 'autre', 'non_specifie']).nullable().optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }),
    practitioner: z.object({
      name: z.string().trim().min(2, 'Nom invalide (minimum 2 caractères)').max(100, 'Nom trop long (maximum 100 caractères)').regex(nameRegex, 'Nom contient des caractères invalides'),
      phone: phoneSchema,
      specialty: z.string().trim().min(2, 'Spécialité invalide (minimum 2 caractères)').max(100, 'Spécialité trop longue (maximum 100 caractères)'),
      practitionerType: practitionerTypeEnum,
      address: z.string().trim().max(200, 'Adresse trop longue (maximum 200 caractères)').optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
      yearsExperience: z.number().int().min(0, 'Années d’expérience invalides').max(70, 'Années d’expérience invalides (doit être entre 0 et 70)').optional(),
      bio: z.string().max(2000).optional(),
      licenseNumber: z.string().trim().max(100).optional(),
      sessionTypes: z.array(z.string().trim().min(1)).max(10, 'Trop de types de séances sélectionnés (maximum 10)').optional(),
      interventionZone: z.string().trim().max(200, 'Zone d’intervention trop longue (maximum 200 caractères)').optional(),
      interventionRadius: z.number().min(1, 'Rayon d’intervention invalide (doit être entre 1 et 100 km)').max(100, 'Rayon d’intervention invalide (doit être entre 1 et 100 km)').optional(),
      certifications: z.array(z.string().trim()).max(20, 'Trop de certifications (maximum 20)').optional(),
      communesServed: z.array(z.string().trim()).max(50).optional(),
      languages: z.array(z.string().trim()).max(20).optional(),
    }),
    documents: z.object({
      idDocument: dataUrl,
      licenseDocument: dataUrl.optional(),
      diploma: dataUrl.optional(),
      profilePhoto: dataUrl.optional(),
    }),
  })
  .superRefine((data, ctx) => {
    const coach = data.practitioner.practitionerType === 'coach_sportif';
    if (coach) {
      if (!data.practitioner.sessionTypes?.length) ctx.addIssue({ code: 'custom', path: ['practitioner', 'sessionTypes'], message: 'Au moins un type de séance requis pour les coachs sportifs' });
      if (!data.practitioner.interventionZone || data.practitioner.interventionZone.length < 3) ctx.addIssue({ code: 'custom', path: ['practitioner', 'interventionZone'], message: 'Zone d’intervention requise pour les coachs sportifs (minimum 3 caractères)' });
      if (data.practitioner.interventionRadius === undefined) ctx.addIssue({ code: 'custom', path: ['practitioner', 'interventionRadius'], message: 'Rayon d’intervention requis pour les coachs sportifs' });
      if (!data.documents.diploma) ctx.addIssue({ code: 'custom', path: ['documents', 'diploma'], message: 'Le diplôme ou la certification est obligatoire pour les coachs sportifs' });
    } else if (!data.documents.licenseDocument) {
      ctx.addIssue({ code: 'custom', path: ['documents', 'licenseDocument'], message: "L'autorisation d'exercice est obligatoire pour les praticiens de santé" });
    }
  });
export type RegisterPractitionerDto = z.infer<typeof registerPractitionerSchema>;

export const updatePractitionerSchema = z.object({
  bio: z.string().max(2000).optional(),
  address: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  specialty: z.string().trim().min(2).max(100).optional(),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  interventionRadius: z.number().int().min(1).max(100).optional(),
  interventionZone: z.string().trim().max(200).optional(),
  communesServed: z.array(z.string().trim()).max(50).optional(),
  languages: z.array(z.string().trim()).max(20).optional(),
  diplomas: z.array(z.string().trim()).max(20).optional(),
  certifications: z.array(z.string().trim()).max(20).optional(),
  sessionTypes: z.array(z.string().trim()).max(10).optional(),
  image: z.string().max(1024).nullable().optional(),
  licenseNumber: z.string().trim().max(100).nullable().optional(),
  available: z.boolean().optional(),
  isOnline: z.boolean().optional(),
});
export type UpdatePractitionerDto = z.infer<typeof updatePractitionerSchema>;

export const listPractitionersQuerySchema = z.object({
  type: practitionerTypeEnum.optional(),
  /** true = uniquement ceux qui peuvent recevoir des missions maintenant (usePractitioners) */
  onlineOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListPractitionersQuery = z.infer<typeof listPractitionersQuerySchema>;

/** Port de FindPractitionerRequest (find-available-practitioner). */
export const availableQuerySchema = z.object({
  type: practitionerTypeEnum,
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ'),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:MM'),
  radiusKm: z.coerce.number().min(1).max(200).default(10),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type AvailableQuery = z.infer<typeof availableQuerySchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Format HH:MM');
export const availabilitySchema = z
  .object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time, isActive: z.boolean().optional() })
  .refine((a) => a.startTime < a.endTime, { message: "L'heure de fin doit être après l'heure de début", path: ['endTime'] });
export type AvailabilityDto = z.infer<typeof availabilitySchema>;
export const availabilityUpdateSchema = z.object({ startTime: time.optional(), endTime: time.optional(), isActive: z.boolean().optional() });
export type AvailabilityUpdateDto = z.infer<typeof availabilityUpdateSchema>;

export const exceptionSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(200).optional(), isAvailable: z.boolean().default(false) });
export type ExceptionDto = z.infer<typeof exceptionSchema>;

// zod 4 applique un .default() même dans un champ rendu facultatif par .partial() : les schémas de
// mise à jour partent donc des champs sans valeur par défaut, sinon un PATCH écraserait le champ omis.
const rateFields = z.object({ serviceType: z.string().trim().min(2).max(100), basePrice: z.number().int().min(0).max(10_000_000), durationMinutes: z.number().int().min(5).max(600) });
export const rateSchema = rateFields.extend({ durationMinutes: rateFields.shape.durationMinutes.default(60) });
export type RateDto = z.infer<typeof rateSchema>;
export const rateUpdateSchema = rateFields.partial();
export type RateUpdateDto = z.infer<typeof rateUpdateSchema>;

/** Ex DocumentsSection : nouveau document KYC téléversé via POST /files/upload-url (dossier documents). */
export const updateDocumentsSchema = z
  .object({
    idDocumentUrl: z.string().trim().min(3).max(1024).optional(),
    licenseDocumentUrl: z.string().trim().min(3).max(1024).optional(),
    insuranceDocumentUrl: z.string().trim().min(3).max(1024).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Aucun document fourni' });
export type UpdateDocumentsDto = z.infer<typeof updateDocumentsSchema>;
