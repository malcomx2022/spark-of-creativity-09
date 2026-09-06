import { Injectable, Logger } from '@nestjs/common';
import { isValidE164, normalizePhoneNumber } from '../auth/phone.util';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { SmsService } from './sms.service';

export type NotificationChannel = 'email' | 'sms' | 'push';
export interface ChannelResult {
  attempted: boolean;
  success: boolean;
  skipped?: boolean;
  error?: string;
}
export interface DispatchOptions {
  userId: string;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  /** Canaux souhaités (défaut : tous) ; filtrés par notification_preferences. */
  channels?: NotificationChannel[];
}

const DEFAULT_CHANNELS: NotificationChannel[] = ['email', 'sms', 'push'];

/** Port de _shared/notifications.ts dispatchNotification : in-app + e-mail + SMS + push selon les préférences. */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly database: DatabaseService, private readonly email: EmailService, private readonly sms: SmsService, private readonly push: PushService) {}

  async dispatch(o: DispatchOptions): Promise<{ notificationId: string; channels: Record<NotificationChannel, ChannelResult> }> {
    const { notification, prefs, user, profile } = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const notification = await trx.insertInto('notifications').values({ user_id: o.userId, title: o.title, message: o.message, type: o.type ?? 'system', link: o.link ?? null }).returning('id').executeTakeFirstOrThrow();
      const prefs = await trx.selectFrom('notification_preferences').select(['email_enabled', 'sms_enabled', 'push_enabled']).where('user_id', '=', o.userId).executeTakeFirst();
      const user = await trx.selectFrom('users').select(['email']).where('id', '=', o.userId).executeTakeFirst();
      const profile = await trx.selectFrom('profiles').select(['phone']).where('id', '=', o.userId).executeTakeFirst();
      return { notification, prefs, user, profile };
    });
    const wanted = new Set<NotificationChannel>(o.channels?.length ? o.channels : DEFAULT_CHANNELS);
    if (prefs?.email_enabled === false) wanted.delete('email');
    if (prefs?.sms_enabled === false) wanted.delete('sms');
    if (prefs?.push_enabled === false) wanted.delete('push');
    const results: Record<NotificationChannel, ChannelResult> = {
      email: { attempted: false, success: false, skipped: !wanted.has('email') },
      sms: { attempted: false, success: false, skipped: !wanted.has('sms') },
      push: { attempted: false, success: false, skipped: !wanted.has('push') },
    };
    if (wanted.has('email')) {
      if (user?.email) {
        results.email = await this.email
          .send({ to: user.email, subject: o.title, text: `${o.message}${o.link ? `\n\n${o.link}` : ''}`, html: `<p>${o.message}</p>${o.link ? `<p><a href="${o.link}">${o.link}</a></p>` : ''}` })
          .then(() => ({ attempted: true, success: true }))
          .catch((e) => ({ attempted: true, success: false, error: String(e) }));
      } else results.email = { attempted: false, success: false, skipped: true, error: 'missing_email' };
    }
    if (wanted.has('sms')) {
      const phone = profile?.phone ? normalizePhoneNumber(profile.phone) : null;
      if (phone && isValidE164(phone)) results.sms = { attempted: true, success: await this.sms.send(phone, o.message).catch(() => false) };
      else results.sms = { attempted: false, success: false, skipped: true, error: 'invalid_phone' };
    }
    if (wanted.has('push')) {
      const r = await this.push.sendToUser(o.userId, { title: o.title, message: o.message, url: o.link, notificationId: notification.id, tag: o.type }).catch((e) => ({ attempted: true, success: false, sent: 0, removed: 0, error: String(e) }));
      results.push = { attempted: r.attempted, success: r.success, skipped: !r.attempted, error: r.error };
    }
    this.logger.debug(`notification ${notification.id} → ${JSON.stringify(results)}`);
    return { notificationId: notification.id, channels: results };
  }
}
