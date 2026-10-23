import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { applyEnrollmentState } from './academy-enrollments.service';
import { AdminEnrollmentsQuery, AdminWebhookEventsQuery } from './academy.dto';
import { academyHttpError } from './academy.errors';
import { AKAMBI_CLIENT, AkambiClient, AkambiEnrollment, AkambiError } from './akambi.client';

/**
 * Supervision DomiCares Academy (lot A6) : indicateurs du partenariat, inscriptions, événements reçus, état des
 * synchronisations et désinscription. Aucune route ne renvoie de corps d'événement ni de lien d'accès ou de
 * téléchargement ; les relances de synchronisation passent par POST /admin/jobs/:name/run.
 */
@Injectable()
export class AcademyAdminService {
  private readonly logger = new Logger(AcademyAdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(AKAMBI_CLIENT) private readonly akambi: AkambiClient,
  ) {}

  /** Indicateurs Akambi (GET /reports, définitions encore à valider) et décompte local pour les comparer. */
  async reports() {
    let akambi;
    try {
      akambi = await this.akambi.getReports();
    } catch (err) {
      throw academyHttpError(err);
    }
    const local = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const byStatus = await trx.selectFrom('academy_enrollments').select(['status', sql<string>`count(*)`.as('n')]).groupBy('status').execute();
      const learners = await trx.selectFrom('academy_learners').select(['link_status', sql<string>`count(*)`.as('n')]).groupBy('link_status').execute();
      const certificates = await trx.selectFrom('academy_certificates').select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow();
      return {
        enrollmentsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
        learnersByLinkStatus: Object.fromEntries(learners.map((r) => [r.link_status, Number(r.n)])),
        certificates: Number(certificates.n),
      };
    });
    return { akambi, local };
  }

  async listEnrollments(q: AdminEnrollmentsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('academy_enrollments')
        .innerJoin('academy_learners', 'academy_learners.user_id', 'academy_enrollments.user_id')
        .innerJoin('academy_courses', 'academy_courses.id', 'academy_enrollments.course_id')
        .leftJoin('profiles', 'profiles.id', 'academy_enrollments.user_id')
        .leftJoin('practitioners', 'practitioners.user_id', 'academy_enrollments.user_id');
      if (q.status) base = base.where('academy_enrollments.status', '=', q.status);
      if (q.courseId) base = base.where('academy_enrollments.course_id', '=', q.courseId);
      if (q.search) {
        const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        base = base.where((eb) => eb.or([eb('profiles.full_name', 'ilike', like), eb('practitioners.name', 'ilike', like), eb('academy_learners.email', 'ilike', like), eb('academy_courses.title', 'ilike', like)]));
      }
      const total = await base.select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow();
      const rows = await base
        .select([
          'academy_enrollments.id', 'academy_enrollments.user_id', 'academy_enrollments.course_id', 'academy_enrollments.status', 'academy_enrollments.progress',
          'academy_enrollments.enrolled_at', 'academy_enrollments.completed_at', 'academy_enrollments.certificate_id', 'academy_enrollments.last_error_code', 'academy_enrollments.updated_at',
          'academy_courses.title as course_title', 'academy_learners.email', 'academy_learners.account_origin', 'academy_learners.link_status',
          'profiles.full_name', 'practitioners.name as practitioner_name',
        ])
        .orderBy('academy_enrollments.updated_at', 'desc').orderBy('academy_enrollments.id')
        .limit(q.limit).offset(q.page * q.limit)
        .execute();
      return {
        total: Number(total.n),
        page: q.page,
        limit: q.limit,
        items: rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          learnerName: r.full_name ?? r.practitioner_name,
          email: r.email,
          accountOrigin: r.account_origin,
          linkStatus: r.link_status,
          courseId: r.course_id,
          courseTitle: r.course_title,
          status: r.status,
          progress: r.progress,
          enrolledAt: r.enrolled_at?.toISOString() ?? null,
          completedAt: r.completed_at?.toISOString() ?? null,
          hasCertificate: r.certificate_id !== null,
          lastErrorCode: r.last_error_code,
          updatedAt: r.updated_at.toISOString(),
        })),
      };
    });
  }

  /** Événements reçus, sans leur corps (il reprend l'état des inscriptions et le nom figurant sur l'attestation). */
  async listWebhookEvents(q: AdminWebhookEventsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('academy_webhook_events');
      if (q.status) base = base.where('processing_status', '=', q.status);
      if (q.type) base = base.where('event_type', '=', q.type);
      const total = await base.select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow();
      const rows = await base
        .select(['id', 'event_id', 'event_type', 'event_version', 'processing_status', 'error_message', 'signed_at', 'akambi_created_at', 'received_at', 'processed_at'])
        .orderBy('received_at', 'desc').orderBy('id').limit(q.limit).offset(q.page * q.limit).execute();
      const counts = await trx.selectFrom('academy_webhook_events').select(['processing_status', sql<string>`count(*)`.as('n')]).groupBy('processing_status').execute();
      return {
        total: Number(total.n),
        page: q.page,
        limit: q.limit,
        counts: Object.fromEntries(counts.map((c) => [c.processing_status, Number(c.n)])),
        items: rows.map((r) => ({
          id: r.id,
          eventId: r.event_id,
          type: r.event_type,
          version: r.event_version,
          status: r.processing_status,
          message: r.error_message,
          signedAt: r.signed_at.toISOString(),
          createdAt: r.akambi_created_at?.toISOString() ?? null,
          receivedAt: r.received_at.toISOString(),
          processedAt: r.processed_at?.toISOString() ?? null,
        })),
      };
    });
  }

  async syncState() {
    const rows = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_sync_state').selectAll().orderBy('key').execute());
    return rows.map((r) => ({
      key: r.key,
      cursor: r.cursor?.toISOString() ?? null,
      lastRunAt: r.last_run_at?.toISOString() ?? null,
      lastSuccessAt: r.last_success_at?.toISOString() ?? null,
      lastError: r.last_error,
    }));
  }

  /**
   * Désinscription (DELETE /enrollments/{id} chez Akambi) : retire l'accès au cours. Refusée après l'attestation
   * (409 CERTIFICATE_ISSUED) ou pour une demande encore en attente. Une inscription déjà absente chez Akambi est
   * close localement. Journalisée dans admin_audit_logs.
   */
  async cancelEnrollment(adminId: string, enrollmentId: string, ip?: string) {
    const row = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_enrollments').select(['id', 'status', 'akambi_enrollment_id']).where('id', '=', enrollmentId).executeTakeFirst());
    if (!row) throw new NotFoundException('Inscription introuvable');
    if (row.status === 'CANCELLED') throw new ConflictException({ statusCode: 409, error: 'ALREADY_CANCELLED', message: 'Inscription déjà annulée' });
    if (row.status === 'PENDING' || !row.akambi_enrollment_id) throw new ConflictException({ statusCode: 409, error: 'ENROLLMENT_PENDING', message: 'Inscription encore en attente de confirmation par Akambi' });

    let remote: AkambiEnrollment | null = null;
    try {
      remote = await this.akambi.cancelEnrollment(row.akambi_enrollment_id);
    } catch (err) {
      if (!(err instanceof AkambiError) || err.code !== 'ENROLLMENT_NOT_FOUND') throw academyHttpError(err);
    }
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const updated = remote
        ? await applyEnrollmentState(trx, row.id, remote)
        : await trx.updateTable('academy_enrollments').set({ status: 'CANCELLED', last_error_code: 'ENROLLMENT_NOT_FOUND' }).where('id', '=', row.id).returningAll().executeTakeFirst();
      // Version locale plus récente que la réponse (rare) : l'annulation confirmée par Akambi prime.
      if (!updated) await trx.updateTable('academy_enrollments').set({ status: 'CANCELLED' }).where('id', '=', row.id).execute();
      await this.audit.log(trx, { adminId, action: 'academy_cancel_enrollment', entityType: 'academy_enrollment', entityId: row.id, ip, details: { previous_status: row.status, akambi_found: remote !== null } });
      this.logger.log(`inscription Academy ${row.id} annulée par un administrateur`);
      return { id: row.id, status: 'CANCELLED' as const };
    });
  }
}
