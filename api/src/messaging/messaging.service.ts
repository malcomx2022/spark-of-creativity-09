import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { DatabaseService } from '../database/database.service';
import type { DB } from '../database/types';
import { DispatchService } from '../notifications/dispatch.service';
import type { ConversationsQuery, MessagesQuery, SendMessageDto } from './messaging.dto';
import { messageLink } from './message-link';

const CONVERSATION_STATUSES = ['confirmed', 'completed'] as const;

export interface Participant {
  appointmentId: string;
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  practitionerUserId: string | null;
  isPatient: boolean;
  isPractitioner: boolean;
  practitionerType?: string | null;
}

/** Messagerie patient ↔ praticien liée à un rendez-vous (ex useConversations / useMessages). */
@Injectable()
export class MessagingService {
  constructor(private readonly database: DatabaseService, private readonly dispatch: DispatchService) {}

  /** Vérifie que l'utilisateur est partie prenante (ou admin) du rendez-vous. */
  async participant(trx: Transaction<DB>, userId: string, appointmentId: string, allowAdmin = true): Promise<Participant> {
    const a = await trx.selectFrom('appointments').select(['id', 'patient_id', 'patient_name', 'practitioner_id', 'practitioner_name']).where('id', '=', appointmentId).executeTakeFirst();
    if (!a) throw new NotFoundException('Rendez-vous introuvable');
    const pr = await trx.selectFrom('practitioners').select(['user_id', 'practitioner_type']).where('id', '=', a.practitioner_id).executeTakeFirst();
    const isPatient = a.patient_id === userId;
    const isPractitioner = pr?.user_id === userId;
    if (!isPatient && !isPractitioner) {
      const admin = allowAdmin && (await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst());
      if (!admin) throw new ForbiddenException('Accès non autorisé à cette conversation');
    }
    return { appointmentId: a.id, patientId: a.patient_id, patientName: a.patient_name, practitionerId: a.practitioner_id, practitionerName: a.practitioner_name, practitionerUserId: pr?.user_id ?? null, isPatient, isPractitioner, practitionerType: pr?.practitioner_type };
  }

  async canAccess(userId: string, appointmentId: string): Promise<boolean> {
    return this.database.runAs({ role: 'service_role', userId }, (trx) => this.participant(trx, userId, appointmentId).then(() => true).catch(() => false));
  }

  /** Conversations = rendez-vous confirmés/terminés de l'utilisateur, triés par dernier message. */
  async listConversations(userId: string, q: ConversationsQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      const appointments = await trx
        .selectFrom('appointments')
        .select(['id', 'patient_id', 'patient_name', 'practitioner_id', 'practitioner_name', 'date', 'time', 'status', 'created_at'])
        .where((eb) => (practitioner ? eb.or([eb('patient_id', '=', userId), eb('practitioner_id', '=', practitioner.id)]) : eb('patient_id', '=', userId)))
        .where('status', 'in', [...CONVERSATION_STATUSES])
        .orderBy('created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      if (appointments.length === 0) return { conversations: [], hasMore: false };
      const ids = appointments.map((a) => a.id);
      const messages = await trx.selectFrom('messages').select(['appointment_id', 'content', 'created_at', 'sender_id', 'is_read']).where('appointment_id', 'in', ids).orderBy('created_at', 'desc').execute();
      const conversations = appointments
        .map((a) => {
          const own = messages.filter((m) => m.appointment_id === a.id);
          const last = own[0];
          return {
            appointment_id: a.id, patient_id: a.patient_id, patient_name: a.patient_name, practitioner_id: a.practitioner_id, practitioner_name: a.practitioner_name,
            last_message: last?.content || 'Aucun message', last_message_at: last?.created_at ?? a.created_at,
            unread_count: own.filter((m) => !m.is_read && m.sender_id !== userId).length,
            appointment_date: a.date, appointment_time: a.time, appointment_status: a.status,
          };
        })
        .sort((x, y) => new Date(y.last_message_at).getTime() - new Date(x.last_message_at).getTime());
      return { conversations, hasMore: appointments.length === q.limit };
    });
  }

  async getConversation(userId: string, appointmentId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async trx => {
      const participant = await this.participant(trx, userId, appointmentId, false);
      const appointment = await trx.selectFrom('appointments').select(['date', 'time', 'status', 'created_at']).where('id', '=', appointmentId).executeTakeFirstOrThrow();
      if (!(CONVERSATION_STATUSES as readonly string[]).includes(appointment.status)) throw new NotFoundException('Conversation indisponible');
      const last = await trx.selectFrom('messages').select(['content', 'created_at']).where('appointment_id', '=', appointmentId).orderBy('created_at', 'desc').orderBy('id', 'desc').executeTakeFirst();
      const unread = await trx.selectFrom('messages').select(eb => eb.fn.countAll<string>().as('count')).where('appointment_id', '=', appointmentId).where('sender_id', '!=', userId).where('is_read', '=', false).executeTakeFirstOrThrow();
      return { appointment_id: appointmentId, patient_id: participant.patientId, patient_name: participant.patientName, practitioner_id: participant.practitionerId, practitioner_name: participant.practitionerName, last_message: last?.content || 'Aucun message', last_message_at: last?.created_at ?? appointment.created_at, unread_count: Number(unread.count), appointment_date: appointment.date, appointment_time: appointment.time, appointment_status: appointment.status };
    });
  }

  async listMessages(userId: string, appointmentId: string, q: MessagesQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      await this.participant(trx, userId, appointmentId);
      let query = trx.selectFrom('messages').selectAll().where('appointment_id', '=', appointmentId).orderBy('created_at', 'desc').limit(q.limit);
      if (q.before) query = query.where('created_at', '<', new Date(q.before));
      const rows = await query.execute();
      return rows.reverse();
    });
  }

  async send(userId: string, appointmentId: string, dto: SendMessageDto) {
    const { message, recipientId, senderName, link } = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const p = await this.participant(trx, userId, appointmentId, false);
      if (dto.attachment && !dto.attachment.filePath.startsWith(`message-attachments/${userId}/`) && !/^https?:\/\//.test(dto.attachment.filePath)) {
        throw new ForbiddenException("La pièce jointe doit avoir été envoyée dans votre dossier message-attachments");
      }
      const message = await trx
        .insertInto('messages')
        .values({
          appointment_id: appointmentId, sender_id: userId, content: dto.content, is_read: false,
          attachment_url: dto.attachment?.filePath ?? null, attachment_type: dto.attachment?.type ?? null, attachment_name: dto.attachment?.name ?? null, attachment_size: dto.attachment?.size ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const recipientId = p.isPatient ? p.practitionerUserId : p.patientId;
      const senderName = p.isPatient ? p.patientName : p.practitionerName;
      return { message, recipientId, senderName, link: messageLink(appointmentId, !p.isPatient, p.practitionerType) };
    });
    if (recipientId) {
      // In-app + push uniquement (pas d'e-mail/SMS par message, comme le comportement Supabase temps réel).
      await this.dispatch
        .dispatch({ userId: recipientId, title: `Nouveau message de ${senderName}`, message: dto.content || 'Pièce jointe', type: 'message', link, channels: ['push'] })
        .catch(() => undefined);
    }
    return message;
  }

  async markRead(userId: string, appointmentId: string) {
    const r = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      await this.participant(trx, userId, appointmentId, false);
      return trx.updateTable('messages').set({ is_read: true }).where('appointment_id', '=', appointmentId).where('sender_id', '!=', userId).where('is_read', '=', false).executeTakeFirst();
    });
    return { updated: Number(r.numUpdatedRows) };
  }

  async unreadCount(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      const r = await trx
        .selectFrom('messages')
        .innerJoin('appointments', 'appointments.id', 'messages.appointment_id')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('messages.is_read', '=', false)
        .where('messages.sender_id', '!=', userId)
        .where((eb) => (practitioner ? eb.or([eb('appointments.patient_id', '=', userId), eb('appointments.practitioner_id', '=', practitioner.id)]) : eb('appointments.patient_id', '=', userId)))
        .executeTakeFirstOrThrow();
      return { unread: Number(r.n) };
    });
  }
}
