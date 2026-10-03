import { z } from 'zod';

const page = { page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) };

/** Port de src/schemas/paymentInfoSchema.ts (PaymentInfoSection). */
export const paymentInfoSchema = z
  .object({
    // `orange` n'existe pas au Bénin : un tel reversement échouerait chez FedaPay (m6).
    paymentMethod: z.enum(['mtn', 'moov', 'bank']),
    accountHolderName: z.string().trim().min(2, 'Le nom du titulaire est obligatoire').max(120),
    phoneNumber: z.string().trim().optional(),
    bankName: z.string().trim().max(120).optional(),
    bankAccountNumber: z.string().trim().optional(),
    /** Le praticien confirme ses informations (comportement hérité : is_verified est déclaratif). */
    verify: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.paymentMethod === 'bank') {
      if (!d.bankName) ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Le nom de la banque est obligatoire' });
      const acc = (d.bankAccountNumber ?? '').replace(/\s+/g, '');
      if (!acc) ctx.addIssue({ code: 'custom', path: ['bankAccountNumber'], message: 'Le numéro de compte est obligatoire' });
      else if (!/^[0-9A-Za-z]{8,34}$/.test(acc)) ctx.addIssue({ code: 'custom', path: ['bankAccountNumber'], message: 'Numéro de compte invalide (8 à 34 caractères alphanumériques)' });
    } else {
      if (!d.phoneNumber) ctx.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Le numéro Mobile Money est obligatoire' });
      else if (!/^\+229(01)?\d{8}$/.test(d.phoneNumber.replace(/[\s-]/g, ''))) ctx.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Format invalide. Exemple attendu : +22960000000' });
    }
  });
export type PaymentInfoDto = z.infer<typeof paymentInfoSchema>;

export const adminPaymentsQuerySchema = z.object({
  status: z.string().max(30).optional(),
  payoutStatus: z.enum(['pending', 'held', 'ready', 'paid', 'failed']).optional(),
  /** Borne inférieure de création (ISO 8601), ex métriques des dernières 24 h. */
  from: z.string().datetime().optional(),
  page: page.page,
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});
export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;

export const payoutsQuerySchema = z.object({ status: z.enum(['planned', 'sent', 'completed', 'failed']).optional(), practitionerId: z.string().uuid().optional(), batchId: z.string().uuid().optional(), ...page });
export type PayoutsQuery = z.infer<typeof payoutsQuerySchema>;

/** Ex create-payout : reversement individuel immédiat. */
export const createPayoutSchema = z.object({
  practitionerId: z.string().uuid('Identifiant praticien invalide'),
  /** Absent : somme des paiements « prêts » de la période. */
  amount: z.number().int().positive('Le montant doit être positif').optional(),
  period: z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
  description: z.string().trim().max(300).optional(),
});
export type CreatePayoutDto = z.infer<typeof createPayoutSchema>;

/** Ex create-payout-batch. */
export const createBatchSchema = z.object({
  practitionerIds: z.array(z.string().uuid()).min(1, 'Sélectionnez au moins un praticien').max(500),
  paymentMethod: z.enum(['momo', 'bank']),
});
export type CreateBatchDto = z.infer<typeof createBatchSchema>;

/**
 * Ex process-refund. Canal `fedapay` : appel API (le statut rendu fait foi). Canal `manual` : remboursement
 * déjà effectué depuis le tableau de bord FedaPay (seule voie documentée) ou par un autre moyen, enregistré
 * avec sa référence ; aucun appel FedaPay, écritures et soldes traités ici.
 */
export const refundSchema = z
  .object({
    paymentId: z.string().uuid(),
    refundAmount: z.number().int().positive('Le montant du remboursement doit être un nombre positif').optional(),
    reason: z.string().trim().min(3, 'Le motif est obligatoire').max(500),
    channel: z.enum(['fedapay', 'manual']).default('fedapay'),
    /** Référence FedaPay (ou du virement) du remboursement effectué hors API — obligatoire en canal manuel. */
    providerReference: z.string().trim().min(3).max(120).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.channel === 'manual' && !d.providerReference) ctx.addIssue({ code: 'custom', path: ['providerReference'], message: 'La référence du remboursement effectué chez FedaPay est obligatoire' });
  });
export type RefundDto = z.infer<typeof refundSchema>;

/** Confirmation d'un remboursement `pending` après vérification chez FedaPay. */
export const confirmRefundSchema = z.object({ providerReference: z.string().trim().min(3).max(120).optional() });
export type ConfirmRefundDto = z.infer<typeof confirmRefundSchema>;

export const reconciliationSchema = z.object({ periodStart: z.string().datetime().optional(), periodEnd: z.string().datetime().optional() });
export type ReconciliationDto = z.infer<typeof reconciliationSchema>;

export const webhookEventsQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'success', 'failed', 'permanently_failed']).optional(),
  eventType: z.string().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: page.page,
  /** Jusqu'à 5000 pour l'export CSV de WebhooksSection. */
  limit: z.coerce.number().int().min(1).max(5000).default(20),
});
export type WebhookEventsQuery = z.infer<typeof webhookEventsQuerySchema>;

export const listQuerySchema = z.object(page);
export type ListQuery = z.infer<typeof listQuerySchema>;
