import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { FakeFedaPayClient } from './fedapay.client';
import { CreatePaymentDto, createPaymentSchema, ListPaymentsQuery, listPaymentsQuerySchema, SimulateWebhookDto, simulateWebhookSchema } from './payments.dto';
import { PaymentsService, WebhookPayload } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Clé publique FedaPay pour le widget (ex get-fedapay-config)' })
  config() {
    return this.payments.publicConfig();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initie un paiement FedaPay pour un rendez-vous (ex create-payment)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createPaymentSchema)) dto: CreatePaymentDto) {
    return this.payments.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listPaymentsQuerySchema)) q: ListPaymentsQuery) {
    return this.payments.listOwn(user.id, q);
  }

  @Get('attempts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tentatives de paiement de l’utilisateur (ex lecture directe de payment_attempts)' })
  attempts(@CurrentUser() user: AuthenticatedUser, @Query('appointmentId') appointmentId?: string) {
    return this.payments.listAttempts(user.id, appointmentId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getOwn(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annule un paiement en attente (ex cancel-pending-payment)' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.cancelPending(user.id, id);
  }

  @Post(':id/sync')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resynchronise le statut depuis FedaPay (ex sync-payment-status)' })
  sync(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.sync(user.id, id);
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  /** Corps brut (option rawBody de NestFactory) requis pour la vérification HMAC. */
  @Post('fedapay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook FedaPay (signature HMAC-SHA256, idempotence webhook_events)' })
  async fedapay(@Req() req: FastifyRequest, @Headers('x-fedapay-signature') signature: string | undefined) {
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const raw = rawBody ? rawBody.toString() : JSON.stringify(req.body ?? {});
    if (!signature) throw new UnauthorizedException('Signature manquante');
    if (!this.payments.verifySignature(raw, signature)) throw new UnauthorizedException('Signature invalide');
    return this.payments.handleWebhook(req.body as WebhookPayload);
  }
}

@ApiTags('admin/payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'finance', 'ops')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly fake: FakeFedaPayClient, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Post('simulate-webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simule un événement FedaPay (client factice uniquement, ex simulate-webhook)' })
  async simulate(@Body(new ZodValidationPipe(simulateWebhookSchema)) dto: SimulateWebhookDto) {
    if (this.config.FEDAPAY_PROVIDER !== 'fake') throw new ForbiddenException('Simulation disponible uniquement avec FEDAPAY_PROVIDER=fake');
    this.fake.setStatus(dto.transactionId, dto.status);
    return this.payments.handleWebhook({ id: `sim-${dto.transactionId}-${dto.status}-${Date.now()}`, name: `transaction.${dto.status}`, entity: { id: dto.transactionId, status: dto.status } });
  }

  @Post(':id/sync')
  @HttpCode(200)
  sync(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.sync(null, id);
  }
}
