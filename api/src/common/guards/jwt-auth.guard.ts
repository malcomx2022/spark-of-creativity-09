import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { APP_CONFIG, AppConfig } from '../../config/config.module';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { AccountStatusService } from '../../auth/account-status.service';

export interface AccessTokenPayload {
  sub: string;
  email: string | null;
  role: 'authenticated';
  exp?: number;
}

/** Lit le JWT d'accès dans `Authorization: Bearer` ou dans le cookie `access_token`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
    if (!token) throw new UnauthorizedException('Authentification requise');
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    }
    await this.accounts.assertActive(payload.sub);
    req.user = { id: payload.sub, email: payload.email, role: 'authenticated' };
    return true;
  }
}
