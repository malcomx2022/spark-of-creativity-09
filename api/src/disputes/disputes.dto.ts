import { z } from 'zod';

const page = { page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) };
export const disputeStatusEnum = z.enum(['open', 'investigating', 'resolved', 'closed']);
export const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

/** Ex ConsultationConfirmation.handleReportIssue : le litige porte sur un rendez-vous de l'utilisateur. */
export const createDisputeSchema = z.object({
  appointmentId: z.string().min(1).max(255),
  description: z.string().trim().min(1, 'Veuillez décrire le problème rencontré.').max(5000),
  subject: z.string().trim().min(1).max(200).optional(),
  priority: priorityEnum.default('high'),
});
export type CreateDisputeDto = z.infer<typeof createDisputeSchema>;

export const disputeMessageSchema = z.object({ message: z.string().trim().min(1, 'Message requis').max(5000), attachments: z.array(z.string().max(1024)).max(10).optional() });
export type DisputeMessageDto = z.infer<typeof disputeMessageSchema>;

export const myDisputesQuerySchema = z.object({ status: disputeStatusEnum.optional(), ...page });
export type MyDisputesQuery = z.infer<typeof myDisputesQuerySchema>;

export const adminDisputesQuerySchema = z.object({ status: disputeStatusEnum.optional(), priority: priorityEnum.optional(), overdue: z.coerce.boolean().optional(), ...page });
export type AdminDisputesQuery = z.infer<typeof adminDisputesQuerySchema>;

/** Ex updateDisputeMutation (OperationsSection) : prise en charge, résolution, réouverture, fermeture. */
export const updateDisputeSchema = z
  .object({ status: disputeStatusEnum.optional(), resolution: z.string().trim().max(5000).optional(), priority: priorityEnum.optional(), assignedTo: z.string().uuid().nullable().optional() })
  .superRefine((d, ctx) => {
    if (d.status === 'resolved' && !d.resolution) ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Commentaire de résolution requis' });
    if (!Object.values(d).some((v) => v !== undefined)) ctx.addIssue({ code: 'custom', message: 'Aucune modification' });
  });
export type UpdateDisputeDto = z.infer<typeof updateDisputeSchema>;
