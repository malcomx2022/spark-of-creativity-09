import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { APP_CONFIG, AppConfig } from '../../config/config.module';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { AccessTokenPayload } from './jwt-auth.guard';
import { AccountStatusService } from '../../auth/account-status.service';

/**
 * Comme JwtAuthGuard, mais laisse passer les requêtes anonymes (req.user absent) et ignore un jeton
 * invalide : pour les routes publiques dont la réponse est enrichie pour les utilisateurs connectés.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly accounts: AccountStatusService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = bearer ?? (req.cookies?.['access_token'] as string | undefined);
    if (!token) return true;
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.JWT_ACCESS_SECRET });
    } catch {
      // Jeton expiré ou invalide : la requête est traitée comme anonyme.
      return true;
    }
    await this.accounts.assertActive(payload.sub);
    req.user = { id: payload.sub, email: payload.email, role: 'authenticated' };
    return true;
  }
}
