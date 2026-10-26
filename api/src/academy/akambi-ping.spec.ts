import { AkambiError, FakeAkambiClient } from './akambi.client';
import { AKAMBI_PREPROD_URL, pingConfig, runAkambiPing } from './akambi-ping';

describe('akambi-ping (lot A0)', () => {
  const refusing = () => {
    const client = new FakeAkambiClient();
    jest.spyOn(client, 'ping').mockRejectedValue(new AkambiError('Signature invalide', 401, 'INVALID_SIGNATURE'));
    return client;
  };

  it('configuration : préproduction par défaut, identifiants requis, HTTPS imposé', () => {
    expect(pingConfig({ AKAMBI_API_KEY: 'k', AKAMBI_API_SECRET: 's' })).toMatchObject({ AKAMBI_BASE_URL: AKAMBI_PREPROD_URL, AKAMBI_TIMEOUT_MS: 10_000 });
    expect(() => pingConfig({ AKAMBI_API_KEY: 'k' })).toThrow('AKAMBI_API_KEY et AKAMBI_API_SECRET requis');
    expect(() => pingConfig({ AKAMBI_API_KEY: 'k', AKAMBI_API_SECRET: 's', AKAMBI_BASE_URL: 'http://akambi.test' })).toThrow('HTTPS');
  });

  it('tous les contrôles réussis : partenaire, horloge, signature fausse refusée, catalogue', async () => {
    const client = new FakeAkambiClient();
    client.seedCourse({ title: 'Gestes et postures' });
    const checks = await runAkambiPing(client, refusing());
    expect(checks.map((c) => [c.label, c.ok])).toEqual([
      ['Authentification (GET /ping)', true],
      ['Horloge', true],
      ['Refus d’une signature fausse', true],
      ['Catalogue (GET /courses)', true],
    ]);
    expect(checks[3].detail).toContain('1 formation(s) publiée(s) : Gestes et postures');
  });

  it('identifiants refusés : arrêt après le ping, code Akambi affiché sans message', async () => {
    const client = new FakeAkambiClient();
    jest.spyOn(client, 'ping').mockRejectedValue(new AkambiError('Clé inconnue de test@exemple.fr', 401, 'INVALID_API_KEY'));
    const checks = await runAkambiPing(client, refusing());
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ ok: false });
    expect(checks[0].detail).toContain('401 INVALID_API_KEY');
    expect(checks[0].detail).not.toContain('test@exemple.fr');
  });

  it('horloge décalée de plus de 300 s : échec ; signature fausse acceptée : échec ; catalogue vide : avertissement', async () => {
    const client = new FakeAkambiClient();
    jest.spyOn(client, 'ping').mockResolvedValue({ partner: { code: 'DOMICARES', name: 'DomiCares' }, serverTime: '2026-10-26T12:10:00.000Z' });
    const accepting = new FakeAkambiClient();
    const checks = await runAkambiPing(client, accepting, () => Date.parse('2026-10-26T12:00:00.000Z'));
    expect(checks.find((c) => c.label === 'Horloge')).toMatchObject({ ok: false, detail: expect.stringContaining('600 s') });
    expect(checks.find((c) => c.label === 'Refus d’une signature fausse')).toMatchObject({ ok: false });
    expect(checks.find((c) => c.label === 'Catalogue (GET /courses)')).toMatchObject({ ok: true, warning: true });
  });
});
