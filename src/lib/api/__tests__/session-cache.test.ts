import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
it('removes old account results and cancels late responses, preserving cache during rotation', async () => {
  const session = await import('../session');
  const response = (id: string) => ({ accessToken: id, refreshToken: 'refresh', expiresIn: 900, tokenType: 'Bearer', user: { id, email: null, phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' } });
  session.setSession(response('A'));
  const { isolateSessionCache } = await import('../session-cache');
  const client = new QueryClient();
  const unsubscribe = isolateSessionCache(client);
  client.setQueryData(['admin-role'], 'super_admin');
  session.setSession(response('A'), 'TOKEN_REFRESHED');
  expect(client.getQueryData(['admin-role'])).toBe('super_admin');
  let finish!: (value: string) => void;
  const pending = client.fetchQuery({ queryKey: ['private-data'], queryFn: () => new Promise<string>(resolve => { finish = resolve; }) }).catch(() => undefined);
  session.clearSession();
  session.setSession(response('B'));
  finish('A private data');
  await pending;
  expect(client.getQueryData(['admin-role'])).toBeUndefined();
  expect(client.getQueryData(['private-data'])).toBeUndefined();
  expect(client.getQueryData(['auth', 'user'])).toMatchObject({ id: 'B' });
  unsubscribe(); client.clear();
});
