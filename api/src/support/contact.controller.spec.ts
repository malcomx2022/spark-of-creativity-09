import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import rateLimit from '@fastify/rate-limit';
import { APP_CONFIG } from '../config/config.module';
import { EmailService } from '../notifications/email.service';
import { ContactController } from './contact.controller';

describe('Public contact HTTP workflow', () => {
  let app: NestFastifyApplication;
  const config = { NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', CONTACT_RECIPIENT_EMAIL: 'support@example.invalid' };
  const email = { send: jest.fn() };
  const payload = { name: 'Patient de recette', email: 'patient@example.invalid', subject: 'Demande de contact', message: 'Message complet de recette.' };
  beforeEach(async () => {
    email.send.mockReset().mockResolvedValue({ id: 're_test' });
    config.CONTACT_RECIPIENT_EMAIL = 'support@example.invalid';
    config.EMAIL_PROVIDER = 'resend';
    const module = await Test.createTestingModule({ controllers: [ContactController], providers: [{ provide: APP_CONFIG, useValue: config }, { provide: EmailService, useValue: email }] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], { max: 60 });
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterEach(async () => { await app.close(); });
  it('returns success only after the provider accepts the message', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/contact', payload });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ accepted: true });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: config.CONTACT_RECIPIENT_EMAIL, text: expect.stringContaining(payload.email) }));
  });
  it('lets the team reply to the visitor and shows the visitor subject on one line', async () => {
    await app.inject({ method: 'POST', url: '/api/contact', payload: { ...payload, subject: 'Rendez-vous\r\nBcc: x@evil.test' } });
    const sent = email.send.mock.calls[0][0];
    expect(sent.replyTo).toBe(payload.email);
    expect(sent.subject).toBe('DomiCares — contact : Rendez-vous Bcc: x@evil.test');
    expect(sent.subject).not.toMatch(/[\r\n]/);
  });
  it('rejects invalid fields and the honeypot without sending mail', async () => {
    for (const invalid of [{ ...payload, email: 'invalid' }, { ...payload, message: 'short' }, { ...payload, website: 'spam' }, { ...payload, message: 'a'.repeat(5001) }]) {
      expect((await app.inject({ method: 'POST', url: '/api/contact', payload: invalid })).statusCode).toBe(400);
    }
    expect(email.send).not.toHaveBeenCalled();
  });
  it('returns 503 when the provider fails', async () => {
    email.send.mockRejectedValue(new Error('provider unavailable'));
    expect((await app.inject({ method: 'POST', url: '/api/contact', payload })).statusCode).toBe(503);
  });
  it('fails closed when the receiving mailbox is missing', async () => {
    config.CONTACT_RECIPIENT_EMAIL = '';
    expect((await app.inject({ method: 'POST', url: '/api/contact', payload })).statusCode).toBe(503);
    expect(email.send).not.toHaveBeenCalled();
  });
  it('does not claim delivery using the console provider in production', async () => {
    config.EMAIL_PROVIDER = 'console';
    expect((await app.inject({ method: 'POST', url: '/api/contact', payload })).statusCode).toBe(503);
    expect(email.send).not.toHaveBeenCalled();
  });
  it('escapes user content in HTML and uses a fixed destination', async () => {
    await app.inject({ method: 'POST', url: '/api/contact', payload: { ...payload, message: '<img src=x onerror=alert(1)>' } });
    expect(email.send.mock.calls[0][0].html).toContain('&lt;img');
    expect(email.send.mock.calls[0][0].html).not.toContain('<img');
    expect(email.send.mock.calls[0][0].to).toBe('support@example.invalid');
  });
  it('limits the public endpoint to five submissions per IP per hour', async () => {
    for (let index = 0; index < 5; index++) expect((await app.inject({ method: 'POST', url: '/api/contact', payload })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/contact', payload })).statusCode).toBe(429);
    expect(email.send).toHaveBeenCalledTimes(5);
  });
});
