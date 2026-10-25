import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import { SERVICE_CONTEXT } from '../database/database.service';
import { withFakeTrx } from '../../test/unit/fake-trx';
import { AccountStatusService, assertActiveAccount } from './account-status.service';

describe('assertActiveAccount', () => {
  it('compte actif : accepté', () => {
    expect(() => assertActiveAccount({ deleted_at: null, banned_until: null })).not.toThrow();
  });

  it('suspension terminée : accepté', () => {
    expect(() => assertActiveAccount({ deleted_at: null, banned_until: new Date(Date.now() - 1_000) })).not.toThrow();
  });

  it('suspension en cours : 403 « Compte suspendu »', () => {
    const run = () => assertActiveAccount({ deleted_at: null, banned_until: new Date(Date.now() + 60_000) });
    expect(run).toThrow(ForbiddenException);
    expect(run).toThrow('Compte suspendu');
  });

  it('compte supprimé : 401, même s’il est aussi suspendu', () => {
    expect(() => assertActiveAccount({ deleted_at: new Date(), banned_until: new Date(Date.now() + 60_000) })).toThrow(UnauthorizedException);
  });

  it('compte introuvable : 401 « Compte introuvable »', () => {
    expect(() => assertActiveAccount(undefined)).toThrow(UnauthorizedException);
    expect(() => assertActiveAccount(undefined)).toThrow('Compte introuvable');
  });
});

describe('AccountStatusService.assertActive', () => {
  /** DatabaseService réduit à runAs, exécuté sur la transaction simulée. */
  function database(row: { deleted_at: Date | null; banned_until: Date | null } | undefined) {
    const contexts: unknown[] = [];
    const queries: unknown[] = [];
    const db = {
      runAs: (ctx: unknown, fn: Parameters<DatabaseService['runAs']>[1]) => {
        contexts.push(ctx);
        return withFakeTrx(() => (row ? [row] : []), fn).then((r) => {
          queries.push(...r.queries);
          return r.result;
        });
      },
    } as Pick<DatabaseService, 'runAs'> as DatabaseService;
    return { db, contexts, queries };
  }

  it('lit l’état du compte dans le contexte service et accepte un compte actif', async () => {
    const { db, contexts, queries } = database({ deleted_at: null, banned_until: null });
    await expect(new AccountStatusService(db).assertActive('u-1')).resolves.toBeUndefined();
    expect(contexts).toEqual([SERVICE_CONTEXT]);
    expect(queries).toEqual([expect.objectContaining({ parameters: ['u-1'] })]);
  });

  it('refuse un compte suspendu (403) ou supprimé (401)', async () => {
    await expect(new AccountStatusService(database({ deleted_at: null, banned_until: new Date(Date.now() + 60_000) }).db).assertActive('u-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(new AccountStatusService(database({ deleted_at: new Date(), banned_until: null }).db).assertActive('u-1')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(new AccountStatusService(database(undefined).db).assertActive('u-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
