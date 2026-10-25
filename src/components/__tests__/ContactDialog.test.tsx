import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Appointment } from '@/types/appointment';
import { ContactDialog } from '../ContactDialog';

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { post: mocks.post },
  onTableChange: vi.fn(), subscribeAppointment: vi.fn(), emitTyping: vi.fn(), onTyping: vi.fn(), uploadFile: vi.fn(), getSignedFileUrl: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const appointment = { id: 'rdv-1', practitionerName: 'Inf. Koffi', date: '2026-11-02T00:00:00.000Z', time: '09:00', specialty: 'infirmier' } as Appointment;

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><ContactDialog open onOpenChange={onOpenChange} appointment={appointment} userId="patient-1" /></QueryClientProvider>);
  return { onOpenChange, user: userEvent.setup() };
}

it("envoie le message dans la conversation du rendez-vous, sans transmettre l'expéditeur", async () => {
  mocks.post.mockResolvedValue({ id: 'm-1' });
  const { user, onOpenChange } = renderDialog();
  await user.type(screen.getByRole('textbox'), 'Bonjour, à quelle heure arrivez-vous ?');
  await user.click(screen.getByRole('button', { name: /Envoyer le message/ }));

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(mocks.post).toHaveBeenCalledWith('/conversations/rdv-1/messages', { content: 'Bonjour, à quelle heure arrivez-vous ?' });
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Message envoyé' }));
});

it("échec de l'envoi : message conservé et erreur affichée", async () => {
  mocks.post.mockRejectedValue(new Error('Hors ligne'));
  const { user, onOpenChange } = renderDialog();
  await user.type(screen.getByRole('textbox'), 'Bonjour');
  await user.click(screen.getByRole('button', { name: /Envoyer le message/ }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erreur', variant: 'destructive' })));
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue('Bonjour');
});
