import { withFakeTrx, type RecordedQuery } from '../../test/unit/fake-trx';
import { BalancesService, parseGroupSessionRef } from './balances.service';

const SESSION = '11111111-2222-4333-8444-555555555555';
const PARTICIPANT = '66666666-7777-4888-9999-000000000000';

describe('parseGroupSessionRef', () => {
  it('extrait séance et participant de group_session_{séance}_{participant}', () => {
    expect(parseGroupSessionRef(`group_session_${SESSION}_${PARTICIPANT}`)).toEqual({ sessionId: SESSION, participantId: PARTICIPANT });
  });

  it.each(['7f1c2e4a-0000-4000-8000-000000000001', 'group_session_', `group_session_${SESSION}`, `session_${SESSION}_${PARTICIPANT}`])('%s : pas une référence de séance', (ref) => {
    expect(parseGroupSessionRef(ref)).toBeNull();
  });
});

describe('BalancesService', () => {
  const isCompute = (q: RecordedQuery) => q.sql.includes('with p as');
  const isRead = (q: RecordedQuery) => q.sql.startsWith('select "balance_available"');
  const isUpsert = (q: RecordedQuery) => q.sql.startsWith('insert into "practitioner_balances"');

  it('compute : agrégats ramenés au praticien, zéro quand aucun paiement', async () => {
    const { result, queries } = await withFakeTrx(() => [], (trx) => new BalancesService().compute(trx, 'prat-1'));
    expect(result).toEqual({ practitioner_id: 'prat-1', balance_available: 0, balance_pending: 0, balance_on_hold: 0 });
    const sql = queries[0];
    // Paiements de rendez-vous et de séances de groupe (le trigger hérité ignorait ces derniers).
    expect(sql.sql).toContain('a.practitioner_id =');
    expect(sql.sql).toContain("like 'group_session_%'");
    expect(sql.parameters).toEqual(['prat-1', 'prat-1']);
    // Un paiement réservé par un reversement en cours n'est plus disponible ; les remboursements partiels sont déduits.
    expect(sql.sql).toContain('not p.reserved');
    expect(sql.sql).toContain("r.status = 'completed'");
  });

  it('recompute : solde inchangé, aucune écriture', async () => {
    const snapshot = { balance_available: 14_250, balance_pending: 0, balance_on_hold: 9_500 };
    const { result, queries } = await withFakeTrx(
      (q) => (isCompute(q) ? [{ available: 14_250, pending: 0, on_hold: 9_500 }] : isRead(q) ? [snapshot] : []),
      (trx) => new BalancesService().recompute(trx, 'prat-1'),
    );
    expect(result).toEqual({ practitioner_id: 'prat-1', ...snapshot, changed: false });
    expect(queries.some(isUpsert)).toBe(false);
  });

  it('recompute : solde changé, upsert avec les nouvelles valeurs', async () => {
    const { result, queries } = await withFakeTrx(
      (q) => (isCompute(q) ? [{ available: 14_250, pending: 15_000, on_hold: 0 }] : isRead(q) ? [{ balance_available: 0, balance_pending: 15_000, balance_on_hold: 0 }] : []),
      (trx) => new BalancesService().recompute(trx, 'prat-1'),
    );
    expect(result.changed).toBe(true);
    const upsert = queries.find(isUpsert)!;
    expect(upsert.sql).toContain('on conflict ("practitioner_id") do update');
    expect(upsert.parameters.slice(0, 5)).toEqual(['prat-1', 14_250, 15_000, 0, 'XOF']);
  });

  it('recompute : premier solde du praticien, la ligne est créée', async () => {
    const { result, queries } = await withFakeTrx(() => [], (trx) => new BalancesService().recompute(trx, 'prat-neuf'));
    expect(result.changed).toBe(true);
    expect(queries.filter(isUpsert)).toHaveLength(1);
  });

  it('repairAll : ne rapporte que les praticiens dont le solde a changé', async () => {
    const stored: Record<string, { balance_available: number; balance_pending: number; balance_on_hold: number }> = {
      'prat-ok': { balance_available: 100, balance_pending: 0, balance_on_hold: 0 },
      'prat-faux': { balance_available: 999, balance_pending: 0, balance_on_hold: 0 },
    };
    const { result } = await withFakeTrx(
      (q) => {
        if (q.sql.includes('from public.practitioners pr')) return [{ id: 'prat-ok', name: 'Inf. A' }, { id: 'prat-faux', name: 'Coach B' }];
        if (isCompute(q)) return [{ available: 100, pending: 0, on_hold: 0 }];
        if (isRead(q)) return [stored[q.parameters[0] as string]];
        return [];
      },
      (trx) => new BalancesService().repairAll(trx),
    );
    expect(result).toEqual({ success: true, repairs_count: 1, details: [{ name: 'Coach B', practitioner_id: 'prat-faux', balance_available: 100, balance_pending: 0, balance_on_hold: 0 }] });
  });
});
