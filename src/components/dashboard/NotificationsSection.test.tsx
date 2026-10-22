import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationsSection } from './NotificationsSection';

const mocks = vi.hoisted(() => ({ markAsRead: vi.fn(), notifications: [] as unknown[] }));
vi.mock('@/hooks/useAuthUser', () => ({ useAuthUser: () => ({ data: { id: 'user-1' } }) }));
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ isSupported: false, isSubscribed: false, isLoading: false, subscribe: vi.fn(), unsubscribe: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: mocks.notifications, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useNotificationPreferences: () => ({ data: undefined }),
  useMarkNotificationAsRead: () => ({ mutate: mocks.markAsRead }),
  useMarkAllNotificationsAsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
  useUpdateNotificationPreferences: () => ({ mutateAsync: vi.fn() }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const notification = (id: string, link: string | null, is_read = false) => ({ id, user_id: 'user-1', title: `Notif ${id}`, message: 'Bonjour', type: 'message', is_read, link, created_at: new Date().toISOString() });
function Location() { const l = useLocation(); return <p data-testid="location">{l.pathname}{l.search}</p>; }
function mount() {
  render(<MemoryRouter initialEntries={['/dashboard/patient?tab=notifications']}><Routes><Route path="*" element={<><NotificationsSection /><Location /></>} /></Routes></MemoryRouter>);
}

it('ouvre la conversation ciblée et marque la notification comme lue', () => {
  mocks.notifications = [notification('n1', '/dashboard/patient?tab=messages&appointment=appt-1')];
  mount();
  fireEvent.click(screen.getByRole('link', { name: /Notif n1/ }));
  expect(mocks.markAsRead).toHaveBeenCalledWith({ notificationId: 'n1', userId: 'user-1' });
  expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/patient?tab=messages&appointment=appt-1');
});

it('ouvre au clavier une ancienne notification /dashboard sans la marquer deux fois', () => {
  mocks.notifications = [notification('n2', '/dashboard?tab=messages&appointment=old', true)];
  mount();
  fireEvent.keyDown(screen.getByRole('link', { name: /Notif n2/ }), { key: 'Enter' });
  expect(mocks.markAsRead).not.toHaveBeenCalled();
  expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?tab=messages&appointment=old');
});

it('reste sur place pour un lien externe ou inconnu', () => {
  mocks.notifications = [notification('n3', 'https://checkout.fedapay.com/pay/1'), notification('n4', '/page-inexistante')];
  mount();
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(screen.getByText('Notif n3'));
  fireEvent.click(screen.getByText('Notif n4'));
  expect(mocks.markAsRead).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/patient?tab=notifications');
});
