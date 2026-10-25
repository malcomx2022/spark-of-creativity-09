import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TriageForm } from '../TriageForm';

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post: mocks.post }, errorMessage: (_e: unknown, fallback: string) => fallback }));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useAuthUser', () => ({ useAuthUser: () => ({ data: null }) }));
vi.mock('@/components/TriageHistory', () => ({ TriageHistory: () => null }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderForm() {
  render(<QueryClientProvider client={new QueryClient()}><TriageForm /></QueryClientProvider>);
  return userEvent.setup();
}

// Avec @hookform/resolvers 3 et zod 4, le résolveur levait la ZodError au lieu de la rendre au
// formulaire : aucun message n'apparaissait et la soumission partait en rejet non géré.
it('questionnaire incomplet : les questions sans réponse sont signalées, rien n’est envoyé', async () => {
  const user = renderForm();
  await user.click(screen.getByLabelText('Conscient et orienté'));
  await user.click(screen.getByRole('button', { name: "Calculer le niveau d'urgence" }));

  await waitFor(() => expect(screen.getAllByText('Veuillez sélectionner une option')).toHaveLength(4));
  expect(mocks.post).not.toHaveBeenCalled();
});

it('questionnaire complet : réponses envoyées avec les symptômes par défaut, résultat du serveur affiché', async () => {
  mocks.post.mockResolvedValue({ id: null, score: 3, maxScore: 30, saved: false, urgencyLevel: 'semi-urgent', message: 'Consultez dans la journée', recommendations: ['Hydratez-vous'] });
  const user = renderForm();
  for (const label of ['Conscient et orienté', 'Respiration normale', 'Aucune', 'Aucun saignement', '4-6 (Modérée)']) {
    await user.click(screen.getByLabelText(label));
  }
  await user.click(screen.getByRole('button', { name: "Calculer le niveau d'urgence" }));

  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/triage', { consciousness: 'conscious', breathing: 'normal', 'chest-pain': 'none', bleeding: 'none', 'pain-level': 'moderate', symptoms: [] }));
  expect(await screen.findByText('Consultez dans la journée')).toBeInTheDocument();
});
