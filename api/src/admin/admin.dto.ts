import { z } from 'zod';

const page = { page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(50) };

export const adminRoleEnum = z.enum(['super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst']);

/** Ex admin-management action=create. */
export const createAdminSchema = z.object({
  email: z.string().email(),
  role: adminRoleEnum,
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
});
export type CreateAdminDto = z.infer<typeof createAdminSchema>;

export const revokeAdminSchema = z.object({ reason: z.string().trim().min(1, 'Raison requise').max(500) });
export type RevokeAdminDto = z.infer<typeof revokeAdminSchema>;

export const usersQuerySchema = z.object({ search: z.string().trim().max(100).optional(), ...page });
export type UsersQuery = z.infer<typeof usersQuerySchema>;

export const deleteUserSchema = z.object({ userType: z.enum(['patient', 'practitioner']).optional(), confirm: z.literal('SUPPRIMER', { errorMap: () => ({ message: 'Tapez SUPPRIMER pour confirmer' }) }) });
export type DeleteUserDto = z.infer<typeof deleteUserSchema>;

export const auditQuerySchema = z.object({
  entityType: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  adminId: z.string().uuid().optional(),
  /** Historique d'une entité précise (ex KYC d'un praticien). */
  entityId: z.string().max(255).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(5000).default(20),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const searchActivityQuerySchema = z.object({
  actionType: z.string().max(60).optional(),
  userType: z.enum(['authenticated', 'anonymous']).optional(),
  days: z.coerce.number().int().min(1).max(365).default(7),
  ...page,
});
export type SearchActivityQuery = z.infer<typeof searchActivityQuerySchema>;

/** Ex useSearchActivityLog.logActivity (public, session anonyme acceptée). */
export const logSearchActivitySchema = z.object({
  sessionId: z.string().min(4).max(120),
  actionType: z.enum(['view_search_page', 'filter_specialty', 'filter_zone', 'view_practitioner_details', 'click_contact', 'click_appointment', 'click_itinerary', 'close_practitioner_details', 'search_text', 'appointment_created']),
  practitionerId: z.string().uuid().optional().nullable(),
  searchFilters: z.record(z.unknown()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});
export type LogSearchActivityDto = z.infer<typeof logSearchActivitySchema>;

export const otpAttemptsQuerySchema = z.object({
  phone: z.string().trim().max(30).optional(),
  status: z.string().max(30).optional(),
  channel: z.string().max(30).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...page,
});
export type OtpAttemptsQuery = z.infer<typeof otpAttemptsQuerySchema>;

export const systemConfigSchema = z.object({ value: z.unknown().refine((v) => v !== undefined, 'Valeur requise'), description: z.string().trim().max(300).optional() });
export type SystemConfigDto = z.infer<typeof systemConfigSchema>;

export const consentTypeEnum = z.enum(['cgu', 'charte', 'partage_donnees', 'marketing']);
export const createConsentVersionSchema = z.object({ consentType: consentTypeEnum, version: z.string().trim().min(1, 'Version et contenu sont requis').max(30), content: z.string().trim().min(1, 'Version et contenu sont requis') });
export type CreateConsentVersionDto = z.infer<typeof createConsentVersionSchema>;

export const reviewsQuerySchema = z.object({ ...page });
export const moderateReviewSchema = z.object({ isHidden: z.boolean(), reason: z.string().trim().max(500).optional() });
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;

export const todayAppointmentsQuerySchema = z.object({ status: z.string().max(40).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export type TodayAppointmentsQuery = z.infer<typeof todayAppointmentsQuerySchema>;
