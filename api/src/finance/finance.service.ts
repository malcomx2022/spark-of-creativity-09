import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { normalizePhoneNumber } from '../auth/phone.util';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, LedgerAccountType, LedgerOwnerType, PractitionerPayout } from '../database/types';
import { DispatchService } from '../notifications/dispatch.service';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { BalancesService, parseGroupSessionRef } from '../payments/balances.service';
import { FEDAPAY_CLIENT, FedaPayError, type FedaPayClient } from '../payments/fedapay.client';
import { PaymentsService, type WebhookPayload } from '../payments/payments.service';
import type { AdminPaymentsQuery, CreateBatchDto, CreatePayoutDto, ListQuery, PaymentInfoDto, PayoutsQuery, ReconciliationDto, RefundDto, WebhookEventsQuery } from './finance.dto';
import { toDateOnly, withDateOnly } from '../common/utils/date-only';

const REFUNDABLE = ['paid', 'partially_refunded'];
const ACTIVE_PAYOUT = ['planned', 'sent', 'completed'];

interface ReadyPayment {
  id: string;
  net_due: number;
  created_at: Date;
}

interface PractitionerRef {
  id: string;
  name: string;
  phone: string | null;
  user_id: string;
  kyc_status: string | null;
}
type PayoutDestination =
  | { practitioner: PractitionerRef; skip: string }
  | { practitioner: PractitionerRef; info: { account_holder_name: string; payment_method: string }; mode: string; customer: Record<string, unknown> };

interface Anomaly {
  type: 'missing_in_db' | 'missing_in_fedapay' | 'amount_mismatch' | 'status_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  fedapay_transaction_id?: string;
  db_payment_id?: string;
  fedapay_amount?: number;
  db_amount?: number;
  fedapay_status?: string;
  db_status?: string;
  description: string;
  recommendation: string;
}

/**
 * Finance — port de create-payout, create-payout-batch, process-payout-batch, process-refund,
 * release-held-funds, repair-balances, reconcile-fedapay, retry-failed-webhooks, send-payment-reminders
 * et des écrans FinanceSection / PayoutsManagementSection / RefundsSection / FundsReleaseSection.
 *
 * Règles reprises et corrigées (voir docs) :
 *  - accès réservé aux rôles finance / ops / super_admin (is_admin() acceptait n'importe quel rôle) ;
 *  - un reversement réserve les paiements « prêts » (payout_payments) au lieu de remettre le solde à 0 ;
 *    un reversement échoué ou ignoré libère les fonds ;
 *  - statuts conformes aux contraintes de la base (planned → sent → completed | failed) ;
 *  - les reversements FedaPay sont retrouvés par transaction_ids (et non par la clé primaire) ;
 *  - remboursements : séances de groupe prises en charge, écritures comptables équilibrées,
 *    soldes recalculés (plus de double déduction de balance_on_hold).
 */
@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly payments: PaymentsService,
    private readonly balances: BalancesService,
    private readonly audit: AuditService,
    private readonly dispatch: DispatchService,
    private readonly inApp: InAppNotificationsService,
    @Inject(FEDAPAY_CLIENT) private readonly fedapay: FedaPayClient,
  ) {}

  onModuleInit(): void {
    this.payments.transferHandler = (e) => this.handleTransfer(e);
  }

  // ---------------------------------------------------------------------------
  // Praticien : solde, reversements, informations de paiement
  // ---------------------------------------------------------------------------
  private async practitionerOf(trx: Transaction<DB>, userId: string) {
    const p = await trx.selectFrom('practitioners').select(['id', 'name', 'phone', 'user_id', 'kyc_status']).where('user_id', '=', userId).executeTakeFirst();
    if (!p) throw new ForbiddenException('Compte praticien requis');
    return p;
  }

  async myBalance(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const b = await this.balances.recompute(trx, p.id);
      const row = await trx.selectFrom('practitioner_balances').selectAll().where('practitioner_id', '=', p.id).executeTakeFirstOrThrow();
      return { ...row, changed: b.changed };
    });
  }

  async myPayouts(userId: string, q: ListQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const rows = await trx.selectFrom('practitioner_payouts').selectAll().where('practitioner_id', '=', p.id).orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return rows.map((r) => withDateOnly(r, 'period_start', 'period_end'));
    });
  }

  async getPaymentInfo(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      return trx.selectFrom('practitioner_payment_info').selectAll().where('practitioner_id', '=', p.id).orderBy('updated_at', 'desc').execute();
    });
  }

  /** Upsert sur (practitioner_id, payment_method) comme PaymentInfoSection. */
  async upsertPaymentInfo(userId: string, dto: PaymentInfoDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const bank = dto.paymentMethod === 'bank';
      const values = {
        practitioner_id: p.id, payment_method: dto.paymentMethod, account_holder_name: dto.accountHolderName,
        phone_number: bank ? null : normalizePhoneNumber(dto.phoneNumber!),
        bank_name: bank ? dto.bankName ?? null : null,
        bank_account_number: bank ? (dto.bankAccountNumber ?? '').replace(/\s+/g, '').toUpperCase() : null,
        is_verified: dto.verify,
      };
      return trx
        .insertInto('practitioner_payment_info')
        .values(values)
        .onConflict((oc) => oc.columns(['practitioner_id', 'payment_method']).doUpdateSet({ ...values, updated_at: new Date() }))
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  // ---------------------------------------------------------------------------
  // Admin : tableau de bord
  // ---------------------------------------------------------------------------
  /** admin_finance_stats + held_amount / total_commission / available_amount que FinanceSection attend. */
  async stats() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const r = await sql<Record<string, number>>`
        select
          coalesce(sum(case when status in ('paid', 'partially_refunded', 'completed') then amount else 0 end), 0)::bigint as total_revenue,
          coalesce(sum(case when status in ('paid', 'partially_refunded', 'completed') then coalesce(commission_amount, 0) else 0 end), 0)::bigint as total_commission,
          coalesce(sum(case when status in ('paid', 'partially_refunded') and payout_status = 'held' then coalesce(net_amount, 0) else 0 end), 0)::bigint as held_amount,
          coalesce(sum(case when status in ('paid', 'partially_refunded') and payout_status = 'ready' then coalesce(net_amount, 0) else 0 end), 0)::bigint as available_amount,
          count(case when status in ('pending', 'initiated', 'authorized') then 1 end)::int as pending_payments,
          count(case when status in ('paid', 'partially_refunded', 'completed') then 1 end)::int as completed_payments,
          count(case when status in ('failed', 'canceled') then 1 end)::int as failed_payments,
          (select coalesce(sum(amount), 0) from public.practitioner_payouts where status = 'planned')::bigint as pending_payouts,
          (select coalesce(sum(amount), 0) from public.practitioner_payouts where status in ('sent', 'completed'))::bigint as paid_out,
          (select coalesce(sum(refund_amount), 0) from public.payment_refunds where status = 'completed')::bigint as refunded_amount
        from public.payments`.execute(trx);
      return Object.fromEntries(Object.entries(r.rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
    });
  }

  async listPayments(q: AdminPaymentsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('payments');
      if (q.status) base = base.where('payments.status', '=', q.status as never);
      if (q.payoutStatus) base = base.where('payments.payout_status', '=', q.payoutStatus);
      if (q.from) base = base.where('payments.created_at', '>=', new Date(q.from));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const rows = await base
        .leftJoin('profiles', 'profiles.id', 'payments.patient_id')
        .leftJoin('appointments', 'appointments.id', 'payments.appointment_id')
        .selectAll('payments')
        .select(['profiles.full_name as patient_name', 'profiles.phone as patient_phone', 'appointments.practitioner_name as appointment_practitioner_name', 'appointments.specialty as appointment_specialty', 'appointments.date as appointment_date'])
        .orderBy('payments.created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      // Séances de groupe : nom de la séance et du coach.
      const refs = rows.map((r) => ({ id: r.id, ref: parseGroupSessionRef(r.appointment_id) })).filter((x) => x.ref);
      const sessions = refs.length ? await trx.selectFrom('group_sessions').innerJoin('practitioners', 'practitioners.id', 'group_sessions.coach_id').select(['group_sessions.id', 'group_sessions.session_name', 'practitioners.name as coach_name']).where('group_sessions.id', 'in', refs.map((x) => x.ref!.sessionId)).execute() : [];
      return {
        data: rows.map((r) => {
          const ref = parseGroupSessionRef(r.appointment_id);
          const s = ref ? sessions.find((x) => x.id === ref.sessionId) : undefined;
          return { ...r, group_session_name: s?.session_name ?? null, appointment_practitioner_name: r.appointment_practitioner_name ?? s?.coach_name ?? null };
        }),
        count: Number(count.n),
      };
    });
  }

  async listBalances() {
    return this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx
        .selectFrom('practitioner_balances')
        .innerJoin('practitioners', 'practitioners.id', 'practitioner_balances.practitioner_id')
        .selectAll('practitioner_balances')
        .select(['practitioners.name', 'practitioners.phone', 'practitioners.practitioner_type', 'practitioners.kyc_status'])
        .orderBy('practitioner_balances.balance_available', 'desc')
        .execute(),
    );
  }

  async listPayouts(q: PayoutsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('practitioner_payouts');
      if (q.status) base = base.where('practitioner_payouts.status', '=', q.status);
      if (q.practitionerId) base = base.where('practitioner_payouts.practitioner_id', '=', q.practitionerId);
      if (q.batchId) base = base.where('practitioner_payouts.batch_id', '=', q.batchId);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base
        .innerJoin('practitioners', 'practitioners.id', 'practitioner_payouts.practitioner_id')
        .selectAll('practitioner_payouts')
        .select(['practitioners.name as practitioner_name', 'practitioners.phone as practitioner_phone'])
        .orderBy('practitioner_payouts.created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      return { data, count: Number(count.n) };
    });
  }

  async getPayout(id: string) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const payout = await trx.selectFrom('practitioner_payouts').innerJoin('practitioners', 'practitioners.id', 'practitioner_payouts.practitioner_id').selectAll('practitioner_payouts').select(['practitioners.name as practitioner_name', 'practitioners.phone as practitioner_phone']).where('practitioner_payouts.id', '=', id).executeTakeFirst();
      if (!payout) throw new NotFoundException('Reversement introuvable');
      const payments = await trx.selectFrom('payout_payments').innerJoin('payments', 'payments.id', 'payout_payments.payment_id').select(['payments.id', 'payments.appointment_id', 'payments.amount', 'payments.net_amount', 'payments.status', 'payments.payout_status', 'payments.created_at', 'payout_payments.amount_included']).where('payout_payments.payout_id', '=', id).execute();
      return { ...payout, payments };
    });
  }

  // ---------------------------------------------------------------------------
  // Reversements
  // ---------------------------------------------------------------------------
  /** Paiements « prêts » (status paid, payout_status ready) non réservés par un reversement actif, net dû, du plus ancien au plus récent. */
  private async readyPayments(trx: Transaction<DB>, practitionerId: string, until?: string): Promise<ReadyPayment[]> {
    const r = await sql<ReadyPayment>`
      select p.id, p.created_at,
        (coalesce(p.net_amount, 0) - coalesce((select sum(round(coalesce(p.net_amount, 0)::numeric * r.refund_amount / nullif(p.amount, 0)))::int from public.payment_refunds r where r.payment_id = p.id and r.status = 'completed'), 0))::int as net_due
      from public.payments p
      where p.status in ('paid', 'partially_refunded') and p.payout_status = 'ready'
        and (${until ?? null}::date is null or p.created_at::date <= ${until ?? null}::date)
        and not exists (select 1 from public.payout_payments pp join public.practitioner_payouts po on po.id = pp.payout_id where pp.payment_id = p.id and po.status in ('planned', 'sent', 'completed'))
        and (
          exists (select 1 from public.appointments a where a.id = p.appointment_id and a.practitioner_id = ${practitionerId}::text)
          or (p.appointment_id like 'group_session_%' and exists (select 1 from public.group_sessions gs where gs.coach_id = ${practitionerId}::uuid and p.appointment_id like '%' || gs.id::text || '%'))
        )
      order by p.created_at asc`.execute(trx);
    return r.rows.filter((p) => p.net_due > 0);
  }

  /** Vérifie le praticien (KYC) et ses informations de reversement ; renvoie la destination FedaPay. */
  private async payoutDestination(trx: Transaction<DB>, practitionerId: string, preferred?: 'momo' | 'bank'): Promise<PayoutDestination> {
    const practitioner = await trx.selectFrom('practitioners').select(['id', 'name', 'phone', 'user_id', 'kyc_status']).where('id', '=', practitionerId).executeTakeFirst();
    if (!practitioner) throw new NotFoundException('Praticien introuvable');
    if (practitioner.kyc_status !== 'approved') return { practitioner, skip: `Statut KYC non approuvé (${practitioner.kyc_status ?? 'pending'})` };
    const infos = await trx.selectFrom('practitioner_payment_info').selectAll().where('practitioner_id', '=', practitionerId).orderBy('updated_at', 'desc').execute();
    if (infos.length === 0) return { practitioner, skip: 'Aucune information de paiement configurée' };
    const candidates = preferred ? infos.filter((i) => (preferred === 'bank' ? i.payment_method === 'bank' : i.payment_method !== 'bank')) : infos;
    const info = candidates.find((i) => i.is_verified) ?? candidates[0];
    if (!info) return { practitioner, skip: preferred === 'bank' ? 'Informations bancaires manquantes' : 'Numéro de téléphone Mobile Money manquant' };
    if (!info.is_verified) return { practitioner, skip: 'Informations de paiement non vérifiées' };
    const [firstname, ...rest] = practitioner.name.trim().split(/\s+/);
    const customer = { firstname: firstname || 'Praticien', lastname: rest.join(' ') || firstname || 'Praticien' };
    if (info.payment_method === 'bank') {
      if (!info.bank_account_number || !info.bank_name) return { practitioner, skip: 'Informations bancaires manquantes' };
      return { practitioner, info, mode: 'bank', customer: { ...customer, bankAccount: { number: info.bank_account_number, bank: info.bank_name, holder: info.account_holder_name || practitioner.name } } };
    }
    const phone = info.phone_number ?? practitioner.phone;
    if (!phone) return { practitioner, skip: 'Numéro de téléphone Mobile Money manquant' };
    return { practitioner, info, mode: info.payment_method, customer: { ...customer, phoneNumber: phone.replace(/\D/g, '').replace(/^229/, ''), country: 'bj' } };
  }

  private async transfer(destination: { mode: string; customer: Record<string, unknown> }, amount: number, description: string): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string }> {
    try {
      const p = await this.fedapay.createPayout({ amount, mode: destination.mode, customer: destination.customer as never, description });
      return { ok: true, id: p.id, status: p.status };
    } catch (err) {
      const message = err instanceof FedaPayError ? `${err.message}${err.details ? ` : ${JSON.stringify(err.details).slice(0, 200)}` : ''}` : err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /** Après acceptation FedaPay : paiements versés, solde recalculé, praticien notifié. */
  private async markSent(trx: Transaction<DB>, payout: PractitionerPayout, transferId: string, notify: { userId: string | null; amount: number; mode: string }) {
    await trx.updateTable('practitioner_payouts').set({ status: 'sent', processed_at: new Date(), transaction_ids: [transferId], payment_method: notify.mode }).where('id', '=', payout.id).execute();
    const linked = await trx.selectFrom('payout_payments').select('payment_id').where('payout_id', '=', payout.id).execute();
    if (linked.length) await trx.updateTable('payments').set({ payout_status: 'paid', updated_at: new Date() }).where('id', 'in', linked.map((l) => l.payment_id)).execute();
    await this.balances.recompute(trx, payout.practitioner_id);
    await trx.updateTable('practitioner_balances').set({ last_payout_at: new Date() }).where('practitioner_id', '=', payout.practitioner_id).execute();
    if (notify.userId) {
      const channel = notify.mode === 'mtn' ? 'MTN MoMo' : notify.mode === 'moov' ? 'Moov Money' : notify.mode === 'bank' ? 'bancaire' : notify.mode;
      await this.inApp.notifyUser(trx, notify.userId, { title: '💰 Reversement en cours', message: `Un reversement de ${notify.amount.toLocaleString('fr-FR')} XOF a été initié vers votre compte ${channel}. Les fonds arriveront sous 24-48h.`, type: 'payout', link: '/dashboard/practitioner?tab=payouts' });
    }
  }

  /** Reversement échoué ou ignoré : les paiements réservés redeviennent disponibles. */
  private async markFailed(trx: Transaction<DB>, payoutId: string, practitionerId: string, reason: string, userId: string | null, amount: number) {
    await trx.updateTable('practitioner_payouts').set({ status: 'failed', processed_at: new Date(), account_details: JSON.stringify({ error: reason }) }).where('id', '=', payoutId).execute();
    await trx.deleteFrom('payout_payments').where('payout_id', '=', payoutId).execute();
    await this.balances.recompute(trx, practitionerId);
    if (userId) await this.inApp.notifyUser(trx, userId, { title: '❌ Échec du reversement', message: `Le reversement de ${amount.toLocaleString('fr-FR')} XOF a échoué : ${reason}. Veuillez vérifier vos informations de paiement.`, type: 'payout', link: '/dashboard/practitioner?tab=payouts' });
  }

  /** Ex create-payout : reversement individuel immédiat. `amount` plafonne la somme des paiements prêts (du plus ancien au plus récent). */
  async createPayout(adminId: string, dto: CreatePayoutDto, ip?: string) {
    const prepared = await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const dest = await this.payoutDestination(trx, dto.practitionerId);
      if ('skip' in dest) {
        if (dest.practitioner.kyc_status !== 'approved') throw new BadRequestException({ statusCode: 400, error: 'KYC not completed', message: 'Le praticien doit avoir un KYC approuvé pour recevoir des reversements' });
        throw new BadRequestException({ statusCode: 400, error: 'Payment information not configured', message: `Informations de reversement incomplètes : ${dest.skip}` });
      }
      const today = new Date().toISOString().slice(0, 10);
      const periodStart = dto.period?.start ?? `${today.slice(0, 8)}01`;
      const periodEnd = dto.period?.end ?? today;
      // Un seul reversement individuel actif par période (les lots ont leur propre cycle).
      const duplicate = await trx.selectFrom('practitioner_payouts').select('id').where('practitioner_id', '=', dto.practitionerId).where('batch_id', 'is', null).where('period_start', '=', periodStart).where('period_end', '=', periodEnd).where('status', 'in', ACTIVE_PAYOUT as never).executeTakeFirst();
      if (duplicate) throw new ConflictException({ statusCode: 409, error: 'Payout already exists', message: 'Un reversement existe déjà pour cette période', payoutId: duplicate.id });
      const ready = await this.readyPayments(trx, dto.practitionerId, periodEnd);
      const selected: ReadyPayment[] = [];
      let total = 0;
      for (const p of ready) {
        if (dto.amount !== undefined && total + p.net_due > dto.amount) break;
        selected.push(p);
        total += p.net_due;
      }
      if (total <= 0) throw new BadRequestException({ statusCode: 400, error: 'No funds available', message: dto.amount !== undefined ? 'Aucun paiement prêt ne correspond à ce montant' : 'Aucun paiement prêt à reverser sur cette période' });
      const payout = await trx
        .insertInto('practitioner_payouts')
        .values({ practitioner_id: dto.practitionerId, amount: total, net_amount: total, currency: 'XOF', payment_method: dest.mode, status: 'planned', period_start: periodStart, period_end: periodEnd, account_details: JSON.stringify({ holder: dest.info.account_holder_name, method: dest.info.payment_method }) })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx.insertInto('payout_payments').values(selected.map((p) => ({ payout_id: payout.id, payment_id: p.id, amount_included: p.net_due }))).execute();
      return { payout, dest, total, description: dto.description ?? `Reversement période ${periodStart} - ${periodEnd}` };
    });

    const result = await this.transfer(prepared.dest, prepared.total, prepared.description);
    // Le statut (sent / failed) et l'audit sont validés avant de signaler l'échec au client.
    const outcome = await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const { payout, dest } = prepared;
      if (result.ok) await this.markSent(trx, payout, result.id, { userId: dest.practitioner.user_id, amount: prepared.total, mode: dest.mode });
      else await this.markFailed(trx, payout.id, payout.practitioner_id, result.error, dest.practitioner.user_id, prepared.total);
      await this.audit.log(trx, { adminId, action: 'create_payout', entityType: 'payout', entityId: payout.id, ip, details: { practitioner_id: payout.practitioner_id, practitioner_name: dest.practitioner.name, amount: prepared.total, period: { start: payout.period_start, end: payout.period_end }, transfer_id: result.ok ? result.id : null, transfer_status: result.ok ? 'sent' : 'failed', payout_mode: dest.mode, error: result.ok ? null : result.error } });
      const linked = await trx.selectFrom('payout_payments').select('id').where('payout_id', '=', payout.id).execute();
      return { payoutId: payout.id, paymentsCount: linked.length };
    });
    if (!result.ok) throw new HttpException({ statusCode: 502, error: 'FEDAPAY_PAYOUT', message: result.error, payoutId: outcome.payoutId, status: 'failed', amount: prepared.total }, HttpStatus.BAD_GATEWAY);
    return { payoutId: outcome.payoutId, transferId: result.id, status: 'sent', estimatedArrival: '24-48 hours', amount: prepared.total, currency: 'XOF', paymentsCount: outcome.paymentsCount };
  }

  // ---------------------------------------------------------------------------
  // Lots de reversements
  // ---------------------------------------------------------------------------
  async listBatches(q: ListQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const count = await trx.selectFrom('payout_batches').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = (await trx.selectFrom('payout_batches').selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute()).map((b) => withDateOnly(b, 'batch_date'));
      return { data, count: Number(count.n) };
    });
  }

  async getBatch(id: string) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const batch = await trx.selectFrom('payout_batches').selectAll().where('id', '=', id).executeTakeFirst();
      if (!batch) throw new NotFoundException('Lot introuvable');
      const payouts = await trx.selectFrom('practitioner_payouts').innerJoin('practitioners', 'practitioners.id', 'practitioner_payouts.practitioner_id').selectAll('practitioner_payouts').select(['practitioners.name as practitioner_name', 'practitioners.phone as practitioner_phone']).where('batch_id', '=', id).orderBy('practitioner_payouts.created_at').execute();
      return { ...batch, payouts };
    });
  }

  /** Ex create-payout-batch : un reversement « planned » par praticien ayant des paiements prêts ; les fonds sont réservés, pas remis à zéro. */
  async createBatch(adminId: string, dto: CreateBatchDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const today = new Date().toISOString().slice(0, 10);
      const periodStart = `${today.slice(0, 8)}01`;
      const items: Array<{ practitionerId: string; ready: ReadyPayment[]; total: number }> = [];
      for (const practitionerId of [...new Set(dto.practitionerIds)]) {
        const ready = await this.readyPayments(trx, practitionerId);
        const total = ready.reduce((s, p) => s + p.net_due, 0);
        if (total > 0) items.push({ practitionerId, ready, total });
      }
      if (items.length === 0) throw new BadRequestException('Aucun praticien sélectionné n’a de solde disponible');
      const totalAmount = items.reduce((s, i) => s + i.total, 0);
      const batch = await trx.insertInto('payout_batches').values({ created_by: adminId, payment_method: dto.paymentMethod, total_amount: totalAmount, practitioners_count: items.length, status: 'queued' }).returningAll().executeTakeFirstOrThrow();
      for (const item of items) {
        const payout = await trx
          .insertInto('practitioner_payouts')
          .values({ batch_id: batch.id, practitioner_id: item.practitionerId, amount: item.total, net_amount: item.total, currency: 'XOF', payment_method: dto.paymentMethod, status: 'planned', period_start: periodStart, period_end: today })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx.insertInto('payout_payments').values(item.ready.map((p) => ({ payout_id: payout.id, payment_id: p.id, amount_included: p.net_due }))).execute();
        await this.balances.recompute(trx, item.practitionerId);
      }
      await this.audit.log(trx, { adminId, action: 'create_payout_batch', entityType: 'payout_batch', entityId: batch.id, ip, details: { practitioners_count: items.length, total_amount: totalAmount, payment_method: dto.paymentMethod } });
      return { batchId: batch.id, totalAmount, practitionersCount: items.length };
    });
  }

  /** Ex process-payout-batch : verrou optimiste queued → processing, un transfert FedaPay par reversement. */
  async processBatch(adminId: string, batchId: string, ip?: string) {
    const payouts = await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const batch = await trx.selectFrom('payout_batches').selectAll().where('id', '=', batchId).executeTakeFirst();
      if (!batch) throw new NotFoundException('Lot introuvable');
      if (batch.status === 'sent' || batch.status === 'partially_sent') throw new BadRequestException('Ce lot a déjà été traité');
      if (batch.status === 'processing') throw new ConflictException('Ce lot est en cours de traitement. Veuillez patienter.');
      const locked = await trx.updateTable('payout_batches').set({ status: 'processing', updated_at: new Date() }).where('id', '=', batchId).where('status', 'in', ['queued', 'failed']).returning('id').executeTakeFirst();
      if (!locked) throw new ConflictException('Le statut du lot a changé. Rafraîchissez et réessayez.');
      const rows = await trx.selectFrom('practitioner_payouts').selectAll().where('batch_id', '=', batchId).where('status', '=', 'planned').execute();
      if (rows.length === 0) {
        await trx.updateTable('payout_batches').set({ status: 'failed', updated_at: new Date() }).where('id', '=', batchId).execute();
        throw new NotFoundException('Aucun reversement à traiter dans ce lot');
      }
      return rows;
    });

    const results = { success: [] as string[], failed: [] as Array<{ practitionerId: string; name: string; error: string }>, skipped: [] as Array<{ practitionerId: string; name: string; reason: string }> };
    for (const payout of payouts) {
      const dest = await this.database.runAs(SERVICE_CONTEXT, (trx) => this.payoutDestination(trx, payout.practitioner_id, payout.payment_method === 'bank' ? 'bank' : 'momo'));
      if ('skip' in dest) {
        await this.database.runAs(SERVICE_CONTEXT, (trx) => this.markFailed(trx, payout.id, payout.practitioner_id, dest.skip, dest.practitioner.user_id, payout.amount));
        results.skipped.push({ practitionerId: payout.practitioner_id, name: dest.practitioner.name, reason: dest.skip });
        continue;
      }
      const r = await this.transfer(dest, payout.amount, `Reversement lot ${batchId} — ${dest.practitioner.name}`);
      await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
        if (r.ok) await this.markSent(trx, payout, r.id, { userId: dest.practitioner.user_id, amount: payout.amount, mode: dest.mode });
        else await this.markFailed(trx, payout.id, payout.practitioner_id, r.error, dest.practitioner.user_id, payout.amount);
      });
      if (r.ok) results.success.push(payout.practitioner_id);
      else results.failed.push({ practitionerId: payout.practitioner_id, name: dest.practitioner.name, error: r.error });
    }
    const status = results.failed.length === 0 && results.skipped.length === 0 ? 'sent' : results.success.length === 0 ? 'failed' : 'partially_sent';
    await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      await trx.updateTable('payout_batches').set({ status, processed_at: new Date(), updated_at: new Date() }).where('id', '=', batchId).execute();
      await this.audit.log(trx, { adminId, action: 'process_payout_batch', entityType: 'payout_batch', entityId: batchId, ip, details: { status, success_count: results.success.length, failed_count: results.failed.length, skipped_count: results.skipped.length } });
    });
    return { success: true, batchId, status, results: { successCount: results.success.length, failedCount: results.failed.length, skippedCount: results.skipped.length, failed: results.failed, skipped: results.skipped } };
  }

  /** Webhook FedaPay transfer.* / payout.* : le reversement est retrouvé par transaction_ids. */
  async handleTransfer(e: { transferId: string; status: string; eventType: string; payload: WebhookPayload }): Promise<Record<string, unknown>> {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const payout = await trx.selectFrom('practitioner_payouts').selectAll().where(sql<boolean>`transaction_ids @> array[${e.transferId}]::text[]`).executeTakeFirst();
      if (!payout) return { handled: false, reason: 'payout_not_found', transferId: e.transferId };
      // Un reversement terminé ne bouge plus : un « failed » tardif ou rejoué après « completed » supprimait
      // les liens payout_payments et libérait des fonds déjà versés.
      if (payout.status === 'completed' || payout.status === 'failed') return { handled: true, payoutId: payout.id, status: payout.status, changed: false, ignored: e.status, reason: 'terminal' };
      const practitioner = await trx.selectFrom('practitioners').select(['user_id', 'name']).where('id', '=', payout.practitioner_id).executeTakeFirst();
      const ok = ['approved', 'sent', 'completed', 'transferred'].includes(e.status);
      const ko = ['declined', 'failed', 'canceled', 'cancelled'].includes(e.status);
      if (!ok && !ko) return { handled: true, payoutId: payout.id, status: payout.status, ignored: e.status };
      if (ok) {
        await trx.updateTable('practitioner_payouts').set({ status: 'completed', processed_at: new Date() }).where('id', '=', payout.id).execute();
        if (practitioner?.user_id) await this.inApp.notifyUser(trx, practitioner.user_id, { title: 'Reversement effectué', message: `Votre reversement de ${payout.amount.toLocaleString('fr-FR')} XOF a été effectué avec succès !`, type: 'payout', link: '/dashboard/practitioner?tab=payouts' });
      } else {
        await this.markFailed(trx, payout.id, payout.practitioner_id, `Reversement ${e.status} côté FedaPay`, practitioner?.user_id ?? null, payout.amount);
      }
      await this.payments.notifyFinanceAdmins(trx, ok ? 'Reversement effectué' : 'Reversement échoué', `Webhook ${e.eventType} reçu pour le reversement ${e.transferId} (${e.status}). Montant: ${payout.amount} XOF.`, '/admin?tab=finance');
      await this.audit.log(trx, { adminId: practitioner?.user_id ?? null, action: `transfer.${ok ? 'completed' : 'failed'}`, entityType: 'payout', entityId: payout.id, details: { amount: payout.amount, status: e.status, event_type: e.eventType, transfer_id: e.transferId } });
      return { handled: true, payoutId: payout.id, status: ok ? 'completed' : 'failed', changed: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Remboursements
  // ---------------------------------------------------------------------------
  async listRefunds(q: ListQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const count = await trx.selectFrom('payment_refunds').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await trx
        .selectFrom('payment_refunds')
        .innerJoin('payments', 'payments.id', 'payment_refunds.payment_id')
        .leftJoin('profiles', 'profiles.id', 'payments.patient_id')
        .selectAll('payment_refunds')
        .select(['payments.amount as payment_amount', 'payments.patient_id', 'payments.appointment_id', 'payments.status as payment_status', 'profiles.full_name as patient_name'])
        .orderBy('payment_refunds.created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      return { data, count: Number(count.n) };
    });
  }

  private async ledgerAccount(trx: Transaction<DB>, ownerType: LedgerOwnerType, ownerId: string | null, accountType: LedgerAccountType, currency: string): Promise<string> {
    let q = trx.selectFrom('ledger_accounts').select('id').where('owner_type', '=', ownerType).where('account_type', '=', accountType).where('currency', '=', currency);
    q = ownerId === null ? q.where('owner_id', 'is', null) : q.where('owner_id', '=', ownerId);
    const existing = await q.executeTakeFirst();
    if (existing) return existing.id;
    return (await trx.insertInto('ledger_accounts').values({ owner_type: ownerType, owner_id: ownerId, account_type: accountType, currency }).returning('id').executeTakeFirstOrThrow()).id;
  }

  /** Ex process-refund : remboursement FedaPay total ou partiel, écritures comptables, soldes recalculés. */
  async refund(adminId: string, dto: RefundDto, ip?: string) {
    const prepared = await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const payment = await trx.selectFrom('payments').selectAll().where('id', '=', dto.paymentId).executeTakeFirst();
      if (!payment) throw new NotFoundException('Paiement introuvable');
      if (!REFUNDABLE.includes(payment.status)) throw new BadRequestException(`Seuls les paiements payés ou partiellement remboursés peuvent être remboursés (statut : ${payment.status})`);
      const transactionId = payment.fedapay_transaction_id;
      if (!transactionId) throw new BadRequestException('Paiement sans transaction FedaPay');
      const done = await trx.selectFrom('payment_refunds').select('refund_amount').where('payment_id', '=', payment.id).where('status', '=', 'completed').execute();
      const totalRefunded = done.reduce((s, r) => s + r.refund_amount, 0);
      const remaining = payment.amount - totalRefunded;
      if (remaining <= 0) throw new BadRequestException('Ce paiement a déjà été intégralement remboursé');
      if (dto.refundAmount !== undefined && dto.refundAmount > remaining) throw new BadRequestException(`Le montant ne peut pas dépasser ${remaining.toLocaleString('fr-FR')} XOF`);
      const actual = dto.refundAmount ?? remaining;
      const practitionerId = await this.payments.practitionerOf(trx, payment.appointment_id);
      return { payment: { ...payment, fedapay_transaction_id: transactionId }, actual, totalRefunded, practitionerId };
    });

    let provider: { id: string; status: string };
    try {
      provider = await this.fedapay.refundTransaction(prepared.payment.fedapay_transaction_id, prepared.actual);
    } catch (err) {
      throw new HttpException({ statusCode: 502, error: 'FEDAPAY_REFUND', message: `Le remboursement a été refusé par le prestataire de paiement : ${err instanceof Error ? err.message : err}` }, HttpStatus.BAD_GATEWAY);
    }

    // Le statut rendu par FedaPay fait foi : un remboursement encore « pending » chez lui n'est pas
    // enregistré terminé ici, ni imputé au praticien, tant qu'il n'est pas confirmé.
    const settled = ['approved', 'completed', 'refunded', 'sent', 'success'].includes(provider.status.toLowerCase());
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const { payment, actual, totalRefunded, practitionerId } = prepared;
      const refund = await trx.insertInto('payment_refunds').values({ payment_id: payment.id, refund_amount: actual, refund_reason: dto.reason, refunded_by: adminId, provider_refund_id: provider.id, status: settled ? 'completed' : 'pending', processed_at: settled ? new Date() : null }).returningAll().executeTakeFirstOrThrow();
      if (!settled) {
        await trx.insertInto('payment_events').values({ payment_id: payment.id, event_type: 'payment.refund.pending', event_data: JSON.stringify({ refund_id: refund.id, amount: actual, provider_status: provider.status, by: adminId }) }).execute();
        await this.payments.notifyFinanceAdmins(trx, 'Remboursement en attente de confirmation', `FedaPay a répondu « ${provider.status} » pour le remboursement de ${actual.toLocaleString('fr-FR')} XOF du paiement ${payment.id}. Il sera comptabilisé à sa confirmation.`, '/admin?tab=finance');
        await this.audit.log(trx, { adminId, action: 'process_refund', entityType: 'payment', entityId: payment.id, ip, details: { refund_amount: actual, reason: dto.reason, refund_id: refund.id, provider_refund_id: provider.id, provider_status: provider.status, settled: false } });
        return { refundId: refund.id, refundAmount: actual, status: 'pending', paymentStatus: payment.status, netRefund: 0 };
      }
      const full = totalRefunded + actual >= payment.amount;
      await trx.updateTable('payments').set({ status: full ? 'refunded' : 'partially_refunded', updated_at: new Date() }).where('id', '=', payment.id).execute();
      await trx.insertInto('payment_events').values({ payment_id: payment.id, event_type: full ? 'payment.refunded' : 'payment.partially_refunded', event_data: JSON.stringify({ refund_id: refund.id, amount: actual, reason: dto.reason, by: adminId }) }).execute();
      const ref = parseGroupSessionRef(payment.appointment_id);
      if (ref && full) {
        await trx.updateTable('group_session_participants').set({ payment_status: 'refunded' }).where('id', '=', ref.participantId).execute();
        await this.payments.refreshParticipantCount(trx, ref.sessionId);
      }
      const netRefund = Math.round((payment.net_amount ?? 0) * (actual / payment.amount));
      if (practitionerId) {
        const cur = payment.currency;
        // Écriture équilibrée : sortie de trésorerie = part praticien + part commission reprises.
        const [cash, payable, commission] = await Promise.all([
          this.ledgerAccount(trx, 'platform', null, 'cash', cur),
          this.ledgerAccount(trx, 'practitioner', practitionerId, 'payable', cur),
          this.ledgerAccount(trx, 'platform', null, 'revenue_commission', cur),
        ]);
        const base = { reference_type: 'refund', reference_id: refund.id, currency: cur };
        await trx
          .insertInto('ledger_entries')
          .values(
            [
              { account_id: cash, debit: 0, credit: actual, description: 'Refund to patient', ...base },
              { account_id: payable, debit: netRefund, credit: 0, description: 'Refund deducted from practitioner', ...base },
              { account_id: commission, debit: actual - netRefund, credit: 0, description: 'Commission reversed', ...base },
            ].filter((e) => e.debit > 0 || e.credit > 0),
          )
          .execute();
        await this.balances.recompute(trx, practitionerId);
      }
      await this.inApp.notifyUser(trx, payment.patient_id, { title: 'Remboursement effectué', message: `💰 Votre paiement de ${actual.toLocaleString('fr-FR')} XOF a été remboursé.${dto.reason ? ` Motif : ${dto.reason}` : ''}`, type: 'payment', link: '/dashboard/patient' });
      await this.audit.log(trx, { adminId, action: 'process_refund', entityType: 'payment', entityId: payment.id, ip, details: { refund_amount: actual, reason: dto.reason, refund_id: refund.id, provider_refund_id: provider.id, full } });
      return { refundId: refund.id, refundAmount: actual, status: 'completed', paymentStatus: full ? 'refunded' : 'partially_refunded', netRefund };
    });
  }

  // ---------------------------------------------------------------------------
  // Libération des fonds, réparation, réconciliation
  // ---------------------------------------------------------------------------
  /** Ex release-held-funds : held → ready une fois hold_until dépassé. */
  async releaseHeldFunds(adminId?: string) {
    const due = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('payments').select(['id', 'appointment_id', 'amount', 'net_amount']).where('payout_status', '=', 'held').where('status', 'in', REFUNDABLE as never).where('hold_until', '<', new Date()).orderBy('hold_until').limit(500).execute());
    const results = { total: due.length, released: 0, failed: 0, errors: [] as Array<{ payment_id: string; error: string }> };
    for (const p of due) {
      try {
        await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
          const practitionerId = await this.payments.practitionerOf(trx, p.appointment_id);
          if (!practitionerId) throw new Error('Practitioner ID not found');
          await trx.updateTable('payments').set({ payout_status: 'ready', updated_at: new Date() }).where('id', '=', p.id).execute();
          await trx.insertInto('payment_events').values({ payment_id: p.id, event_type: 'funds_released', event_data: JSON.stringify({ old_status: 'held', new_status: 'ready', amount: p.net_amount ?? p.amount, practitioner_id: practitionerId, released_at: new Date().toISOString(), by: adminId ?? 'job' }) }).execute();
          await this.balances.recompute(trx, practitionerId);
        });
        results.released++;
      } catch (err) {
        results.failed++;
        results.errors.push({ payment_id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (adminId) await this.database.runAs(SERVICE_CONTEXT, (trx) => this.audit.log(trx, { adminId, action: 'release_held_funds', entityType: 'payments', details: results }));
    return { success: true, results };
  }

  async heldPayments() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const rows = await trx.selectFrom('payments').leftJoin('appointments', 'appointments.id', 'payments.appointment_id').select(['payments.id', 'payments.amount', 'payments.net_amount', 'payments.hold_until', 'payments.created_at', 'payments.appointment_id', 'appointments.practitioner_id', 'appointments.practitioner_name']).where('payments.payout_status', '=', 'held').where('payments.status', 'in', REFUNDABLE as never).orderBy('payments.hold_until', 'asc').execute();
      const now = Date.now();
      const amount = (r: (typeof rows)[number]) => r.net_amount ?? r.amount;
      return { data: rows, ready_count: rows.filter((r) => r.hold_until && r.hold_until.getTime() <= now).length, total_held_amount: rows.reduce((s, r) => s + amount(r), 0), ready_amount: rows.filter((r) => r.hold_until && r.hold_until.getTime() <= now).reduce((s, r) => s + amount(r), 0) };
    });
  }

  /** Ex repair-balances. */
  async repairBalances(adminId: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const result = await this.balances.repairAll(trx);
      await this.audit.log(trx, { adminId, action: 'repair_balances', entityType: 'practitioner_balances', ip, details: result });
      return { success: true, message: 'Réparation des balances terminée', result };
    });
  }

  /** Ex reconcile-fedapay : compare les transactions FedaPay et la table payments sur une période. */
  async reconcile(adminId: string, dto: ReconciliationDto, ip?: string) {
    // Borne haute à la fin du jour demandé : à minuit, les transactions du dernier jour manquaient d'un
    // côté et sortaient en fausses anomalies à chaque rapport.
    const end = dto.periodEnd ? new Date(`${dto.periodEnd.slice(0, 10)}T23:59:59.999Z`) : new Date();
    const start = dto.periodStart ? new Date(dto.periodStart) : new Date(end.getTime() - 7 * 86_400_000);
    if (start > end) throw new BadRequestException('La date de début doit précéder la date de fin');
    const report = await this.database.runAs({ role: 'service_role', userId: adminId }, (trx) => trx.insertInto('reconciliation_reports').values({ created_by: adminId, period_start: start, period_end: end, status: 'in_progress' }).returning('id').executeTakeFirstOrThrow());
    try {
      const remote = await this.fedapay.listTransactions(start, end);
      const local = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('payments').select(['id', 'amount', 'status', 'fedapay_transaction_id']).where('created_at', '>=', start).where('created_at', '<=', end).execute());
      const remoteMap = new Map(remote.map((t) => [t.id, t]));
      const localMap = new Map(local.filter((p) => p.fedapay_transaction_id).map((p) => [p.fedapay_transaction_id!, p]));
      const anomalies: Anomaly[] = [];
      let matched = 0;
      let discrepancy = 0;
      const statusMap: Record<string, string> = { approved: 'paid', transferred: 'paid', pending: 'pending', processing: 'pending', declined: 'failed', failed: 'failed', canceled: 'canceled', refunded: 'refunded' };
      for (const t of remote) {
        const p = localMap.get(t.id);
        if (!p) {
          anomalies.push({ type: 'missing_in_db', severity: 'high', fedapay_transaction_id: t.id, fedapay_amount: t.amount, fedapay_status: t.status, description: `Transaction FedaPay ${t.id} (${t.amount ?? '?'} XOF) n'existe pas dans la base de données`, recommendation: 'Créer manuellement le paiement dans la base de données ou vérifier si la transaction a été annulée' });
          continue;
        }
        matched++;
        if (t.amount !== undefined && t.amount !== p.amount) {
          const d = Math.abs(t.amount - p.amount);
          discrepancy += d;
          anomalies.push({ type: 'amount_mismatch', severity: d > 1000 ? 'critical' : 'medium', fedapay_transaction_id: t.id, db_payment_id: p.id, fedapay_amount: t.amount, db_amount: p.amount, description: `Écart de montant: FedaPay=${t.amount} XOF, DB=${p.amount} XOF (différence: ${d} XOF)`, recommendation: "Vérifier la source de l'écart et corriger le montant dans la base de données" });
        }
        const expected = statusMap[t.status] ?? t.status;
        const localStatus = p.status === 'partially_refunded' ? 'paid' : p.status;
        if (expected !== localStatus) {
          anomalies.push({ type: 'status_mismatch', severity: 'medium', fedapay_transaction_id: t.id, db_payment_id: p.id, fedapay_status: t.status, db_status: p.status, description: `Incohérence de statut: FedaPay=${t.status}, DB=${p.status}`, recommendation: 'Mettre à jour le statut dans la base de données pour correspondre à FedaPay (POST /admin/payments/:id/sync)' });
        }
      }
      for (const p of local) {
        if (p.fedapay_transaction_id && !remoteMap.has(p.fedapay_transaction_id)) {
          anomalies.push({ type: 'missing_in_fedapay', severity: 'high', db_payment_id: p.id, fedapay_transaction_id: p.fedapay_transaction_id, db_amount: p.amount, db_status: p.status, description: `Paiement DB ${p.id} référence une transaction FedaPay ${p.fedapay_transaction_id} qui n'existe pas`, recommendation: "Vérifier si la transaction FedaPay a été supprimée ou si l'ID est incorrect" });
        }
      }
      const count = (type: Anomaly['type']) => anomalies.filter((a) => a.type === type).length;
      const critical = anomalies.filter((a) => a.severity === 'critical').length;
      const high = anomalies.filter((a) => a.severity === 'high').length;
      const recommendations: string[] = [];
      if (critical) recommendations.push(`🚨 ${critical} anomalie(s) critique(s) détectée(s). Action immédiate requise.`);
      if (count('missing_in_db')) recommendations.push(`⚠️ ${count('missing_in_db')} transaction(s) FedaPay non enregistrée(s) dans la base. Synchroniser les webhooks ou créer manuellement les paiements.`);
      if (count('missing_in_fedapay')) recommendations.push(`⚠️ ${count('missing_in_fedapay')} paiement(s) en base référencent des transactions FedaPay inexistantes. Vérifier les ID de transaction.`);
      if (count('amount_mismatch')) recommendations.push(`💰 ${count('amount_mismatch')} écart(s) de montant détecté(s). Vérifier les frais et commissions.`);
      recommendations.push(anomalies.length === 0 ? '✅ Aucune anomalie détectée. Tous les paiements sont cohérents entre FedaPay et la base de données.' : `📊 Total: ${anomalies.length} anomalie(s) à traiter.`);
      const summary = { total_fedapay_transactions: remote.length, total_db_payments: local.length, matched_count: matched, missing_in_db_count: count('missing_in_db'), missing_in_fedapay_count: count('missing_in_fedapay'), amount_mismatch_count: count('amount_mismatch'), status_mismatch_count: count('status_mismatch'), total_amount_discrepancy: discrepancy };
      await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
        await trx.updateTable('reconciliation_reports').set({ status: 'completed', ...summary, anomalies: JSON.stringify(anomalies), recommendations: JSON.stringify(recommendations), completed_at: new Date(), updated_at: new Date() }).where('id', '=', report.id).execute();
        await this.audit.log(trx, { adminId, action: 'reconcile_fedapay', entityType: 'reconciliation_report', entityId: report.id, ip, details: summary });
        if (anomalies.length > 0) {
          const admins = await trx.selectFrom('user_roles').select('user_id').distinct().where('role', 'in', ['finance', 'ops', 'compliance', 'super_admin']).execute();
          const detail = critical ? `${critical} anomalie(s) critique(s)` : high ? `${high} anomalie(s) majeure(s)` : `${anomalies.length} anomalie(s)`;
          for (const a of admins) await this.inApp.notifyUser(trx, a.user_id, { title: 'Anomalies de réconciliation détectées', message: `Réconciliation FedaPay du ${start.toISOString().slice(0, 10)} au ${end.toISOString().slice(0, 10)}: ${detail} détectée(s). Rapport #${report.id}.`, type: 'reconciliation', link: '/admin?tab=finance' });
        }
      });
      return { success: true, report_id: report.id, summary: { ...summary, anomalies_count: anomalies.length }, anomalies, recommendations };
    } catch (err) {
      await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('reconciliation_reports').set({ status: 'failed', recommendations: JSON.stringify([`Échec : ${err instanceof Error ? err.message : err}`]), updated_at: new Date() }).where('id', '=', report.id).execute()).catch(() => undefined);
      throw err;
    }
  }

  listReconciliations(q: ListQuery) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('reconciliation_reports').selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute());
  }

  async getReconciliation(id: string) {
    const r = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('reconciliation_reports').selectAll().where('id', '=', id).executeTakeFirst());
    if (!r) throw new NotFoundException('Rapport introuvable');
    return r;
  }

  // ---------------------------------------------------------------------------
  // Webhooks et événements de paiement (WebhooksSection, PaymentEventsSection)
  // ---------------------------------------------------------------------------
  async listWebhookEvents(q: WebhookEventsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('webhook_events');
      if (q.status) base = base.where('processing_status', '=', q.status);
      if (q.eventType) base = base.where('event_type', '=', q.eventType);
      if (q.from) base = base.where('created_at', '>=', new Date(`${q.from}T00:00:00`));
      if (q.to) base = base.where('created_at', '<=', new Date(`${q.to}T23:59:59`));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      const types = await trx.selectFrom('webhook_events').select('event_type').distinct().orderBy('event_type').execute();
      const stats = await sql<Record<string, number>>`select count(*)::int as total, count(*) filter (where processing_status = 'success')::int as processed, count(*) filter (where processing_status in ('pending', 'processing'))::int as pending, count(*) filter (where processing_status = 'failed')::int as failed, count(*) filter (where processing_status = 'permanently_failed')::int as permanently_failed from public.webhook_events`.execute(trx);
      return { data, count: Number(count.n), stats: stats.rows[0], eventTypes: types.map((t) => t.event_type) };
    });
  }

  /** Rejeu immédiat d'un webhook (échoué ou définitivement échoué). */
  async retryWebhookEvent(adminId: string, id: string, ip?: string) {
    const event = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('webhook_events').selectAll().where('id', '=', id).executeTakeFirst());
    if (!event) throw new NotFoundException('Webhook introuvable');
    if (event.processing_status === 'success') throw new BadRequestException('Ce webhook a déjà été traité avec succès');
    const payload = event.payload as WebhookPayload;
    const entity = payload.entity ?? {};
    let outcome: { status: 'success' | 'failed'; result?: unknown; error?: string };
    try {
      const result = await this.payments.processWebhook(payload, String(payload.name ?? payload.type ?? event.event_type), String(entity.id ?? ''), String(entity.status ?? ''));
      outcome = { status: 'success', result };
    } catch (err) {
      outcome = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
    await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      await trx.updateTable('webhook_events').set({ processing_status: outcome.status, processed_at: new Date(), retry_count: (event.retry_count ?? 0) + 1, last_retry_at: new Date(), error_message: outcome.error ?? null }).where('id', '=', id).execute();
      await this.audit.log(trx, { adminId, action: 'retry_webhook', entityType: 'webhook_event', entityId: id, ip, details: { event_id: event.event_id, outcome: outcome.status, error: outcome.error ?? null } });
    });
    return { eventId: event.event_id, ...outcome };
  }

  listPaymentEvents(q: ListQuery) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('payment_events').selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute());
  }

  // ---------------------------------------------------------------------------
  // Rappels de paiement (ex send-payment-reminders) — un rappel par 24 h et par inscription
  // ---------------------------------------------------------------------------
  async sendPaymentReminders() {
    const pending = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx
        .selectFrom('group_session_participants as p')
        .innerJoin('group_sessions as s', 's.id', 'p.session_id')
        .select(['p.id', 'p.patient_id', 'p.session_id', 's.session_name', 's.scheduled_date', 's.start_time', 's.price_per_person', 's.status'])
        .where('p.payment_status', '=', 'pending')
        .where('p.joined_at', '<', new Date(Date.now() - 24 * 3_600_000))
        .where('s.status', 'in', ['planifiee', 'confirmee'])
        .where('s.scheduled_date', '>=', new Date().toISOString().slice(0, 10))
        .execute(),
    );
    let sent = 0;
    const errors: Array<{ participant_id: string; error: string }> = [];
    for (const p of pending) {
      const link = `/dashboard/patient?tab=group-sessions&participant=${p.id}`;
      const recent = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('notifications').select('id').where('user_id', '=', p.patient_id).where('type', '=', 'payment_reminder').where('link', '=', link).where('created_at', '>', new Date(Date.now() - 24 * 3_600_000)).executeTakeFirst());
      if (recent) continue;
      const date = toDateOnly(p.scheduled_date);
      const formatted = new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      try {
        await this.dispatch.dispatch({ userId: p.patient_id, title: '⏰ Rappel de paiement', message: `Votre inscription à la séance "${p.session_name}" le ${formatted} à ${p.start_time} est en attente de paiement (${p.price_per_person} XOF). Finalisez votre paiement pour confirmer votre place.`, type: 'payment_reminder', link, channels: ['sms', 'push'] });
        sent++;
      } catch (err) {
        errors.push({ participant_id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { success: true, reminders_sent: sent, total_pending: pending.length, errors };
  }
}
