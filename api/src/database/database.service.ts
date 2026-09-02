import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, sql, Transaction } from 'kysely';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DB } from './types';

/** Contexte d'exécution transmis à PostgreSQL via SET LOCAL (lu par auth.uid()/auth.role()/auth.jwt()). */
export interface DbContext {
  userId?: string | null;
  email?: string | null;
  /** 'service_role' = opérations système (auth, jobs) ; 'authenticated' = requête utilisateur. */
  role: 'anon' | 'authenticated' | 'service_role';
}

export const SERVICE_CONTEXT: DbContext = { role: 'service_role' };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: Kysely<DB>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });
    this.pool.on('error', (err) => this.logger.error(`Erreur pool PostgreSQL : ${err.message}`));
    this.db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: this.pool }) });
  }

  /**
   * Exécute `fn` dans une transaction dont les variables de session app.user_id /
   * app.user_role / app.user_email sont positionnées : les fonctions SQL héritées
   * (auth.uid(), is_admin(auth.uid()), approve_practitioner_kyc…) et les policies
   * RLS encore actives (users, refresh_tokens, auth_tokens) voient l'utilisateur courant.
   */
  async runAs<T>(ctx: DbContext, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await sql`select
        set_config('app.user_id', ${ctx.userId ?? ''}, true),
        set_config('app.user_role', ${ctx.role}, true),
        set_config('app.user_email', ${ctx.email ?? ''}, true)`.execute(trx);
      return fn(trx);
    });
  }

  async ping(): Promise<boolean> {
    const r = await sql<{ ok: number }>`select 1 as ok`.execute(this.db);
    return r.rows[0]?.ok === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
