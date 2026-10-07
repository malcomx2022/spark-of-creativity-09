import { Body, Controller, Inject, Post, ServiceUnavailableException } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EmailService } from '../notifications/email.service';

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(2).max(150),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional(),
}).strict();
export type ContactDto = z.infer<typeof contactSchema>;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly email: EmailService) {}

  @Post()
  @RouteConfig({ rateLimit: { max: 5, timeWindow: 60 * 60 * 1000 } })
  async send(@Body(new ZodValidationPipe(contactSchema)) dto: ContactDto) {
    if (!this.config.CONTACT_RECIPIENT_EMAIL || (this.config.NODE_ENV === 'production' && this.config.EMAIL_PROVIDER !== 'resend')) {
      throw new ServiceUnavailableException('Le formulaire est temporairement indisponible. Contactez-nous par e-mail.');
    }
    const text = `Nom : ${dto.name}\nE-mail : ${dto.email}\nTéléphone : ${dto.phone || 'Non renseigné'}\nSujet : ${dto.subject}\n\n${dto.message}`;
    try {
      await this.email.send({ to: this.config.CONTACT_RECIPIENT_EMAIL, subject: 'DomiCares — nouveau message de contact', text, html: `<pre>${escapeHtml(text)}</pre>` });
    } catch {
      throw new ServiceUnavailableException('Votre message n’a pas pu être transmis. Réessayez plus tard.');
    }
    return { accepted: true };
  }
}
