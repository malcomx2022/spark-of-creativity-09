import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { InternalServerErrorException } from '@nestjs/common';

/**
 * Chiffrement des numéros de téléphone (AES-256-GCM, format `base64(iv):base64(chiffré + tag)`),
 * partagé par les moyens de paiement enregistrés (ex Edge Function secure-phone) et les tentatives
 * de paiement (`payment_attempts.phone_number_encrypted`, m5).
 *
 * Clé : `PHONE_ENCRYPTION_KEY` (32 octets en base64, obligatoire en production — la même valeur que
 * l'ancienne plateforme, sinon les numéros déjà chiffrés deviennent illisibles) ; hors production,
 * une clé dérivée du secret JWT évite une configuration supplémentaire.
 */
export class PhoneCipher {
  private readonly key: Buffer;

  constructor(config: { PHONE_ENCRYPTION_KEY?: string; JWT_ACCESS_SECRET: string }) {
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

  /** Forme affichable : seuls les quatre derniers chiffres restent (`****0001`). */
  static mask(phone: string): string {
    return phone.length <= 4 ? phone : `****${phone.slice(-4)}`;
  }
}
