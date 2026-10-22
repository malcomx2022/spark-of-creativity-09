import * as webpush from 'web-push';
import { PushService } from './push.service';
import type { AppConfig } from '../config/config.module';
import type { DatabaseService } from '../database/database.service';
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) }));
it('sends generic authenticated notifications without medical details', async () => {
  const query = { selectAll: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue([{ id: 'sub', endpoint: 'https://fcm.googleapis.com/id', p256dh: 'key', auth: 'key' }]) };
  const database = { runAs: (_ctx: unknown, callback: (trx: unknown) => unknown) => callback({ selectFrom: () => query }) } as unknown as DatabaseService;
  const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', WEB_PUSH_PUBLIC_KEY: 'key', WEB_PUSH_PRIVATE_KEY: 'key' } as AppConfig, database);
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
  const service = new PushService({ PUSH_PROVIDER: 'webpush', WEB_PUSH_EMAIL: 'mailto:test@audit.invalid', WEB_PUSH_PUBLIC_KEY: 'key', WEB_PUSH_PRIVATE_KEY: 'key' } as AppConfig, database);
  await service.sendToUser('user', { title: 'Nouveau message de PRIVATE_NAME', message: 'PRIVATE_CONTENT', url: link });
  const body = JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1] as string);
  expect(body.url).toBe(expected);
  expect(JSON.stringify(body)).not.toContain('PRIVATE');
});
