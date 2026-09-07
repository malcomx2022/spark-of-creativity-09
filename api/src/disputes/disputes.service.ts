import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { SupportService } from '../support/support.service';
import type { AdminDisputesQuery, CreateDisputeDto, DisputeMessageDto, MyDisputesQuery, UpdateDisputeDto } from './disputes.dto';

const DISPUTE_ADMIN_ROLES = ['super_admin', 'ops', 'support'];
/** Délai de traitement (SLA) : 48 h pour high / urgent, 72 h sinon — la colonne sla_deadline n'était jamais renseignée. */
const SLA_HOURS: Record<string, number> = { urgent: 24, high: 48, medium: 72, low: 72 };

/**
 * Litiges — port de ConsultationConfirmation (signalement patient) et de l'onglet Litiges de
 * OperationsSection. Ajouts assumés : liste des litiges pour les parties du rendez-vous, messages
 * (table dispute_messages, jusqu'ici inutilisée), SLA renseigné et job `disputes.sla`, notification
 * du déclarant à chaque changement de statut.
 */
@Injectable()
export class DisputesService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly inApp: InAppNotificationsService) {}

  private async loadForUser(trx: Transaction<DB>, userId: string, disputeId: string, allowAdmin = true) {
    const d = await trx.selectFrom('disputes').selectAll().where('id', '=', disputeId).executeTakeFirst();
    if (!d) throw new NotFoundException('Litige introuvable');
    let party = d.raised_by === userId;
    if (!party && d.appointment_id) party = !!(await SupportService.isPartyOfAppointment(trx, userId, d.appointment_id));
    let admin = false;
    if (!party && allowAdmin) admin = !!(await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst());
    if (!party && !admin) throw new ForbiddenException('Accès non autorisé à ce litige');
    return { dispute: d, isAdmin: admin, isRaiser: d.raised_by === userId };
  }

  // ---------------------------------------------------------------------------
  // Parties du rendez-vous
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreateDisputeDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const party = await SupportService.isPartyOfAppointment(trx, userId, dto.appointmentId);
      if (party === null) {
        const exists = await trx.selectFrom('appointments').select('id').where('id', '=', dto.appointmentId).executeTakeFirst();
        if (!exists) throw new NotFoundException('Rendez-vous introuvable');
        throw new ForbiddenException('Ce rendez-vous ne vous concerne pas');
      }
      const subject = dto.subject ?? `Problème avec la consultation - ${party.practitionerName}`;
      const dispute = await trx
        .insertInto('disputes')
        .values({ raised_by: userId, appointment_id: dto.appointmentId, subject, description: dto.description, status: 'open', priority: dto.priority, sla_deadline: new Date(Date.now() + (SLA_HOURS[dto.priority] ?? 72) * 3_600_000) })
        .returningAll()
        .executeTakeFirstOrThrow();
      const labels: Record<string, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
      const who = userId === party.patientId ? 'Un patient' : 'Un praticien';
      await this.inApp.notifyRoles(trx, DISPUTE_ADMIN_ROLES, { title: 'Nouveau litige signalé', message: `${who} a signalé un problème avec sa consultation avec ${party.practitionerName}. Priorité: ${labels[dto.priority]}`, type: 'dispute_created', link: '/admin?tab=operations' });
      return dispute;
    });
  }

  listMine(userId: string, q: MyDisputesQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      let base = trx
        .selectFrom('disputes')
        .leftJoin('appointments', 'appointments.id', 'disputes.appointment_id')
        .where((eb) => eb.or([eb('disputes.raised_by', '=', userId), eb('appointments.patient_id', '=', userId), ...(practitioner ? [eb('appointments.practitioner_id', '=', practitioner.id)] : [])]));
      if (q.status) base = base.where('disputes.status', '=', q.status);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll('disputes').select(['appointments.date as appointment_date', 'appointments.time as appointment_time', 'appointments.practitioner_name', 'appointments.patient_name', 'appointments.specialty']).orderBy('disputes.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  async get(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { dispute } = await this.loadForUser(trx, userId, id);
      const appointment = dispute.appointment_id ? await trx.selectFrom('appointments').select(['id', 'date', 'time', 'specialty', 'patient_name', 'practitioner_name', 'status']).where('id', '=', dispute.appointment_id).executeTakeFirst() : null;
      return { ...dispute, appointment: appointment ?? null };
    });
  }

  /** Messages : déclarant et administrateurs (policy RLS d'origine) ; l'autre partie du rendez-vous n'y a pas accès. */
  listMessages(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { dispute, isAdmin } = await this.loadForUser(trx, userId, id);
      if (dispute.raised_by !== userId && !isAdmin) throw new ForbiddenException('Accès non autorisé aux messages de ce litige');
      return trx.selectFrom('dispute_messages').leftJoin('profiles', 'profiles.id', 'dispute_messages.sender_id').selectAll('dispute_messages').select('profiles.full_name as sender_name').where('dispute_id', '=', id).orderBy('dispute_messages.created_at', 'asc').execute();
    });
  }

  async addMessage(userId: string, id: string, dto: DisputeMessageDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { dispute, isAdmin } = await this.loadForUser(trx, userId, id);
      if (dispute.raised_by !== userId && !isAdmin) throw new ForbiddenException('Accès non autorisé aux messages de ce litige');
      if (dispute.status === 'closed') throw new ForbiddenException('Ce litige est fermé');
      const message = await trx.insertInto('dispute_messages').values({ dispute_id: id, sender_id: userId, message: dto.message, attachments: dto.attachments ?? null }).returningAll().executeTakeFirstOrThrow();
      await trx.updateTable('disputes').set({ updated_at: new Date() }).where('id', '=', id).execute();
      if (isAdmin && dispute.raised_by !== userId) {
        await this.inApp.notifyUser(trx, dispute.raised_by, { title: 'Réponse sur votre litige', message: `« ${dispute.subject} » : ${dto.message.slice(0, 200)}`, type: 'dispute_updated', link: '/dashboard?tab=disputes' });
      } else {
        await this.inApp.notifyRoles(trx, DISPUTE_ADMIN_ROLES, { title: 'Nouveau message sur un litige', message: `« ${dispute.subject} » : ${dto.message.slice(0, 200)}`, type: 'dispute_updated', link: '/admin?tab=operations' });
      }
      return message;
    });
  }

  // ---------------------------------------------------------------------------
  // Administration (OperationsSection)
  // ---------------------------------------------------------------------------
  adminList(q: AdminDisputesQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('disputes').leftJoin('profiles', 'profiles.id', 'disputes.raised_by').leftJoin('appointments', 'appointments.id', 'disputes.appointment_id');
      if (q.status) base = base.where('disputes.status', '=', q.status);
      if (q.priority) base = base.where('disputes.priority', '=', q.priority);
      if (q.overdue) base = base.where('disputes.status', 'in', ['open', 'investigating']).where('disputes.sla_deadline', '<', new Date());
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base
        .selectAll('disputes')
        .select(['profiles.full_name as raised_by_name', 'profiles.phone as raised_by_phone', 'appointments.date as appointment_date', 'appointments.time as appointment_time', 'appointments.specialty as appointment_specialty', 'appointments.patient_name', 'appointments.practitioner_name'])
        .orderBy('disputes.created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      const stats = (await sql<Record<string, string>>`select count(*) filter (where status = 'open') as open, count(*) filter (where status = 'investigating') as investigating, count(*) filter (where status in ('open', 'investigating') and sla_deadline < now()) as overdue from public.disputes`.execute(trx)).rows[0];
      return { data, count: Number(count.n), stats: { open: Number(stats?.open ?? 0), investigating: Number(stats?.investigating ?? 0), overdue: Number(stats?.overdue ?? 0) } };
    });
  }

  /** Ex updateDisputeMutation : action d'audit `Dispute <status>` (libellés d'AuditLogs.tsx), déclarant notifié. */
  async adminUpdate(adminId: string, id: string, dto: UpdateDisputeDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const current = await trx.selectFrom('disputes').selectAll().where('id', '=', id).executeTakeFirst();
      if (!current) throw new NotFoundException('Litige introuvable');
      const status = dto.status ?? current.status ?? 'open';
      const patch: Record<string, unknown> = { status, updated_at: new Date() };
      if (dto.priority) Object.assign(patch, { priority: dto.priority, sla_deadline: new Date(current.created_at.getTime() + (SLA_HOURS[dto.priority] ?? 72) * 3_600_000) });
      if (status === 'investigating') patch.assigned_to = dto.assignedTo === undefined ? adminId : dto.assignedTo;
      else if (dto.assignedTo !== undefined) patch.assigned_to = dto.assignedTo;
      if (status === 'resolved' || status === 'closed') {
        patch.resolution = dto.resolution || (status === 'closed' ? current.resolution || 'Fermé sans résolution' : current.resolution);
        patch.resolved_at = new Date();
      } else if (dto.resolution !== undefined) patch.resolution = dto.resolution;
      const dispute = await trx.updateTable('disputes').set(patch as never).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: `Dispute ${status}`, entityType: 'dispute', entityId: id, ip, details: { status, resolution: patch.resolution ?? null, priority: dto.priority ?? null } });
      if (status !== current.status) {
        const messages: Record<string, string> = { investigating: 'est pris en charge par notre équipe.', resolved: `a été résolu.${patch.resolution ? ` Résolution : ${String(patch.resolution).slice(0, 200)}` : ''}`, closed: 'a été fermé.', open: 'a été rouvert.' };
        await this.inApp.notifyUser(trx, current.raised_by, { title: 'Mise à jour de votre litige', message: `Votre litige « ${current.subject} » ${messages[status] ?? status}`, type: 'dispute_updated', link: '/dashboard?tab=disputes' });
      }
      return dispute;
    });
  }

  /** Ex check_overdue_disputes() (corrigé : statut `investigating`, pas `in_progress`) : les litiges en retard passent en priorité haute et les admins sont alertés une fois. */
  async escalateOverdue() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const escalated = await trx.updateTable('disputes').set({ priority: 'high', updated_at: new Date() }).where('status', 'in', ['open', 'investigating']).where('sla_deadline', '<', new Date()).where('priority', 'in', ['low', 'medium']).returning(['id', 'subject']).execute();
      for (const d of escalated) await this.inApp.notifyRoles(trx, DISPUTE_ADMIN_ROLES, { title: 'Litige en retard', message: `Le délai de traitement du litige « ${d.subject} » est dépassé : priorité passée à Haute.`, type: 'dispute_overdue', link: '/admin?tab=operations' });
      return { escalated: escalated.length, ids: escalated.map((d) => d.id) };
    });
  }
}
