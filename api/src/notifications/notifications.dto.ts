import { z } from 'zod';
import { isTrustedPushEndpoint } from './push-endpoint';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const preferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
});
export type PreferencesDto = z.infer<typeof preferencesSchema>;

/** Abonnement Web Push tel que renvoyé par PushSubscription.toJSON() (src/lib/push-notifications.ts). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(isTrustedPushEndpoint, 'Service push non autorisé'),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  userAgent: z.string().max(512).optional(),
});
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });
