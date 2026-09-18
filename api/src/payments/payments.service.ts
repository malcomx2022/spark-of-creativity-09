import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { normalizePhoneNumber } from '../auth/phone.util';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, Payment, PaymentStatus, PayoutStatus } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { BalancesService, parseGroupSessionRef } from './balances.service';
import { FEDAPAY_CLIENT, FedaPayError, fedapayMode, type FedaPayClient } from './fedapay.client';
import { calculateFees, holdUntil, normalizeStatus, OPEN_STATUSES, parseFeeConfig } from './fees';
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

export type PaymentTarget =
  | { kind: 'appointment'; appointmentId: string; practitionerId: string; patientId: string; appointment: { id: string; patient_id: string; status: string; payment_amount: number | null; practitioner_id: string; patient_name: string; date: Date | string; time: string; specialty: string } }
  | { kind: 'group_session'; appointmentId: string; practitionerId: string; patientId: string; session: { id: string; coach_id: string; session_name: string; price_per_person: number; status: string | null; scheduled_date: Date | string; start_time: string }; participant: { id: string; patient_id: string; payment_status: string | null } };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: LedgerService,
    private readonly inApp: InAppNotificationsService,
    private readonly balances: BalancesService,
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
  /**
   * Cible d'un paiement : rendez-vous (appointments.id) ou inscription à une séance de groupe
   * (appointment_id = group_session_{sessionId}_{participantId}, convention héritée).
   */
  async resolveTarget(trx: Transaction<DB>, appointmentId: string): Promise<PaymentTarget> {
    const ref = parseGroupSessionRef(appointmentId);
    if (ref) {
      const session = await trx.selectFrom('group_sessions').select(['id', 'coach_id', 'session_name', 'price_per_person', 'status', 'scheduled_date', 'start_time']).where('id', '=', ref.sessionId).executeTakeFirst();
      if (!session) throw new NotFoundException('Séance de groupe non trouvée');
      const participant = await trx.selectFrom('group_session_participants').select(['id', 'patient_id', 'payment_status']).where('id', '=', ref.participantId).where('session_id', '=', ref.sessionId).executeTakeFirst();
      if (!participant) throw new NotFoundException('Inscription à la séance non trouvée');
      return { kind: 'group_session', appointmentId, practitionerId: session.coach_id, patientId: participant.patient_id, session, participant };
    }
    const appointment = await trx.selectFrom('appointments').select(['id', 'patient_id', 'status', 'payment_amount', 'practitioner_id', 'patient_name', 'date', 'time', 'specialty']).where('id', '=', appointmentId).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    return { kind: 'appointment', appointmentId, practitionerId: appointment.practitioner_id, patientId: appointment.patient_id, appointment };
  }

  async create(userId: string, dto: CreatePaymentDto) {
    const appointmentId = dto.appointmentId;

    const { target, amount, existing } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const target = await this.resolveTarget(trx, appointmentId);
      let amount: number;
      if (target.kind === 'group_session') {
        if (target.patientId !== userId) throw new ForbiddenException("Vous n'êtes pas autorisé à payer pour cette inscription");
        if (target.participant.payment_status === 'paid') throw new BadRequestException('Cette inscription est déjà payée');
        if (target.session.status === 'annulee') throw new BadRequestException('Cette séance a été annulée');
        if (target.session.status === 'terminee') throw new BadRequestException('Cette séance est terminée');
        // Le montant est celui de la séance : le client ne le choisit pas (correction de register-group-session).
        amount = target.session.price_per_person;
      } else {
        const appointment = target.appointment;
        if (appointment.patient_id !== userId) throw new ForbiddenException('Ce rendez-vous ne vous appartient pas');
        if (!PAYABLE_STATUSES.includes(appointment.status)) {
          throw new BadRequestException({ statusCode: 400, error: 'NOT_PAYABLE', message: `Ce rendez-vous ne peut pas être payé (statut : ${appointment.status})`, currentStatus: appointment.status, allowedStatuses: PAYABLE_STATUSES });
        }
        // Le tarif est fixé par le praticien à l'acceptation (appointments.service) : le client ne
        // le choisit pas. Un montant différent est refusé plutôt qu'ignoré, pour que l'écart remonte
        // au lieu de passer inaperçu. Sans tarif enregistré (rendez-vous antérieur), le montant
        // proposé est accepté à défaut de mieux.
        const tarif = appointment.payment_amount;
        if (tarif != null && tarif > 0) {
          if (dto.amount !== undefined && dto.amount !== tarif) {
            throw new BadRequestException({ statusCode: 400, error: 'AMOUNT_MISMATCH', message: `Le montant doit être celui fixé pour ce rendez-vous (${tarif} XOF)`, expectedAmount: tarif });
          }
          amount = tarif;
        } else {
          amount = dto.amount ?? DEFAULT_APPOINTMENT_AMOUNT;
        }
      }
      if (!amount || amount <= 0) throw new BadRequestException('Montant invalide');

      // Un rendez-vous déjà encaissé ne se repaie pas.
      const paid = await trx.selectFrom('payments').select('id').where('appointment_id', '=', appointmentId).where('status', 'in', ['paid', 'partially_refunded']).executeTakeFirst();
      if (paid) throw new ConflictException({ statusCode: 409, error: 'ALREADY_PAID', message: 'Ce rendez-vous est déjà payé', paymentId: paid.id });

      // Paiement encore ouvert : bloque 2 min (UX) ; au-delà il est remplacé, après vérification chez FedaPay.
      const existing = await trx.selectFrom('payments').select(['id', 'status', 'created_at', 'fedapay_transaction_id']).where('appointment_id', '=', appointmentId).where('status', 'in', OPEN_STATUSES).orderBy('created_at', 'desc').executeTakeFirst();
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
      }
      return { target, amount, existing };
    });

    // Le paiement périmé n'est pas simplement marqué échoué : le lien FedaPay restait payable, et une
    // approbation tardive après un second paiement débitait le patient deux fois. On interroge FedaPay :
    // approuvé entre-temps → il est comptabilisé et le rendez-vous est payé, pas de second encaissement ;
    // sinon il est annulé ici ET chez FedaPay.
    if (existing) {
      if (existing.fedapay_transaction_id) {
        const remote = await this.fedapay.getTransaction(existing.fedapay_transaction_id).catch(() => null);
        if (remote && normalizeStatus(remote.status) === 'paid') {
          await this.transition(existing.id, 'paid', remote.status, 'create:replace');
          throw new ConflictException({ statusCode: 409, error: 'ALREADY_PAID', message: 'Ce paiement vient d’être confirmé', paymentId: existing.id });
        }
      }
      await this.cancelOpen(existing.id, 'create:replace', 'timeout');
    }

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
        description: target.kind === 'group_session' ? `Inscription séance: ${target.session.session_name}` : `Paiement rendez-vous médical #${appointmentId}`,
        callbackUrl: `${appBaseUrl}/payment/callback?appointment_id=${appointmentId}`,
        // Numéro au format international et moyen choisi (`mtn_open` / `moov`) comme dans les exemples FedaPay.
        customer: { firstname, lastname, email: dto.payerEmail, phoneNumber: normalizePhoneNumber(dto.phoneNumber), country: 'bj' },
        metadata: { appointment_id: appointmentId, user_id: userId, payment_method: dto.paymentMethod, payer_name: dto.payerName, payer_email: dto.payerEmail ?? null, idempotency_key: idempotencyKey },
        mode: fedapayMode(dto.paymentMethod),
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
      // Le contrôle du paiement ouvert et cette insertion ne partagent pas de transaction (appel FedaPay
      // entre les deux) : l'index partiel payments_one_open_per_appointment arbitre deux appels simultanés.
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
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === '23505') {
            this.fedapay.cancelTransaction(transactionId).catch(() => undefined);
            throw new ConflictException({ statusCode: 409, error: 'PAYMENT_IN_PROGRESS', message: 'Un paiement vient d’être créé pour ce rendez-vous. Veuillez patienter.' });
          }
          throw err;
        });
      await this.logEvent(trx, payment.id, 'payment.intent.created', { amount: fees.amount, currency: fees.currency, payment_method: dto.paymentMethod, idempotency_key: idempotencyKey });
      await trx.insertInto('payment_attempts').values({ payment_id: payment.id, appointment_id: appointmentId, user_id: userId, status: 'pending', payment_method: dto.paymentMethod, amount }).execute();
      let expiresAt: Date | null = null;
      if (target.kind === 'appointment') {
        expiresAt = new Date(Date.now() + this.config.PAYMENT_SLOT_EXPIRY_MINUTES * 60_000);
        await trx.updateTable('appointments').set({ status: 'pending_payment', payment_expires_at: expiresAt, updated_at: new Date() }).where('id', '=', appointmentId).execute();
      }
      await this.inApp.notifyUser(trx, userId, { title: 'Paiement initié', message: 'Votre paiement a été initié. Veuillez suivre les instructions pour compléter la transaction.', type: 'payment' });
      return { success: true, paymentId: payment.id, transactionId, token, paymentUrl, amount: fees.amount, currency: fees.currency, netAmount: fees.netAmount, expiresAt: expiresAt?.toISOString() ?? null, practitionerId: target.practitionerId };
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
  /** Praticien bénéficiaire d'un paiement (rendez-vous ou coach d'une séance de groupe). appointments.practitioner_id est en TEXT et practitioners.id en UUID : pas de jointure. */
  async practitionerOf(trx: Transaction<DB>, appointmentId: string): Promise<string | null> {
    const ref = parseGroupSessionRef(appointmentId);
    if (ref) return (await trx.selectFrom('group_sessions').select('coach_id').where('id', '=', ref.sessionId).executeTakeFirst())?.coach_id ?? null;
    return (await trx.selectFrom('appointments').select('practitioner_id').where('id', '=', appointmentId).executeTakeFirst())?.practitioner_id ?? null;
  }

  /** Historique des tentatives (PaymentAttemptsHistory), limité au propriétaire. */
  listAttempts(userId: string, appointmentId?: string) {
    return this.database.runAs({ role: 'service_role', userId }, (trx) => {
      let q = trx.selectFrom('payment_attempts').selectAll().where('user_id', '=', userId);
      if (appointmentId) q = q.where('appointment_id', '=', appointmentId);
      return q.orderBy('created_at', 'desc').limit(100).execute();
    });
  }

  async listOwn(userId: string, q: ListPaymentsQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      const sessions = practitioner ? await trx.selectFrom('group_sessions').select('id').where('coach_id', '=', practitioner.id).execute() : [];
      let query = trx
        .selectFrom('payments')
        .selectAll('payments')
        .leftJoin('appointments', 'appointments.id', 'payments.appointment_id')
        .select(['appointments.practitioner_id as appointment_practitioner_id', 'appointments.date as appointment_date', 'appointments.time as appointment_time', 'appointments.practitioner_name as appointment_practitioner_name'])
        .where((eb) =>
          practitioner
            ? eb.or([eb('payments.patient_id', '=', userId), eb('appointments.practitioner_id', '=', practitioner.id), ...sessions.map((s) => eb('payments.appointment_id', 'like', `group_session_${s.id}_%`))])
            : eb('payments.patient_id', '=', userId),
        )
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
      const practitionerId = await this.practitionerOf(trx, p.appointment_id);
      const pr = practitionerId ? await trx.selectFrom('practitioners').select('user_id').where('id', '=', practitionerId).executeTakeFirst() : undefined;
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
    await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const payment = await trx.selectFrom('payments').select(['id', 'patient_id', 'appointment_id']).where('id', '=', paymentId).where('status', 'in', OPEN_STATUSES).executeTakeFirst();
      if (!payment) throw new NotFoundException('Aucun paiement en attente avec cet identifiant');
      const target = await this.resolveTarget(trx, payment.appointment_id);
      const practitioner = await trx.selectFrom('practitioners').select('user_id').where('id', '=', target.practitionerId).executeTakeFirst();
      if (payment.patient_id !== userId && practitioner?.user_id !== userId) throw new ForbiddenException('Vous ne pouvez pas annuler ce paiement');
      await this.logEvent(trx, payment.id, 'payment.canceled', { by: userId });
    });
    await this.cancelOpen(paymentId, `user:${userId}`);
    return { success: true, paymentId, status: 'canceled' as const };
  }

  /**
   * Annule un paiement encore ouvert, ici et chez FedaPay. Sans l'annulation distante, le lien de
   * paiement restait valide après l'annulation locale : le patient pouvait le régler plus tard, et
   * l'approbation tardive s'ajoutait au paiement de remplacement (double encaissement). L'appel
   * distant est au mieux : un refus n'empêche pas l'annulation locale. Le rendez-vous redevient
   * payable ; l'inscription à une séance de groupe reste en attente.
   */
  async cancelOpen(paymentId: string, source: string, fedapayStatus = 'canceled'): Promise<boolean> {
    const payment = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('payments').select(['id', 'appointment_id', 'fedapay_transaction_id']).where('id', '=', paymentId).where('status', 'in', OPEN_STATUSES).executeTakeFirst());
    if (!payment) return false;
    if (payment.fedapay_transaction_id) {
      await this.fedapay.cancelTransaction(payment.fedapay_transaction_id).catch((e) => this.logger.warn(`annulation FedaPay ${payment.fedapay_transaction_id} : ${e instanceof Error ? e.message : e}`));
    }
    await this.transition(payment.id, 'canceled', fedapayStatus, source);
    if (!parseGroupSessionRef(payment.appointment_id)) {
      await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('appointments').set({ status: 'confirmed', updated_at: new Date() }).where('id', '=', payment.appointment_id).where('status', '=', 'pending_payment').execute());
    }
    return true;
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

  /**
   * Fenêtre d'acceptation d'un webhook. L'historique (payment-webhook) rejetait un événement de plus
   * de cinq minutes en production, trente en sandbox ; le port l'avait perdu, et un événement signé
   * capturé restait rejouable sans limite. L'horodatage vient de l'en-tête « t=… » quand FedaPay le
   * fournit, sinon de created_at dans le corps (secondes, millisecondes ou ISO). Sans horodatage,
   * l'événement est accepté, comme avant : l'idempotence par event_id reste le second rempart.
   */
  webhookTimestampError(header: string | undefined, rawBody: string): string | null {
    const parts = Object.fromEntries((header ?? '').split(',').map((kv) => kv.trim().split('=')).filter((kv) => kv.length === 2)) as Record<string, string>;
    let ts: number | null = parts.t ? Number(parts.t) : null;
    if (ts === null) {
      try {
        const c = (JSON.parse(rawBody) as { created_at?: unknown }).created_at;
        if (typeof c === 'number') ts = c;
        else if (typeof c === 'string') { const ms = Date.parse(c); ts = Number.isNaN(ms) ? Number(c) : ms / 1000; }
      } catch { /* corps illisible : la validation du corps s'en charge */ }
    }
    if (ts === null || !Number.isFinite(ts)) return null;
    if (ts > 1e12) ts /= 1000; // millisecondes
    const sandbox = this.config.FEDAPAY_MODE === 'sandbox';
    const diff = Date.now() / 1000 - ts;
    if (diff > (sandbox ? 1800 : 300)) return 'Webhook trop ancien';
    if (diff < -(sandbox ? 300 : 60)) return 'Horodatage du webhook dans le futur';
    return null;
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

    try {
      const result = await this.processWebhook(payload, eventType, transactionId, status);
      await this.markWebhook(eventId, 'success', null);
      return { received: true, eventId, ...result };
    } catch (err) {
      await this.markWebhook(eventId, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** Traitement d'un événement FedaPay (transaction ou reversement) — réutilisé par le rejeu des webhooks échoués. */
  async processWebhook(payload: WebhookPayload, eventType: string, transactionId: string, status: string): Promise<Record<string, unknown>> {
    if (eventType.includes('transfer') || eventType.includes('payout')) {
      if (!this.transferHandler) return { handled: false, reason: 'transfer_handler_missing' };
      return this.transferHandler({ transferId: transactionId, status, eventType, payload });
    }
    return this.transition(null, normalizeStatus(status), status, `webhook:${eventType}`, transactionId);
  }

  /** Enregistré par FinanceService (évite la dépendance circulaire payments ↔ finance). */
  transferHandler: ((e: { transferId: string; status: string; eventType: string; payload: WebhookPayload }) => Promise<Record<string, unknown>>) | null = null;

  /**
   * Rejeu des webhooks en échec (ex retry-failed-webhooks) : backoff 2^(n+1) minutes, 5 tentatives
   * maximum puis `permanently_failed` et alerte des administrateurs ops/finance.
   */
  async retryFailedWebhooks(limit = 10, force = false) {
    const MAX_RETRIES = 5;
    // Un événement réservé (processing) dont le traitement a été interrompu — arrêt du processus entre
    // la réservation et le traitement, qui sont deux transactions — n'aurait jamais été repris : le
    // rejeu ne lit que les « failed ». Passé dix minutes, il lui est rendu.
    await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.updateTable('webhook_events').set({ processing_status: 'failed', error_message: 'Traitement interrompu : réservé depuis plus de 10 minutes' }).where('processing_status', '=', 'processing').where('created_at', '<', new Date(Date.now() - 10 * 60_000)).execute(),
    );
    const failed = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('webhook_events').selectAll().where('processing_status', '=', 'failed').where('retry_count', '<', MAX_RETRIES).orderBy('created_at', 'asc').limit(limit).execute(),
    );
    const results: Array<Record<string, unknown>> = [];
    let retried = 0;
    let permanentlyFailed = 0;
    for (const w of failed) {
      const retryCount = w.retry_count ?? 0;
      const backoffMs = 2 ** (retryCount + 1) * 60_000;
      const last = (w.last_retry_at ?? w.created_at).getTime();
      if (!force && Date.now() < last + backoffMs) {
        results.push({ event_id: w.event_id, status: 'waiting', next_retry_in: `${Math.ceil((last + backoffMs - Date.now()) / 60_000)}m` });
        continue;
      }
      const payload = w.payload as WebhookPayload;
      const entity = payload.entity ?? {};
      try {
        const r = await this.processWebhook(payload, String(payload.name ?? payload.type ?? w.event_type), String(entity.id ?? ''), String(entity.status ?? ''));
        await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('webhook_events').set({ processing_status: 'success', processed_at: new Date(), retry_count: retryCount + 1, last_retry_at: new Date(), error_message: null }).where('id', '=', w.id).execute());
        retried++;
        results.push({ event_id: w.event_id, status: 'success', result: r });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const next = retryCount + 1;
        if (next >= MAX_RETRIES) {
          await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
            await trx.updateTable('webhook_events').set({ processing_status: 'permanently_failed', retry_count: next, last_retry_at: new Date(), error_message: `Max retries atteint: ${message}` }).where('id', '=', w.id).execute();
            await this.notifyFinanceAdmins(trx, '⚠️ Webhook échoué définitivement', `Le webhook ${w.event_id} a échoué après ${MAX_RETRIES} tentatives. Intervention manuelle requise.`, '/admin?tab=webhooks');
          });
          permanentlyFailed++;
          results.push({ event_id: w.event_id, status: 'permanently_failed', error: message });
        } else {
          await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('webhook_events').set({ retry_count: next, last_retry_at: new Date(), error_message: message }).where('id', '=', w.id).execute());
          results.push({ event_id: w.event_id, status: 'failed', next_retry_in: `${2 ** (next + 1)}m` });
        }
      }
    }
    return { retried, permanently_failed: permanentlyFailed, total_processed: failed.length, results };
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
      const ref = parseGroupSessionRef(payment.appointment_id);
      const appointment = ref ? undefined : await trx.selectFrom('appointments').select(['id', 'practitioner_id', 'patient_id', 'patient_name', 'date', 'time', 'status']).where('id', '=', payment.appointment_id).executeTakeFirst();
      const session = ref ? await trx.selectFrom('group_sessions').select(['id', 'coach_id', 'session_name']).where('id', '=', ref.sessionId).executeTakeFirst() : undefined;
      const practitionerId = appointment?.practitioner_id ?? session?.coach_id ?? null;

      // Un « refunded » reçu après un remboursement partiel enregistré ici ne doit pas passer le
      // paiement en remboursement intégral : la somme des remboursements tranche. Sans remboursement
      // local (opération faite depuis le tableau de bord FedaPay), le statut distant fait foi.
      if (newStatus === 'refunded') {
        const done = await trx.selectFrom('payment_refunds').select('refund_amount').where('payment_id', '=', payment.id).where('status', '=', 'completed').execute();
        const refunded = done.reduce((s, r) => s + r.refund_amount, 0);
        if (refunded > 0 && refunded < payment.amount) newStatus = 'partially_refunded';
      }

      if (payment.status === newStatus) return { paymentId: payment.id, status: newStatus, changed: false };
      if (['paid', 'partially_refunded'].includes(payment.status) && !['refunded', 'partially_refunded', 'chargeback'].includes(newStatus)) {
        // Un paiement payé ne redevient pas pending/failed sur un événement tardif.
        await this.logEvent(trx, payment.id, 'payment.status.ignored', { from: payment.status, to: newStatus, fedapay_status: fedapayStatus, source });
        return { paymentId: payment.id, status: payment.status, changed: false, ignored: true };
      }

      if (newStatus === 'paid') {
        // Double encaissement : un autre paiement de ce rendez-vous est déjà encaissé (approbation tardive
        // d'un paiement remplacé, par exemple). Celui-ci est enregistré payé — l'argent est bien arrivé —
        // mais exclu des soldes (payout_status = failed) et signalé à la finance pour remboursement.
        const other = await trx.selectFrom('payments').select('id').where('appointment_id', '=', payment.appointment_id).where('id', '!=', payment.id).where('status', 'in', ['paid', 'partially_refunded']).executeTakeFirst();
        if (other) {
          await this.applyStatus(trx, payment, 'paid', 'failed', practitionerId, null);
          await this.logEvent(trx, payment.id, 'payment.duplicate', { duplicate_of: other.id, from: payment.status, fedapay_status: fedapayStatus, source, transaction_id: payment.fedapay_transaction_id });
          await trx.updateTable('payment_attempts').set({ status: 'success', completed_at: new Date() }).where('payment_id', '=', payment.id).where('status', '=', 'pending').execute();
          await this.notifyFinanceAdmins(trx, '⚠️ Double paiement à rembourser', `Le paiement ${payment.id} (${payment.amount} XOF, transaction ${payment.fedapay_transaction_id}) a été encaissé alors que ${other.id} l'était déjà pour ${payment.appointment_id}. Rembourser le doublon.`, '/admin?tab=finance');
          return { paymentId: payment.id, status: 'paid', previousStatus: payment.status, changed: true, duplicateOf: other.id };
        }
      }

      // Un paiement déjà reversé au praticien (payout_status = paid) le reste : l'argent est parti.
      const payoutStatus: PayoutStatus = newStatus === 'paid' ? 'held' : ['failed', 'canceled', 'refunded', 'chargeback'].includes(newStatus) ? (payment.payout_status === 'paid' ? 'paid' : 'failed') : (payment.payout_status ?? 'pending');
      const hold = newStatus === 'paid' ? holdUntil(await this.holdPeriodDays(trx)) : payment.hold_until;
      await this.applyStatus(trx, payment, newStatus, payoutStatus, practitionerId, hold);
      await this.logEvent(trx, payment.id, `payment.${newStatus}`, { from: payment.status, fedapay_status: fedapayStatus, source, transaction_id: payment.fedapay_transaction_id });
      await trx.updateTable('payment_attempts').set({ status: newStatus === 'paid' ? 'success' : 'failed', completed_at: new Date() }).where('payment_id', '=', payment.id).where('status', '=', 'pending').execute();

      if (newStatus === 'paid' && ref && session) {
        // Séance de groupe : la place est confirmée ; current_participants = inscrits payés.
        await trx.updateTable('group_session_participants').set({ payment_status: 'paid' }).where('id', '=', ref.participantId).execute();
        await this.refreshParticipantCount(trx, session.id);
        const updated = { ...payment, status: newStatus } as Payment;
        await this.ledger.applyPaidEntries(trx, updated, session.coach_id).catch((e) => this.logger.error(`Ledger paiement ${payment.id} : ${e}`));
        const coach = await trx.selectFrom('practitioners').select('user_id').where('id', '=', session.coach_id).executeTakeFirst();
        if (coach) await this.inApp.notifyUser(trx, coach.user_id, { title: '💰 Nouveau paiement reçu', message: `Un participant a payé pour votre séance de groupe "${session.session_name}". Montant: ${payment.net_amount ?? 0} XOF`, type: 'payment', link: '/dashboard/coach?tab=sessions' });
        await this.inApp.notifyUser(trx, payment.patient_id, { title: 'Paiement confirmé', message: `Votre paiement de ${payment.amount} XOF a été confirmé. Votre place pour la séance "${session.session_name}" est validée.`, type: 'payment', link: '/dashboard/patient?tab=group-sessions' });
      } else if (['failed', 'canceled'].includes(newStatus) && ref && source.startsWith('webhook')) {
        // L'inscription reste « pending » (seule valeur autorisée par la contrainte) : le patient peut réessayer.
        await this.inApp.notifyUser(trx, payment.patient_id, { title: newStatus === 'failed' ? 'Paiement échoué' : 'Paiement annulé', message: newStatus === 'failed' ? 'Votre paiement a échoué. Veuillez réessayer pour confirmer votre place.' : 'Votre paiement a été annulé.', type: 'payment', link: '/dashboard/patient?tab=group-sessions' });
      } else if (newStatus === 'paid' && appointment) {
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
   * Mise à jour du statut. Les soldes praticien ne sont jamais incrémentés : ils sont toujours
   * recalculés depuis la table payments (trigger hérité + BalancesService.recompute qui couvre
   * aussi les séances de groupe). Appeler update_payment_with_balance() comme les Edge Functions
   * doublait le montant en attente (défaut hérité, compensé côté Supabase par repair-balances).
   */
  private async applyStatus(trx: Transaction<DB>, payment: Payment, status: PaymentStatus, payoutStatus: PayoutStatus, practitionerId: string | null, hold: Date | null) {
    await trx.updateTable('payments').set({ status, payout_status: payoutStatus, hold_until: hold, updated_at: new Date() }).where('id', '=', payment.id).execute();
    // Le trigger ignore les séances de groupe : recalcul complet (rendez-vous + séances) après coup.
    if (practitionerId) await this.balances.recompute(trx, practitionerId);
  }

  /** current_participants = inscrits payés (le trigger hérité update_participants_count n'existe plus dans le schéma final). */
  async refreshParticipantCount(trx: Transaction<DB>, sessionId: string): Promise<number> {
    const r = await trx.selectFrom('group_session_participants').select((eb) => eb.fn.countAll<string>().as('n')).where('session_id', '=', sessionId).where('payment_status', '=', 'paid').executeTakeFirstOrThrow();
    const n = Number(r.n);
    await trx.updateTable('group_sessions').set({ current_participants: n, updated_at: new Date() }).where('id', '=', sessionId).execute();
    return n;
  }

  async notifyFinanceAdmins(trx: Transaction<DB>, title: string, message: string, link = '/admin?tab=payments') {
    const admins = await trx.selectFrom('user_roles').select('user_id').distinct().where('role', 'in', ['ops', 'finance', 'super_admin']).execute();
    for (const a of admins) await this.inApp.notifyUser(trx, a.user_id, { title, message, type: 'payment', link });
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
      trx.selectFrom('payments').select(['id', 'status', 'appointment_id', 'fedapay_transaction_id']).where('status', 'in', OPEN_STATUSES).where('created_at', '<', threshold).orderBy('created_at').limit(200).execute(),
    );
    const cleaned: Array<{ paymentId: string; oldStatus: PaymentStatus; newStatus: 'canceled' | 'paid' }> = [];
    for (const p of stuck) {
      if (dryRun) { cleaned.push({ paymentId: p.id, oldStatus: p.status, newStatus: 'canceled' }); continue; }
      // Un paiement Mobile Money peut dépasser le délai : FedaPay est interrogé avant d'annuler. Approuvé,
      // il est comptabilisé ; sinon il est annulé ici et chez FedaPay, et le rendez-vous redevient payable.
      const remote = p.fedapay_transaction_id ? await this.fedapay.getTransaction(p.fedapay_transaction_id).catch(() => null) : null;
      if (remote && normalizeStatus(remote.status) === 'paid') {
        await this.transition(p.id, 'paid', remote.status, 'job:payments.cleanup');
        cleaned.push({ paymentId: p.id, oldStatus: p.status, newStatus: 'paid' });
        continue;
      }
      await this.cancelOpen(p.id, 'job:payments.cleanup', 'timeout');
      cleaned.push({ paymentId: p.id, oldStatus: p.status, newStatus: 'canceled' });
    }
    return { dryRun, expirationMinutes, count: cleaned.length, cleaned };
  }
}
