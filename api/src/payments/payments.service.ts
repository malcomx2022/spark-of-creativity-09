import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, NotImplementedException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, Payment, PaymentStatus, PayoutStatus } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { FEDAPAY_CLIENT, FedaPayError, type FedaPayClient } from './fedapay.client';
import { calculateFees, FINAL_STATUSES, holdUntil, normalizeStatus, OPEN_STATUSES, parseFeeConfig } from './fees';
import { LedgerService } from './ledger.service';
import type { CreatePaymentDto, ListPaymentsQuery } from './payments.dto';

const DEFAULT_APPOINTMENT_AMOUNT = 10_000;
const PAYABLE_STATUSES = ['confirmed', 'pending_payment', 'pending'];

export interface WebhookPayload {
  id?: string;
  name?: string;
  type?: string;
  entity?: { id?: string | number; status?: string; updated_at?: string; [k: string]: unknown };
  [k: string]: unknown;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly inApp: InAppNotificationsService,
    @Inject(FEDAPAY_CLIENT) private readonly fedapay: FedaPayClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Ex get-fedapay-config : clé publique pour le widget checkout côté client. */
  publicConfig() {
    return { publicKey: this.config.FEDAPAY_PUBLIC_KEY ?? (this.config.FEDAPAY_PROVIDER === 'fake' ? 'pk_fake' : null), environment: this.config.FEDAPAY_MODE, provider: this.config.FEDAPAY_PROVIDER };
  }

  // ---------------------------------------------------------------------------
  // Création (ex create-payment)
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreatePaymentDto) {
    if (dto.appointmentId.startsWith('group_session_')) {
      throw new NotImplementedException('Le paiement des séances de groupe sera porté avec le module séances de groupe (étape 5)');
    }
    const appointmentId = dto.appointmentId;

    const { appointment, amount } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const appointment = await trx.selectFrom('appointments').select(['id', 'patient_id', 'status', 'payment_amount', 'practitioner_id', 'specialty']).where('id', '=', appointmentId).executeTakeFirst();
      if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
      if (appointment.patient_id !== userId) throw new ForbiddenException('Ce rendez-vous ne vous appartient pas');
      if (!PAYABLE_STATUSES.includes(appointment.status)) {
        throw new BadRequestException({ statusCode: 400, error: 'NOT_PAYABLE', message: `Ce rendez-vous ne peut pas être payé (statut : ${appointment.status})`, currentStatus: appointment.status, allowedStatuses: PAYABLE_STATUSES });
      }
      const amount = dto.amount ?? appointment.payment_amount ?? DEFAULT_APPOINTMENT_AMOUNT;
      if (!amount || amount <= 0) throw new BadRequestException('Montant invalide');

      // Paiement encore ouvert : bloque 2 min (UX), puis le marque échoué pour permettre une nouvelle tentative.
      const existing = await trx.selectFrom('payments').select(['id', 'status', 'created_at']).where('appointment_id', '=', appointmentId).where('status', 'in', OPEN_STATUSES).orderBy('created_at', 'desc').executeTakeFirst();
      if (existing) {
        const ageMs = Date.now() - existing.created_at.getTime();
        const timeoutMs = this.config.PAYMENT_PENDING_TIMEOUT_MINUTES * 60_000;
        if (ageMs <= timeoutMs) {
          const remaining = Math.ceil((timeoutMs - ageMs) / 60_000);
          throw new ConflictException({
            statusCode: 409, error: 'PAYMENT_IN_PROGRESS',
            message: `Un paiement est en cours de traitement. Veuillez patienter ${remaining} minute(s) ou annulez-le pour recommencer.`,
            paymentId: existing.id, retryAfter: remaining, existingPaymentStatus: existing.status,
          });
        }
        await trx.updateTable('payments').set({ status: 'failed', payout_status: 'failed', updated_at: new Date() }).where('id', '=', existing.id).execute();
        await trx.updateTable('appointments').set({ status: 'confirmed', updated_at: new Date() }).where('id', '=', appointmentId).where('status', '=', 'pending_payment').execute();
      }
      return { appointment, amount };
    });

    // Transaction + token FedaPay (hors transaction SQL : appels réseau).
    const [firstname, ...rest] = dto.payerName.trim().split(/\s+/);
    const lastname = rest.join(' ') || firstname;
    const appBaseUrl = this.config.APP_BASE_URL ?? this.config.FRONTEND_URL;
    const idempotencyKey = `${appointmentId}-${randomUUID()}`;
    let transactionId: string;
    let paymentUrl: string;
    let token: string;
    try {
      const transaction = await this.fedapay.createTransaction({
        amount,
        description: `Paiement rendez-vous médical #${appointmentId}`,
        callbackUrl: `${appBaseUrl}/payment/callback?appointment_id=${appointmentId}`,
        customer: { firstname, lastname, email: dto.payerEmail, phoneNumber: dto.phoneNumber.replace(/^\+229/, ''), country: 'bj' },
        metadata: { appointment_id: appointmentId, user_id: userId, payment_method: dto.paymentMethod, payer_name: dto.payerName, payer_email: dto.payerEmail ?? null, idempotency_key: idempotencyKey },
      });
      transactionId = transaction.id;
      const generated = await this.fedapay.generateToken(transactionId);
      token = generated.token;
      paymentUrl = generated.url;
    } catch (err) {
      await this.recordAttempt(userId, { appointmentId, amount, paymentMethod: dto.paymentMethod, status: 'failed', errorType: 'gateway', errorMessage: err instanceof Error ? err.message : String(err) });
      if (err instanceof FedaPayError) throw new HttpException({ statusCode: 502, error: 'FEDAPAY', message: err.message, details: err.details }, HttpStatus.BAD_GATEWAY);
      throw err;
    }

    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const feeConfig = parseFeeConfig(await this.readSystemConfig(trx, ['payment_commission_rate', 'payment_gateway_fees', 'payment_rounding_mode']));
      const fees = calculateFees(amount, 'XOF', feeConfig);
      const payment = await trx
        .insertInto('payments')
        .values({
          appointment_id: appointmentId, patient_id: userId, amount: fees.amount, currency: fees.currency, payment_method: dto.paymentMethod,
          status: 'initiated', payout_status: 'pending', channel: 'momo',
          fedapay_transaction_id: transactionId, fedapay_payment_url: paymentUrl, idempotency_key: idempotencyKey,
          commission_amount: fees.commissionAmount, gateway_fees_amount: fees.gatewayFeesAmount, fees_amount: fees.feesAmount, net_amount: fees.netAmount,
          hold_until: holdUntil(await this.holdPeriodDays(trx)),
          payer_name: dto.payerName, payer_email: dto.payerEmail ?? null, payer_phone: dto.phoneNumber,
          payment_session_data: JSON.stringify({ token }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.logEvent(trx, payment.id, 'payment.intent.created', { amount: fees.amount, currency: fees.currency, payment_method: dto.paymentMethod, idempotency_key: idempotencyKey });
      await trx.insertInto('payment_attempts').values({ payment_id: payment.id, appointment_id: appointmentId, user_id: userId, status: 'pending', payment_method: dto.paymentMethod, amount }).execute();
      const expiresAt = new Date(Date.now() + this.config.PAYMENT_SLOT_EXPIRY_MINUTES * 60_000);
      await trx.updateTable('appointments').set({ status: 'pending_payment', payment_expires_at: expiresAt, updated_at: new Date() }).where('id', '=', appointmentId).execute();
      await this.inApp.notifyUser(trx, userId, { title: 'Paiement initié', message: 'Votre paiement a été initié. Veuillez suivre les instructions pour compléter la transaction.', type: 'payment' });
      return { success: true, paymentId: payment.id, transactionId, token, paymentUrl, amount: fees.amount, currency: fees.currency, netAmount: fees.netAmount, expiresAt: expiresAt.toISOString(), practitionerId: appointment.practitioner_id };
    });
  }

  private async recordAttempt(userId: string, a: { appointmentId: string; amount: number; paymentMethod: string; status: 'failed' | 'timeout'; errorType: string; errorMessage: string }) {
    await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.insertInto('payment_attempts').values({ appointment_id: a.appointmentId, user_id: userId, status: a.status, error_type: a.errorType, error_message: a.errorMessage.slice(0, 500), payment_method: a.paymentMethod, amount: a.amount, completed_at: new Date() }).execute(),
    ).catch((e) => this.logger.error(`payment_attempts : ${e}`));
  }

  private async readSystemConfig(trx: Transaction<DB>, keys: string[]): Promise<Record<string, unknown>> {
    const rows = await trx.selectFrom('system_config').select(['key', 'value']).where('key', 'in', keys).execute();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  private async holdPeriodDays(trx: Transaction<DB>): Promise<number> {
    const cfg = await this.readSystemConfig(trx, ['payment_hold_period_days']);
    const v = cfg['payment_hold_period_days'] as { days?: number } | number | undefined;
    const days = typeof v === 'number' ? v : v?.days;
    return typeof days === 'number' && days >= 0 ? days : this.config.PAYMENT_HOLD_PERIOD_DAYS;
  }

  private logEvent(trx: Transaction<DB>, paymentId: string, type: string, data: Record<string, unknown>) {
    return trx.insertInto('payment_events').values({ payment_id: paymentId, event_type: type, event_data: JSON.stringify(data) }).execute();
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------
  async listOwn(userId: string, q: ListPaymentsQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      let query = trx
        .selectFrom('payments')
        .selectAll('payments')
        .leftJoin('appointments', 'appointments.id', 'payments.appointment_id')
        .select(['appointments.practitioner_id as appointment_practitioner_id', 'appointments.date as appointment_date', 'appointments.time as appointment_time', 'appointments.practitioner_name as appointment_practitioner_name'])
        .where((eb) => (practitioner ? eb.or([eb('payments.patient_id', '=', userId), eb('appointments.practitioner_id', '=', practitioner.id)]) : eb('payments.patient_id', '=', userId)))
        .orderBy('payments.created_at', 'desc')
        .limit(q.limit);
      if (q.appointmentId) query = query.where('payments.appointment_id', '=', q.appointmentId);
      if (q.status) query = query.where('payments.status', '=', q.status);
      return query.execute();
    });
  }

  async getOwn(userId: string, paymentId: string): Promise<Payment> {
    const payment = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await trx.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirst();
      if (!p) return null;
      if (p.patient_id === userId) return p;
      // appointments.practitioner_id est en TEXT et practitioners.id en UUID : deux requêtes plutôt qu'une jointure.
      const a = await trx.selectFrom('appointments').select('practitioner_id').where('id', '=', p.appointment_id).executeTakeFirst();
      const pr = a ? await trx.selectFrom('practitioners').select('user_id').where('id', '=', a.practitioner_id).executeTakeFirst() : undefined;
      const admin = await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst();
      return pr?.user_id === userId || admin ? p : undefined;
    });
    if (payment === null) throw new NotFoundException('Paiement introuvable');
    if (payment === undefined) throw new ForbiddenException('Accès non autorisé à ce paiement');
    return payment;
  }

  // ---------------------------------------------------------------------------
  // Annulation (ex cancel-pending-payment) et synchronisation (ex sync-payment-status)
  // ---------------------------------------------------------------------------
  async cancelPending(userId: string, paymentId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const payment = await trx.selectFrom('payments').selectAll().where('id', '=', paymentId).where('status', 'in', OPEN_STATUSES).executeTakeFirst();
      if (!payment) throw new NotFoundException('Aucun paiement en attente avec cet identifiant');
      const appointment = await trx.selectFrom('appointments').select(['id', 'patient_id', 'practitioner_id', 'status']).where('id', '=', payment.appointment_id).executeTakeFirst();
      if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
      const practitioner = await trx.selectFrom('practitioners').select('user_id').where('id', '=', appointment.practitioner_id).executeTakeFirst();
      if (payment.patient_id !== userId && practitioner?.user_id !== userId) throw new ForbiddenException('Vous ne pouvez pas annuler ce paiement');
      await this.applyStatus(trx, payment, 'canceled', 'failed', appointment.practitioner_id, null);
      await this.logEvent(trx, payment.id, 'payment.canceled', { by: userId });
      // Le rendez-vous redevient payable (confirmé côté praticien).
      if (appointment.status === 'pending_payment') await trx.updateTable('appointments').set({ status: 'confirmed', updated_at: new Date() }).where('id', '=', appointment.id).execute();
      return { success: true, paymentId, status: 'canceled' as const };
    });
  }

  async sync(userId: string | null, paymentId: string) {
    const payment = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirst());
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (userId) await this.getOwn(userId, paymentId); // contrôle d'accès
    if (!payment.fedapay_transaction_id) throw new BadRequestException({ statusCode: 400, message: 'Paiement sans transaction FedaPay', payment: { id: payment.id, status: payment.status } });
    const remote = await this.fedapay.getTransaction(payment.fedapay_transaction_id);
    const newStatus = normalizeStatus(remote.status);
    if (newStatus === payment.status) return { synced: false, status: payment.status, fedapayStatus: remote.status };
    await this.transition(payment.id, newStatus, remote.status, 'sync');
    return { synced: true, previousStatus: payment.status, status: newStatus, fedapayStatus: remote.status };
  }

  // ---------------------------------------------------------------------------
  // Webhook FedaPay (ex payment-webhook)
  // ---------------------------------------------------------------------------
  /** HMAC-SHA256 hex du corps brut ; accepte aussi le format `t=<ts>,s=<sig>` (signature de `<ts>.<corps>`). */
  verifySignature(rawBody: string, header: string | undefined): boolean {
    const secret = this.config.FEDAPAY_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const candidates: Array<[string, string]> = [];
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=')).filter((kv) => kv.length === 2)) as Record<string, string>;
    if (parts.s) {
      candidates.push([parts.s, parts.t ? `${parts.t}.${rawBody}` : rawBody]);
      candidates.push([parts.s, rawBody]);
    } else {
      candidates.push([header.trim(), rawBody]);
    }
    return candidates.some(([provided, signed]) => {
      const expected = createHmac('sha256', secret).update(signed).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(provided.toLowerCase());
      return a.length === b.length && timingSafeEqual(a, b);
    });
  }

  async handleWebhook(payload: WebhookPayload) {
    const eventType = String(payload.name ?? payload.type ?? 'transaction.update');
    const entity = payload.entity ?? {};
    const transactionId = entity.id !== undefined ? String(entity.id) : null;
    const status = entity.status ? String(entity.status) : null;
    if (!transactionId || !status) throw new BadRequestException("Événement FedaPay sans entité ou sans statut");
    const eventId = payload.id ? String(payload.id) : `${eventType}:${transactionId}:${status}:${entity.updated_at ?? ''}`;

    // Idempotence : un event_id déjà vu n'est pas retraité.
    const claimed = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const inserted = await trx
        .insertInto('webhook_events')
        .values({ event_id: eventId, event_type: eventType, payload: JSON.stringify(payload), processing_status: 'processing' })
        .onConflict((oc) => oc.column('event_id').doNothing())
        .returning('id')
        .executeTakeFirst();
      return !!inserted;
    });
    if (!claimed) return { received: true, duplicate: true, eventId };

    if (eventType.includes('transfer')) {
      // Reversements : portés avec le module finance (étape 5). L'événement est journalisé.
      await this.markWebhook(eventId, 'success', null);
      return { received: true, eventId, handled: false, reason: 'transfer_event_deferred' };
    }
    try {
      const result = await this.transition(null, normalizeStatus(status), status, `webhook:${eventType}`, transactionId);
      await this.markWebhook(eventId, 'success', null);
      return { received: true, eventId, ...result };
    } catch (err) {
      await this.markWebhook(eventId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private markWebhook(eventId: string, status: 'success' | 'failed', error: string | null) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.updateTable('webhook_events').set({ processing_status: status, processed_at: new Date(), error_message: error, ...(status === 'failed' ? { retry_count: sql`coalesce(retry_count,0) + 1`, last_retry_at: new Date() } : {}) }).where('event_id', '=', eventId).execute(),
    );
  }

  /**
   * Transition de statut d'un paiement (webhook, sync, jobs) : met à jour le paiement et les
   * soldes via update_payment_with_balance(), le rendez-vous, le ledger et les notifications.
   */
  async transition(paymentId: string | null, newStatus: PaymentStatus, fedapayStatus: string, source: string, transactionId?: string) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let q = trx.selectFrom('payments').selectAll();
      q = paymentId ? q.where('id', '=', paymentId) : q.where('fedapay_transaction_id', '=', transactionId!);
      const payment = await q.executeTakeFirst();
      if (!payment) throw new NotFoundException(`Paiement introuvable (${paymentId ?? transactionId})`);
      const appointment = await trx.selectFrom('appointments').select(['id', 'practitioner_id', 'patient_id', 'patient_name', 'date', 'time', 'status']).where('id', '=', payment.appointment_id).executeTakeFirst();
      const practitionerId = appointment?.practitioner_id ?? null;

      if (payment.status === newStatus) return { paymentId: payment.id, status: newStatus, changed: false };
      if (FINAL_STATUSES.includes(payment.status) && payment.status === 'paid' && newStatus !== 'refunded' && newStatus !== 'chargeback') {
        // Un paiement payé ne redevient pas pending/failed sur un événement tardif.
        await this.logEvent(trx, payment.id, 'payment.status.ignored', { from: payment.status, to: newStatus, fedapay_status: fedapayStatus, source });
        return { paymentId: payment.id, status: payment.status, changed: false, ignored: true };
      }

      const payoutStatus: PayoutStatus = newStatus === 'paid' ? 'held' : ['failed', 'canceled', 'refunded', 'chargeback'].includes(newStatus) ? 'failed' : (payment.payout_status ?? 'pending');
      const hold = newStatus === 'paid' ? holdUntil(await this.holdPeriodDays(trx)) : payment.hold_until;
      await this.applyStatus(trx, payment, newStatus, payoutStatus, practitionerId, hold);
      await this.logEvent(trx, payment.id, `payment.${newStatus}`, { from: payment.status, fedapay_status: fedapayStatus, source, transaction_id: payment.fedapay_transaction_id });
      await trx.updateTable('payment_attempts').set({ status: newStatus === 'paid' ? 'success' : 'failed', completed_at: new Date() }).where('payment_id', '=', payment.id).where('status', '=', 'pending').execute();

      if (newStatus === 'paid' && appointment) {
        await trx.updateTable('appointments').set({ status: 'confirmed', payment_expires_at: null, updated_at: new Date() }).where('id', '=', appointment.id).execute();
        if (practitionerId) {
          const updated = { ...payment, status: newStatus } as Payment;
          await this.ledger.applyPaidEntries(trx, updated, practitionerId).catch((e) => this.logger.error(`Ledger paiement ${payment.id} : ${e}`));
          const pr = await trx.selectFrom('practitioners').select(['user_id', 'practitioner_type']).where('id', '=', practitionerId).executeTakeFirst();
          if (pr) {
            await this.inApp.notifyUser(trx, pr.user_id, {
              title: '💰 Nouveau paiement reçu',
              message: `Rendez-vous avec ${appointment.patient_name} confirmé pour le ${appointment.date} à ${appointment.time}. Montant reçu : ${payment.net_amount ?? 0} XOF`,
              type: 'appointment', link: pr.practitioner_type === 'coach_sportif' ? '/dashboard/coach?tab=appointments' : '/dashboard/practitioner?tab=appointments',
            });
          }
        }
        await this.inApp.notifyUser(trx, payment.patient_id, { title: 'Paiement confirmé', message: `Votre paiement de ${payment.amount} XOF a été confirmé. Votre rendez-vous est validé.`, type: 'payment', link: '/dashboard/patient' });
      } else if (['failed', 'canceled'].includes(newStatus) && appointment && appointment.status === 'pending_payment' && source.startsWith('webhook')) {
        // Comme payment-webhook : le créneau est libéré ; le patient peut relancer un paiement.
        await trx.updateTable('appointments').set({ status: 'confirmed', updated_at: new Date() }).where('id', '=', appointment.id).execute();
        await this.inApp.notifyUser(trx, payment.patient_id, { title: newStatus === 'failed' ? 'Paiement échoué' : 'Paiement annulé', message: newStatus === 'failed' ? 'Votre paiement a échoué. Veuillez réessayer.' : 'Votre paiement a été annulé.', type: 'payment', link: '/dashboard/patient' });
      }
      if (['approved', 'declined', 'refunded'].includes(fedapayStatus)) {
        await this.notifyFinanceAdmins(trx, fedapayStatus === 'approved' ? 'Paiement reçu' : `Webhook paiement ${fedapayStatus}`, `Événement ${source} pour la transaction ${payment.fedapay_transaction_id} (${fedapayStatus}). Montant : ${payment.amount} XOF.`);
      }
      return { paymentId: payment.id, status: newStatus, previousStatus: payment.status, changed: true };
    });
  }

  /**
   * Mise à jour du statut. Les soldes praticien ne sont PAS modifiés ici : le trigger
   * trigger_update_balance_on_payment (sync_practitioner_balance_from_payments) les recalcule
   * depuis la table payments à chaque changement. Appeler en plus update_payment_with_balance()
   * — comme le faisaient les Edge Functions — doublait le montant en attente (défaut hérité,
   * compensé côté Supabase par repair-balances).
   */
  private async applyStatus(trx: Transaction<DB>, payment: Payment, status: PaymentStatus, payoutStatus: PayoutStatus, _practitionerId: string | null, hold: Date | null) {
    await trx.updateTable('payments').set({ status, payout_status: payoutStatus, hold_until: hold, updated_at: new Date() }).where('id', '=', payment.id).execute();
  }

  private async notifyFinanceAdmins(trx: Transaction<DB>, title: string, message: string) {
    const admins = await trx.selectFrom('user_roles').select('user_id').distinct().where('role', 'in', ['ops', 'finance', 'super_admin']).execute();
    for (const a of admins) await this.inApp.notifyUser(trx, a.user_id, { title, message, type: 'payment', link: '/admin?tab=payments' });
  }

  // ---------------------------------------------------------------------------
  // Jobs (ex auto-sync-pending-payments, cleanup-stuck-payments)
  // ---------------------------------------------------------------------------
  /** Interroge FedaPay pour les paiements ouverts depuis plus de N minutes. */
  async syncStalePayments(staleMinutes = this.config.PAYMENT_STALE_SYNC_MINUTES) {
    const threshold = new Date(Date.now() - staleMinutes * 60_000);
    const stale = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('payments').select(['id', 'status', 'fedapay_transaction_id']).where('status', 'in', OPEN_STATUSES).where('fedapay_transaction_id', 'is not', null).where('created_at', '<', threshold).orderBy('created_at').limit(100).execute(),
    );
    const results = { checked: stale.length, updated: 0, errors: [] as string[] };
    for (const p of stale) {
      try {
        const remote = await this.fedapay.getTransaction(p.fedapay_transaction_id!);
        const newStatus = normalizeStatus(remote.status);
        if (newStatus !== p.status) {
          await this.transition(p.id, newStatus, remote.status, 'job:payments.sync');
          results.updated++;
        }
      } catch (err) {
        results.errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return results;
  }

  /** Annule les paiements ouverts depuis plus de N minutes et libère le rendez-vous. */
  async cleanupStuckPayments(expirationMinutes = this.config.PAYMENT_STUCK_EXPIRATION_MINUTES, dryRun = false) {
    const threshold = new Date(Date.now() - expirationMinutes * 60_000);
    const stuck = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('payments').select(['id', 'status', 'appointment_id']).where('status', 'in', OPEN_STATUSES).where('created_at', '<', threshold).orderBy('created_at').limit(200).execute(),
    );
    const cleaned: Array<{ paymentId: string; oldStatus: PaymentStatus; newStatus: 'canceled' }> = [];
    for (const p of stuck) {
      if (!dryRun) await this.transition(p.id, 'canceled', 'timeout', 'job:payments.cleanup');
      cleaned.push({ paymentId: p.id, oldStatus: p.status, newStatus: 'canceled' });
    }
    if (!dryRun) {
      await this.database.runAs(SERVICE_CONTEXT, (trx) =>
        trx.updateTable('appointments').set({ status: 'confirmed', updated_at: new Date() }).where('id', 'in', stuck.map((s) => s.appointment_id).concat(['-'])).where('status', '=', 'pending_payment').execute(),
      );
    }
    return { dryRun, expirationMinutes, count: cleaned.length, cleaned };
  }
}
