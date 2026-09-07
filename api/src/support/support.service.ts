import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import type { AdminTicketsQuery, CreateTicketDto, FaqDto, MyTicketsQuery, PublicFaqQuery, UpdateFaqDto, UpdateTicketDto } from './support.dto';

const SUPPORT_ROLES = ['super_admin', 'ops', 'support'];
const CLOSED = ['resolu', 'ferme'];

/**
 * Support — port de useSupportTickets / SupportSection (patient, praticien, coach) et de
 * l'onglet Support de l'administration (tickets + FAQ).
 * Ajouts assumés : notifications (admins à la création, utilisateur à la réponse), `updated_at`
 * et `resolved_at` renseignés (aucun trigger dans le schéma déployé), FAQ publique.
 */
@Injectable()
export class SupportService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly inApp: InAppNotificationsService) {}

  // ---------------------------------------------------------------------------
  // Tickets : utilisateur
  // ---------------------------------------------------------------------------
  listMine(userId: string, q: MyTicketsQuery) {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) => {
      let query = trx.selectFrom('support_tickets').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').limit(q.limit);
      if (q.status) query = query.where('status', '=', q.status);
      return query.execute();
    });
  }

  async getMine(userId: string, id: string) {
    const t = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const ticket = await trx.selectFrom('support_tickets').selectAll().where('id', '=', id).executeTakeFirst();
      if (!ticket) throw new NotFoundException('Ticket introuvable');
      if (ticket.user_id !== userId) {
        const admin = await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst();
        if (!admin) throw new ForbiddenException('Accès non autorisé à ce ticket');
      }
      return ticket;
    });
    return t;
  }

  async create(userId: string, dto: CreateTicketDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      if (dto.appointmentId) {
        const a = await trx.selectFrom('appointments').select(['id', 'patient_id', 'practitioner_id']).where('id', '=', dto.appointmentId).executeTakeFirst();
        if (!a) throw new NotFoundException('Rendez-vous introuvable');
        const pr = await trx.selectFrom('practitioners').select('user_id').where('id', '=', a.practitioner_id).executeTakeFirst();
        if (a.patient_id !== userId && pr?.user_id !== userId) throw new ForbiddenException('Ce rendez-vous ne vous concerne pas');
      }
      const ticket = await trx
        .insertInto('support_tickets')
        .values({ user_id: userId, subject: dto.subject, description: dto.description, status: 'ouvert', priority: dto.priority, appointment_id: dto.appointmentId ?? null, attachments: dto.attachments ?? null })
        .returningAll()
        .executeTakeFirstOrThrow();
      const profile = await trx.selectFrom('profiles').select('full_name').where('id', '=', userId).executeTakeFirst();
      await this.inApp.notifyRoles(trx, SUPPORT_ROLES, { title: 'Nouveau ticket de support', message: `${profile?.full_name ?? 'Un utilisateur'} : ${dto.subject}`, type: 'support_ticket_created', link: '/admin?tab=support' });
      return ticket;
    });
  }

  /** L'utilisateur peut fermer son propre ticket (la policy RLS l'autorisait à le modifier). */
  async closeMine(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const ticket = await trx.selectFrom('support_tickets').select(['id', 'user_id', 'status']).where('id', '=', id).executeTakeFirst();
      if (!ticket) throw new NotFoundException('Ticket introuvable');
      if (ticket.user_id !== userId) throw new ForbiddenException('Accès non autorisé à ce ticket');
      if (ticket.status === 'ferme') return trx.selectFrom('support_tickets').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
      return trx.updateTable('support_tickets').set({ status: 'ferme', resolved_at: new Date(), updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  }

  // ---------------------------------------------------------------------------
  // Tickets : administration
  // ---------------------------------------------------------------------------
  async adminList(q: AdminTicketsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('support_tickets').leftJoin('profiles', 'profiles.id', 'support_tickets.user_id');
      if (q.status) base = base.where('support_tickets.status', '=', q.status);
      if (q.priority) base = base.where('support_tickets.priority', '=', q.priority);
      if (q.search) base = base.where((eb) => eb.or([eb('support_tickets.subject', 'ilike', `%${q.search}%`), eb('profiles.full_name', 'ilike', `%${q.search}%`)]));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll('support_tickets').select(['profiles.full_name as user_full_name', 'profiles.phone as user_phone']).orderBy('support_tickets.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  adminStats() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const rows = await trx.selectFrom('support_tickets').select(['status', (eb) => eb.fn.countAll<string>().as('n')]).groupBy('status').execute();
      const by = Object.fromEntries(rows.map((r) => [r.status ?? 'ouvert', Number(r.n)]));
      const faqs = await trx.selectFrom('faqs').select([(eb) => eb.fn.countAll<string>().as('total'), (eb) => eb.fn.count<string>('id').filterWhere('is_published', '=', true).as('published')]).executeTakeFirstOrThrow();
      return { open: by['ouvert'] ?? 0, in_progress: by['en_cours'] ?? 0, resolved: by['resolu'] ?? 0, closed: by['ferme'] ?? 0, faqs_total: Number(faqs.total), faqs_published: Number(faqs.published) };
    });
  }

  /** Ex updateTicketMutation : statut et/ou réponse ; l'utilisateur est notifié. */
  async adminUpdate(adminId: string, id: string, dto: UpdateTicketDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const current = await trx.selectFrom('support_tickets').selectAll().where('id', '=', id).executeTakeFirst();
      if (!current) throw new NotFoundException('Ticket introuvable');
      const status = dto.status ?? current.status ?? 'ouvert';
      const patch: Record<string, unknown> = { status, updated_at: new Date() };
      if (dto.response) Object.assign(patch, { admin_response: dto.response, responded_at: new Date(), responded_by: adminId });
      if (dto.priority) patch.priority = dto.priority;
      if (dto.assignedTo !== undefined) patch.assigned_to = dto.assignedTo;
      if (dto.tags) patch.tags = dto.tags;
      if (CLOSED.includes(status) && !CLOSED.includes(current.status ?? '')) patch.resolved_at = new Date();
      if (!CLOSED.includes(status)) patch.resolved_at = null;
      const ticket = await trx.updateTable('support_tickets').set(patch as never).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: 'update_ticket_status', entityType: 'support_ticket', entityId: id, ip, details: { status, has_response: !!dto.response, priority: dto.priority ?? null } });
      if (dto.response || status !== current.status) {
        const labels: Record<string, string> = { ouvert: 'ouvert', en_cours: 'en cours de traitement', resolu: 'résolu', ferme: 'fermé' };
        await this.inApp.notifyUser(trx, current.user_id, {
          title: dto.response ? 'Réponse à votre ticket' : 'Mise à jour de votre ticket',
          message: dto.response ? `« ${current.subject} » : ${dto.response.slice(0, 200)}` : `Votre ticket « ${current.subject} » est ${labels[status] ?? status}.`,
          type: 'support_ticket_updated', link: '/dashboard?tab=support',
        });
      }
      return ticket;
    });
  }

  // ---------------------------------------------------------------------------
  // FAQ
  // ---------------------------------------------------------------------------
  publicFaqs(q: PublicFaqQuery) {
    return this.database.runAs({ role: 'anon' }, (trx) => {
      let query = trx.selectFrom('faqs').select(['id', 'category', 'question', 'answer', 'target_audience', 'updated_at']).where('is_published', '=', true);
      if (q.audience) query = query.where('target_audience', 'in', [q.audience, 'all']);
      if (q.category) query = query.where('category', '=', q.category);
      return query.orderBy('category').orderBy('created_at', 'desc').execute();
    });
  }

  adminFaqs() {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('faqs').selectAll().orderBy('created_at', 'desc').execute());
  }

  async createFaq(adminId: string, dto: FaqDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const faq = await trx.insertInto('faqs').values({ question: dto.question, answer: dto.answer, category: dto.category, target_audience: dto.targetAudience, is_published: false, created_by: adminId }).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: 'create_faq', entityType: 'faq', entityId: faq.id, ip, details: { question: dto.question, category: dto.category } });
      return faq;
    });
  }

  /** Ex updateFaqMutation : action d'audit publish_faq / unpublish_faq / update_faq selon le corps. */
  async updateFaq(adminId: string, id: string, dto: UpdateFaqDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const current = await trx.selectFrom('faqs').select(['id', 'version', 'is_published']).where('id', '=', id).executeTakeFirst();
      if (!current) throw new NotFoundException('FAQ introuvable');
      const contentChanged = dto.question !== undefined || dto.answer !== undefined || dto.category !== undefined || dto.targetAudience !== undefined;
      const faq = await trx
        .updateTable('faqs')
        .set({
          ...(dto.question !== undefined ? { question: dto.question } : {}),
          ...(dto.answer !== undefined ? { answer: dto.answer } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.targetAudience !== undefined ? { target_audience: dto.targetAudience } : {}),
          ...(dto.isPublished !== undefined ? { is_published: dto.isPublished } : {}),
          ...(contentChanged ? { version: (current.version ?? 1) + 1 } : {}),
          updated_by: adminId, updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const action = dto.isPublished !== undefined ? (dto.isPublished ? 'publish_faq' : 'unpublish_faq') : 'update_faq';
      await this.audit.log(trx, { adminId, action, entityType: 'faq', entityId: id, ip, details: dto as Record<string, unknown> });
      return faq;
    });
  }

  async deleteFaq(adminId: string, id: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const r = await trx.deleteFrom('faqs').where('id', '=', id).executeTakeFirst();
      if (Number(r.numDeletedRows) === 0) throw new NotFoundException('FAQ introuvable');
      await this.audit.log(trx, { adminId, action: 'delete_faq', entityType: 'faq', entityId: id, ip });
      return { deleted: true };
    });
  }

  /** Utilisé par les autres modules pour vérifier l'appartenance à un rendez-vous. */
  static async isPartyOfAppointment(trx: Transaction<DB>, userId: string, appointmentId: string): Promise<{ patientId: string; practitionerUserId: string | null; practitionerName: string } | null> {
    const a = await trx.selectFrom('appointments').select(['patient_id', 'practitioner_id', 'practitioner_name']).where('id', '=', appointmentId).executeTakeFirst();
    if (!a) return null;
    const pr = await trx.selectFrom('practitioners').select('user_id').where('id', '=', a.practitioner_id).executeTakeFirst();
    const party = a.patient_id === userId || pr?.user_id === userId;
    return party ? { patientId: a.patient_id, practitionerUserId: pr?.user_id ?? null, practitionerName: a.practitioner_name } : null;
  }
}
