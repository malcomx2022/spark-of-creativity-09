import { afterEach, expect, it, vi } from 'vitest';
import { detachBrowserPush } from '../push-session';
import { api } from '../client';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('unsubscribes locally before removing server ownership', async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://fcm.googleapis.com/id', unsubscribe }) } }) } });
  const remove = vi.spyOn(api, 'delete').mockImplementation(async () => { expect(unsubscribe).toHaveBeenCalled(); return undefined; });
  await detachBrowserPush();
  expect(remove).toHaveBeenCalledWith('/push/subscriptions', { endpoint: 'https://fcm.googleapis.com/id' }, { timeoutMs: 5000 });
});
it('returns promptly when no service worker is registered', async () => {
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) } });
  await expect(detachBrowserPush()).resolves.toBeUndefined();
});
