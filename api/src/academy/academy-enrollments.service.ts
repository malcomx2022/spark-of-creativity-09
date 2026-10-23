import { BadGatewayException, BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type Selectable, type Transaction } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { AcademyEnrollmentsTable, AcademyLearnersTable, DB } from '../database/types';
import { AcademyEnrollmentView, AcademyLaunchView, akambiEnrollmentSchema, EnrollDto } from './academy.dto';
import { academyHttpError, isDefinitive } from './academy.errors';
import { AcademyService } from './academy.service';
import { AKAMBI_CLIENT, AkambiClient, AkambiEnrollment, AkambiError } from './akambi.client';

type LearnerRow = Selectable<AcademyLearnersTable>;
type EnrollmentRow = Selectable<AcademyEnrollmentsTable>;

/**
 * Rattachement du compte de formation, inscription et accès au cours (plan § 4.2 à § 4.4, lot A4).
 * Chaque écriture chez Akambi est précédée d'une ligne locale portant sa clé d'idempotence : une reprise après
 * coupure réseau ou redémarrage rejoue la même clé et ne crée pas de doublon (guide § 4.4).
 */
@Injectable()
export class AcademyEnrollmentsService {
  private readonly logger = new Logger(AcademyEnrollmentsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly academy: AcademyService,
    @Inject(AKAMBI_CLIENT) private readonly akambi: AkambiClient,
  ) {}

  private run<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.database.runAs(SERVICE_CONTEXT, fn);
  }

  /** Inscrit le praticien à une formation publiée ; une inscription active existante est renvoyée telle quelle. */
  async enroll(userId: string, dto: EnrollDto): Promise<{ created: boolean; enrollment: AcademyEnrollmentView }> {
    await this.academy.assertAccess(userId);
    const course = await this.run((trx) => trx.selectFrom('academy_courses').select(['id', 'title']).where('id', '=', dto.courseId).where('status', '=', 'PUBLISHED').executeTakeFirst());
    if (!course) throw new NotFoundException({ statusCode: 404, error: 'COURSE_NOT_FOUND', message: 'Formation introuvable' });

    const existing = await this.activeEnrollment(userId, course.id);
    if (existing && existing.status !== 'PENDING') return { created: false, enrollment: toView(existing, course.title) };

    const learner = await this.ensureLearner(userId, dto);

    // Ligne PENDING créée avant l'appel ; l'index unique partiel arbitre deux demandes simultanées.
    await this.run((trx) => trx.insertInto('academy_enrollments').values({ user_id: userId, course_id: course.id })
      .onConflict((oc) => oc.columns(['user_id', 'course_id']).where('status', '<>', 'CANCELLED').doNothing()).execute());
    const pending = await this.activeEnrollment(userId, course.id);
    if (!pending) throw new BadGatewayException({ statusCode: 502, error: 'AKAMBI_UNAVAILABLE', message: 'Inscription momentanément impossible. Réessayez.' });
    if (pending.status !== 'PENDING') return { created: false, enrollment: toView(pending, course.title) };

    let remote: AkambiEnrollment;
    try {
      remote = (await this.akambi.createEnrollment({ externalLearnerId: learner.external_learner_id, courseId: course.id }, pending.idempotency_key)).resource;
    } catch (err) {
      if (err instanceof AkambiError) {
        // Refus définitif : la ligne PENDING est retirée pour qu'une demande ultérieure reparte d'une clé neuve.
        if (isDefinitive(err)) await this.run((trx) => trx.deleteFrom('academy_enrollments').where('id', '=', pending.id).where('status', '=', 'PENDING').execute());
        else await this.run((trx) => trx.updateTable('academy_enrollments').set({ last_error_code: err.code }).where('id', '=', pending.id).execute());
      }
      throw academyHttpError(err);
    }
    if (remote.externalLearnerId !== learner.external_learner_id || remote.courseId !== course.id) {
      this.logger.error(`inscription Akambi incohérente pour ${pending.id} (apprenant ou formation différent)`);
      throw new BadGatewayException({ statusCode: 502, error: 'AKAMBI_UNAVAILABLE', message: 'Réponse inattendue du service de formation. Réessayez.' });
    }
    let updated: EnrollmentRow | undefined;
    try {
      updated = await this.run((trx) => applyEnrollmentState(trx, pending.id, remote));
    } catch (err) {
      throw academyHttpError(err);
    }
    return { created: true, enrollment: toView(updated ?? pending, course.title) };
  }

  /** Inscriptions du praticien, la plus récente d'abord ; les annulées restent visibles comme historique. */
  async listMine(userId: string): Promise<AcademyEnrollmentView[]> {
    await this.academy.assertAccess(userId);
    const rows = await this.run((trx) => trx.selectFrom('academy_enrollments')
      .innerJoin('academy_courses', 'academy_courses.id', 'academy_enrollments.course_id')
      .selectAll('academy_enrollments').select('academy_courses.title as course_title')
      .where('academy_enrollments.user_id', '=', userId)
      .orderBy('academy_enrollments.created_at', 'desc')
      .execute());
    return rows.map((r) => toView(r, r.course_title));
  }

  /**
   * Lien d'accès demandé au clic (§ 7) : jamais stocké ni journalisé. Une inscription d'un autre praticien,
   * en attente ou annulée répond 404, comme un identifiant inconnu.
   */
  async launch(userId: string, enrollmentId: string): Promise<AcademyLaunchView> {
    await this.academy.assertAccess(userId);
    const row = await this.run((trx) => trx.selectFrom('academy_enrollments')
      .innerJoin('academy_learners', 'academy_learners.user_id', 'academy_enrollments.user_id')
      .select(['academy_enrollments.course_id', 'academy_enrollments.akambi_enrollment_id', 'academy_learners.external_learner_id', 'academy_learners.link_status'])
      .where('academy_enrollments.id', '=', enrollmentId)
      .where('academy_enrollments.user_id', '=', userId)
      .where('academy_enrollments.status', 'not in', ['PENDING', 'CANCELLED'])
      .executeTakeFirst());
    if (!row || row.link_status !== 'linked') throw new NotFoundException('Inscription introuvable');
    try {
      const launch = await this.akambi.launchSso({ externalLearnerId: row.external_learner_id, courseId: row.course_id });
      return { mode: launch.mode, url: launch.url, expiresAt: launch.expiresAt };
    } catch (err) {
      if (err instanceof AkambiError && err.code === 'ENROLLMENT_NOT_FOUND' && row.akambi_enrollment_id) await this.closeIfGone(enrollmentId, row.akambi_enrollment_id);
      throw academyHttpError(err);
    }
  }

  /**
   * Inscription retirée chez Akambi (DELETE) dont l'événement enrollment.cancelled n'a pas été reçu : confirmée par
   * GET /enrollments/{id} (404 après suppression, guide § 8), elle est close localement en CANCELLED.
   */
  private async closeIfGone(enrollmentId: string, akambiEnrollmentId: string): Promise<void> {
    try {
      await this.akambi.getEnrollment(akambiEnrollmentId);
    } catch (err) {
      if (!(err instanceof AkambiError) || err.code !== 'ENROLLMENT_NOT_FOUND') return;
      await this.run((trx) => trx.updateTable('academy_enrollments').set({ status: 'CANCELLED', last_error_code: 'ENROLLMENT_NOT_FOUND' }).where('id', '=', enrollmentId).where('status', '<>', 'CANCELLED').execute());
      this.logger.warn(`inscription ${enrollmentId} absente chez Akambi : close localement`);
    }
  }

  /**
   * Compte de formation du praticien : créé ou rattaché chez Akambi au premier besoin (POST /learners).
   * Les refus 409 sont conservés (link_status = failed) puis retentés à la demande suivante : ils dépendent
   * d'une action du support. Une clé d'idempotence déjà employée avec un autre corps (e-mail ou nom modifié
   * entre deux tentatives) est renouvelée une fois.
   */
  private async ensureLearner(userId: string, dto: EnrollDto): Promise<LearnerRow> {
    const identity = await this.run((trx) => trx.selectFrom('users')
      .leftJoin('profiles', 'profiles.id', 'users.id')
      .leftJoin('practitioners', 'practitioners.user_id', 'users.id')
      .select(['users.email', 'profiles.full_name', 'practitioners.name as practitioner_name'])
      .where('users.id', '=', userId)
      .executeTakeFirstOrThrow());
    if (!identity.email) throw new BadRequestException({ statusCode: 400, error: 'EMAIL_REQUIRED', message: 'Une adresse e-mail vérifiée est nécessaire pour DomiCares Academy' });

    let learner = await this.learner(userId);
    if (learner?.link_status === 'linked') return learner;
    if (!learner) {
      await this.run((trx) => trx.insertInto('academy_learners').values({ user_id: userId, external_learner_id: `DC-${userId}`, email: identity.email as string })
        .onConflict((oc) => oc.column('user_id').doNothing()).execute());
      learner = (await this.learner(userId)) as LearnerRow;
      if (learner.link_status === 'linked') return learner;
    }

    const names = dto.firstName && dto.lastName ? { firstName: dto.firstName, lastName: dto.lastName } : splitName(identity.full_name ?? identity.practitioner_name);
    if (!names) throw new BadRequestException({ statusCode: 400, error: 'LEARNER_NAME_REQUIRED', message: 'Indiquez votre prénom et votre nom : ils figureront sur vos attestations.' });
    const input = { externalLearnerId: learner.external_learner_id, email: identity.email, firstName: names.firstName, lastName: names.lastName };

    let key = learner.idempotency_key;
    for (let attempt = 1; ; attempt++) {
      try {
        const { resource } = await this.akambi.upsertLearner(input, key);
        if (resource.externalLearnerId !== learner.external_learner_id) throw new AkambiError('Apprenant incohérent', 502, 'INVALID_RESPONSE');
        const linked = await this.run((trx) => trx.updateTable('academy_learners')
          .set({ link_status: 'linked', akambi_learner_id: resource.learnerId, account_origin: resource.accountOrigin, email: identity.email as string, akambi_updated_at: resource.updatedAt, last_error_code: null, idempotency_key: key })
          .where('user_id', '=', userId).returningAll().executeTakeFirstOrThrow());
        return linked;
      } catch (err) {
        if (err instanceof AkambiError && err.code === 'IDEMPOTENCY_KEY_REUSED' && attempt === 1) {
          key = (await sql<{ k: string }>`select gen_random_uuid()::text as k`.execute(this.database.db)).rows[0].k;
          continue;
        }
        if (err instanceof AkambiError) {
          const failed = isDefinitive(err) && err.status === 409;
          await this.run((trx) => trx.updateTable('academy_learners').set({ last_error_code: err.code, ...(failed ? { link_status: 'failed' as const } : {}), idempotency_key: key }).where('user_id', '=', userId).execute());
        }
        throw academyHttpError(err);
      }
    }
  }

  private learner(userId: string): Promise<LearnerRow | undefined> {
    return this.run((trx) => trx.selectFrom('academy_learners').selectAll().where('user_id', '=', userId).executeTakeFirst());
  }

  private activeEnrollment(userId: string, courseId: string): Promise<EnrollmentRow | undefined> {
    return this.run((trx) => trx.selectFrom('academy_enrollments').selectAll().where('user_id', '=', userId).where('course_id', '=', courseId).where('status', '<>', 'CANCELLED').executeTakeFirst());
  }
}

/**
 * Applique l'état complet d'une inscription reçu d'Akambi (réponse d'API, webhook ou rapprochement), sauf si la
 * version locale est plus récente : les événements peuvent arriver dans le désordre (guide § 9.3). Rend la ligne
 * à jour, ou undefined si l'état reçu était plus ancien.
 */
export async function applyEnrollmentState(trx: Transaction<DB>, localId: string, remote: AkambiEnrollment): Promise<EnrollmentRow | undefined> {
  const parsed = akambiEnrollmentSchema.safeParse(remote);
  if (!parsed.success) throw new AkambiError(`Inscription Akambi illisible (${parsed.error.issues.map((i) => i.path.join('.')).join(', ')})`, 502, 'INVALID_RESPONSE');
  const state = parsed.data;
  return trx.updateTable('academy_enrollments')
    .set({
      akambi_enrollment_id: state.id,
      status: state.status,
      progress: state.progress,
      enrolled_at: state.enrolledAt,
      started_at: state.startedAt,
      last_activity_at: state.lastActivityAt,
      completed_at: state.completedAt,
      certificate_id: state.certificateId,
      akambi_updated_at: state.updatedAt,
      last_error_code: null,
    })
    .where('id', '=', localId)
    .where((eb) => eb.or([eb('akambi_updated_at', 'is', null), eb('akambi_updated_at', '<=', new Date(state.updatedAt))]))
    .returningAll()
    .executeTakeFirst();
}

/** « Awa Diallo » → prénom « Awa », nom « Diallo » ; un nom d'un seul mot ne suffit pas pour une attestation. */
export function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } | null {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function toView(row: EnrollmentRow, courseTitle: string): AcademyEnrollmentView {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle,
    status: row.status,
    progress: row.progress,
    enrolledAt: iso(row.enrolled_at),
    startedAt: iso(row.started_at),
    lastActivityAt: iso(row.last_activity_at),
    completedAt: iso(row.completed_at),
    hasCertificate: row.certificate_id !== null,
  };
}
