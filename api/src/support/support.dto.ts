import { z } from 'zod';

const page = { page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) };
export const ticketStatusEnum = z.enum(['ouvert', 'en_cours', 'resolu', 'ferme']);
export const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

/** Ex useCreateSupportTicket : le patient / praticien ne peut choisir que low | medium | high. */
export const createTicketSchema = z.object({
  subject: z.string().trim().min(1, 'Sujet requis').max(200),
  description: z.string().trim().min(1, 'Description requise').max(5000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  appointmentId: z.string().max(255).optional(),
  attachments: z.array(z.string().max(1024)).max(10).optional(),
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

export const myTicketsQuerySchema = z.object({ status: ticketStatusEnum.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export type MyTicketsQuery = z.infer<typeof myTicketsQuerySchema>;

export const adminTicketsQuerySchema = z.object({ status: ticketStatusEnum.optional(), priority: priorityEnum.optional(), search: z.string().trim().max(100).optional(), ...page });
export type AdminTicketsQuery = z.infer<typeof adminTicketsQuerySchema>;

/** Ex updateTicketMutation (SupportSection admin) : statut + réponse ; priorité et assignation en plus. */
export const updateTicketSchema = z
  .object({
    status: ticketStatusEnum.optional(),
    response: z.string().trim().max(5000).optional(),
    priority: priorityEnum.optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Aucune modification' });
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;

export const FAQ_CATEGORIES = ['Général', 'Paiements', 'Rendez-vous', 'Compte', 'Praticiens', 'Technique'] as const;
export const audienceEnum = z.enum(['all', 'patients', 'practitioners']);

export const faqSchema = z.object({
  question: z.string().trim().min(1, 'Question et réponse requises').max(500),
  answer: z.string().trim().min(1, 'Question et réponse requises').max(10_000),
  category: z.string().trim().min(1).max(100).default('Général'),
  targetAudience: audienceEnum.default('all'),
});
export type FaqDto = z.infer<typeof faqSchema>;

export const updateFaqSchema = faqSchema.partial().extend({ isPublished: z.boolean().optional() }).refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Aucune modification' });
export type UpdateFaqDto = z.infer<typeof updateFaqSchema>;

export const publicFaqQuerySchema = z.object({ audience: z.enum(['patients', 'practitioners']).optional(), category: z.string().trim().max(100).optional() });
export type PublicFaqQuery = z.infer<typeof publicFaqQuerySchema>;
