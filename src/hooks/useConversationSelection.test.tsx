import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationSelection } from './useConversationSelection';
import type { Conversation } from './useConversations';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const row = (id: string): Conversation => ({ appointment_id: id, patient_id: 'patient', patient_name: 'Patient', practitioner_id: 'practitioner', practitioner_name: 'Professionnel', last_message: '', last_message_at: '', unread_count: 0, appointment_date: '', appointment_status: 'confirmed' });
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/dashboard/patient?tab=messages&appointment=target']}>{children}</MemoryRouter></QueryClientProvider>;
}
it('selects the requested conversation rather than the first row', () => {
  const { result } = renderHook(() => useConversationSelection([row('first'), row('target')], 'patient'), { wrapper });
  expect(result.current.selectedConversation?.appointment_id).toBe('target');
  expect(mocks.get).not.toHaveBeenCalled();
});
it('loads a conversation absent from the first page through the authorized endpoint', async () => {
  mocks.get.mockResolvedValue(row('target'));
  const { result } = renderHook(() => useConversationSelection([row('first')], 'patient'), { wrapper });
  await waitFor(() => expect(result.current.selectedConversation?.appointment_id).toBe('target'));
  expect(mocks.get).toHaveBeenCalledWith('/conversations/target');
});
it('shows failure without opening another conversation when access is denied', async () => {
  mocks.get.mockRejectedValue(new Error('Accès refusé'));
  const { result } = renderHook(() => useConversationSelection([row('first')], 'patient'), { wrapper });
  await waitFor(() => expect(result.current.linkedError).toBe(true));
  expect(result.current.selectedConversation).toBeUndefined();
});
