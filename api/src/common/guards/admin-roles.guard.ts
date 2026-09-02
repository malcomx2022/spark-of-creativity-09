import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ADMIN_ROLES_KEY, AdminRole } from '../decorators/roles.decorator';

/** Remplace les policies RLS `is_admin(auth.uid())` / `has_role(auth.uid(), 'finance')`. */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined) return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new ForbiddenException('Accès administrateur requis');
    const roles = await this.database.db
      .selectFrom('user_roles')
      .select('role')
      .where('user_id', '=', req.user.id)
      .execute();
    const owned = roles.map((r) => r.role as AdminRole);
    const ok = required.length === 0 ? owned.length > 0 : owned.some((r) => required.includes(r) || r === 'super_admin');
    if (!ok) throw new ForbiddenException('Accès administrateur requis');
    return true;
  }
}
