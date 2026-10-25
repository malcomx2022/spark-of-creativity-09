import { z } from 'zod';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const groupSession = /^group_session_[0-9a-f-]{36}_[0-9a-f-]{36}$/i;

/** Port de PaymentRequestSchema (create-payment). */
export const createPaymentSchema = z.object({
  appointmentId: z.string().refine((v) => uuid.test(v) || groupSession.test(v), "Format d'identifiant invalide (UUID ou group_session_{uuid}_{uuid} attendu)"),
  amount: z.number().min(100, "Le montant doit être d'au moins 100 XOF").max(1_000_000, 'Le montant ne doit pas dépasser 1 000 000 XOF').optional(),
  paymentMethod: z.enum(['mtn', 'moov'], { error: "La méthode de paiement doit être 'mtn' ou 'moov'" }),
  phoneNumber: z.string().regex(/^\+229(01)?\d{8}$/, 'Le numéro doit être au format béninois : +229XXXXXXXX ou +2290101XXXXXXXX'),
  payerName: z.string().trim().min(2, 'Le nom du payeur doit contenir au moins 2 caractères').max(120),
  payerEmail: z.string().email("Format d'email invalide").optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const listPaymentsQuerySchema = z.object({
  appointmentId: z.string().optional(),
  status: z.enum(['initiated', 'pending', 'authorized', 'paid', 'failed', 'canceled', 'refunded', 'chargeback']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

/** Simulation d'un événement FedaPay (ex simulate-webhook, admin / fake uniquement). */
export const simulateWebhookSchema = z.object({
  transactionId: z.string().min(1),
  status: z.enum(['pending', 'processing', 'authorized', 'approved', 'declined', 'canceled', 'refunded', 'transferred', 'expired', 'timeout']),
});
export type SimulateWebhookDto = z.infer<typeof simulateWebhookSchema>;
