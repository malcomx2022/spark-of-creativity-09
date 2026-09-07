import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { DisputesService } from '../disputes/disputes.service';
import { FinanceService } from '../finance/finance.service';
import { PaymentsService } from '../payments/payments.service';

export type JobName = 'consultations.tick' | 'payments.sync' | 'payments.cleanup' | 'funds.release' | 'webhooks.retry' | 'payments.reminders' | 'disputes.sla' | 'maintenance.cleanup';

export interface JobDefinition {
  name: JobName;
  /** Intervalle d'exécution (ms) dans le worker. */
  everyMs: number;
  description: string;
}

/** Remplace les Edge Functions planifiées ; chaque job est aussi exécutable via POST /admin/jobs/:name/run. */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  readonly definitions: JobDefinition[] = [
    { name: 'consultations.tick', everyMs: 5 * 60_000, description: 'cleanup_expired_payment_slots(), request_consultation_confirmation(), auto_confirm_consultations() (ex schedule-consultation-tasks)' },
    { name: 'payments.sync', everyMs: 10 * 60_000, description: 'Resynchronise les paiements ouverts depuis FedaPay (ex auto-sync-pending-payments)' },
    { name: 'payments.cleanup', everyMs: 15 * 60_000, description: 'Annule les paiements bloqués et libère les rendez-vous (ex cleanup-stuck-payments)' },
    { name: 'funds.release', everyMs: 60 * 60_000, description: 'Libère les fonds retenus dont hold_until est dépassé (ex release-held-funds, horaire)' },
    { name: 'webhooks.retry', everyMs: 5 * 60_000, description: 'Rejoue les webhooks FedaPay en échec avec backoff exponentiel (ex retry-failed-webhooks)' },
    { name: 'payments.reminders', everyMs: 6 * 60 * 60_000, description: 'Rappelle les inscriptions aux séances de groupe en attente de paiement depuis plus de 24 h (ex send-payment-reminders)' },
    { name: 'disputes.sla', everyMs: 60 * 60_000, description: 'Passe en priorité haute les litiges dont le délai de traitement est dépassé (ex check_overdue_disputes)' },
    { name: 'maintenance.cleanup', everyMs: 24 * 60 * 60_000, description: 'Rétention quotidienne : cleanup_old_* (limites OTP > 7 j, journaux d’accès fichiers, tentatives de paiement et activité de recherche > 90 j), repair_missing_profiles() ; comptes orphelins comptés, supprimés seulement avec deleteOrphans=true' },
  ];

  constructor(private readonly database: DatabaseService, private readonly payments: PaymentsService, private readonly finance: FinanceService, private readonly disputes: DisputesService) {}

  /** Verrou consultatif PostgreSQL : un seul exécutant par job, même avec plusieurs workers. */
  async run(name: JobName, options: Record<string, unknown> = {}) {
    const lockKey = hashKey(name);
    const startedAt = Date.now();
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const lock = (await sql<{ ok: boolean }>`select pg_try_advisory_xact_lock(${lockKey}) as ok`.execute(trx)).rows[0]?.ok;
      if (!lock) return { job: name, skipped: true, reason: 'already_running' };
      let result: unknown;
      switch (name) {
        case 'consultations.tick': {
          await sql`select cleanup_expired_payment_slots()`.execute(trx);
          await sql`select request_consultation_confirmation()`.execute(trx);
          await sql`select auto_confirm_consultations()`.execute(trx);
          const rows = await trx.selectFrom('appointments').select(['status']).where('status', 'in', ['pending_payment', 'awaiting_confirmation', 'cancelled_unpaid']).execute();
          result = { pending_payment: rows.filter((r) => r.status === 'pending_payment').length, awaiting_confirmation: rows.filter((r) => r.status === 'awaiting_confirmation').length, cancelled_unpaid: rows.filter((r) => r.status === 'cancelled_unpaid').length };
          break;
        }
        case 'payments.sync':
          result = await this.payments.syncStalePayments(typeof options.staleMinutes === 'number' ? options.staleMinutes : undefined);
          break;
        case 'payments.cleanup':
          result = await this.payments.cleanupStuckPayments(typeof options.expirationMinutes === 'number' ? options.expirationMinutes : undefined, options.dryRun === true);
          break;
        case 'funds.release':
          result = await this.finance.releaseHeldFunds();
          break;
        case 'webhooks.retry':
          result = await this.payments.retryFailedWebhooks(typeof options.limit === 'number' ? options.limit : undefined, options.force === true);
          break;
        case 'payments.reminders':
          result = await this.finance.sendPaymentReminders();
          break;
        case 'disputes.sla':
          result = await this.disputes.escalateOverdue();
          break;
        case 'maintenance.cleanup': {
          // Fonctions SQL héritées, jamais planifiées chez Supabase (aucun pg_cron versionné) : exécutées une fois par jour.
          const executed = ['cleanup_old_otp_rate_limits', 'cleanup_old_file_access_logs', 'cleanup_old_payment_attempts', 'cleanup_old_search_activity_logs'];
          for (const fn of executed) await sql`select ${sql.raw(fn)}()`.execute(trx);
          // Comptes sans profil ni fiche praticien depuis plus de 24 h : compte-rendu par défaut, suppression explicite.
          const orphans = (await sql<{ n: string }>`select count(*) as n from public.users u left join public.profiles p on p.id = u.id where p.id is null and u.created_at < now() - interval '24 hours' and not exists (select 1 from public.practitioners pr where pr.user_id = u.id)`.execute(trx)).rows[0];
          const orphansDeleted = options.deleteOrphans === true ? (await sql<{ r: unknown }>`select cleanup_orphan_accounts() as r`.execute(trx)).rows[0]?.r ?? null : null;
          const repairedProfiles = (await sql<{ r: unknown }>`select repair_missing_profiles() as r`.execute(trx)).rows[0]?.r ?? null;
          result = { executed, orphanCandidates: Number(orphans?.n ?? 0), orphansDeleted, repairedProfiles };
          break;
        }
      }
      this.logger.log(`job ${name} terminé en ${Date.now() - startedAt} ms`);
      return { job: name, skipped: false, durationMs: Date.now() - startedAt, result };
    });
  }
}

function hashKey(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}
