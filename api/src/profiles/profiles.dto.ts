import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).optional(),
  gender: z.enum(['homme', 'femme', 'autre', 'non_specifie']).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ').optional(),
  avatarUrl: z.string().url().max(2048).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
