import { Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../database/types';

export interface InAppNotification {
  title: string;
  message: string;
  type?: string;
  link?: string;
}

/** Table notifications (cloche in-app, lue en temps réel par le front). */
@Injectable()
export class InAppNotificationsService {
  async notifyUser(db: Kysely<DB> | Transaction<DB>, userId: string, n: InAppNotification): Promise<void> {
    await db.insertInto('notifications').values({ user_id: userId, title: n.title, message: n.message, type: n.type ?? 'info', link: n.link ?? null }).execute();
  }

  /** Administrateurs porteurs d'un des rôles donnés (ex requête user_roles.in('role', …)). */
  async notifyRoles(db: Kysely<DB> | Transaction<DB>, roles: string[], n: InAppNotification): Promise<number> {
    const admins = await db.selectFrom('user_roles').select('user_id').distinct().where('role', 'in', roles as never).execute();
    if (admins.length === 0) return 0;
    await db.insertInto('notifications').values(admins.map((a) => ({ user_id: a.user_id, title: n.title, message: n.message, type: n.type ?? 'info', link: n.link ?? null }))).execute();
    return admins.length;
  }

  /** Tous les administrateurs (n'importe quel rôle de user_roles), comme sendKYCNotifications(). */
  async notifyAdmins(db: Kysely<DB> | Transaction<DB>, n: InAppNotification): Promise<number> {
    const admins = await db.selectFrom('user_roles').select('user_id').distinct().execute();
    if (admins.length === 0) return 0;
    await db
      .insertInto('notifications')
      .values(admins.map((a) => ({ user_id: a.user_id, title: n.title, message: n.message, type: n.type ?? 'info', link: n.link ?? null })))
      .execute();
    return admins.length;
  }
}
