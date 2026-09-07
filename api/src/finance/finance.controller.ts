import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  AdminPaymentsQuery, adminPaymentsQuerySchema, CreateBatchDto, createBatchSchema, CreatePayoutDto, createPayoutSchema, ListQuery, listQuerySchema, PaymentInfoDto, paymentInfoSchema, PayoutsQuery, payoutsQuerySchema,
  ReconciliationDto, reconciliationSchema, RefundDto, refundSchema, WebhookEventsQuery, webhookEventsQuerySchema,
} from './finance.dto';
import { FinanceService } from './finance.service';

/** Espace praticien / coach : solde, reversements, informations de reversement (PayoutsSection, PaymentInfoSection). */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance/me')
export class PractitionerFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('balance')
  balance(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.myBalance(user.id);
  }

  @Get('payouts')
  payouts(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.finance.myPayouts(user.id, q);
  }

  @Get('payment-info')
  paymentInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.getPaymentInfo(user.id);
  }

  @Put('payment-info')
  @ApiOperation({ summary: 'Enregistre / vérifie une méthode de reversement (ex PaymentInfoSection)' })
  upsertPaymentInfo(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(paymentInfoSchema)) dto: PaymentInfoDto) {
    return this.finance.upsertPaymentInfo(user.id, dto);
  }
}

/** Administration finance (rôles finance / ops / super_admin) — FinanceSection et ses onglets. */
@ApiTags('admin/finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'finance', 'ops')
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('stats')
  stats() {
    return this.finance.stats();
  }

  @Get('payments')
  payments(@Query(new ZodValidationPipe(adminPaymentsQuerySchema)) q: AdminPaymentsQuery) {
    return this.finance.listPayments(q);
  }

  @Get('balances')
  balances() {
    return this.finance.listBalances();
  }

  @Get('payouts')
  payouts(@Query(new ZodValidationPipe(payoutsQuerySchema)) q: PayoutsQuery) {
    return this.finance.listPayouts(q);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Reversement individuel immédiat (ex create-payout)' })
  createPayout(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createPayoutSchema)) dto: CreatePayoutDto, @Req() req: FastifyRequest) {
    return this.finance.createPayout(user.id, dto, req.ip);
  }

  @Get('payouts/:id')
  payout(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getPayout(id);
  }

  @Get('payout-batches')
  batches(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.finance.listBatches(q);
  }

  @Post('payout-batches')
  @ApiOperation({ summary: 'Crée un lot de reversements (ex create-payout-batch)' })
  createBatch(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createBatchSchema)) dto: CreateBatchDto, @Req() req: FastifyRequest) {
    return this.finance.createBatch(user.id, dto, req.ip);
  }

  @Get('payout-batches/:id')
  batch(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getBatch(id);
  }

  @Post('payout-batches/:id/process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exécute les transferts FedaPay du lot (ex process-payout-batch)' })
  processBatch(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.finance.processBatch(user.id, id, req.ip);
  }

  @Get('refunds')
  refunds(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.finance.listRefunds(q);
  }

  @Post('refunds')
  @ApiOperation({ summary: 'Remboursement total ou partiel (ex process-refund)' })
  refund(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(refundSchema)) dto: RefundDto, @Req() req: FastifyRequest) {
    return this.finance.refund(user.id, dto, req.ip);
  }

  @Get('held-funds')
  held() {
    return this.finance.heldPayments();
  }

  @Post('held-funds/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Libère les fonds dont la rétention est échue (ex release-held-funds)' })
  release(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.releaseHeldFunds(user.id);
  }

  @Post('balances/repair')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recalcule tous les soldes depuis les paiements (ex repair-balances)' })
  repair(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.finance.repairBalances(user.id, req.ip);
  }

  @Get('reconciliation')
  reconciliations(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.finance.listReconciliations(q);
  }

  @Post('reconciliation')
  @ApiOperation({ summary: 'Réconciliation FedaPay ↔ base (ex reconcile-fedapay)' })
  reconcile(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(reconciliationSchema)) dto: ReconciliationDto, @Req() req: FastifyRequest) {
    return this.finance.reconcile(user.id, dto ?? {}, req.ip);
  }

  @Get('reconciliation/:id')
  reconciliation(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getReconciliation(id);
  }

  @Get('webhook-events')
  webhookEvents(@Query(new ZodValidationPipe(webhookEventsQuerySchema)) q: WebhookEventsQuery) {
    return this.finance.listWebhookEvents(q);
  }

  @Post('webhook-events/:id/retry')
  @HttpCode(200)
  retryWebhook(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.finance.retryWebhookEvent(user.id, id, req.ip);
  }

  @Get('payment-events')
  paymentEvents(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.finance.listPaymentEvents(q);
  }
}
