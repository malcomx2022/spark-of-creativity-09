import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { normalizePhoneNumber } from '../auth/phone.util';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService } from '../database/database.service';

export const savePaymentMethodSchema = z.object({
  provider: z.enum(['mtn', 'moov', 'orange']),
  phoneNumber: z.string().trim().min(8).max(20),
  setAsDefault: z.boolean().default(false),
});
export type SavePaymentMethodDto = z.infer<typeof savePaymentMethodSchema>;

/**
 * Moyens de paiement Mobile Money enregistrés — port de useSavedPaymentMethods + Edge Function secure-phone.
 * Le numéro est chiffré côté serveur (AES-256-GCM, format `base64(iv):base64(ciphertext+tag)`) et
 * n'est jamais renvoyé en clair sauf sur demande explicite du propriétaire (ex action decrypt).
 * Déduplication par (user, provider, numéro masqué) : la contrainte unique sur le chiffré était inopérante (IV aléatoire).
 */
@Injectable()
export class PaymentMethodsService {
  private readonly key: Buffer;

  constructor(private readonly database: DatabaseService, @Inject(APP_CONFIG) config: AppConfig) {
    // Hors production, une clé dérivée du secret JWT évite une configuration supplémentaire.
    this.key = config.PHONE_ENCRYPTION_KEY ? Buffer.from(config.PHONE_ENCRYPTION_KEY, 'base64') : createHash('sha256').update(config.JWT_ACCESS_SECRET).digest();
    if (this.key.length !== 32) throw new InternalServerErrorException('PHONE_ENCRYPTION_KEY doit être une clé de 32 octets encodée en base64');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `${iv.toString('base64')}:${data.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, dataB64] = payload.split(':');
    if (!ivB64 || !dataB64) throw new InternalServerErrorException('Numéro chiffré illisible');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
  }

  static mask(phone: string): string {
    return phone.length <= 4 ? phone : `****${phone.slice(-4)}`;
  }

  list(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('saved_payment_methods').select(['id', 'provider', 'phone_number_masked', 'is_default', 'consent_given_at', 'created_at']).where('user_id', '=', userId).orderBy('is_default', 'desc').orderBy('created_at', 'desc').execute());
  }

  /** Ex addPaymentMethod : rétrogradation de l'ancien défaut, chiffrement et insertion dans une seule transaction. */
  save(userId: string, dto: SavePaymentMethodDto) {
    const phone = normalizePhoneNumber(dto.phoneNumber);
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const masked = PaymentMethodsService.mask(phone);
      const existing = await trx.selectFrom('saved_payment_methods').select('id').where('user_id', '=', userId).where('provider', '=', dto.provider).where('phone_number_masked', '=', masked).executeTakeFirst();
      const count = await trx.selectFrom('saved_payment_methods').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', userId).executeTakeFirstOrThrow();
      const isDefault = dto.setAsDefault || Number(count.n) === 0;
      if (isDefault) await trx.updateTable('saved_payment_methods').set({ is_default: false, updated_at: new Date() }).where('user_id', '=', userId).execute();
      const encrypted = this.encrypt(phone);
      const row = existing
        ? await trx.updateTable('saved_payment_methods').set({ phone_number_encrypted: encrypted, is_default: isDefault || undefined, consent_given_at: new Date(), updated_at: new Date() }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('saved_payment_methods').values({ user_id: userId, provider: dto.provider, phone_number_masked: masked, phone_number_encrypted: encrypted, is_default: isDefault }).returningAll().executeTakeFirstOrThrow();
      const { phone_number_encrypted: _omit, ...safe } = row;
      return safe;
    });
  }

  async remove(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const row = await trx.deleteFrom('saved_payment_methods').where('id', '=', id).where('user_id', '=', userId).returning('is_default').executeTakeFirst();
      if (!row) throw new NotFoundException('Méthode de paiement introuvable');
      if (row.is_default) {
        const next = await trx.selectFrom('saved_payment_methods').select('id').where('user_id', '=', userId).orderBy('created_at', 'desc').executeTakeFirst();
        if (next) await trx.updateTable('saved_payment_methods').set({ is_default: true, updated_at: new Date() }).where('id', '=', next.id).execute();
      }
      return { deleted: true };
    });
  }

  setDefault(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const target = await trx.selectFrom('saved_payment_methods').select('id').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst();
      if (!target) throw new NotFoundException('Méthode de paiement introuvable');
      await trx.updateTable('saved_payment_methods').set({ is_default: false, updated_at: new Date() }).where('user_id', '=', userId).execute();
      return trx.updateTable('saved_payment_methods').set({ is_default: true, updated_at: new Date() }).where('id', '=', id).returning(['id', 'provider', 'phone_number_masked', 'is_default']).executeTakeFirstOrThrow();
    });
  }

  /** Ex secure-phone action=decrypt : le propriétaire uniquement. */
  async reveal(userId: string, id: string) {
    const row = await this.database.runAs({ role: 'service_role', userId }, (trx) => trx.selectFrom('saved_payment_methods').select(['id', 'user_id', 'phone_number_encrypted', 'provider']).where('id', '=', id).where('user_id', '=', userId).executeTakeFirst());
    if (!row) throw new NotFoundException('Méthode de paiement introuvable');
    return { id: row.id, provider: row.provider, phone: this.decrypt(row.phone_number_encrypted) };
  }
}
