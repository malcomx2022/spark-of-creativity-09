import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';

export type OtpChannel = 'sms' | 'whatsapp' | 'call';

export interface OtpSendResult {
  sid: string | null;
  status: string;
}

export interface OtpProvider {
  send(phone: string, channel: OtpChannel): Promise<OtpSendResult>;
  check(phone: string, code: string): Promise<'approved' | 'pending' | 'failed'>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

/** Twilio Verify — port de legacy/supabase/functions/send-otp et verify-otp. */
@Injectable()
export class TwilioVerifyProvider implements OtpProvider {
  private readonly logger = new Logger(TwilioVerifyProvider.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private get auth(): string {
    return 'Basic ' + Buffer.from(`${this.config.TWILIO_ACCOUNT_SID}:${this.config.TWILIO_AUTH_TOKEN}`).toString('base64');
  }

  async send(phone: string, channel: OtpChannel): Promise<OtpSendResult> {
    const url = `https://verify.twilio.com/v2/Services/${this.config.TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Channel: channel }),
    });
    const data = (await res.json()) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok) {
      this.logger.error(`Twilio Verifications ${res.status}: ${JSON.stringify(data)}`);
      throw new Error(data.message ? `${data.message} (code ${data.code ?? 'unknown'})` : `Erreur Twilio ${res.status}`);
    }
    return { sid: data.sid ?? null, status: data.status ?? 'pending' };
  }

  async check(phone: string, code: string): Promise<'approved' | 'pending' | 'failed'> {
    const url = `https://verify.twilio.com/v2/Services/${this.config.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Code: code }),
    });
    const data = (await res.json()) as { status?: string };
    if (!res.ok) return 'failed';
    return data.status === 'approved' ? 'approved' : 'pending';
  }
}

/** Fournisseur de test : code fixe 123456, jamais en production (interdit par loadConfig). */
@Injectable()
export class FakeOtpProvider implements OtpProvider {
  static readonly CODE = '123456';
  readonly sent: Array<{ phone: string; channel: OtpChannel }> = [];

  async send(phone: string, channel: OtpChannel): Promise<OtpSendResult> {
    this.sent.push({ phone, channel });
    return { sid: `fake-${this.sent.length}`, status: 'pending' };
  }

  async check(_phone: string, code: string): Promise<'approved' | 'pending' | 'failed'> {
    return code === FakeOtpProvider.CODE ? 'approved' : 'pending';
  }
}
