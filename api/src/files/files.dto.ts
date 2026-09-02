import { z } from 'zod';

const folder = z.enum(['documents', 'avatars', 'message-attachments']).default('documents');
const fileName = z.string().trim().min(1).max(255);

/** Étape 1 du flux navigateur → S3 : obtenir une URL pré-signée PUT. */
export const uploadUrlSchema = z.object({
  fileName,
  contentType: z.string().min(3).max(100),
  fileSize: z.number().int().positive(),
  folder,
});
export type UploadUrlDto = z.infer<typeof uploadUrlSchema>;

/** Étape 2 : enregistrer l'objet envoyé dans la table files. */
export const registerFileSchema = z.object({
  filePath: z.string().min(3).max(1024),
  fileName,
  fileSize: z.number().int().nonnegative(),
  fileType: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RegisterFileDto = z.infer<typeof registerFileSchema>;

/** Flux hérité (upload-to-wasabi) : contenu base64 transitant par l'API. */
export const uploadBase64Schema = z.object({
  fileName,
  fileContent: z.string().min(1),
  contentType: z.string().min(3).max(100).optional(),
  folder,
});
export type UploadBase64Dto = z.infer<typeof uploadBase64Schema>;

export const fileUrlQuerySchema = z.object({
  filePath: z.string().min(3).max(1024),
  expiresIn: z.coerce.number().int().min(60).max(24 * 3600).optional(),
});
export type FileUrlQuery = z.infer<typeof fileUrlQuerySchema>;
