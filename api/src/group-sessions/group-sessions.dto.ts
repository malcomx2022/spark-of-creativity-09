import { z } from 'zod';

/** Port de src/lib/session-validation.ts (contrôles côté serveur). Le plancher de prix est celui de la base (10 000 XOF). */
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MIN_SESSION_PRICE = 10_000;
export const MAX_SESSION_PRICE = 500_000;

const sessionFields = {
  sessionName: z.string().trim().min(3, 'Le nom de la séance doit contenir au moins 3 caractères').max(100),
  sessionType: z.enum(['individuelle', 'duo', 'groupe']),
  maxParticipants: z.number().int().min(1).max(100),
  minParticipants: z.number().int().min(1).max(100),
  scheduledDate: z.string().regex(dateRe, 'Date attendue au format AAAA-MM-JJ'),
  startTime: z.string().regex(timeRe, 'Heure attendue au format HH:MM'),
  endTime: z.string().regex(timeRe, 'Heure attendue au format HH:MM'),
  pricePerPerson: z.number().int().min(MIN_SESSION_PRICE, `Le prix doit être d'au moins ${MIN_SESSION_PRICE} FCFA`).max(MAX_SESSION_PRICE, `Le prix ne peut pas dépasser ${MAX_SESSION_PRICE} FCFA`),
  location: z.string().trim().min(5, 'Le lieu doit contenir au moins 5 caractères').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
};

type SessionInput = Partial<Record<keyof typeof sessionFields, unknown>>;

function refine<T extends z.ZodType<SessionInput>>(schema: T) {
  return schema.superRefine((d: SessionInput, ctx) => {
    const min = d.minParticipants as number | undefined;
    const max = d.maxParticipants as number | undefined;
    if (min !== undefined && max !== undefined && min > max) ctx.addIssue({ code: 'custom', path: ['minParticipants'], message: 'Le nombre minimum de participants ne peut pas dépasser le maximum' });
    const start = d.startTime as string | undefined;
    const end = d.endTime as string | undefined;
    if (start && end && start >= end) ctx.addIssue({ code: 'custom', path: ['startTime'], message: "L'heure de début doit être avant l'heure de fin" });
    const date = d.scheduledDate as string | undefined;
    if (date && date < new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: 'custom', path: ['scheduledDate'], message: 'La date de la séance doit être dans le futur' });
  });
}

// minParticipants vaut 1 par défaut à la création seulement : zod 4 appliquerait la valeur par défaut
// dans .partial(), et une mise à jour sans le champ le remettrait à 1.
export const createGroupSessionSchema = refine(z.object({ ...sessionFields, minParticipants: sessionFields.minParticipants.default(1) }));
export type CreateGroupSessionDto = z.infer<typeof createGroupSessionSchema>;

export const updateGroupSessionSchema = refine(z.object(sessionFields).partial());
export type UpdateGroupSessionDto = z.infer<typeof updateGroupSessionSchema>;

export const listGroupSessionsQuerySchema = z.object({
  coachId: z.string().guid().optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListGroupSessionsQuery = z.infer<typeof listGroupSessionsQuerySchema>;

export const coachSessionsQuerySchema = z.object({
  status: z.enum(['planifiee', 'confirmee', 'annulee', 'terminee']).optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CoachSessionsQuery = z.infer<typeof coachSessionsQuerySchema>;

export const mineQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type MineQuery = z.infer<typeof mineQuerySchema>;

/** Ex register-group-session : le montant est celui de la séance, le patient est l'utilisateur connecté. */
export const registerSchema = z.object({
  paymentMethod: z.enum(['mtn', 'moov'], { error: "La méthode de paiement doit être 'mtn' ou 'moov'" }),
  phoneNumber: z.string().regex(/^\+229(01)?\d{8}$/, 'Le numéro doit être au format béninois : +229XXXXXXXX ou +2290101XXXXXXXX'),
  payerName: z.string().trim().min(2).max(120).optional(),
  payerEmail: z.string().email().optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const retryPaymentSchema = registerSchema;
export type RetryPaymentDto = z.infer<typeof retryPaymentSchema>;

export const cancelSessionSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type CancelSessionDto = z.infer<typeof cancelSessionSchema>;
