import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { academyNavigation } from '@/hooks/useAcademy';
import { AcademySection } from './AcademySection';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get: mocks.get, post: mocks.post } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }), toast: mocks.toast }));

const course = (id: string, title: string) => ({ id, title, description: `Description ${title}`, type: 'E_LEARNING', category: null, publicPrice: null, moduleCount: 2, chapterCount: 8, coverImageUrl: null, presentationUrl: null, updatedAt: '2026-10-14T09:30:00.000Z' });
const enrollment = (over: Record<string, unknown> = {}) => ({ id: 'enr-1', courseId: 'c1', courseTitle: 'Gestes et postures', status: 'IN_PROGRESS', progress: 50, enrolledAt: '2026-10-20T08:00:00.000Z', startedAt: null, lastActivityAt: null, completedAt: null, hasCertificate: false, ...over });

let go: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  go = vi.spyOn(academyNavigation, 'go').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  go.mockRestore();
});

function mount(routes: { courses: unknown; enrollments?: unknown; certificate?: unknown }) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/academy/courses') {
      if (routes.courses instanceof Error) throw routes.courses;
      return routes.courses;
    }
    if (path === '/academy/enrollments') return routes.enrollments ?? [];
    if (path.endsWith('/certificate')) return routes.certificate;
    throw new Error(`route inattendue ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AcademySection /></QueryClientProvider>);
}

it('Academy désactivée (503) : message d’indisponibilité, sans liste ni bouton', async () => {
  mount({ courses: new ApiError(503, 'DomiCares Academy n’est pas encore disponible') });
  expect(await screen.findByText(/pas encore disponible/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(mocks.get).not.toHaveBeenCalledWith('/academy/enrollments');
});

it('accès refusé (403) : le motif renvoyé par l’API est affiché', async () => {
  mount({ courses: new ApiError(403, 'Vérifiez votre adresse e-mail pour accéder à DomiCares Academy') });
  expect(await screen.findByText(/Vérifiez votre adresse e-mail/)).toBeInTheDocument();
});

it('catalogue et inscription : la formation suivie n’a pas de bouton d’inscription, l’autre envoie son identifiant', async () => {
  mocks.post.mockResolvedValue({ created: true, enrollment: enrollment({ id: 'enr-2', courseId: 'c2', courseTitle: 'Hygiène', status: 'ENROLLED', progress: 0 }) });
  mount({ courses: [course('c1', 'Gestes et postures'), course('c2', 'Hygiène')], enrollments: [enrollment()] });
  expect(await screen.findByText('Mes formations')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /S’inscrire/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /S’inscrire/ }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/academy/enrollments', { courseId: 'c2' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Inscription confirmée' })));
});

it('nom d’un seul mot (LEARNER_NAME_REQUIRED) : prénom et nom demandés puis transmis', async () => {
  mocks.post
    .mockRejectedValueOnce(new ApiError(400, 'Indiquez votre prénom et votre nom', undefined, undefined, { statusCode: 400, error: 'LEARNER_NAME_REQUIRED' }))
    .mockResolvedValueOnce({ created: true, enrollment: enrollment({ courseId: 'c2', status: 'ENROLLED' }) });
  mount({ courses: [course('c2', 'Hygiène')] });
  fireEvent.click(await screen.findByRole('button', { name: /S’inscrire/ }));
  fireEvent.change(await screen.findByLabelText('Prénom'), { target: { value: 'Madonna' } });
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Ciccone' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’inscription' }));
  await waitFor(() => expect(mocks.post).toHaveBeenLastCalledWith('/academy/enrollments', { courseId: 'c2', firstName: 'Madonna', lastName: 'Ciccone' }));
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
});

it('refus d’inscription codé : message de l’API en toast', async () => {
  mocks.post.mockRejectedValue(new ApiError(409, 'Vous êtes déjà inscrit à cette formation directement auprès d’Akambi Consulting.', undefined, undefined, { error: 'ENROLLMENT_EXISTS_OUTSIDE_PARTNER' }));
  mount({ courses: [course('c2', 'Hygiène')] });
  fireEvent.click(await screen.findByRole('button', { name: /S’inscrire/ }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Inscription impossible', description: expect.stringContaining('directement auprès d’Akambi'), variant: 'destructive' })));
});

it('accès au cours : lien demandé au clic puis suivi dans le même onglet', async () => {
  mocks.post.mockResolvedValue({ mode: 'SSO', url: 'https://www.akambiconsulting.com/partenaires/connexion?token=abc', expiresAt: '2026-10-23T10:05:00.000Z' });
  mount({ courses: [course('c1', 'Gestes et postures')], enrollments: [enrollment()] });
  fireEvent.click(await screen.findByRole('button', { name: /Accéder à la formation/ }));
  await waitFor(() => expect(go).toHaveBeenCalledWith('https://www.akambiconsulting.com/partenaires/connexion?token=abc'));
  expect(mocks.post).toHaveBeenCalledWith('/academy/enrollments/enr-1/launch');
});

it('inscription en attente : pas d’accès au cours, nouvelle tentative possible', async () => {
  mocks.post.mockResolvedValue({ created: true, enrollment: enrollment({ status: 'ENROLLED' }) });
  mount({ courses: [course('c1', 'Gestes et postures')], enrollments: [enrollment({ status: 'PENDING', progress: 0 })] });
  expect(await screen.findByText(/pas encore été confirmée/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Accéder à la formation/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/academy/enrollments', { courseId: 'c1' }));
});

it('attestation : lien de vérification affiché, PDF redemandé au clic', async () => {
  mocks.post.mockResolvedValue({ url: 'https://files.akambi.test/cert.pdf?sig=1', expiresAt: '2026-10-23T10:15:00.000Z' });
  mount({
    courses: [course('c1', 'Gestes et postures')],
    enrollments: [enrollment({ status: 'CERTIFIED', progress: 100, hasCertificate: true })],
    certificate: { id: 'CERT-1', courseTitle: 'Gestes et postures', learnerName: 'Awa Diallo', score: { correctAnswers: 9, totalQuestions: 10 }, completionDate: null, issuedAt: '2026-10-22T10:00:00.000Z', verificationUrl: 'https://www.akambiconsulting.com/attestations/CERT-1?cle=x' },
  });
  expect(await screen.findByText(/9\/10 bonnes réponses/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Lien de vérification/ })).toHaveAttribute('href', 'https://www.akambiconsulting.com/attestations/CERT-1?cle=x');
  fireEvent.click(screen.getByRole('button', { name: /Télécharger le PDF/ }));
  await waitFor(() => expect(go).toHaveBeenCalledWith('https://files.akambi.test/cert.pdf?sig=1'));
  expect(mocks.post).toHaveBeenCalledWith('/academy/enrollments/enr-1/certificate/download');
});

it('navigation : seules les URL HTTPS sont suivies', () => {
  go.mockRestore();
  expect(() => academyNavigation.go('javascript:alert(1)')).toThrow('Lien de formation invalide');
  expect(() => academyNavigation.go('http://akambi.test')).toThrow('Lien de formation invalide');
});
