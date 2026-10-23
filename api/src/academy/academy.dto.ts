import { z } from 'zod';

/** Identifiant de formation Akambi tel que reçu (UUID en pratique) : borné et sans caractère de chemin. */
export const courseIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Identifiant de formation invalide');

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Date ISO 8601 attendue');
const nullableText = z.string().nullable();

/**
 * Formation telle que renvoyée par GET /courses (guide Akambi § 6.1). Toute formation qui ne la respecte
 * pas est écartée de la synchronisation (et retient le curseur) plutôt qu'enregistrée partiellement.
 */
export const akambiCourseSchema = z.object({
  id: courseIdSchema,
  title: z.string().trim().min(1),
  description: nullableText,
  type: z.enum(['E_LEARNING', 'VISIO_CONFERENCE', 'PRESENTIEL']),
  status: z.enum(['PUBLISHED', 'ARCHIVED']),
  category: z.object({ code: z.string(), title: z.string() }).nullable(),
  publicPrice: z.object({ amount: z.number().nonnegative(), currency: z.enum(['EURO', 'DOLLAR', 'FRANC_CFA']) }).nullable(),
  moduleCount: z.number().int().nonnegative().nullable(),
  chapterCount: z.number().int().nonnegative().nullable(),
  coverImageUrl: z.string().url().nullable(),
  presentationUrl: z.string().url().nullable(),
  createdAt: isoDate.nullable(),
  updatedAt: isoDate,
});
export type AkambiCourseInput = z.infer<typeof akambiCourseSchema>;

/** Formation exposée aux praticiens DomiCares (catalogue local, formations publiées seulement). */
export interface AcademyCourseView {
  id: string;
  title: string;
  description: string | null;
  type: 'E_LEARNING' | 'VISIO_CONFERENCE' | 'PRESENTIEL';
  category: { code: string; title: string | null } | null;
  publicPrice: { amount: number; currency: 'EURO' | 'DOLLAR' | 'FRANC_CFA' } | null;
  moduleCount: number | null;
  chapterCount: number | null;
  coverImageUrl: string | null;
  presentationUrl: string | null;
  updatedAt: string;
}

const personName = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{M}' .-]+$/u, 'Caractères non autorisés');

/**
 * POST /academy/enrollments. Le nom n'est transmis à Akambi qu'au premier rattachement du compte de formation
 * (il figure ensuite sur les attestations) ; absent, il est déduit du nom complet du profil DomiCares.
 */
export const enrollSchema = z.object({
  courseId: courseIdSchema,
  firstName: personName.optional(),
  lastName: personName.optional(),
}).refine((v) => (v.firstName === undefined) === (v.lastName === undefined), { message: 'Prénom et nom vont ensemble', path: ['lastName'] });
export type EnrollDto = z.infer<typeof enrollSchema>;

/** Inscription renvoyée par Akambi (§ 6.3), contrôlée avant toute écriture locale. */
export const akambiEnrollmentSchema = z.object({
  id: z.string().min(1).max(128),
  externalLearnerId: z.string(),
  learnerId: z.string(),
  courseId: courseIdSchema,
  courseTitle: z.string(),
  status: z.enum(['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CERTIFIED', 'CANCELLED']),
  progress: z.number().int().min(0).max(100),
  enrolledAt: isoDate,
  startedAt: isoDate.nullable(),
  lastActivityAt: isoDate.nullable(),
  completedAt: isoDate.nullable(),
  certificateId: z.string().nullable(),
  updatedAt: isoDate,
});
export type AkambiEnrollmentInput = z.infer<typeof akambiEnrollmentSchema>;

/** Inscription exposée au praticien (identifiant local DomiCares, jamais l'identifiant Akambi). */
export interface AcademyEnrollmentView {
  id: string;
  courseId: string;
  courseTitle: string;
  status: 'PENDING' | 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CERTIFIED' | 'CANCELLED';
  progress: number;
  enrolledAt: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  hasCertificate: boolean;
}

/** Accès au cours (§ 7) : lien à suivre immédiatement, jamais mis en cache ni stocké. */
export interface AcademyLaunchView {
  mode: 'SSO' | 'LOGIN_REQUIRED';
  url: string;
  expiresAt: string | null;
}
