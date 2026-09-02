import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';

/** SMS transactionnels via l'API Messages Twilio (port de _shared/notifications.ts). */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(to: string, body: string): Promise<boolean> {
    if (this.config.SMS_PROVIDER === 'console') {
      this.logger.log(`[sms:console] à ${to} — ${body}`);
      return true;
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.TWILIO_ACCOUNT_SID}/Messages.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.config.TWILIO_ACCOUNT_SID}:${this.config.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: this.config.TWILIO_PHONE_NUMBER ?? '', Body: body }),
    });
    if (!res.ok) {
      this.logger.error(`Twilio Messages ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  }
}
