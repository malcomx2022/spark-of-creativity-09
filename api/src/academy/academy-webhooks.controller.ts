import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AcademySyncService } from './academy-sync.service';

@ApiTags('webhooks')
@Controller('webhooks/akambi')
export class AcademyWebhooksController {
  constructor(private readonly sync: AcademySyncService) {}

  /** Corps brut (option rawBody de NestFactory) : la signature porte sur les octets reçus, jamais sur un JSON re-sérialisé. */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhooks Akambi (signature X-Akambi-Signature sur le corps brut, dédoublonnage academy_webhook_events)' })
  receive(@Req() req: FastifyRequest, @Headers('x-akambi-signature') signature: string | undefined, @Headers('x-akambi-event-id') eventId: string | undefined) {
    return this.sync.handleWebhook((req as FastifyRequest & { rawBody?: Buffer | string }).rawBody, signature, eventId);
  }
}
