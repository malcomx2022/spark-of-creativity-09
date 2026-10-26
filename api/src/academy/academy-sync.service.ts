import { BadGatewayException, BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import type { DB } from '../database/types';
import { applyEnrollmentState } from './academy-enrollments.service';
import { akambiEnrollmentSchema, AkambiEnrollmentInput } from './academy.dto';
import { AKAMBI_CLIENT, AkambiClient, AkambiError } from './akambi.client';
import { verifyAkambiWebhookSignature } from './akambi.signature';

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Date ISO 8601 attendue');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enveloppe d'un événement (guide § 9.1). */
const webhookEnvelopeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  version: z.number().int().nullable().optional(),
  createdAt: isoDate.nullable().optional(),
  partnerCode: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

/** Attestation d'un événement certificate.issued ou de GET …/certificate ; downloadUrl n'est jamais lu ni stocké. */
const certificateSchema = z.object({
  id: z.string().min(1).max(200),
  enrollmentId: z.string(),
  learnerName: z.string(),
  courseTitle: z.string(),
  score: z.object({ correctAnswers: z.number().int().nonnegative(), totalQuestions: z.number().int().nonnegative() }).nullable(),
  completionDate: isoDate.nullable(),
  issuedAt: isoDate,
  verificationUrl: z.string().url(),
});

/** Onglet Academy de l'espace praticien (chemin autorisé par notificationPath / pushTargetPath / sw.js). */
const ACADEMY_LINK = '/dashboard/practitioner?tab=academy';
const ENROLLMENT_EVENTS = new Set(['enrollment.created', 'progress.updated', 'course.completed', 'enrollment.cancelled', 'certificate.issued']);
const PAGE_LIMIT = 100;
const MAX_REQUESTS = 1000;

type Outcome = { status: 'processed' | 'ignored' | 'failed'; message: string | null };

export interface ReconcileResult {
  skipped?: true;
  reason?: string;
  fetched: number;
  applied: number;
  unchanged: number;
  unknown: number;
  invalid: number;
  certificates: number;
  cursor: string | null;
}

/**
 * Suivi des inscriptions (lot A5) : réception des webhooks Akambi et rapprochement périodique par updatedSince.
 * Les deux chemins appliquent le même état complet par applyEnrollmentState : doublons et désordre sont sans
 * effet (dédoublonnage sur l'identifiant d'événement, version plus ancienne ignorée).
 */
@Injectable()
export class AcademySyncService {
  private readonly logger = new Logger(AcademySyncService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(AKAMBI_CLIENT) private readonly akambi: AkambiClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly inApp: InAppNotificationsService,
  ) {}

  /**
   * Applique l'état reçu et prévient le praticien, dans la même transaction, quand la formation passe à terminée ou
   * à attestée (notification in-app ; le titre de la formation n'est pas une donnée de santé). Un doublon ou un état
   * plus ancien ne notifie pas : le statut ne change pas.
   */
  private async applyAndNotify(trx: Transaction<DB>, localId: string, remote: AkambiEnrollmentInput) {
    const before = await trx.selectFrom('academy_enrollments').select('status').where('id', '=', localId).executeTakeFirst();
    const applied = await applyEnrollmentState(trx, localId, remote);
    if (applied && before && applied.status !== before.status && (applied.status === 'COMPLETED' || applied.status === 'CERTIFIED')) {
      const course = await trx.selectFrom('academy_courses').select('title').where('id', '=', applied.course_id).executeTakeFirst();
      const title = course?.title ?? remote.courseTitle;
      await this.inApp.notifyUser(trx, applied.user_id, applied.status === 'CERTIFIED'
        ? { title: 'Attestation disponible', message: `Votre attestation pour « ${title} » est disponible dans DomiCares Academy.`, type: 'academy', link: ACADEMY_LINK }
        : { title: 'Formation terminée', message: `Vous avez terminé « ${title} ». L'évaluation finale permet d'obtenir l'attestation.`, type: 'academy', link: ACADEMY_LINK });
    }
    return applied;
  }

  private get webhookSecrets(): string[] {
    return (this.config.AKAMBI_WEBHOOK_SECRETS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * POST /api/webhooks/akambi. La signature est vérifiée sur le corps brut, avant tout parsing ; l'événement est
   * enregistré puis appliqué dans une transaction courte, et la réponse part bien avant la limite de 10 s.
   * Un contenu illisible est enregistré en échec et acquitté (une nouvelle tentative n'y changerait rien) ;
   * une erreur de base de données répond 500 pour qu'Akambi retente.
   */
  async handleWebhook(rawBody: Buffer | string | undefined, signature: string | undefined, eventIdHeader: string | undefined) {
    const secrets = this.webhookSecrets;
    if (!this.config.ACADEMY_ENABLED || secrets.length === 0) throw new ServiceUnavailableException('Réception des événements Academy non configurée');
    if (rawBody === undefined) throw new BadRequestException('Corps de requête absent');
    const check = verifyAkambiWebhookSignature(rawBody, signature, secrets);
    if (!check.ok) throw new UnauthorizedException(check.reason === 'stale' ? 'Signature expirée' : 'Signature invalide');

    let json: unknown;
    try {
      json = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Corps JSON invalide');
    }
    const envelope = webhookEnvelopeSchema.safeParse(json);
    if (!envelope.success) throw new BadRequestException('Événement Akambi invalide');
    const event = envelope.data;
    if (eventIdHeader && eventIdHeader !== event.id) throw new BadRequestException('Identifiant d’événement incohérent');

    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const inserted = await trx.insertInto('academy_webhook_events')
        .values({
          event_id: event.id,
          event_type: event.type,
          event_version: event.version ?? null,
          payload: JSON.stringify(json),
          signed_at: new Date(check.timestamp * 1000),
          akambi_created_at: event.createdAt ?? null,
        })
        .onConflict((oc) => oc.column('event_id').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!inserted) return { received: true, duplicate: true };

      const outcome = await this.processEvent(trx, event.type, event.data);
      await trx.updateTable('academy_webhook_events')
        .set({ processing_status: outcome.status, processed_at: new Date(), error_message: outcome.message })
        .where('id', '=', inserted.id).execute();
      if (outcome.status !== 'processed') this.logger.warn(`événement Akambi ${event.id} (${event.type}) ${outcome.status} : ${outcome.message}`);
      return { received: true, status: outcome.status };
    });
  }

  private async processEvent(trx: Transaction<DB>, type: string, data: Record<string, unknown>): Promise<Outcome> {
    if (type === 'webhook.test') return { status: 'ignored', message: 'événement de test' };
    if (!ENROLLMENT_EVENTS.has(type)) return { status: 'ignored', message: 'type d’événement non pris en charge' };
    const parsed = akambiEnrollmentSchema.safeParse(data.enrollment);
    if (!parsed.success) return { status: 'failed', message: `inscription illisible (${parsed.error.issues.map((i) => i.path.join('.')).join(', ')})` };
    const remote = parsed.data;

    const localId = await this.localEnrollmentId(trx, remote);
    if (!localId) return { status: 'ignored', message: 'inscription inconnue de DomiCares' };

    const applied = await this.applyAndNotify(trx, localId, remote);
    if (type === 'certificate.issued') {
      const certificate = certificateSchema.safeParse(data.certificate);
      if (!certificate.success) return { status: 'failed', message: `attestation illisible (${certificate.error.issues.map((i) => i.path.join('.')).join(', ')})` };
      await upsertCertificate(trx, localId, certificate.data);
    }
    return applied ? { status: 'processed', message: null } : { status: 'ignored', message: 'état plus ancien que la version détenue' };
  }

  /**
   * Ligne locale d'une inscription Akambi : par son identifiant Akambi, sinon la demande encore en attente du même
   * apprenant pour la même formation (l'événement enrollment.created peut précéder l'enregistrement de la réponse).
   * Une inscription annulée n'est jamais rattachée ainsi : Akambi attribue un nouvel identifiant à la réinscription,
   * et liste aussi les annulations (réponse du 26 octobre 2026) ; une ancienne annulation fermerait la nouvelle demande.
   */
  private async localEnrollmentId(trx: Transaction<DB>, remote: AkambiEnrollmentInput): Promise<string | null> {
    const byId = await trx.selectFrom('academy_enrollments').select('id').where('akambi_enrollment_id', '=', remote.id).executeTakeFirst();
    if (byId) return byId.id;
    if (remote.status === 'CANCELLED') return null;
    const userId = remote.externalLearnerId.startsWith('DC-') ? remote.externalLearnerId.slice(3) : '';
    if (!UUID.test(userId)) return null;
    const pending = await trx.selectFrom('academy_enrollments')
      .innerJoin('academy_learners', 'academy_learners.user_id', 'academy_enrollments.user_id')
      .select('academy_enrollments.id')
      .where('academy_learners.external_learner_id', '=', remote.externalLearnerId)
      .where('academy_enrollments.course_id', '=', remote.courseId)
      .where('academy_enrollments.status', '=', 'PENDING')
      .where('academy_enrollments.akambi_enrollment_id', 'is', null)
      .executeTakeFirst();
    return pending?.id ?? null;
  }

  /**
   * Job academy.enrollments.reconcile : inscriptions modifiées depuis le dernier curseur (GET /enrollments?updatedSince).
   * La lecture repart de la première page à chaque avancée du curseur (liste triée par updatedAt) pour ne rien
   * sauter pendant que des inscriptions changent. Les attestations délivrées mais absentes localement sont relues.
   * Une inscription illisible retient le curseur : elle sera relue au passage suivant.
   */
  async reconcileEnrollments(): Promise<ReconcileResult> {
    const empty = { fetched: 0, applied: 0, unchanged: 0, unknown: 0, invalid: 0, certificates: 0, cursor: null };
    if (!this.config.ACADEMY_ENABLED) return { skipped: true, reason: 'academy_disabled', ...empty };
    const state = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('academy_sync_state').select('cursor').where('key', '=', 'enrollments').executeTakeFirst());
    const start = state?.cursor ?? new Date(0);
    await this.saveState({ last_run_at: new Date() });
    const result: ReconcileResult = { ...empty };
    let since = start;
    let maxSeen = start;
    try {
      let page = 1;
      for (let request = 0; request < MAX_REQUESTS; request++) {
        const res = await this.akambi.listEnrollments({ updatedSince: since, page, limit: PAGE_LIMIT });
        for (const item of res.items) {
          result.fetched++;
          const parsed = akambiEnrollmentSchema.safeParse(item);
          if (!parsed.success) {
            result.invalid++;
            continue;
          }
          const remote = parsed.data;
          const updatedAt = new Date(remote.updatedAt);
          if (updatedAt > maxSeen) maxSeen = updatedAt;
          const outcome = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
            const localId = await this.localEnrollmentId(trx, remote);
            if (!localId) return null;
            const applied = await this.applyAndNotify(trx, localId, remote);
            const hasCertificate = await trx.selectFrom('academy_certificates').select('id').where('enrollment_id', '=', localId).executeTakeFirst();
            return { localId, applied: !!applied, needsCertificate: remote.status === 'CERTIFIED' && !hasCertificate };
          });
          if (!outcome) {
            result.unknown++;
            continue;
          }
          if (outcome.applied) result.applied++;
          else result.unchanged++;
          if (outcome.needsCertificate) {
            const certificate = certificateSchema.safeParse(await this.akambi.getCertificate(remote.id));
            if (certificate.success) {
              await this.database.runAs(SERVICE_CONTEXT, (trx) => upsertCertificate(trx, outcome.localId, certificate.data));
              result.certificates++;
            } else {
              result.invalid++;
            }
          }
        }
        if (res.items.length < PAGE_LIMIT) break;
        if (maxSeen > since) {
          since = maxSeen;
          page = 1;
        } else {
          page++;
        }
      }
      const cursor = result.invalid === 0 ? maxSeen : start;
      await this.saveState({ cursor, last_success_at: new Date(), last_error: result.invalid > 0 ? `${result.invalid} élément(s) illisible(s) : curseur conservé` : null });
      return { ...result, cursor: cursor.getTime() === 0 ? null : cursor.toISOString() };
    } catch (err) {
      if (!(err instanceof AkambiError)) {
        await this.saveState({ last_error: 'erreur interne de rapprochement' });
        throw err;
      }
      const summary = `Akambi ${err.status} ${err.code}`;
      await this.saveState({ last_error: summary });
      throw new BadGatewayException(`Rapprochement des inscriptions impossible (${summary})`);
    }
  }

  private async saveState(values: { cursor?: Date | null; last_run_at?: Date; last_success_at?: Date; last_error?: string | null }): Promise<void> {
    await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.insertInto('academy_sync_state').values({ key: 'enrollments', ...values })
        .onConflict((oc) => oc.column('key').doUpdateSet(values))
        .execute());
  }
}

/** Enregistre ou met à jour l'attestation d'une inscription (métadonnées et lien de vérification seulement). */
export async function upsertCertificate(trx: Transaction<DB>, enrollmentId: string, certificate: z.infer<typeof certificateSchema>): Promise<void> {
  const values = {
    learner_name: certificate.learnerName,
    course_title: certificate.courseTitle,
    score_correct: certificate.score?.correctAnswers ?? null,
    score_total: certificate.score?.totalQuestions ?? null,
    completion_date: certificate.completionDate,
    issued_at: certificate.issuedAt,
    verification_url: certificate.verificationUrl,
  };
  await trx.insertInto('academy_certificates').values({ id: certificate.id, enrollment_id: enrollmentId, ...values })
    .onConflict((oc) => oc.column('id').doUpdateSet(values))
    .execute();
}
