import { createHmac } from 'crypto';
import { akambiPath, signAkambiRequest, verifyAkambiWebhookSignature } from './akambi.signature';

// Vecteurs calculés indépendamment avec `openssl dgst -sha256 -hmac`, sur la chaîne du guide Akambi §3.
const TS = '1792000000';
const NONCE = '0b6f1c2e-4a5d-4e8f-9b7a-123456789abc';

describe('signature des requêtes Akambi (§3)', () => {
  it('POST : {timestamp}.{nonce}.{MÉTHODE}.{chemin}.{corps brut}', () => {
    const body = '{"externalLearnerId":"DC-000123","courseId":"3f6c2a1e-8d4b-4c1f-9a77-2b5e0c9d41aa"}';
    expect(signAkambiRequest('secret-de-test', TS, NONCE, 'POST', '/api/partners/v1/enrollments', body)).toBe('b14fc2f901d22b71028650627f385410e8ae43f5e6ab396bceff1d4743d5a057');
  });

  it('GET : query incluse telle qu’envoyée, corps vide, méthode mise en majuscules', () => {
    expect(signAkambiRequest('secret-de-test', TS, NONCE, 'get', '/api/partners/v1/enrollments?page=2&limit=50', '')).toBe('c795a0df909dcee5f16ee039ad66cd377df17dccf56f5654a7a41d1ea11cf04c');
  });
});

describe('akambiPath', () => {
  it('omet les valeurs absentes, garde l’ordre et transmet les dates en UTC avec Z', () => {
    expect(akambiPath('/api/partners/v1/enrollments', { page: 2, limit: 50, status: undefined, courseId: null, updatedSince: new Date('2026-10-14T09:30:00+02:00') }))
      .toBe('/api/partners/v1/enrollments?page=2&limit=50&updatedSince=2026-10-14T07%3A30%3A00.000Z');
  });

  it('sans paramètre : chemin seul, sans « ? »', () => {
    expect(akambiPath('/api/partners/v1/ping')).toBe('/api/partners/v1/ping');
  });
});

describe('vérification des webhooks Akambi (§9.2)', () => {
  const body = '{"id":"evt_1","type":"webhook.test"}';
  const valid = '2e658a86e6ef3b2ade016d0c68d2796400bd9809f845793ce93f0f3d5f732174';
  const now = Number(TS) + 10;

  it('accepte la signature du secret courant, sur le corps brut (Buffer ou chaîne)', () => {
    expect(verifyAkambiWebhookSignature(Buffer.from(body), `t=${TS},v1=${valid}`, ['whsec_test'], now)).toEqual({ ok: true, timestamp: Number(TS) });
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, ['whsec_test'], now).ok).toBe(true);
  });

  it('rotation : deux valeurs v1 et deux secrets actifs, une seule correspondance suffit', () => {
    const other = createHmac('sha256', 'whsec_nouveau').update(`${TS}.${body}`).digest('hex');
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${'0'.repeat(64)},v1=${valid}`, ['whsec_test'], now).ok).toBe(true);
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${other}`, ['whsec_test', 'whsec_nouveau'], now).ok).toBe(true);
  });

  it('accepte l’hexadécimal en majuscules', () => {
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid.toUpperCase()}`, ['whsec_test'], now).ok).toBe(true);
  });

  it('refuse un corps modifié ou un mauvais secret', () => {
    expect(verifyAkambiWebhookSignature(`${body} `, `t=${TS},v1=${valid}`, ['whsec_test'], now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, ['autre'], now)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuse un horodatage à plus de 5 minutes, dans les deux sens', () => {
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, ['whsec_test'], Number(TS) + 301)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, ['whsec_test'], Number(TS) - 301)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, ['whsec_test'], Number(TS) + 300).ok).toBe(true);
  });

  it('refuse un en-tête absent ou mal formé, ou une liste de secrets vide', () => {
    for (const header of [undefined, '', `v1=${valid}`, `t=${TS}`, `t=abc,v1=${valid}`, `t=${TS},v1=${valid.slice(1)}`, `t=${TS},v0=${valid}`]) {
      expect(verifyAkambiWebhookSignature(body, header, ['whsec_test'], now)).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(verifyAkambiWebhookSignature(body, `t=${TS},v1=${valid}`, [], now)).toEqual({ ok: false, reason: 'malformed' });
  });
});
