import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, GroupSession } from '../database/types';
import { DispatchService } from '../notifications/dispatch.service';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { GROUP_SESSION_PREFIX } from '../payments/balances.service';
import { PaymentsService } from '../payments/payments.service';
import type { CancelSessionDto, CoachSessionsQuery, CreateGroupSessionDto, ListGroupSessionsQuery, MineQuery, RegisterDto, RetryPaymentDto, UpdateGroupSessionDto } from './group-sessions.dto';
import { toDateOnly, withDateOnly } from '../common/utils/date-only';

const OPEN_STATUSES = ['planifiee', 'confirmee'] as const;

/**
 * Séances de groupe des coachs sportifs — port de useGroupSessions, usePatientGroupSessions,
 * CreateGroupSessionDialog, register-group-session et retry-group-session-payment.
 * Corrections par rapport à Supabase : le patient et le coach sont déduits du JWT (les Edge
 * Functions faisaient confiance aux identifiants du corps), le montant payé est celui de la séance,
 * et current_participants (inscrits payés) est maintenu par l'API.
 */
@Injectable()
export class GroupSessionsService {
  private readonly logger = new Logger(GroupSessionsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly payments: PaymentsService,
    private readonly dispatch: DispatchService,
    private readonly inApp: InAppNotificationsService,
  ) {}

  private toRow(dto: Partial<CreateGroupSessionDto>) {
    return {
      ...(dto.sessionName !== undefined ? { session_name: dto.sessionName } : {}),
      ...(dto.sessionType !== undefined ? { session_type: dto.sessionType } : {}),
      ...(dto.maxParticipants !== undefined ? { max_participants: dto.maxParticipants } : {}),
      ...(dto.minParticipants !== undefined ? { min_participants: dto.minParticipants } : {}),
      ...(dto.scheduledDate !== undefined ? { scheduled_date: dto.scheduledDate } : {}),
      ...(dto.startTime !== undefined ? { start_time: dto.startTime } : {}),
      ...(dto.endTime !== undefined ? { end_time: dto.endTime } : {}),
      ...(dto.pricePerPerson !== undefined ? { price_per_person: dto.pricePerPerson } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
    };
  }

  private static isPast(session: { scheduled_date: Date | string; start_time: string }): boolean {
    const date = toDateOnly(session.scheduled_date);
    return new Date(`${date}T${session.start_time}`) < new Date();
  }

  private async coachOf(trx: Transaction<DB>, userId: string) {
    const coach = await trx.selectFrom('practitioners').select(['id', 'name', 'practitioner_type', 'kyc_status', 'kyc_validated_at', 'user_id']).where('user_id', '=', userId).executeTakeFirst();
    if (!coach) throw new ForbiddenException('Compte praticien requis');
    if (coach.practitioner_type !== 'coach_sportif') throw new ForbiddenException('Seuls les coachs sportifs peuvent créer des séances de groupe');
    return coach;
  }

  private async ownSession(trx: Transaction<DB>, userId: string, sessionId: string) {
    const coach = await this.coachOf(trx, userId);
    const session = await trx.selectFrom('group_sessions').selectAll().where('id', '=', sessionId).executeTakeFirst();
    if (!session) throw new NotFoundException('Séance non trouvée');
    if (session.coach_id !== coach.id) throw new ForbiddenException('Cette séance ne vous appartient pas');
    return { coach, session };
  }

  private async participantStats(trx: Transaction<DB>, sessionIds: string[]) {
    if (sessionIds.length === 0) return new Map<string, { paid: number; pending: number }>();
    const rows = await trx.selectFrom('group_session_participants').select(['session_id', 'payment_status']).where('session_id', 'in', sessionIds).execute();
    const stats = new Map<string, { paid: number; pending: number }>();
    for (const r of rows) {
      const s = stats.get(r.session_id) ?? { paid: 0, pending: 0 };
      if (r.payment_status === 'paid') s.paid++;
      else if (r.payment_status === 'pending') s.pending++;
      stats.set(r.session_id, s);
    }
    return stats;
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------
  /** Catalogue public : séances à venir, planifiées ou confirmées (ex useGroupSessions / CoachSearch). */
  async list(q: ListGroupSessionsQuery) {
    const today = new Date().toISOString().slice(0, 10);
    return this.database.runAs({ role: 'anon' }, async (trx) => {
      let base = trx.selectFrom('group_sessions').where('status', 'in', [...OPEN_STATUSES]).where('scheduled_date', '>=', today);
      if (q.coachId) base = base.where('coach_id', '=', q.coachId);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('scheduled_date', 'asc').orderBy('start_time', 'asc').offset(q.page * q.limit).limit(q.limit).execute();
      const coaches = data.length ? await trx.selectFrom('practitioners').select(['id', 'name', 'image', 'specialty']).where('id', 'in', [...new Set(data.map((s) => s.coach_id))]).execute() : [];
      return { data: data.map((s) => ({ ...withDateOnly(s, 'scheduled_date'), coach: coaches.find((c) => c.id === s.coach_id) ?? null })), count: Number(count.n) };
    });
  }

  async get(sessionId: string, userId?: string) {
    return this.database.runAs(userId ? { role: 'service_role', userId } : { role: 'anon' }, async (trx) => {
      const session = await trx.selectFrom('group_sessions').selectAll().where('id', '=', sessionId).executeTakeFirst();
      if (!session) throw new NotFoundException('Séance non trouvée');
      const coach = await trx.selectFrom('practitioners').select(['id', 'name', 'image', 'specialty', 'kyc_status', 'kyc_validated_at', 'user_id']).where('id', '=', session.coach_id).executeTakeFirst();
      const isCoach = !!userId && coach?.user_id === userId;
      if (!isCoach && !OPEN_STATUSES.includes(session.status as (typeof OPEN_STATUSES)[number])) {
        const admin = userId ? await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst() : undefined;
        if (!admin) throw new NotFoundException('Séance non trouvée');
      }
      const stats = (await this.participantStats(trx, [session.id])).get(session.id) ?? { paid: 0, pending: 0 };
      const myRegistration = userId ? await trx.selectFrom('group_session_participants').select(['id', 'payment_status', 'joined_at']).where('session_id', '=', sessionId).where('patient_id', '=', userId).executeTakeFirst() : undefined;
      return {
        ...withDateOnly(session, 'scheduled_date'),
        coach: coach ? { id: coach.id, name: coach.name, image: coach.image, specialty: coach.specialty, verified: coach.kyc_status === 'approved' && !!coach.kyc_validated_at } : null,
        participants_paid: stats.paid, participants_pending: stats.pending,
        spots_remaining: Math.max(0, (session.max_participants ?? 0) - stats.paid - stats.pending),
        my_registration: myRegistration ?? null,
      };
    });
  }

  /** Séances du coach connecté, tous statuts (tableau de bord coach). */
  async listForCoach(userId: string, q: CoachSessionsQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const coach = await this.coachOf(trx, userId);
      let base = trx.selectFrom('group_sessions').where('coach_id', '=', coach.id);
      if (q.status) base = base.where('status', '=', q.status);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('scheduled_date', 'desc').orderBy('start_time', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      const stats = await this.participantStats(trx, data.map((s) => s.id));
      return { data: data.map((s) => ({ ...withDateOnly(s, 'scheduled_date'), participants_paid: stats.get(s.id)?.paid ?? 0, participants_pending: stats.get(s.id)?.pending ?? 0 })), count: Number(count.n) };
    });
  }

  /** Inscriptions du patient connecté avec la séance et le coach (ex usePatientGroupSessions). */
  async listMine(userId: string, q: MineQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const count = await trx.selectFrom('group_session_participants').select((eb) => eb.fn.countAll<string>().as('n')).where('patient_id', '=', userId).executeTakeFirstOrThrow();
      const rows = await trx
        .selectFrom('group_session_participants as p')
        .innerJoin('group_sessions as s', 's.id', 'p.session_id')
        .innerJoin('practitioners as c', 'c.id', 's.coach_id')
        .select([
          'p.id', 'p.session_id', 'p.patient_id', 'p.joined_at', 'p.payment_status',
          's.session_name', 's.session_type', 's.max_participants', 's.min_participants', 's.current_participants', 's.scheduled_date', 's.start_time', 's.end_time', 's.price_per_person', 's.location', 's.status', 's.description',
          'c.id as coach_id', 'c.name as coach_name', 'c.image as coach_image', 'c.specialty as coach_specialty',
        ])
        .where('p.patient_id', '=', userId)
        .orderBy('p.joined_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      const data = rows.map((r) => ({
        id: r.id, session_id: r.session_id, patient_id: r.patient_id, joined_at: r.joined_at, payment_status: r.payment_status,
        session: {
          id: r.session_id, session_name: r.session_name, session_type: r.session_type, max_participants: r.max_participants, min_participants: r.min_participants, current_participants: r.current_participants,
          scheduled_date: toDateOnly(r.scheduled_date), start_time: r.start_time, end_time: r.end_time, price_per_person: r.price_per_person, location: r.location, status: r.status, description: r.description,
          coach: { id: r.coach_id, name: r.coach_name, image: r.coach_image, specialty: r.coach_specialty },
        },
      }));
      return { data, count: Number(count.n) };
    });
  }

  /** Participants d'une séance (coach propriétaire ou admin). */
  async listParticipants(userId: string, sessionId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const session = await trx.selectFrom('group_sessions').select(['id', 'coach_id']).where('id', '=', sessionId).executeTakeFirst();
      if (!session) throw new NotFoundException('Séance non trouvée');
      const coach = await trx.selectFrom('practitioners').select('user_id').where('id', '=', session.coach_id).executeTakeFirst();
      if (coach?.user_id !== userId) {
        const admin = await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst();
        if (!admin) throw new ForbiddenException('Accès réservé au coach de la séance');
      }
      return trx
        .selectFrom('group_session_participants as p')
        .leftJoin('profiles as pr', 'pr.id', 'p.patient_id')
        .select(['p.id', 'p.patient_id', 'p.payment_status', 'p.joined_at', 'pr.full_name', 'pr.phone'])
        .where('p.session_id', '=', sessionId)
        .orderBy('p.joined_at', 'asc')
        .execute();
    });
  }

  // ---------------------------------------------------------------------------
  // Coach : création, modification, confirmation, annulation, clôture
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreateGroupSessionDto): Promise<GroupSession> {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const coach = await this.coachOf(trx, userId);
      const conflict = await trx.selectFrom('group_sessions').select(['id', 'session_name']).where('coach_id', '=', coach.id).where('scheduled_date', '=', dto.scheduledDate).where('start_time', '=', dto.startTime).where('status', '!=', 'annulee').executeTakeFirst();
      if (conflict) throw new ConflictException(`Vous avez déjà une séance "${conflict.session_name}" prévue à cette date et heure.`);
      const created = await trx.insertInto('group_sessions').values({ coach_id: coach.id, status: 'planifiee', current_participants: 0, ...(this.toRow(dto) as Required<ReturnType<GroupSessionsService['toRow']>>) }).returningAll().executeTakeFirstOrThrow();
      return withDateOnly(created, 'scheduled_date');
    });
  }

  async update(userId: string, sessionId: string, dto: UpdateGroupSessionDto) {
    const { session, changedSchedule, notifyIds } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { session } = await this.ownSession(trx, userId, sessionId);
      if (!OPEN_STATUSES.includes(session.status as (typeof OPEN_STATUSES)[number])) throw new BadRequestException(`Une séance ${session.status} ne peut plus être modifiée`);
      const merged = { minParticipants: session.min_participants ?? 1, maxParticipants: session.max_participants ?? 10, startTime: session.start_time, endTime: session.end_time, ...dto };
      if (merged.minParticipants > merged.maxParticipants) throw new BadRequestException('Le nombre minimum de participants ne peut pas dépasser le maximum');
      if (merged.startTime >= merged.endTime) throw new BadRequestException("L'heure de début doit être avant l'heure de fin");
      const stats = (await this.participantStats(trx, [session.id])).get(session.id) ?? { paid: 0, pending: 0 };
      if (dto.maxParticipants !== undefined && dto.maxParticipants < stats.paid + stats.pending) throw new BadRequestException(`Impossible de réduire la capacité sous le nombre d'inscrits (${stats.paid + stats.pending})`);
      const updated = await trx.updateTable('group_sessions').set({ ...this.toRow(dto), updated_at: new Date() }).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
      const changedSchedule = (dto.scheduledDate !== undefined && dto.scheduledDate !== toDateOnly(session.scheduled_date)) || (dto.startTime !== undefined && dto.startTime !== session.start_time) || (dto.location !== undefined && dto.location !== session.location);
      const notifyIds = changedSchedule ? (await trx.selectFrom('group_session_participants').select('patient_id').where('session_id', '=', sessionId).where('payment_status', 'in', ['paid', 'pending']).execute()).map((p) => p.patient_id) : [];
      return { session: updated, changedSchedule, notifyIds };
    });
    if (changedSchedule) {
      for (const patientId of notifyIds) {
        await this.dispatch.dispatch({ userId: patientId, title: 'Séance modifiée', message: `La séance "${session.session_name}" a été modifiée : ${toDateOnly(session.scheduled_date)} à ${session.start_time}, ${session.location}.`, type: 'appointment', link: '/dashboard/patient?tab=group-sessions', channels: ['email', 'push'] }).catch((e) => this.logger.warn(`notification ${patientId} : ${e}`));
      }
    }
    return withDateOnly(session, 'scheduled_date');
  }

  /** Confirmation par le coach : au moins min_participants inscrits payés ; les participants payés sont notifiés. */
  async confirm(userId: string, sessionId: string) {
    const { session, paidIds } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { session } = await this.ownSession(trx, userId, sessionId);
      if (session.status !== 'planifiee') throw new BadRequestException(`Seule une séance planifiée peut être confirmée (statut : ${session.status})`);
      const stats = (await this.participantStats(trx, [session.id])).get(session.id) ?? { paid: 0, pending: 0 };
      if (stats.paid < (session.min_participants ?? 1)) throw new BadRequestException(`Il faut au moins ${session.min_participants ?? 1} participant(s) ayant payé pour confirmer (actuellement ${stats.paid})`);
      const updated = await trx.updateTable('group_sessions').set({ status: 'confirmee', updated_at: new Date() }).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
      const paidIds = (await trx.selectFrom('group_session_participants').select('patient_id').where('session_id', '=', sessionId).where('payment_status', '=', 'paid').execute()).map((p) => p.patient_id);
      return { session: updated, paidIds };
    });
    for (const patientId of paidIds) {
      await this.dispatch.dispatch({ userId: patientId, title: '✅ Séance confirmée', message: `La séance "${session.session_name}" du ${toDateOnly(session.scheduled_date)} à ${session.start_time} est confirmée. Rendez-vous à ${session.location}.`, type: 'appointment', link: '/dashboard/patient?tab=group-sessions', channels: ['email', 'sms', 'push'] }).catch((e) => this.logger.warn(`notification ${patientId} : ${e}`));
    }
    return withDateOnly(session, 'scheduled_date');
  }

  /**
   * Annulation par le coach : les paiements ouverts sont annulés, les participants sont prévenus et
   * les administrateurs finance reçoivent la liste des paiements à rembourser (module finance).
   */
  async cancel(userId: string, sessionId: string, dto: CancelSessionDto) {
    const { session, participants, openPaymentIds, paidCount } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { session } = await this.ownSession(trx, userId, sessionId);
      if (!OPEN_STATUSES.includes(session.status as (typeof OPEN_STATUSES)[number])) throw new BadRequestException(`Une séance ${session.status} ne peut pas être annulée`);
      const updated = await trx.updateTable('group_sessions').set({ status: 'annulee', updated_at: new Date() }).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
      const participants = await trx.selectFrom('group_session_participants').select(['id', 'patient_id', 'payment_status']).where('session_id', '=', sessionId).execute();
      const openPayments = await trx.selectFrom('payments').select('id').where('appointment_id', 'like', `${GROUP_SESSION_PREFIX}${sessionId}_%`).where('status', 'in', ['initiated', 'pending', 'authorized']).execute();
      const paidCount = participants.filter((p) => p.payment_status === 'paid').length;
      if (paidCount > 0) {
        await this.inApp.notifyAdmins(trx, { title: 'Séance annulée : remboursements à traiter', message: `Le coach a annulé la séance "${session.session_name}" (${paidCount} participant(s) ayant payé). Remboursements à traiter dans Finance.`, type: 'payment', link: '/admin?tab=finance' });
      }
      return { session: updated, participants, openPaymentIds: openPayments.map((p) => p.id), paidCount };
    });
    for (const paymentId of openPaymentIds) {
      await this.payments.transition(paymentId, 'canceled', 'canceled', 'group_session.cancel').catch((e) => this.logger.warn(`annulation paiement ${paymentId} : ${e}`));
    }
    for (const p of participants) {
      const refund = p.payment_status === 'paid' ? ' Votre paiement vous sera remboursé.' : '';
      await this.dispatch.dispatch({ userId: p.patient_id, title: 'Séance annulée', message: `La séance "${session.session_name}" du ${toDateOnly(session.scheduled_date)} a été annulée par le coach.${dto.reason ? ` Motif : ${dto.reason}.` : ''}${refund}`, type: 'appointment', link: '/dashboard/patient?tab=group-sessions', channels: ['email', 'sms', 'push'] }).catch((e) => this.logger.warn(`notification ${p.patient_id} : ${e}`));
    }
    return { ...withDateOnly(session, 'scheduled_date'), participants_notified: participants.length, payments_canceled: openPaymentIds.length, refunds_to_process: paidCount };
  }

  /** Clôture (terminee) une fois la séance passée : les revenus deviennent comptabilisables (CoachDashboard). */
  async complete(userId: string, sessionId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { session } = await this.ownSession(trx, userId, sessionId);
      if (!OPEN_STATUSES.includes(session.status as (typeof OPEN_STATUSES)[number])) throw new BadRequestException(`Une séance ${session.status} ne peut pas être clôturée`);
      if (!GroupSessionsService.isPast(session)) throw new BadRequestException("La séance n'a pas encore eu lieu");
      const done = await trx.updateTable('group_sessions').set({ status: 'terminee', updated_at: new Date() }).where('id', '=', sessionId).returningAll().executeTakeFirstOrThrow();
      return withDateOnly(done, 'scheduled_date');
    });
  }

  // ---------------------------------------------------------------------------
  // Patient : inscription + paiement, nouvelle tentative
  // ---------------------------------------------------------------------------
  private async assertRegistrable(trx: Transaction<DB>, sessionId: string) {
    const session = await trx.selectFrom('group_sessions').selectAll().where('id', '=', sessionId).executeTakeFirst();
    if (!session) throw new NotFoundException('Séance non trouvée');
    const coach = await trx.selectFrom('practitioners').select(['id', 'name', 'user_id', 'kyc_status', 'kyc_validated_at']).where('id', '=', session.coach_id).executeTakeFirst();
    if (!coach || coach.kyc_status !== 'approved') throw new BadRequestException("Le coach n'est pas encore vérifié. L'inscription n'est pas possible.");
    if (!coach.kyc_validated_at) throw new BadRequestException("Le coach n'a pas encore terminé sa vérification.");
    if (GroupSessionsService.isPast(session)) throw new BadRequestException('Cette séance est déjà passée. Vous ne pouvez plus vous inscrire.');
    if (session.status === 'annulee') throw new BadRequestException('Cette séance a été annulée.');
    if (session.status === 'terminee') throw new BadRequestException('Cette séance est terminée.');
    return { session, coach };
  }

  async register(userId: string, sessionId: string, dto: RegisterDto) {
    const { session, coach, participantId, payerName, payerEmail, patientName } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { session, coach } = await this.assertRegistrable(trx, sessionId);
      const profile = await trx.selectFrom('profiles').select('full_name').where('id', '=', userId).executeTakeFirst();
      const user = await trx.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirstOrThrow();
      // Réservation atomique : verrou sur la séance, comptage pending + paid (ex reserve_group_session_spot).
      await sql`select id from public.group_sessions where id = ${sessionId} for update`.execute(trx);
      const existing = await trx.selectFrom('group_session_participants').select(['id', 'payment_status']).where('session_id', '=', sessionId).where('patient_id', '=', userId).executeTakeFirst();
      if (existing) {
        if (existing.payment_status === 'paid') throw new ConflictException('Vous êtes déjà inscrit à cette séance');
        throw new ConflictException({ statusCode: 409, error: 'REGISTRATION_PENDING', message: 'Vous avez déjà une inscription en cours de paiement pour cette séance. Finalisez votre paiement ou annulez-la avant d’en créer une nouvelle.', participantId: existing.id });
      }
      const taken = await trx.selectFrom('group_session_participants').select((eb) => eb.fn.countAll<string>().as('n')).where('session_id', '=', sessionId).where('payment_status', 'in', ['pending', 'paid']).executeTakeFirstOrThrow();
      if (Number(taken.n) >= (session.max_participants ?? 0)) throw new ConflictException('Séance complète - Plus de places disponibles');
      const participant = await trx.insertInto('group_session_participants').values({ session_id: sessionId, patient_id: userId, payment_status: 'pending' }).returning('id').executeTakeFirstOrThrow();
      return { session, coach, participantId: participant.id, payerName: dto.payerName ?? profile?.full_name ?? 'Patient', payerEmail: dto.payerEmail ?? user.email ?? undefined, patientName: profile?.full_name ?? 'Un participant' };
    });

    let payment: Awaited<ReturnType<PaymentsService['create']>>;
    try {
      payment = await this.payments.create(userId, { appointmentId: `${GROUP_SESSION_PREFIX}${sessionId}_${participantId}`, paymentMethod: dto.paymentMethod, phoneNumber: dto.phoneNumber, payerName, payerEmail });
    } catch (err) {
      // Rollback complet comme register-group-session : la place est libérée.
      await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.deleteFrom('group_session_participants').where('id', '=', participantId).execute()).catch(() => undefined);
      throw err;
    }

    if (coach.user_id) {
      await this.dispatch.dispatch({ userId: coach.user_id, title: '🏋️ Nouvelle inscription', message: `${patientName} s'est inscrit à votre séance "${session.session_name}"`, type: 'appointment', link: '/dashboard/coach?tab=sessions', channels: ['email', 'sms', 'push'] }).catch((e) => this.logger.warn(`notification coach : ${e}`));
    }
    await this.dispatch.dispatch({ userId, title: 'Paiement en attente', message: `Veuillez confirmer le paiement pour valider votre inscription à "${session.session_name}"`, type: 'payment', link: payment.paymentUrl, channels: ['push'] }).catch(() => undefined);
    return { success: true, participantId, paymentId: payment.paymentId, transactionId: payment.transactionId, token: payment.token, paymentUrl: payment.paymentUrl, amount: payment.amount, message: 'Inscription créée avec succès. Veuillez procéder au paiement.' };
  }

  /** Ex retry-group-session-payment : réutilise une transaction ouverte, sinon en crée une. */
  async retryPayment(userId: string, participantId: string, dto: RetryPaymentDto) {
    const { sessionId, payerName, payerEmail, existing } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const participant = await trx.selectFrom('group_session_participants').selectAll().where('id', '=', participantId).executeTakeFirst();
      if (!participant) throw new NotFoundException('Inscription non trouvée');
      if (participant.patient_id !== userId) throw new ForbiddenException('Cette inscription ne vous appartient pas');
      if (participant.payment_status === 'paid') throw new BadRequestException('Cette inscription est déjà payée');
      if (participant.payment_status === 'refunded') throw new BadRequestException('Cette inscription a été remboursée');
      const { session } = await this.assertRegistrable(trx, participant.session_id);
      const profile = await trx.selectFrom('profiles').select('full_name').where('id', '=', userId).executeTakeFirst();
      const user = await trx.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirstOrThrow();
      const existing = await trx.selectFrom('payments').select(['id', 'status', 'fedapay_transaction_id', 'fedapay_payment_url', 'amount', 'created_at']).where('appointment_id', '=', `${GROUP_SESSION_PREFIX}${session.id}_${participantId}`).where('status', 'in', ['initiated', 'pending', 'authorized']).orderBy('created_at', 'desc').executeTakeFirst();
      return { sessionId: session.id, payerName: dto.payerName ?? profile?.full_name ?? 'Patient', payerEmail: dto.payerEmail ?? user.email ?? undefined, existing };
    });
    if (existing?.fedapay_transaction_id) {
      return { success: true, participantId, paymentId: existing.id, transactionId: existing.fedapay_transaction_id, paymentUrl: existing.fedapay_payment_url, amount: existing.amount, reused: true, message: 'Paiement prêt. Veuillez compléter le paiement.' };
    }
    const payment = await this.payments.create(userId, { appointmentId: `${GROUP_SESSION_PREFIX}${sessionId}_${participantId}`, paymentMethod: dto.paymentMethod, phoneNumber: dto.phoneNumber, payerName, payerEmail });
    return { success: true, participantId, paymentId: payment.paymentId, transactionId: payment.transactionId, token: payment.token, paymentUrl: payment.paymentUrl, amount: payment.amount, reused: false, message: 'Paiement prêt. Veuillez compléter le paiement.' };
  }

  /** Désinscription d'une place non payée : le paiement ouvert est annulé et la place libérée. */
  async withdraw(userId: string, participantId: string) {
    const openIds = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const participant = await trx.selectFrom('group_session_participants').selectAll().where('id', '=', participantId).executeTakeFirst();
      if (!participant) throw new NotFoundException('Inscription non trouvée');
      if (participant.patient_id !== userId) throw new ForbiddenException('Cette inscription ne vous appartient pas');
      if (participant.payment_status === 'paid') throw new BadRequestException('Une inscription payée ne peut pas être annulée ici : contactez le support pour un remboursement');
      const open = await trx.selectFrom('payments').select('id').where('appointment_id', '=', `${GROUP_SESSION_PREFIX}${participant.session_id}_${participantId}`).where('status', 'in', ['initiated', 'pending', 'authorized']).execute();
      return open.map((p) => p.id);
    });
    for (const id of openIds) await this.payments.transition(id, 'canceled', 'canceled', 'group_session.withdraw').catch(() => undefined);
    await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.deleteFrom('group_session_participants').where('id', '=', participantId).execute());
    return { success: true, participantId, paymentsCanceled: openIds.length };
  }
}
