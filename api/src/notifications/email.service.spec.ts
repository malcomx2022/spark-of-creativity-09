import { EmailService } from './email.service';
import type { AppConfig } from '../config/config.module';

const config = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_key', RESEND_FROM_EMAIL: 'noreply@domicares.test' } as AppConfig;
afterEach(() => jest.restoreAllMocks());

it('sends reply_to to Resend and returns the message id', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 're_123' }), { status: 200 }));
  const result = await new EmailService(config).send({ to: 'support@domicares.test', subject: 'S', html: '<p>x</p>', text: 'x', replyTo: 'visiteur@example.test' });
  expect(result).toEqual({ id: 're_123' });
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body).toMatchObject({ from: 'noreply@domicares.test', to: ['support@domicares.test'], reply_to: 'visiteur@example.test' });
});

it('omits reply_to when absent and fails when Resend refuses the message', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{"message":"domain not verified"}', { status: 403 }));
  const service = new EmailService(config);
  expect(await service.send({ to: 'a@domicares.test', subject: 'S', html: 'h' })).toEqual({ id: null });
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty('reply_to');
  await expect(service.send({ to: 'a@domicares.test', subject: 'S', html: 'h' })).rejects.toThrow("Échec de l'envoi");
});

it('returns a null id with the console provider', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  expect(await new EmailService({ ...config, EMAIL_PROVIDER: 'console' } as AppConfig).send({ to: 'a@b.test', subject: 'S', html: 'h' })).toEqual({ id: null });
});
