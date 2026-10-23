import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { onlineMutationOptions } from '@/lib/api/mutation-policy';

/** DomiCares Academy (formations Akambi) — contrat des routes /api/academy/* et /api/admin/academy/*. */
export type AcademyCourseType = 'E_LEARNING' | 'VISIO_CONFERENCE' | 'PRESENTIEL';
export type AcademyEnrollmentStatus = 'PENDING' | 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CERTIFIED' | 'CANCELLED';

export interface AcademyCourse {
  id: string;
  title: string;
  description: string | null;
  type: AcademyCourseType;
  category: { code: string; title: string | null } | null;
  publicPrice: { amount: number; currency: 'EURO' | 'DOLLAR' | 'FRANC_CFA' } | null;
  moduleCount: number | null;
  chapterCount: number | null;
  coverImageUrl: string | null;
  presentationUrl: string | null;
  updatedAt: string;
}

export interface AcademyEnrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  status: AcademyEnrollmentStatus;
  progress: number;
  enrolledAt: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  hasCertificate: boolean;
}

export interface AcademyCertificate {
  id: string;
  courseTitle: string;
  learnerName: string;
  score: { correctAnswers: number; totalQuestions: number } | null;
  completionDate: string | null;
  issuedAt: string;
  verificationUrl: string;
}

interface AcademyLink {
  url: string;
  expiresAt: string | null;
}

/** Code stable d'une erreur Academy (`error` du corps : LEARNER_NAME_REQUIRED, ENROLLMENT_EXISTS_OUTSIDE_PARTNER…). */
export function academyErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const body = error.body as { error?: unknown } | undefined;
  return typeof body?.error === 'string' ? body.error : undefined;
}

/**
 * Navigation vers Akambi dans le même onglet, juste après la réponse : un window.open après await serait bloqué
 * par Safari iOS, et le lien d'accès, à usage unique, ne doit être ni conservé ni ouvert deux fois. Seules les
 * URL HTTPS sont suivies.
 */
export const academyNavigation = {
  go(url: string) {
    if (!/^https:\/\//i.test(url)) throw new Error('Lien de formation invalide');
    window.location.assign(url);
  },
};

const KEYS = {
  courses: ['academy', 'courses'] as const,
  enrollments: ['academy', 'enrollments'] as const,
  certificate: (id: string) => ['academy', 'certificate', id] as const,
};

/** `enabled` : onglet ouvert. 403/503 ne sont pas retentés (accès refusé ou Academy indisponible). */
export function useAcademyCourses(enabled = true) {
  return useQuery<AcademyCourse[]>({
    queryKey: KEYS.courses,
    queryFn: () => api.get<AcademyCourse[]>('/academy/courses'),
    enabled,
    retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 503].includes(error.status)) && count < 2,
  });
}

export function useAcademyEnrollments(enabled = true) {
  return useQuery<AcademyEnrollment[]>({
    queryKey: KEYS.enrollments,
    queryFn: () => api.get<AcademyEnrollment[]>('/academy/enrollments'),
    enabled,
    retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 503].includes(error.status)) && count < 2,
  });
}

export function useAcademyCertificate(enrollmentId: string, enabled: boolean) {
  return useQuery<AcademyCertificate>({
    queryKey: KEYS.certificate(enrollmentId),
    queryFn: () => api.get<AcademyCertificate>(`/academy/enrollments/${enrollmentId}/certificate`),
    enabled,
    retry: false,
  });
}

export function useAcademyEnroll() {
  const queryClient = useQueryClient();
  return useMutation({
    ...onlineMutationOptions,
    mutationFn: (input: { courseId: string; firstName?: string; lastName?: string }) =>
      api.post<{ created: boolean; enrollment: AcademyEnrollment }>('/academy/enrollments', input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS.enrollments }),
  });
}

/** Lien d'accès demandé au clic puis suivi aussitôt (POST, jamais un lien préchargé ou mis en cache). */
export function useAcademyLaunch() {
  return useMutation({
    ...onlineMutationOptions,
    mutationFn: (enrollmentId: string) => api.post<AcademyLink & { mode: 'SSO' | 'LOGIN_REQUIRED' }>(`/academy/enrollments/${enrollmentId}/launch`),
    onSuccess: (link) => academyNavigation.go(link.url),
  });
}

/** Lien du PDF (15 minutes) redemandé à chaque téléchargement. */
export function useAcademyCertificateDownload() {
  return useMutation({
    ...onlineMutationOptions,
    mutationFn: (enrollmentId: string) => api.post<AcademyLink>(`/academy/enrollments/${enrollmentId}/certificate/download`),
    onSuccess: (link) => academyNavigation.go(link.url),
  });
}

/** Onglet Academy affiché seulement si l'API l'annonce activée ; les droits restent contrôlés par /academy/*. */
export function useAcademyEnabled() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: () => api.get<{ academyEnabled?: boolean }>('/config/public', { auth: false }),
    staleTime: 5 * 60_000,
    select: (config) => config.academyEnabled === true,
  });
}

// --- Administration ---

export interface AcademyAdminEnrollment {
  id: string;
  userId: string;
  learnerName: string | null;
  email: string;
  accountOrigin: 'CREATED' | 'EXISTING' | null;
  linkStatus: 'pending' | 'linked' | 'failed';
  courseId: string;
  courseTitle: string;
  status: AcademyEnrollmentStatus;
  progress: number;
  enrolledAt: string | null;
  completedAt: string | null;
  hasCertificate: boolean;
  lastErrorCode: string | null;
  updatedAt: string;
}

export interface AcademyAdminReports {
  akambi: {
    generatedAt: string;
    totals: { learners: number; enrollments: number; inProgress: number; completed: number; certified: number; averageProgress: number; completionRate: number; certificationRate: number };
    exams: { attempts: number; passed: number; passRate: number };
    courses: Array<{ courseId: string; courseTitle: string; enrollments: number; completed: number; certified: number; averageProgress: number; completionRate: number }>;
  };
  local: { enrollmentsByStatus: Record<string, number>; learnersByLinkStatus: Record<string, number>; certificates: number };
}

export interface AcademySyncState {
  key: 'courses' | 'enrollments';
  cursor: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface AcademyWebhookEvent {
  id: string;
  eventId: string;
  type: string;
  status: 'pending' | 'processed' | 'ignored' | 'failed';
  message: string | null;
  receivedAt: string;
}

export function useAcademyAdminReports() {
  return useQuery({ queryKey: ['admin', 'academy', 'reports'], queryFn: () => api.get<AcademyAdminReports>('/admin/academy/reports'), retry: false });
}

export function useAcademyAdminEnrollments(filters: { status?: string; search?: string; page: number; limit: number }) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) });
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  return useQuery({
    queryKey: ['admin', 'academy', 'enrollments', filters],
    queryFn: () => api.get<{ total: number; page: number; limit: number; items: AcademyAdminEnrollment[] }>(`/admin/academy/enrollments?${params.toString()}`),
  });
}

export function useAcademyAdminSyncState() {
  return useQuery({ queryKey: ['admin', 'academy', 'sync-state'], queryFn: () => api.get<AcademySyncState[]>('/admin/academy/sync-state') });
}

export function useAcademyAdminWebhookEvents(status?: string) {
  const params = new URLSearchParams({ page: '0', limit: '20' });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['admin', 'academy', 'webhook-events', status ?? 'all'],
    queryFn: () => api.get<{ total: number; counts: Record<string, number>; items: AcademyWebhookEvent[] }>(`/admin/academy/webhook-events?${params.toString()}`),
  });
}

export function useAcademyAdminRunJob() {
  const queryClient = useQueryClient();
  return useMutation({
    ...onlineMutationOptions,
    mutationFn: (job: 'academy.catalog.sync' | 'academy.enrollments.reconcile') => api.post<{ skipped: boolean; result?: unknown }>(`/admin/jobs/${job}/run`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'academy'] }),
  });
}

export function useAcademyAdminCancel() {
  const queryClient = useQueryClient();
  return useMutation({
    ...onlineMutationOptions,
    mutationFn: (enrollmentId: string) => api.delete<{ id: string; status: 'CANCELLED' }>(`/admin/academy/enrollments/${enrollmentId}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'academy'] }),
  });
}
