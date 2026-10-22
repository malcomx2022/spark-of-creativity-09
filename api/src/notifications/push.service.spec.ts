import * as webpush from 'web-push';
import { createECDH } from 'node:crypto';
import { PushService, vapidKeyError } from './push.service';
import type { AppConfig } from '../config/config.module';
import type { DatabaseService } from '../database/database.service';
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) }));
const vapid = (() => { const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); return { WEB_PUSH_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'), WEB_PUSH_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url') }; })();
it('sends generic authenticated notifications without medical details', async () => {
  const query = { selectAll: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue([{ id: 'sub', endpoint: 'https://fcm.googleapis.com/id', p256dh: 'key', auth: 'key' }]) };
  const database = { runAs: (_ctx: unknown, callback: (trx: unknown) => unknown) => callback({ selectFrom: () => query }) } as unknown as DatabaseService;
  const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', ...vapid } as AppConfig, database);
  await service.sendToUser('user', { title: 'PRIVATE_DIAGNOSIS', message: 'PRIVATE_PATIENT', url: 'https://untrusted.test' });
  const body = (webpush.sendNotification as jest.Mock).mock.calls[0][1] as string;
  expect(body).not.toContain('PRIVATE');
  expect(JSON.parse(body)).toMatchObject({ title: 'DomiCares', url: '/login' });
});
it.each([
  ['/dashboard/patient?tab=messages&appointment=a%2Fb', '/dashboard/patient?tab=messages&appointment=a%2Fb'],
  ['/dashboard/coach?tab=sessions', '/dashboard/coach?tab=sessions'],
  ['/dashboard?tab=support', '/dashboard?tab=support'],
  ['/admin?tab=kyc', '/admin?tab=kyc'],
  ['https://checkout.fedapay.com/pay/1', '/login'],
  ['//evil.test/dashboard', '/login'],
  ['/dashboard/../login', '/login'],
  ['/patient/appointments/1', '/login'],
  [null, '/login'],
])('opens the notification page %s as %s, with generic text', async (link, expected) => {
  (webpush.sendNotification as jest.Mock).mockClear();
  const query = { selectAll: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue([{ id: 'sub', endpoint: 'https://fcm.googleapis.com/id', p256dh: 'key', auth: 'key' }]) };
  const database = { runAs: (_ctx: unknown, callback: (trx: unknown) => unknown) => callback({ selectFrom: () => query }) } as unknown as DatabaseService;
  const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', ...vapid } as AppConfig, database);
  await service.sendToUser('user', { title: 'Nouveau message de PRIVATE_NAME', message: 'PRIVATE_CONTENT', url: link });
  const body = JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1] as string);
  expect(body.url).toBe(expected);
  expect(JSON.stringify(body)).not.toContain('PRIVATE');
});
describe('notificationEmail', () => {
  const { notificationEmail } = jest.requireActual('./push-target') as typeof import('./push-target');
  it('links to the notified page with an absolute URL and escapes user content', () => {
    const mail = notificationEmail('https://domicares.life/', 'Nouveau message', '<img src=x onerror=alert(1)> & co', '/dashboard/patient?tab=messages&appointment=a1');
    expect(mail.text).toBe('<img src=x onerror=alert(1)> & co\n\nhttps://domicares.life/dashboard/patient?tab=messages&appointment=a1');
    expect(mail.html).toBe('<p>&lt;img src=x onerror=alert(1)&gt; &amp; co</p><p><a href="https://domicares.life/dashboard/patient?tab=messages&amp;appointment=a1">Ouvrir dans DomiCares</a></p>');
  });
  it.each(['https://checkout.fedapay.com/pay/1', '/patient/appointments/1', '"><script>', null])('omits an unsupported link %s', (link) => {
    const mail = notificationEmail('https://domicares.life', 'T', 'Bonjour', link);
    expect(mail).toEqual({ subject: 'T', text: 'Bonjour', html: '<p>Bonjour</p>' });
  });
});
describe('VAPID keys and delivery options', () => {
  const query = { selectAll: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue([{ id: 'sub', endpoint: 'https://web.push.apple.com/abc', p256dh: 'key', auth: 'key' }]) };
  const database = { runAs: (_ctx: unknown, callback: (trx: unknown) => unknown) => callback({ selectFrom: () => query }) } as unknown as DatabaseService;
  beforeEach(() => (webpush.sendNotification as jest.Mock).mockClear());

  it('detects a public key that does not belong to the private key', () => {
    const other = createECDH('prime256v1'); other.generateKeys();
    expect(vapidKeyError(vapid.WEB_PUSH_PUBLIC_KEY, vapid.WEB_PUSH_PRIVATE_KEY)).toBeNull();
    expect(vapidKeyError(other.getPublicKey().toString('base64url'), vapid.WEB_PUSH_PRIVATE_KEY)).toMatch(/ne correspond pas/);
    expect(vapidKeyError(vapid.WEB_PUSH_PUBLIC_KEY, 'pas-une-cle')).toMatch(/privée VAPID invalide/);
    expect(vapidKeyError('BCourte', vapid.WEB_PUSH_PRIVATE_KEY)).toMatch(/publique VAPID invalide/);
    expect(vapidKeyError(undefined, vapid.WEB_PUSH_PRIVATE_KEY)).toMatch(/absentes/);
  });

  it('disables push (no public key, no send) when the VAPID pair is inconsistent', async () => {
    const other = createECDH('prime256v1'); other.generateKeys();
    const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', WEB_PUSH_PUBLIC_KEY: other.getPublicKey().toString('base64url'), WEB_PUSH_PRIVATE_KEY: vapid.WEB_PUSH_PRIVATE_KEY } as AppConfig, database);
    expect(service.publicKey).toBeNull();
    expect(await service.sendToUser('user', { title: 'T', message: 'M' })).toMatchObject({ success: false, error: 'vapid_mismatch' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sends with high urgency so that phones in power saving mode receive it promptly', async () => {
    const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', ...vapid } as AppConfig, database);
    expect(service.publicKey).toBe(vapid.WEB_PUSH_PUBLIC_KEY);
    expect(await service.sendToUser('user', { title: 'T', message: 'M' })).toMatchObject({ success: true, sent: 1 });
    expect((webpush.sendNotification as jest.Mock).mock.calls[0][2]).toEqual({ TTL: 3600, urgency: 'high' });
  });
});
