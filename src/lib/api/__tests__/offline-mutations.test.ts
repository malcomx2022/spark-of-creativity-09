import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../client';
import { onlineMutationOptions } from '../mutation-policy';
afterEach(() => { onlineManager.setOnline(true); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('rejects an offline booking and never sends it on reconnect', async () => {
  onlineManager.setOnline(false);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { mutations: onlineMutationOptions } });
  client.mount();
  const observer = new MutationObserver(client, { mutationFn: () => api.post('/appointments', { reason: 'Offline appointment' }) });
  await expect(observer.mutate()).rejects.toMatchObject({ status: 503, code: 'OFFLINE' });
  expect(observer.getCurrentResult().isPaused).toBe(false);
  onlineManager.setOnline(true);
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  client.unmount(); client.clear();
});
