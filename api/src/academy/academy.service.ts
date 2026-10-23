import { BadGatewayException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { AcademyCoursesTable } from '../database/types';
import { AcademyCourseView, akambiCourseSchema, AkambiCourseInput } from './academy.dto';
import { AKAMBI_CLIENT, AkambiClient, AkambiError } from './akambi.client';

/** Avec updatedSince, Akambi renvoie aussi les formations archivées (§ 6.1) : la date d'origine donne le catalogue complet. */
const FULL_CATALOGUE_SINCE = new Date(0);
const PAGE_LIMIT = 100;
const MAX_PAGES = 200;

export interface CatalogSyncResult {
  skipped?: true;
  reason?: string;
  fetched: number;
  upserted: number;
  invalid: number;
  hidden: number;
  cursor: string | null;
}

@Injectable()
export class AcademyService {
  private readonly logger = new Logger(AcademyService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(AKAMBI_CLIENT) private readonly akambi: AkambiClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Accès praticien (plan § 4.3) : Academy activée, fiche praticien hors coach sportif (inclusion des coachs
   * à arbitrer, § 10), dossier KYC validé et e-mail vérifié — sans e-mail vérifié, un compte Akambi pourrait
   * être créé ou rattaché sur une adresse que le praticien ne possède pas. Le compte actif est déjà contrôlé
   * par JwtAuthGuard.
   */
  async assertAccess(userId: string): Promise<void> {
    if (!this.config.ACADEMY_ENABLED) throw new ServiceUnavailableException('DomiCares Academy n’est pas encore disponible');
    const row = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('users')
        .leftJoin('practitioners', 'practitioners.user_id', 'users.id')
        .select(['users.email_verified_at', 'practitioners.id as practitioner_id', 'practitioners.practitioner_type', 'practitioners.kyc_status'])
        .where('users.id', '=', userId)
        .executeTakeFirst());
    if (!row?.practitioner_id || row.practitioner_type === 'coach_sportif') throw new ForbiddenException('DomiCares Academy est réservée aux praticiens DomiCares');
    if (row.kyc_status !== 'approved') throw new ForbiddenException('Votre dossier praticien doit être validé pour accéder à DomiCares Academy');
    if (!row.email_verified_at) throw new ForbiddenException('Vérifiez votre adresse e-mail pour accéder à DomiCares Academy');
  }

  async listCourses(userId: string): Promise<AcademyCourseView[]> {
    await this.assertAccess(userId);
    const rows = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('academy_courses').selectAll().where('status', '=', 'PUBLISHED').orderBy('title').orderBy('id').execute());
    return rows.map(toView);
  }

  async getCourse(userId: string, courseId: string): Promise<AcademyCourseView> {
    await this.assertAccess(userId);
    const row = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('academy_courses').selectAll().where('id', '=', courseId).where('status', '=', 'PUBLISHED').executeTakeFirst());
    if (!row) throw new NotFoundException('Formation introuvable');
    return toView(row);
  }

  /**
   * Job academy.catalog.sync : relit le catalogue complet (formations archivées comprises), l'enregistre
   * sans jamais remplacer une version plus récente, puis masque (ARCHIVED) les formations qui ne figurent
   * plus dans le catalogue DomiCares. Le masquage n'a lieu que si la lecture est complète et cohérente
   * avec le total annoncé ; une formation illisible est écartée et signalée dans academy_sync_state.
   */
  async syncCatalog(): Promise<CatalogSyncResult> {
    if (!this.config.ACADEMY_ENABLED) return { skipped: true, reason: 'academy_disabled', fetched: 0, upserted: 0, invalid: 0, hidden: 0, cursor: null };
    const startedAt = new Date();
    await this.saveState({ last_run_at: startedAt });
    try {
      const seen = new Set<string>();
      let fetched = 0;
      let upserted = 0;
      let invalid = 0;
      let total = 0;
      let cursor: Date | null = null;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await this.akambi.listCourses({ page, limit: PAGE_LIMIT, updatedSince: FULL_CATALOGUE_SINCE });
        total = res.pagination.total;
        const valid: AkambiCourseInput[] = [];
        for (const item of res.items) {
          fetched++;
          const parsed = akambiCourseSchema.safeParse(item);
          if (!parsed.success) {
            invalid++;
            this.logger.warn(`formation Akambi illisible ignorée (${typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : 'sans identifiant'}) : ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
            continue;
          }
          valid.push(parsed.data);
          seen.add(parsed.data.id);
          const updatedAt = new Date(parsed.data.updatedAt);
          if (!cursor || updatedAt > cursor) cursor = updatedAt;
        }
        upserted += await this.upsertCourses(valid);
        if (res.items.length === 0 || page >= res.pagination.totalPages) break;
      }

      let hidden = 0;
      const complete = invalid === 0 && seen.size > 0 && seen.size === total;
      if (complete) {
        hidden = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
          const res = await trx.updateTable('academy_courses').set({ status: 'ARCHIVED', synced_at: new Date() })
            .where('status', '=', 'PUBLISHED').where('id', 'not in', [...seen]).executeTakeFirst();
          return Number(res.numUpdatedRows);
        });
      }
      const lastError = invalid > 0 ? `${invalid} formation(s) illisible(s) ignorée(s)` : complete ? null : `lecture incomplète (${seen.size}/${total}) : aucune formation masquée`;
      await this.saveState({ cursor, last_success_at: new Date(), last_error: lastError });
      return { fetched, upserted, invalid, hidden, cursor: cursor?.toISOString() ?? null };
    } catch (err) {
      // Code stable seulement : le message d'Akambi peut reprendre des données d'apprenant. Il n'est ni
      // enregistré ni relancé, sans quoi le filtre HTTP ou le worker le journaliserait.
      if (!(err instanceof AkambiError)) {
        await this.saveState({ last_error: 'erreur interne de synchronisation' });
        throw err;
      }
      const summary = `Akambi ${err.status} ${err.code}`;
      await this.saveState({ last_error: summary });
      throw new BadGatewayException(`Synchronisation du catalogue impossible (${summary})`);
    }
  }

  private async upsertCourses(courses: AkambiCourseInput[]): Promise<number> {
    if (courses.length === 0) return 0;
    const now = new Date();
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const rows = await trx.insertInto('academy_courses')
        .values(courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          type: c.type,
          status: c.status,
          category_code: c.category?.code ?? null,
          category_title: c.category?.title ?? null,
          public_price_amount: c.publicPrice?.amount ?? null,
          public_price_currency: c.publicPrice?.currency ?? null,
          module_count: c.moduleCount,
          chapter_count: c.chapterCount,
          cover_image_url: c.coverImageUrl,
          presentation_url: c.presentationUrl,
          akambi_created_at: c.createdAt,
          akambi_updated_at: c.updatedAt,
          synced_at: now,
        })))
        .onConflict((oc) => oc.column('id')
          .doUpdateSet((eb) => ({
            title: eb.ref('excluded.title'),
            description: eb.ref('excluded.description'),
            type: eb.ref('excluded.type'),
            status: eb.ref('excluded.status'),
            category_code: eb.ref('excluded.category_code'),
            category_title: eb.ref('excluded.category_title'),
            public_price_amount: eb.ref('excluded.public_price_amount'),
            public_price_currency: eb.ref('excluded.public_price_currency'),
            module_count: eb.ref('excluded.module_count'),
            chapter_count: eb.ref('excluded.chapter_count'),
            cover_image_url: eb.ref('excluded.cover_image_url'),
            presentation_url: eb.ref('excluded.presentation_url'),
            akambi_created_at: eb.ref('excluded.akambi_created_at'),
            akambi_updated_at: eb.ref('excluded.akambi_updated_at'),
            synced_at: eb.ref('excluded.synced_at'),
          }))
          // Une version reçue plus ancienne que celle détenue ne la remplace pas. À version égale, la ligne est
          // réécrite : une formation masquée faute de figurer au catalogue y redevient visible à son retour.
          .where((eb) => eb('academy_courses.akambi_updated_at', '<=', eb.ref('excluded.akambi_updated_at'))))
        .returning('id')
        .execute();
      return rows.length;
    });
  }

  private async saveState(values: { cursor?: Date | null; last_run_at?: Date; last_success_at?: Date; last_error?: string | null }): Promise<void> {
    await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.insertInto('academy_sync_state').values({ key: 'courses', ...values })
        .onConflict((oc) => oc.column('key').doUpdateSet(values))
        .execute());
  }
}

function toView(row: Selectable<AcademyCoursesTable>): AcademyCourseView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    category: row.category_code ? { code: row.category_code, title: row.category_title } : null,
    publicPrice: row.public_price_amount !== null && row.public_price_currency ? { amount: Number(row.public_price_amount), currency: row.public_price_currency } : null,
    moduleCount: row.module_count,
    chapterCount: row.chapter_count,
    coverImageUrl: row.cover_image_url,
    presentationUrl: row.presentation_url,
    updatedAt: row.akambi_updated_at.toISOString(),
  };
}
