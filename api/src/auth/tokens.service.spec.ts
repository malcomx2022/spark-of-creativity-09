import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { configSchema } from '../config/config.schema';
import { withFakeTrx, type RecordedQuery } from '../../test/unit/fake-trx';
import { randomToken, sha256, TokensService } from './tokens.service';

const config = configSchema.parse({ DATABASE_URL: 'postgresql://localhost/test', JWT_ACCESS_SECRET: 'unit-secret-unit-secret-unit-secret-1234', JWT_ACCESS_TTL_SECONDS: '900', JWT_REFRESH_TTL_SECONDS: '3600' });
const jwt = new JwtService();
const service = () => new TokensService(jwt, config);

const ACTIVE = { deleted_at: null, banned_until: null };
const isUserRead = (q: RecordedQuery) => q.sql.startsWith('select "deleted_at", "banned_until" from "users"');
const isRefreshInsert = (q: RecordedQuery) => q.sql.startsWith('insert into "refresh_tokens"');

describe('sha256 / randomToken', () => {
  it('empreinte hexadécimale stable', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('jetons aléatoires base64url, longueur selon le nombre d’octets', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(randomToken(32)).toHaveLength(43);
    expect(randomToken()).not.toBe(a);
  });
});

describe('TokensService.issueSession', () => {
  const user = { id: 'u-1', email: 'awa@example.invalid' };

  it("enregistre seulement l'empreinte du refresh token, avec l'expiration configurée", async () => {
    const before = Date.now();
    const { result, queries } = await withFakeTrx((q) => (isUserRead(q) ? [ACTIVE] : []), (trx) => service().issueSession(trx, user, { userAgent: 'Vitest', ip: '127.0.0.1' }));

    expect(result).toMatchObject({ expiresIn: 900, tokenType: 'Bearer' });
    const insert = queries.find(isRefreshInsert)!;
    expect(insert.parameters).toContain(sha256(result.refreshToken));
    expect(insert.parameters).not.toContain(result.refreshToken);
    expect(insert.parameters).toEqual(expect.arrayContaining(['u-1', 'Vitest', '127.0.0.1']));
    const expires = insert.parameters.find((p): p is Date => p instanceof Date)!;
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 3600_000);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + 3600_000);
    // Sans famille fournie, la base en attribue une nouvelle.
    expect(insert.sql).not.toContain('"family_id"');
  });

  it('rotation : le nouveau refresh token reste dans la famille du précédent', async () => {
    const { queries } = await withFakeTrx((q) => (isUserRead(q) ? [ACTIVE] : []), (trx) => service().issueSession(trx, user, { familyId: 'fam-1' }));
    const insert = queries.find(isRefreshInsert)!;
    expect(insert.sql).toContain('"family_id"');
    expect(insert.parameters).toContain('fam-1');
  });

  it("jeton d'accès signé avec le secret, le sujet et la durée configurés", async () => {
    const { result } = await withFakeTrx((q) => (isUserRead(q) ? [ACTIVE] : []), (trx) => service().issueSession(trx, user, {}));
    const payload = await jwt.verifyAsync<{ sub: string; email: string; role: string; iat: number; exp: number }>(result.accessToken, { secret: config.JWT_ACCESS_SECRET });
    expect(payload).toMatchObject({ sub: 'u-1', email: 'awa@example.invalid', role: 'authenticated' });
    expect(payload.exp - payload.iat).toBe(900);
    await expect(jwt.verifyAsync(result.accessToken, { secret: 'autre-secret-autre-secret-autre-secret-12' })).rejects.toThrow();
  });

  it.each([
    ['supprimé', { deleted_at: new Date(), banned_until: null }, UnauthorizedException],
    ['suspendu', { deleted_at: null, banned_until: new Date(Date.now() + 60_000) }, ForbiddenException],
    ['introuvable', undefined, UnauthorizedException],
  ])('compte %s : aucune session émise', async (_label, row, error) => {
    let queries: RecordedQuery[] = [];
    await expect(
      withFakeTrx((q) => (isUserRead(q) && row ? [row] : []), (trx, recorded) => {
        queries = recorded;
        return service().issueSession(trx, user, {});
      }),
    ).rejects.toBeInstanceOf(error);
    expect(queries.some(isRefreshInsert)).toBe(false);
  });
});

describe('TokensService : jetons à usage unique', () => {
  it('création : invalide les jetons encore ouverts du même type, puis stocke une empreinte', async () => {
    const { result, queries } = await withFakeTrx(() => [], (trx) => service().createOneTimeToken(trx, { userId: 'u-1', identifier: 'awa@example.invalid', kind: 'password_reset', ttlSeconds: 3600 }));
    expect(queries.map((q) => q.sql.split(' ').slice(0, 3).join(' '))).toEqual(['update "auth_tokens" set', 'insert into "auth_tokens"']);
    const [invalidate, insert] = queries;
    expect(invalidate.sql).toContain('"consumed_at" is null');
    expect(invalidate.parameters).toEqual(expect.arrayContaining(['awa@example.invalid', 'password_reset']));
    expect(insert.parameters).toContain(sha256(result));
    expect(insert.parameters).not.toContain(result);
  });

  it('consommation atomique : une seule requête conditionnelle (type, empreinte, non consommé, non expiré)', async () => {
    const row = { id: 't-1', user_id: 'u-1', kind: 'email_verification' };
    const { result, queries } = await withFakeTrx(() => [row], (trx) => service().consumeOneTimeToken(trx, 'email_verification', 'jeton-clair'));
    expect(result).toEqual(row);
    expect(queries).toHaveLength(1);
    const [consume] = queries;
    expect(consume.sql).toMatch(/^update "auth_tokens" set "consumed_at" = \$1 where/);
    expect(consume.sql).toContain('"consumed_at" is null');
    expect(consume.sql).toContain('"expires_at" >');
    expect(consume.sql).toContain('returning *');
    expect(consume.parameters).toEqual(expect.arrayContaining(['email_verification', sha256('jeton-clair')]));
    expect(consume.parameters).not.toContain('jeton-clair');
  });

  it('jeton inconnu, expiré ou déjà utilisé : null', async () => {
    const { result } = await withFakeTrx(() => [], (trx) => service().consumeOneTimeToken(trx, 'password_reset', 'inconnu'));
    expect(result).toBeUndefined();
  });
});
