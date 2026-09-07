import { Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService } from '../database/database.service';
import type { DB } from '../database/types';
import { parseFeeConfig } from '../payments/fees';

/**
 * Statistiques des tableaux de bord (ex calculs `useMemo` côté front de PractitionerDashboard,
 * PatientDashboard et CoachDashboard). Les formules sont désormais calculées en SQL :
 * - praticien : compteurs par statut + minutes réelles de consultation
 *   (consultation_started_at → consultation_ended_at) sur le mois demandé ;
 * - patient : rendez-vous à venir / passés / en attente de paiement ;
 * - coach : séances et rendez-vous à venir, participants, revenus nets
 *   (taux = 1 - commission plateforme lue dans system_config, 63 % par défaut).
 */
@Injectable()
export class StatsService {
  constructor(private readonly database: DatabaseService) {}

  private async practitionerOf(trx: Transaction<DB>, userId: string) {
    const p = await trx.selectFrom('practitioners').select(['id', 'practitioner_type', 'rating']).where('user_id', '=', userId).executeTakeFirst();
    if (!p) throw new NotFoundException('Profil praticien introuvable');
    return p;
  }

  /** `month` au format AAAA-MM (mois courant par défaut). */
  private monthRange(month?: string) {
    const now = new Date();
    const m = month ? Number(month.slice(5, 7)) : now.getMonth() + 1;
    const y = month ? Number(month.slice(0, 4)) : now.getFullYear();
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { from, to: next, label: `${y}-${String(m).padStart(2, '0')}` };
  }

  async practitioner(userId: string, month?: string) {
    return this.database.runAs({ role: 'authenticated', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const range = this.monthRange(month);
      const r = (await sql<Record<string, string | null>>`
        select
          count(*) filter (where status = 'awaiting_practitioner') as awaiting,
          count(*) filter (where status = 'pending_payment') as pending_payment,
          count(*) filter (where status in ('confirmed', 'pending', 'in-progress', 'awaiting_confirmation')) as confirmed,
          count(*) filter (where status = 'completed') as completed,
          count(*) filter (where status = 'completed' and date >= ${range.from} and date < ${range.to}) as completed_month,
          coalesce(sum(payment_amount) filter (where status = 'completed' and date >= ${range.from} and date < ${range.to}), 0) as gross_month,
          coalesce(sum(extract(epoch from (consultation_ended_at - consultation_started_at)) / 60)
            filter (where status = 'completed' and consultation_started_at is not null and consultation_ended_at is not null
                    and date >= ${range.from} and date < ${range.to}), 0) as real_minutes_month,
          coalesce(sum(duration) filter (where status = 'completed' and (consultation_started_at is null or consultation_ended_at is null)
                    and date >= ${range.from} and date < ${range.to}), 0) as planned_minutes_month,
          count(*) filter (where status in ('confirmed', 'pending', 'in-progress', 'awaiting_confirmation') and date = current_date::text) as today
        from public.appointments where practitioner_id = ${p.id}`.execute(trx)).rows[0] ?? {};
      const reviews = (await sql<{ n: string; avg: string | null }>`select count(*) as n, avg(rating) as avg from public.reviews where practitioner_id = ${p.id} and coalesce(is_hidden, false) = false`.execute(trx)).rows[0];
      const n = (k: string) => Number(r[k] ?? 0);
      return {
        month: range.label,
        awaiting: n('awaiting'),
        pendingPayment: n('pending_payment'),
        confirmed: n('confirmed'),
        completed: n('completed'),
        today: n('today'),
        completedThisMonth: n('completed_month'),
        grossThisMonth: Math.round(n('gross_month')),
        // Minutes réelles quand la consultation a été chronométrée, durée planifiée sinon.
        totalMinutesThisMonth: Math.round(n('real_minutes_month') + n('planned_minutes_month')),
        rating: p.rating != null ? Number(p.rating) : null,
        reviews: { count: Number(reviews?.n ?? 0), average: reviews?.avg != null ? Math.round(Number(reviews.avg) * 10) / 10 : null },
      };
    });
  }

  async patient(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, async (trx) => {
      const r = (await sql<Record<string, string | null>>`
        select
          count(*) filter (where status not in ('completed', 'cancelled', 'cancelled_unpaid', 'rejected')) as upcoming,
          count(*) filter (where status in ('completed', 'cancelled', 'cancelled_unpaid', 'rejected')) as past,
          count(*) filter (where status = 'completed') as completed,
          count(*) filter (where status = 'pending_payment') as awaiting_payment,
          count(*) filter (where status = 'awaiting_confirmation') as awaiting_confirmation
        from public.appointments where patient_id = ${userId}`.execute(trx)).rows[0] ?? {};
      const g = (await sql<Record<string, string | null>>`
        select
          count(*) filter (where s.status in ('planifiee', 'confirmee') and s.scheduled_date >= current_date and gp.payment_status <> 'refunded') as upcoming_sessions,
          count(*) filter (where gp.payment_status = 'pending' and s.status in ('planifiee', 'confirmee')) as sessions_pending_payment,
          coalesce(sum(s.price_per_person) filter (where gp.payment_status = 'pending' and s.status in ('planifiee', 'confirmee')), 0) as sessions_pending_amount
        from public.group_session_participants gp join public.group_sessions s on s.id = gp.session_id
        where gp.patient_id = ${userId}`.execute(trx)).rows[0] ?? {};
      const unreadNotifications = await trx.selectFrom('notifications').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', userId).where('is_read', '=', false).executeTakeFirst();
      const n = (o: Record<string, string | null>, k: string) => Number(o[k] ?? 0);
      return {
        upcoming: n(r, 'upcoming'),
        past: n(r, 'past'),
        completed: n(r, 'completed'),
        awaitingPayment: n(r, 'awaiting_payment'),
        awaitingConfirmation: n(r, 'awaiting_confirmation'),
        groupSessions: { upcoming: n(g, 'upcoming_sessions'), pendingPayment: n(g, 'sessions_pending_payment'), pendingAmount: Math.round(n(g, 'sessions_pending_amount')) },
        unreadNotifications: Number(unreadNotifications?.n ?? 0),
      };
    });
  }

  async coach(userId: string) {
    return this.database.runAs({ role: 'authenticated', userId }, async (trx) => {
      const p = await this.practitionerOf(trx, userId);
      const configRows = await trx.selectFrom('system_config').select(['key', 'value']).where('key', 'in', ['payment_commission_rate']).execute();
      const fee = parseFeeConfig(Object.fromEntries(configRows.map((c) => [c.key, c.value])));
      const revenueRate = 1 - fee.commissionRate;
      const s = (await sql<Record<string, string | null>>`
        select
          count(*) filter (where status in ('planifiee', 'confirmee') and scheduled_date >= current_date) as upcoming_sessions,
          coalesce(sum(current_participants), 0) as total_participants,
          coalesce(sum(price_per_person * coalesce(current_participants, 0)) filter (where status = 'terminee'), 0) as sessions_gross
        from public.group_sessions where coach_id = ${p.id}`.execute(trx)).rows[0] ?? {};
      const a = (await sql<Record<string, string | null>>`
        select
          count(*) filter (where status in ('confirmed', 'pending', 'awaiting_practitioner')) as upcoming_appointments,
          coalesce(sum(payment_amount) filter (where status = 'completed'), 0) as appointments_gross
        from public.appointments where practitioner_id = ${p.id}`.execute(trx)).rows[0] ?? {};
      const n = (o: Record<string, string | null>, k: string) => Number(o[k] ?? 0);
      const sessionsRevenue = Math.round(n(s, 'sessions_gross') * revenueRate);
      const appointmentsRevenue = Math.round(n(a, 'appointments_gross') * revenueRate);
      return {
        upcomingSessions: n(s, 'upcoming_sessions'),
        upcomingAppointments: n(a, 'upcoming_appointments'),
        totalParticipants: n(s, 'total_participants'),
        revenueRate,
        sessionsRevenue,
        appointmentsRevenue,
        totalRevenue: sessionsRevenue + appointmentsRevenue,
      };
    });
  }
}
