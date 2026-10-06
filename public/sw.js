const CACHE_NAME = 'domicares-public-__BUILD_VERSION__';
const PUBLIC_FILES = ['/offline.html', '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/icon-maskable.png', '/pwa/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)));
  // Wait for consent: never automatically reload an open payment.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('domicares-public-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Public allowlist only: API responses, authenticated pages and payments are never cached.
  if (PUBLIC_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  } else if (event.request.mode === 'navigate' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io/')) {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/offline.html')) || Response.error();
    }));
  }
});
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(self.registration.showNotification('DomiCares', {
      body: 'Vous avez une nouvelle notification. Connectez-vous pour la consulter.',
      icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png',
      data: { url: '/login', notificationId: data.notificationId }, tag: 'domicares-notification',
    }));
  } catch { /* Ignore invalid notification payloads. */ }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('/login', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const window = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (window) { await window.navigate(target); return window.focus(); }
    return self.clients.openWindow(target);
  })());
});
