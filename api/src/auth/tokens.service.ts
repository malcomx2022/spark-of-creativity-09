import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Transaction } from 'kysely';
import { AccessTokenPayload } from '../common/guards/jwt-auth.guard';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import type { AuthTokenKind, DB } from '../database/types';
import { assertActiveAccount } from './account-status.service';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** JWT d'accès courts + refresh tokens opaques (hashés, rotation, détection de réutilisation). */
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, { secret: this.config.JWT_ACCESS_SECRET, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS });
  }

  async issueSession(
    trx: Transaction<DB>,
    user: { id: string; email: string | null },
    meta: { userAgent?: string; ip?: string; familyId?: string },
  ): Promise<IssuedSession> {
    assertActiveAccount(await trx.selectFrom('users').select(['deleted_at', 'banned_until']).where('id', '=', user.id).executeTakeFirst());
    const refreshToken = randomToken();
    await trx
      .insertInto('refresh_tokens')
      .values({
        user_id: user.id,
        token_hash: sha256(refreshToken),
        ...(meta.familyId ? { family_id: meta.familyId } : {}),
        user_agent: meta.userAgent ?? null,
        ip_address: meta.ip ?? null,
        expires_at: new Date(Date.now() + this.config.JWT_REFRESH_TTL_SECONDS * 1000),
      })
      .execute();
    const accessToken = await this.signAccessToken({ sub: user.id, email: user.email, role: 'authenticated' });
    return { accessToken, refreshToken, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS, tokenType: 'Bearer' };
  }

  /** Crée un jeton à usage unique (vérification e-mail, reset…) et renvoie sa valeur en clair. */
  async createOneTimeToken(
    trx: Transaction<DB>,
    params: { userId: string | null; identifier: string; kind: AuthTokenKind; ttlSeconds: number },
  ): Promise<string> {
    const token = randomToken(32);
    await trx
      .updateTable('auth_tokens')
      .set({ consumed_at: new Date() })
      .where('identifier', '=', params.identifier)
      .where('kind', '=', params.kind)
      .where('consumed_at', 'is', null)
      .execute();
    await trx
      .insertInto('auth_tokens')
      .values({
        user_id: params.userId,
        identifier: params.identifier,
        kind: params.kind,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + params.ttlSeconds * 1000),
      })
      .execute();
    return token;
  }

  /** Consomme un jeton à usage unique ; renvoie null s'il est inconnu, expiré ou déjà utilisé. */
  async consumeOneTimeToken(trx: Transaction<DB>, kind: AuthTokenKind, token: string) {
    return trx
      .updateTable('auth_tokens')
      .set({ consumed_at: new Date() })
      .where('kind', '=', kind)
      .where('token_hash', '=', sha256(token))
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returningAll()
      .executeTakeFirst();
  }
}
