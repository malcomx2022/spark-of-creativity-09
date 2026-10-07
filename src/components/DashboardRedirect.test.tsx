import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardRedirect from './DashboardRedirect';
const mocks = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/lib/api', () => ({ auth: { me: mocks.me } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Destination() { const location = useLocation(); return <p data-testid="destination">{location.pathname}{location.search}</p>; }
function mount() { render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/dashboard?tab=messages&appointment=target']}><Routes><Route path="/dashboard" element={<DashboardRedirect />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter></QueryClientProvider>); }
it.each(['patient', 'practitioner', 'coach'])('preserves the conversation in the %s space', async role => {
  mocks.me.mockResolvedValue({ role }); mount();
  expect(await screen.findByTestId('destination')).toHaveTextContent(`/dashboard/${role}?tab=messages&appointment=target`);
});
it('does not guess the role when the API fails', async () => {
  mocks.me.mockRejectedValue(new Error('Unavailable')); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible');
  expect(screen.queryByTestId('destination')).toBeNull();
});
