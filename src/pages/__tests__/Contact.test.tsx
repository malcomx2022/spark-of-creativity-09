import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Contact from '../Contact';
const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/lib/api', () => ({ api: { post: mocks.post }, errorMessage: (error: Error) => error.message }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
async function fill() {
  const user = userEvent.setup();
  render(<Contact />);
  await user.type(screen.getByLabelText('Nom complet'), 'Patient recette');
  await user.type(screen.getByLabelText('Email'), 'patient@example.invalid');
  await user.type(screen.getByLabelText('Sujet'), 'Question');
  await user.type(screen.getByLabelText('Message'), 'Message complet de recette');
  return user;
}
it('transmits the message publicly and clears it only after acceptance', async () => {
  mocks.post.mockResolvedValue({ accepted: true });
  const user = await fill(); await user.click(screen.getByRole('button', { name: /envoyer/i }));
  expect(mocks.post).toHaveBeenCalledWith('/contact', expect.objectContaining({ email: 'patient@example.invalid', message: 'Message complet de recette' }), { auth: false });
  expect(await screen.findByRole('status')).toHaveTextContent('transmis');
  expect(screen.getByLabelText('Message')).toHaveValue('');
});
it('preserves the message and displays a provider error', async () => {
  mocks.post.mockRejectedValue(new Error('Service temporairement indisponible'));
  const user = await fill(); await user.click(screen.getByRole('button', { name: /envoyer/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('indisponible');
  expect(screen.getByLabelText('Message')).toHaveValue('Message complet de recette');
  expect(mocks.toast).not.toHaveBeenCalled();
});
it('does not display success before the network response and prevents double submission', async () => {
  let resolve!: (value: { accepted: boolean }) => void;
  mocks.post.mockReturnValue(new Promise(r => { resolve = r; }));
  const user = await fill(); const button = screen.getByRole('button', { name: /envoyer/i });
  await user.click(button); await user.click(button);
  expect(button).toBeDisabled(); expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).toBeNull(); expect(mocks.toast).not.toHaveBeenCalled();
  resolve({ accepted: true }); await waitFor(() => expect(button).toBeEnabled());
});
it('does not clear the form on an unaccepted response', async () => {
  mocks.post.mockResolvedValue({ accepted: false });
  const user = await fill(); await user.click(screen.getByRole('button', { name: /envoyer/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('pas été accepté');
  expect(screen.getByLabelText('Message')).toHaveValue('Message complet de recette');
});
