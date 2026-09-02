import { z } from 'zod';

export const kycDecisionSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'incomplete']),
    comment: z.string().trim().max(1000).optional(),
    /** Verrou optimiste (KYCQueue.tsx) : statut attendu avant la décision. */
    expectedCurrentStatus: z.enum(['pending', 'approved', 'rejected', 'incomplete']).optional(),
  })
  .refine((d) => d.status === 'approved' || (d.comment && d.comment.length >= 3), { message: 'Un commentaire est requis pour un refus ou un dossier incomplet', path: ['comment'] });
export type KycDecisionDto = z.infer<typeof kycDecisionSchema>;

export const kycQueueQuerySchema = z.object({
  status: z.enum(['pending', 'incomplete', 'approved', 'rejected', 'all']).default('pending'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type KycQueueQuery = z.infer<typeof kycQueueQuerySchema>;
