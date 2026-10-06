import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, expect, it, vi } from 'vitest';
const handlers = new Map<string, (event: unknown) => void>();
const match = vi.fn().mockResolvedValue(new Response('Public offline screen'));
const addAll = vi.fn().mockResolvedValue(undefined);
const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
beforeEach(() => {
  handlers.clear(); vi.clearAllMocks();
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://app.test' }, addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback) },
    caches: { open: vi.fn().mockResolvedValue({ match, addAll }) }, fetch: fetchMock, URL, Response,
  });
});
it('never intercepts API, payment POSTs or external resources', () => {
  for (const [url, method, mode] of [['https://app.test/api/medical/export', 'GET', 'navigate'], ['https://app.test/api/payments', 'POST', 'cors'], ['https://cdn.test/image.png', 'GET', 'cors']]) {
    const respondWith = vi.fn();
    handlers.get('fetch')!({ request: { url, method, mode }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
it('replaces an offline private navigation with a generic public screen', async () => {
  let response!: Promise<Response>;
  handlers.get('fetch')!({ request: { url: 'https://app.test/dashboard/patient', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { response = value; } });
  expect(await (await response).text()).toBe('Public offline screen');
  expect(match).toHaveBeenCalledWith('/offline.html');
});
it('preloads only the public fallback, manifest and installation icons', async () => {
  let done!: Promise<void>;
  handlers.get('install')!({ waitUntil: (value: Promise<void>) => { done = value; } });
  await done;
  expect(addAll.mock.calls[0][0]).toEqual(['/offline.html', '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/icon-maskable.png', '/pwa/apple-touch-icon.png']);
});
