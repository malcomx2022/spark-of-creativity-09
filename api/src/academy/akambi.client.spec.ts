import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config/config.schema';
import { AkambiError, FakeAkambiClient, HttpAkambiClient } from './akambi.client';
import { signAkambiRequest } from './akambi.signature';

const config = { AKAMBI_BASE_URL: 'https://preprod.akambiconsulting.com/', AKAMBI_API_KEY: 'ak_test', AKAMBI_API_SECRET: 'secret-de-test', AKAMBI_TIMEOUT_MS: 10_000 } as AppConfig;

type Reply = { status: number; body?: unknown; text?: string; headers?: Record<string, string> };
const reply = ({ status, body, text, headers = {} }: Reply) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text ?? (body === undefined ? '' : JSON.stringify(body)),
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});

describe('HttpAkambiClient', () => {
  let fetchMock: jest.Mock;
  let client: HttpAkambiClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new HttpAkambiClient(config);
    client.sleep = jest.fn(async () => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Recalcule la signature à partir de ce qui a réellement été envoyé (URL sans domaine, corps). */
  function expectSigned(call: [string, RequestInit]) {
    const [url, init] = call;
    const headers = init.headers as Record<string, string>;
    const pathWithQuery = url.replace('https://preprod.akambiconsulting.com', '');
    expect(headers['X-Partner-API-Key']).toBe('ak_test');
    expect(headers['X-Partner-Timestamp']).toMatch(/^\d{10}$/);
    expect(Math.abs(Number(headers['X-Partner-Timestamp']) - Date.now() / 1000)).toBeLessThan(5);
    expect(headers['X-Partner-Nonce']).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(headers['X-Partner-Signature']).toBe(signAkambiRequest('secret-de-test', headers['X-Partner-Timestamp'], headers['X-Partner-Nonce'], String(init.method), pathWithQuery, (init.body as string | undefined) ?? ''));
    return { pathWithQuery, headers };
  }

  it('GET /ping signé, sans corps ni Content-Type, barre finale de l’URL de base retirée', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: { partner: { code: 'DOMICARES', name: 'DomiCares' }, serverTime: '2026-10-23T10:00:00.000Z' } } }));
    await expect(client.ping()).resolves.toEqual({ partner: { code: 'DOMICARES', name: 'DomiCares' }, serverTime: '2026-10-23T10:00:00.000Z' });
    const { pathWithQuery, headers } = expectSigned(fetchMock.mock.calls[0]);
    expect(pathWithQuery).toBe('/api/partners/v1/ping');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('liste paginée : query signée telle qu’envoyée, updatedSince en UTC', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: [{ id: 'e1' }], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } } }));
    const page = await client.listEnrollments({ page: 2, limit: 50, updatedSince: new Date('2026-10-14T09:30:00.000Z'), status: 'IN_PROGRESS' });
    expect(page).toEqual({ items: [{ id: 'e1' }], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } });
    expect(expectSigned(fetchMock.mock.calls[0]).pathWithQuery).toBe('/api/partners/v1/enrollments?page=2&limit=50&updatedSince=2026-10-14T09%3A30%3A00.000Z&status=IN_PROGRESS');
  });

  it('POST /learners : corps signé octet pour octet, Idempotency-Key, 201 = créé', async () => {
    const learner = { learnerId: 'l1', externalLearnerId: 'DC-1', email: 'awa@example.com', firstName: 'Awa', lastName: 'Diallo', accountOrigin: 'CREATED' };
    fetchMock.mockResolvedValue(reply({ status: 201, body: { data: learner } }));
    const res = await client.upsertLearner({ externalLearnerId: 'DC-1', email: 'awa@example.com', firstName: 'Awa', lastName: 'Diallo' }, 'idem-1');
    expect(res).toEqual({ resource: learner, created: true, replayed: false });
    const { headers } = expectSigned(fetchMock.mock.calls[0]);
    expect(headers['Idempotency-Key']).toBe('idem-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(fetchMock.mock.calls[0][1].body).toBe('{"externalLearnerId":"DC-1","email":"awa@example.com","firstName":"Awa","lastName":"Diallo"}');
  });

  it('POST /enrollments : 200 = existante, en-tête Idempotent-Replayed lu', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: { id: 'e1' } }, headers: { 'idempotent-replayed': 'true' } }));
    await expect(client.createEnrollment({ externalLearnerId: 'DC-1', courseId: 'c1' }, 'idem-2')).resolves.toEqual({ resource: { id: 'e1' }, created: false, replayed: true });
  });

  it('identifiants encodés dans le chemin', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: {} } }));
    await client.getLearner('DC-1/../x');
    expect(expectSigned(fetchMock.mock.calls[0]).pathWithQuery).toBe('/api/partners/v1/learners/DC-1%2F..%2Fx');
  });

  it('sso/launch sans courseId : le champ n’est pas transmis', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: { mode: 'SSO', url: 'https://x', expiresAt: null } } }));
    await client.launchSso({ externalLearnerId: 'DC-1' });
    expect(fetchMock.mock.calls[0][1].body).toBe('{"externalLearnerId":"DC-1"}');
  });

  it('5xx puis succès : nouvelle signature et nouveau nonce, même Idempotency-Key et même corps', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Erreur' } } }))
      .mockResolvedValueOnce(reply({ status: 502, text: '<html>Bad Gateway</html>' }))
      .mockResolvedValueOnce(reply({ status: 201, body: { data: { id: 'e1' } } }));
    await expect(client.createEnrollment({ externalLearnerId: 'DC-1', courseId: 'c1' }, 'idem-3')).resolves.toMatchObject({ created: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sent = fetchMock.mock.calls.map((call) => expectSigned(call as [string, RequestInit]).headers);
    expect(new Set(sent.map((h) => h['X-Partner-Nonce'])).size).toBe(3);
    expect(sent.every((h) => h['Idempotency-Key'] === 'idem-3')).toBe(true);
    expect(new Set(fetchMock.mock.calls.map((call) => call[1].body)).size).toBe(1);
    expect(client.sleep).toHaveBeenNthCalledWith(1, 500);
    expect(client.sleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('erreur réseau persistante : 3 tentatives puis AkambiError UNREACHABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err = await client.getCourse('c1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AkambiError);
    expect(err).toMatchObject({ status: 504, code: 'UNREACHABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('délai dépassé : AkambiError TIMEOUT', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(client.getReports()).rejects.toMatchObject({ status: 504, code: 'TIMEOUT' });
  });

  it('4xx : pas de nouvelle tentative, code, message et détails d’Akambi conservés', async () => {
    fetchMock.mockResolvedValue(reply({ status: 409, body: { error: { code: 'LEARNER_ALREADY_LINKED', message: 'Compte déjà rattaché', details: { externalLearnerId: 'DC-9' } } } }));
    const err = await client.upsertLearner({ externalLearnerId: 'DC-1', email: 'a@b.c', firstName: 'A', lastName: 'B' }, 'idem-4').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'LEARNER_ALREADY_LINKED', message: 'Compte déjà rattaché', details: { externalLearnerId: 'DC-9' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('journaux : code et chemin seulement, jamais le corps ni le message d’Akambi', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(reply({ status: 401, body: { error: { code: 'INVALID_SIGNATURE', message: 'Signature incorrecte pour awa@example.com' } } }));
    await expect(client.ping()).rejects.toMatchObject({ status: 401, code: 'INVALID_SIGNATURE' });
    expect(error).toHaveBeenCalledWith('Akambi GET /api/partners/v1/ping → 401 INVALID_SIGNATURE');
  });

  it('2xx illisible ou sans data : INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 200, text: 'pas du json' })).mockResolvedValueOnce(reply({ status: 200, body: { ok: true } }));
    await expect(client.ping()).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
    await expect(client.ping()).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('liste sans pagination : INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: { data: [] } }));
    await expect(client.listCourses()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('FakeAkambiClient', () => {
  let fake: FakeAkambiClient;
  const awa = { externalLearnerId: 'DC-1', email: 'awa@example.com', firstName: 'Awa', lastName: 'Diallo' };

  beforeEach(() => {
    fake = new FakeAkambiClient();
  });

  it('apprenant : 201 puis 200 sans doublon ; compte préexistant rattaché en EXISTING', async () => {
    fake.existingAccountEmails.add('kofi@example.com');
    await expect(fake.upsertLearner(awa, 'k1')).resolves.toMatchObject({ created: true, resource: { accountOrigin: 'CREATED' } });
    await expect(fake.upsertLearner(awa, 'k2')).resolves.toMatchObject({ created: false });
    await expect(fake.upsertLearner({ ...awa, externalLearnerId: 'DC-2', email: 'Kofi@example.com' }, 'k3')).resolves.toMatchObject({ resource: { accountOrigin: 'EXISTING' } });
    expect(fake.learners.size).toBe(2);
  });

  it('apprenant : conflits documentés (§11)', async () => {
    fake.nonLinkableEmails.add('formateur@akambi.test');
    await fake.upsertLearner(awa, 'k1');
    await expect(fake.upsertLearner({ ...awa, email: 'autre@example.com' }, 'k2')).rejects.toMatchObject({ status: 409, code: 'LEARNER_EMAIL_MISMATCH' });
    await expect(fake.upsertLearner({ ...awa, externalLearnerId: 'DC-2' }, 'k3')).rejects.toMatchObject({ status: 409, code: 'LEARNER_ALREADY_LINKED', details: { externalLearnerId: 'DC-1' } });
    await expect(fake.upsertLearner({ ...awa, externalLearnerId: 'DC-3', email: 'formateur@akambi.test' }, 'k4')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_LINKABLE' });
  });

  it('idempotence : même clé et même corps rejoués ; corps différent refusé en 422', async () => {
    const first = await fake.upsertLearner(awa, 'k1');
    await expect(fake.upsertLearner(awa, 'k1')).resolves.toEqual({ ...first, replayed: true });
    await expect(fake.upsertLearner({ ...awa, firstName: 'Aïcha' }, 'k1')).rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('inscription répétée : 200 avec le même id ; formation hors catalogue : 404', async () => {
    const course = fake.seedCourse({ title: 'Gestes et postures' });
    await fake.upsertLearner(awa, 'k1');
    const first = await fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: course.id }, 'e1');
    const again = await fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: course.id }, 'e2');
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, resource: { id: first.resource.id } });
    await expect(fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: 'inconnu' }, 'e3')).rejects.toMatchObject({ status: 404, code: 'COURSE_NOT_FOUND' });
    await expect(fake.createEnrollment({ externalLearnerId: 'DC-9', courseId: course.id }, 'e4')).rejects.toMatchObject({ status: 404, code: 'LEARNER_NOT_FOUND' });
  });

  it('progression, attestation, désinscription refusée puis 404 après annulation', async () => {
    const course = fake.seedCourse({ title: 'Hygiène', chapterCount: 2 });
    await fake.upsertLearner(awa, 'k1');
    const { resource } = await fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: course.id }, 'e1');
    await expect(fake.getCertificate(resource.id)).rejects.toMatchObject({ code: 'CERTIFICATE_NOT_FOUND' });
    expect(fake.setProgress(resource.id, 50)).toMatchObject({ status: 'IN_PROGRESS', progress: 50, completedAt: null });
    const certificate = fake.issueCertificate(resource.id);
    await expect(fake.getEnrollment(resource.id)).resolves.toMatchObject({ status: 'CERTIFIED', progress: 100, certificateId: certificate.id });
    await expect(fake.getCertificate(resource.id)).resolves.toMatchObject({ learnerName: 'Awa Diallo', courseTitle: 'Hygiène', downloadUrl: expect.stringContaining(certificate.id) });
    await expect(fake.cancelEnrollment(resource.id)).rejects.toMatchObject({ status: 409, code: 'CERTIFICATE_ISSUED' });

    const other = fake.seedCourse({ title: 'Premiers secours' });
    const second = await fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: other.id }, 'e2');
    await expect(fake.cancelEnrollment(second.resource.id)).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(fake.getEnrollment(second.resource.id)).rejects.toMatchObject({ status: 404, code: 'ENROLLMENT_NOT_FOUND' });
  });

  it('accès : SSO pour un compte créé, LOGIN_REQUIRED pour un compte préexistant, 404 sans inscription', async () => {
    fake.existingAccountEmails.add('kofi@example.com');
    const course = fake.seedCourse({ title: 'Gestes et postures' });
    await fake.upsertLearner(awa, 'k1');
    await fake.upsertLearner({ ...awa, externalLearnerId: 'DC-2', email: 'kofi@example.com' }, 'k2');
    await expect(fake.launchSso({ externalLearnerId: 'DC-1', courseId: course.id })).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_FOUND' });
    await fake.createEnrollment({ externalLearnerId: 'DC-1', courseId: course.id }, 'e1');
    await expect(fake.launchSso({ externalLearnerId: 'DC-1', courseId: course.id })).resolves.toMatchObject({ mode: 'SSO', expiresAt: expect.any(String) });
    await expect(fake.launchSso({ externalLearnerId: 'DC-2' })).resolves.toMatchObject({ mode: 'LOGIN_REQUIRED', expiresAt: null });
  });

  it('catalogue : archivées masquées sauf avec updatedSince ; tri updatedAt et pagination', async () => {
    const since = new Date(Date.now() - 1000);
    const a = fake.seedCourse({ title: 'A' });
    fake.seedCourse({ title: 'B', status: 'ARCHIVED' });
    const c = fake.seedCourse({ title: 'C' });
    await expect(fake.listCourses()).resolves.toMatchObject({ items: [{ id: a.id }, { id: c.id }], pagination: { total: 2 } });
    await expect(fake.listCourses({ updatedSince: since, limit: 2, page: 2 })).resolves.toMatchObject({ items: [{ id: c.id }], pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } });
    await expect(fake.getCourse(a.id)).resolves.toMatchObject({ title: 'A' });
  });
});
