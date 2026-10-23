import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AcademyAdminSection } from './AcademyAdminSection';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', async (original) => {
  const actual = await original<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get: mocks.get, post: mocks.post, delete: mocks.delete } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }), toast: mocks.toast }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: <T,>(v: T) => v }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const row = (id: string, over: Record<string, unknown> = {}) => ({ id, userId: `u-${id}`, learnerName: `Praticien ${id}`, email: `${id}@domicares.test`, accountOrigin: 'CREATED', linkStatus: 'linked', courseId: 'c1', courseTitle: 'Gestes et postures', status: 'IN_PROGRESS', progress: 40, enrolledAt: null, completedAt: null, hasCertificate: false, lastErrorCode: null, updatedAt: '2026-10-23T10:00:00.000Z', ...over });

function mount(total = 2) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/academy/reports') return { akambi: { generatedAt: '', totals: { learners: 42, enrollments: 57, inProgress: 20, completed: 18, certified: 15, averageProgress: 61, completionRate: 32, certificationRate: 26 }, exams: { attempts: 19, passed: 15, passRate: 79 }, courses: [] }, local: { enrollmentsByStatus: {}, learnersByLinkStatus: {}, certificates: 14 } };
    if (path === '/admin/academy/sync-state') return [{ key: 'courses', cursor: null, lastRunAt: null, lastSuccessAt: '2026-10-23T09:00:00.000Z', lastError: null }, { key: 'enrollments', cursor: null, lastRunAt: null, lastSuccessAt: null, lastError: 'Akambi 500 INTERNAL_ERROR' }];
    if (path.startsWith('/admin/academy/webhook-events')) return { total: 1, counts: { failed: 1 }, items: [{ id: 'e1', eventId: 'evt', type: 'progress.updated', status: 'failed', message: 'inscription illisible (progress)', receivedAt: '' }] };
    if (path.startsWith('/admin/academy/enrollments')) return { total, page: 0, limit: 25, items: [row('a'), row('b', { status: 'CERTIFIED', hasCertificate: true, linkStatus: 'failed', lastErrorCode: 'LEARNER_EMAIL_MISMATCH' })] };
    throw new Error(`route inattendue ${path}`);
  });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AcademyAdminSection /></QueryClientProvider>);
}

it('indicateurs, synchronisations et événements en échec', async () => {
  mount();
  expect(await screen.findByText('57')).toBeInTheDocument();
  expect(screen.getByText('79 %')).toBeInTheDocument();
  expect(await screen.findByText('Akambi 500 INTERNAL_ERROR')).toBeInTheDocument();
  expect(await screen.findByText(/1 événement\(s\) Akambi en échec/)).toBeInTheDocument();
});

it('recherche et pagination transmises à l’API, page remise à zéro sur un nouveau filtre', async () => {
  mount(60);
  expect(await screen.findByText(/page 1\/3/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/admin/academy/enrollments?page=1&limit=25'));
  fireEvent.change(screen.getByLabelText('Rechercher une inscription'), { target: { value: 'Awa' } });
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/admin/academy/enrollments?page=0&limit=25&search=Awa'));
});

it('désinscription après confirmation ; aucune action proposée pour une attestation délivrée', async () => {
  mocks.delete.mockResolvedValue({ id: 'a', status: 'CANCELLED' });
  mount();
  expect(await screen.findByText('LEARNER_EMAIL_MISMATCH')).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: 'Désinscrire' });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Désinscrire' }));
  await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/academy/enrollments/a'));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: 'Inscription annulée' }));
});

it('relance d’une synchronisation par le job existant', async () => {
  mocks.post.mockResolvedValue({ skipped: false, result: {} });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /Rapprocher les inscriptions/ }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/jobs/academy.enrollments.reconcile/run'));
});
