import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';

export function assertActiveAccount(user: { deleted_at: Date | null; banned_until: Date | null } | undefined): void {
  if (!user || user.deleted_at) throw new UnauthorizedException('Compte introuvable');
  if (user.banned_until && user.banned_until.getTime() > Date.now()) throw new ForbiddenException('Compte suspendu');
}

@Injectable()
export class AccountStatusService {
  constructor(private readonly database: DatabaseService) {}

  async assertActive(userId: string): Promise<void> {
    const user = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('users').select(['deleted_at', 'banned_until']).where('id', '=', userId).executeTakeFirst(),
    );
    assertActiveAccount(user);
  }
}
