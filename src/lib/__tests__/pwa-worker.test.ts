import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, expect, it, vi } from 'vitest';
const handlers = new Map<string, (event: unknown) => void>();
const match = vi.fn().mockResolvedValue(new Response('Public offline screen'));
const addAll = vi.fn().mockResolvedValue(undefined);
const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
const showNotification = vi.fn().mockResolvedValue(undefined);
const navigate = vi.fn();
const focus = vi.fn();
const openWindow = vi.fn().mockResolvedValue(null);
const matchAll = vi.fn();
beforeEach(() => {
  handlers.clear(); vi.clearAllMocks();
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {
      location: { origin: 'https://app.test' }, addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback),
      registration: { showNotification }, clients: { matchAll, openWindow },
    },
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
async function push(payload: unknown) {
  let done!: Promise<void>;
  handlers.get('push')!({ data: { json: () => payload }, waitUntil: (value: Promise<void>) => { done = value; } });
  await done;
  return showNotification.mock.calls[0][1] as { body: string; data: { url: string } };
}
async function click(url: unknown) {
  let done!: Promise<unknown>;
  handlers.get('notificationclick')!({ notification: { close: vi.fn(), data: { url } }, waitUntil: (value: Promise<unknown>) => { done = value; } });
  await done;
}
it.each([
  ['/dashboard/patient?tab=messages&appointment=a1', '/dashboard/patient?tab=messages&appointment=a1'],
  ['/dashboard?tab=support', '/dashboard?tab=support'],
  ['/admin?tab=finance', '/admin?tab=finance'],
  ['https://evil.test/dashboard/patient', '/login'],
  ['//evil.test/x', '/login'],
  ['/api/medical/export', '/login'],
  [42, '/login'],
])('push %s : texte générique, page cible %s', async (url, expected) => {
  const options = await push({ url, notificationId: 'n1', title: 'PRIVATE', message: 'PRIVATE' });
  expect(options.body).not.toContain('PRIVATE');
  expect(options.data.url).toBe(expected);
});
it('le clic ouvre la page de la notification dans l’onglet existant', async () => {
  matchAll.mockResolvedValue([{ url: 'https://app.test/', navigate: navigate.mockResolvedValue({ focus }) }]);
  await click('/dashboard/coach?tab=messages&appointment=c1');
  expect(navigate).toHaveBeenCalledWith('https://app.test/dashboard/coach?tab=messages&appointment=c1');
  expect(focus).toHaveBeenCalled();
  expect(openWindow).not.toHaveBeenCalled();
});
it('le clic ouvre une fenêtre si l’onglet ne peut pas naviguer, et revérifie la cible', async () => {
  matchAll.mockResolvedValue([{ url: 'https://app.test/', navigate: navigate.mockRejectedValue(new TypeError('not controlled')) }]);
  await click('https://evil.test/');
  expect(openWindow).toHaveBeenCalledWith('https://app.test/login');
  matchAll.mockResolvedValue([]);
  await click('/dashboard/patient?tab=reports');
  expect(openWindow).toHaveBeenLastCalledWith('https://app.test/dashboard/patient?tab=reports');
});
