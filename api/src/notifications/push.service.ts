import { Inject, Injectable, Logger } from '@nestjs/common';
import { createECDH } from 'node:crypto';
import * as webpush from 'web-push';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { isTrustedPushEndpoint } from './push-endpoint';
import { pushTargetPath } from './push-target';

export interface PushPayload {
  title: string;
  message: string;
  url?: string | null;
  notificationId?: string;
  tag?: string;
}

/** Web Push VAPID — port de send-push-notification (payload lu par public/sw.js). */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  /** Clés VAPID incohérentes : Apple/Google refuseraient chaque envoi (403) ; le push est alors coupé. */
  private readonly vapidError: string | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly database: DatabaseService) {
    this.vapidError = config.PUSH_PROVIDER === 'webpush' ? vapidKeyError(config.WEB_PUSH_PUBLIC_KEY, config.WEB_PUSH_PRIVATE_KEY) : null;
    if (this.vapidError) this.logger.error(`Push désactivé : ${this.vapidError} (WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY)`);
    else if (config.PUSH_PROVIDER === 'webpush') webpush.setVapidDetails(config.WEB_PUSH_EMAIL, config.WEB_PUSH_PUBLIC_KEY!, config.WEB_PUSH_PRIVATE_KEY!);
  }

  /** console : aucun envoi réel (développement, recette locale). */
  get provider(): 'webpush' | 'console' {
    return this.config.PUSH_PROVIDER;
  }

  get publicKey(): string | null {
    return this.vapidError ? null : (this.config.WEB_PUSH_PUBLIC_KEY ?? null);
  }

  /** Envoie à tous les abonnements de l'utilisateur ; supprime ceux expirés (404/410). */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ attempted: boolean; success: boolean; sent: number; removed: number; error?: string }> {
    if (this.vapidError) return { attempted: false, success: false, sent: 0, removed: 0, error: 'vapid_mismatch' };
    const subscriptions = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('push_subscriptions').selectAll().where('user_id', '=', userId).execute());
    if (subscriptions.length === 0) return { attempted: false, success: false, sent: 0, removed: 0, error: 'no_subscription' };
    // Notifications may appear on a locked/shared screen. Details stay behind authentication :
    // texte générique, seule la page cible (chemin interne, jamais affiché) suit la notification.
    const message = 'Vous avez une nouvelle notification. Connectez-vous pour la consulter.';
    const body = JSON.stringify({ title: 'DomiCares', message, body: message, url: pushTargetPath(payload.url), notificationId: payload.notificationId, tag: 'domicares-notification' });
    if (this.config.PUSH_PROVIDER === 'console') {
      this.logger.log(`[push:console] ${subscriptions.length} abonnement(s) de ${userId}`);
      return { attempted: true, success: true, sent: subscriptions.length, removed: 0 };
    }
    let sent = 0;
    const expired: string[] = [];
    for (const s of subscriptions) {
      if (!isTrustedPushEndpoint(s.endpoint)) { expired.push(s.id); continue; }
      try {
        // urgency high : remise immédiate même en économie d'énergie (Android) ; TTL d'une heure.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
        else this.logger.warn(`Push ${s.endpoint.slice(0, 40)}… : ${err instanceof Error ? err.message : err}`);
      }
    }
    if (expired.length) await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.deleteFrom('push_subscriptions').where('id', 'in', expired).execute());
    return { attempted: true, success: sent > 0, sent, removed: expired.length };
  }
}

/** Vérifie que la clé publique VAPID dérive bien de la clé privée (base64url, courbe P-256). */
export function vapidKeyError(publicKey?: string, privateKey?: string): string | null {
  if (!publicKey || !privateKey) return 'clés VAPID absentes';
  const priv = Buffer.from(privateKey, 'base64url');
  const pub = Buffer.from(publicKey, 'base64url');
  if (priv.length !== 32) return 'clé privée VAPID invalide (32 octets attendus)';
  if (pub.length !== 65) return 'clé publique VAPID invalide (65 octets attendus)';
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub) ? null : 'la clé publique VAPID ne correspond pas à la clé privée';
  } catch {
    return 'clé privée VAPID invalide';
  }
}
