import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useDashboardTab } from './useDashboardTab';
afterEach(cleanup);
function wrapper({ children }: { children: React.ReactNode }) { return <MemoryRouter initialEntries={['/dashboard/patient?tab=messages&appointment=target']}>{children}</MemoryRouter>; }
function useTest() { return { tab: useDashboardTab(['appointments', 'messages'], 'appointments'), location: useLocation(), navigate: useNavigate() }; }
it('opens the notification tab', () => {
  const { result } = renderHook(useTest, { wrapper }); expect(result.current.tab[0]).toBe('messages');
});
it('synchronizes clicks and browser back while preserving the target conversation', () => {
  const { result } = renderHook(useTest, { wrapper });
  act(() => result.current.tab[1]('appointments'));
  expect(result.current.tab[0]).toBe('appointments'); expect(result.current.location.search).not.toContain('appointment=');
  act(() => result.current.navigate(-1));
  expect(result.current.tab[0]).toBe('messages'); expect(result.current.location.search).toContain('appointment=target');
});
it('ignores unsupported tabs', () => {
  const { result } = renderHook(useTest, { wrapper });
  act(() => result.current.navigate('?tab=finance'));
  expect(result.current.tab[0]).toBe('appointments');
  act(() => result.current.tab[1]('unknown'));
  expect(result.current.tab[0]).toBe('appointments');
});
