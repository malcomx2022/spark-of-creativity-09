import { z } from 'zod';

export const conversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ConversationsQuery = z.infer<typeof conversationsQuerySchema>;

export const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  before: z.string().datetime().optional(),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

/** Pièce jointe déjà envoyée au stockage via POST /files/upload-url (dossier message-attachments). */
export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(4000).default(''),
    attachment: z
      .object({
        filePath: z.string().min(3).max(1024),
        type: z.string().max(100).optional(),
        name: z.string().max(255).optional(),
        size: z.number().int().nonnegative().optional(),
      })
      .optional(),
  })
  .refine((m) => m.content.length > 0 || !!m.attachment, { message: 'Message vide', path: ['content'] });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
