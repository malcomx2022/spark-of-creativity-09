import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ListNotificationsQuery, PreferencesDto, PushSubscriptionDto } from './notifications.dto';

/** Accès de l'utilisateur à ses notifications, préférences et abonnements push. */
@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, q: ListNotificationsQuery) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => {
      let query = trx.selectFrom('notifications').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').limit(q.limit);
      if (q.unreadOnly) query = query.where('is_read', '=', false);
      return query.execute();
    });
  }

  async unreadCount(userId: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.selectFrom('notifications').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', userId).where('is_read', '=', false).executeTakeFirstOrThrow(),
    );
    return { unread: Number(r.n) };
  }

  async markRead(userId: string, id: string) {
    const row = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.updateTable('notifications').set({ is_read: true }).where('id', '=', id).where('user_id', '=', userId).returningAll().executeTakeFirst());
    if (!row) throw new NotFoundException('Notification introuvable');
    return row;
  }

  async markAllRead(userId: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.updateTable('notifications').set({ is_read: true }).where('user_id', '=', userId).where('is_read', '=', false).executeTakeFirst());
    return { updated: Number(r.numUpdatedRows) };
  }

  async remove(userId: string, id: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.deleteFrom('notifications').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst());
    if (Number(r.numDeletedRows) === 0) throw new NotFoundException('Notification introuvable');
    return { deleted: true };
  }

  async getPreferences(userId: string) {
    const p = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('notification_preferences').selectAll().where('user_id', '=', userId).executeTakeFirst());
    // Défauts de la table (email/push activés, sms/whatsapp désactivés) si aucune ligne.
    return p ?? { user_id: userId, email_enabled: true, sms_enabled: false, whatsapp_enabled: false, push_enabled: true };
  }

  updatePreferences(userId: string, dto: PreferencesDto) {
    const values = {
      ...(dto.emailEnabled !== undefined ? { email_enabled: dto.emailEnabled } : {}),
      ...(dto.smsEnabled !== undefined ? { sms_enabled: dto.smsEnabled } : {}),
      ...(dto.whatsappEnabled !== undefined ? { whatsapp_enabled: dto.whatsappEnabled } : {}),
      ...(dto.pushEnabled !== undefined ? { push_enabled: dto.pushEnabled } : {}),
    };
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .insertInto('notification_preferences')
        .values({ user_id: userId, ...values })
        .onConflict((oc) => oc.column('user_id').doUpdateSet({ ...values, updated_at: new Date() }))
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  savePushSubscription(userId: string, dto: PushSubscriptionDto, userAgent?: string) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .insertInto('push_subscriptions')
        .values({ user_id: userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, user_agent: userAgent ?? null })
        .onConflict((oc) => oc.columns(['user_id', 'endpoint']).doUpdateSet({ p256dh: dto.keys.p256dh, auth: dto.keys.auth, user_agent: userAgent ?? null, updated_at: new Date() }))
        .returning(['id', 'endpoint', 'created_at'])
        .executeTakeFirstOrThrow(),
    );
  }

  async removePushSubscription(userId: string, endpoint: string) {
    const r = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.deleteFrom('push_subscriptions').where('user_id', '=', userId).where('endpoint', '=', endpoint).executeTakeFirst());
    return { deleted: Number(r.numDeletedRows) };
  }
}
