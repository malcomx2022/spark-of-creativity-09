import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envoi d'e-mails : Resend (comme legacy/supabase/functions/_shared/notifications.ts) ou console en dev. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(msg: EmailMessage): Promise<void> {
    if (this.config.EMAIL_PROVIDER === 'console') {
      this.logger.log(`[email:console] à ${msg.to} — ${msg.subject}\n${msg.text ?? msg.html}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.config.RESEND_FROM_EMAIL, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Resend ${res.status}: ${body}`);
      throw new Error("Échec de l'envoi de l'e-mail");
    }
  }
}
