import { Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import type { DB } from '../database/types';

/** Préfixe de payments.appointment_id pour les séances de groupe : group_session_{sessionId}_{participantId}. */
export const GROUP_SESSION_PREFIX = 'group_session_';

export function parseGroupSessionRef(appointmentId: string): { sessionId: string; participantId: string } | null {
  if (!appointmentId.startsWith(GROUP_SESSION_PREFIX)) return null;
  const parts = appointmentId.split('_');
  if (parts.length < 4) return null;
  return { sessionId: parts[2], participantId: parts[parts.length - 1] };
}

export interface BalanceSnapshot {
  practitioner_id: string;
  balance_available: number;
  balance_pending: number;
  balance_on_hold: number;
}

/**
 * Soldes praticien recalculés depuis la table payments — port de repair_practitioner_balances().
 *
 * Le trigger hérité trigger_update_balance_on_payment (sync_practitioner_balance_from_payments)
 * ne voit que les paiements liés à un rendez-vous ; les paiements de séances de groupe
 * (appointment_id = group_session_…) en étaient exclus, d'où des soldes de coach faux que
 * repair-balances corrigeait après coup. L'API recalcule donc systématiquement le solde
 * complet après chaque changement de paiement, en plus du trigger.
 */
@Injectable()
export class BalancesService {
  private ownerFilter(practitionerId: string) {
    return sql`(
      exists (select 1 from public.appointments a where a.id = p.appointment_id and a.practitioner_id = ${practitionerId}::text)
      or (p.appointment_id like 'group_session_%' and exists (
        select 1 from public.group_sessions gs where gs.coach_id = ${practitionerId}::uuid and p.appointment_id like '%' || gs.id::text || '%'))
    )`;
  }

  async compute(trx: Transaction<DB>, practitionerId: string): Promise<BalanceSnapshot> {
    // Montant net encore dû : net_amount moins la part nette des remboursements partiels ;
    // un paiement réservé par un reversement en cours (payout_payments) n'est plus « disponible ».
    const r = await sql<{ on_hold: number; available: number; pending: number }>`
      with p as (
        select p.*, coalesce(p.net_amount, 0) - coalesce((
          select sum(round(coalesce(p.net_amount, 0)::numeric * r.refund_amount / nullif(p.amount, 0)))::int
          from public.payment_refunds r where r.payment_id = p.id and r.status = 'completed'), 0) as net_due,
          exists (select 1 from public.payout_payments pp join public.practitioner_payouts po on po.id = pp.payout_id
                  where pp.payment_id = p.id and po.status in ('planned', 'sent', 'completed')) as reserved
        from public.payments p where ${this.ownerFilter(practitionerId)}
      )
      select
        coalesce(sum(case when p.status in ('paid', 'partially_refunded') and p.payout_status = 'held' then p.net_due else 0 end), 0)::int as on_hold,
        coalesce(sum(case when p.status in ('paid', 'partially_refunded') and p.payout_status = 'ready' and not p.reserved then p.net_due else 0 end), 0)::int as available,
        coalesce(sum(case when p.status in ('initiated', 'pending') and p.payout_status = 'pending' then p.net_due else 0 end), 0)::int as pending
      from p`.execute(trx);
    const row = r.rows[0];
    return { practitioner_id: practitionerId, balance_on_hold: row?.on_hold ?? 0, balance_available: row?.available ?? 0, balance_pending: row?.pending ?? 0 };
  }

  /** Recalcule et enregistre (upsert) le solde d'un praticien ; renvoie le solde et s'il a changé. */
  async recompute(trx: Transaction<DB>, practitionerId: string): Promise<BalanceSnapshot & { changed: boolean }> {
    const expected = await this.compute(trx, practitionerId);
    const current = await trx.selectFrom('practitioner_balances').select(['balance_available', 'balance_pending', 'balance_on_hold']).where('practitioner_id', '=', practitionerId).executeTakeFirst();
    const changed = !current || current.balance_available !== expected.balance_available || current.balance_pending !== expected.balance_pending || current.balance_on_hold !== expected.balance_on_hold;
    if (changed) {
      await trx
        .insertInto('practitioner_balances')
        .values({ practitioner_id: practitionerId, balance_available: expected.balance_available, balance_pending: expected.balance_pending, balance_on_hold: expected.balance_on_hold, currency: 'XOF' })
        .onConflict((oc) => oc.column('practitioner_id').doUpdateSet({ balance_available: expected.balance_available, balance_pending: expected.balance_pending, balance_on_hold: expected.balance_on_hold, updated_at: new Date() }))
        .execute();
    }
    return { ...expected, changed };
  }

  /** Ex repair-balances : tous les praticiens ayant un solde ou des paiements. */
  async repairAll(trx: Transaction<DB>) {
    const ids = await sql<{ id: string; name: string }>`
      select pr.id, pr.name from public.practitioners pr
      where exists (select 1 from public.practitioner_balances pb where pb.practitioner_id = pr.id)
         or exists (select 1 from public.appointments a join public.payments p on p.appointment_id = a.id where a.practitioner_id = pr.id::text)
         or exists (select 1 from public.group_sessions gs join public.payments p on p.appointment_id like '%' || gs.id::text || '%' where gs.coach_id = pr.id)`.execute(trx);
    const details: Array<BalanceSnapshot & { name: string }> = [];
    for (const { id, name } of ids.rows) {
      const r = await this.recompute(trx, id);
      if (r.changed) details.push({ name, practitioner_id: id, balance_available: r.balance_available, balance_pending: r.balance_pending, balance_on_hold: r.balance_on_hold });
    }
    return { success: true, repairs_count: details.length, details };
  }
}
