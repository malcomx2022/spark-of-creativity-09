import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
  type Transaction,
} from 'kysely';
import type { DB } from '../../src/database/types';

/** Requête compilée par Kysely telle qu'elle partirait vers PostgreSQL. */
export interface RecordedQuery {
  sql: string;
  parameters: readonly unknown[];
}

/** Réponse simulée : lignes renvoyées pour la requête, vide par défaut. */
export type QueryHandler = (query: RecordedQuery) => Record<string, unknown>[] | undefined;

/**
 * Transaction Kysely sans base : chaque requête est compilée par le vrai compilateur PostgreSQL,
 * enregistrée, et reçoit les lignes que renvoie `handler`. Pour les tests unitaires des services
 * (les e2e couvrent l'exécution réelle sur PostgreSQL 16).
 */
export async function withFakeTrx<T>(handler: QueryHandler, fn: (trx: Transaction<DB>, queries: RecordedQuery[]) => Promise<T>): Promise<{ result: T; queries: RecordedQuery[] }> {
  const queries: RecordedQuery[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      if (/^(begin|commit|rollback)\b/i.test(compiled.sql)) return { rows: [] };
      const query = { sql: compiled.sql, parameters: compiled.parameters };
      queries.push(query);
      return { rows: (handler(query) ?? []) as R[] };
    },
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('streamQuery non simulé');
    },
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() { return connection; },
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const result = await db.transaction().execute((trx) => fn(trx, queries));
  await db.destroy();
  return { result, queries };
}
