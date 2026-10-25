import { Logger } from '@nestjs/common';
import type { Payment } from '../database/types';
import { withFakeTrx, type RecordedQuery } from '../../test/unit/fake-trx';
import { calculateFees, parseFeeConfig } from './fees';
import { LedgerService } from './ledger.service';

type Amounts = Pick<Payment, 'amount' | 'net_amount' | 'commission_amount' | 'gateway_fees_amount' | 'fees_amount'>;

const totals = (lines: { debit: number; credit: number }[]) => ({
  debit: lines.reduce((s, l) => s + l.debit, 0),
  credit: lines.reduce((s, l) => s + l.credit, 0),
});

/** Colonnes d'un paiement telles que payments.service les remplit depuis calculateFees. */
function amountsFor(amount: number, config: Record<string, unknown>): Amounts {
  const f = calculateFees(amount, 'XOF', parseFeeConfig(config));
  return { amount, net_amount: f.netAmount, commission_amount: f.commissionAmount, gateway_fees_amount: f.gatewayFeesAmount, fees_amount: f.feesAmount };
}

const PRODUCTION = { payment_commission_rate: { rate: 0.05 }, payment_gateway_fees: { fixed: 0, percentage: 0.02, paid_by: 'platform' } };
const PATIENT_PAYS = { payment_commission_rate: { rate: 0.05 }, payment_gateway_fees: { fixed: 0, percentage: 0.02, paid_by: 'patient' } };

describe('LedgerService.paidEntries', () => {
  it('configuration de production (frais payés par la plateforme) : 5 lignes équilibrées', () => {
    const { lines, commission, commissionMismatch } = LedgerService.paidEntries(amountsFor(15_000, PRODUCTION));
    expect(lines.map((l) => [l.account, l.debit, l.credit])).toEqual([
      ['cash', 15_000, 0],
      ['payable', 0, 14_250],
      ['revenue_commission', 0, 750],
      ['expense_gateway', 300, 0],
      ['cash', 0, 300],
    ]);
    expect(commission).toBe(750);
    expect(commissionMismatch).toBe(false);
    expect(totals(lines)).toEqual({ debit: 15_300, credit: 15_300 });
    // Les frais de passerelle sont une charge de la plateforme, jamais un produit (08-REVUE-FEDAPAY M11).
    expect(lines.some((l) => l.account === 'revenue_fees')).toBe(false);
  });

  it('frais facturés au patient : produit revenue_fees, toujours équilibré', () => {
    const payment = amountsFor(15_000, PATIENT_PAYS);
    const { lines } = LedgerService.paidEntries(payment);
    const fees = lines.find((l) => l.account === 'revenue_fees');
    expect(fees?.credit).toBe(payment.gateway_fees_amount);
    expect(lines.find((l) => l.account === 'payable')?.credit).toBe(payment.net_amount);
    const t = totals(lines);
    expect(t.debit).toBe(t.credit);
  });

  it.each([100, 101, 333, 999, 15_001, 1_000_000])('montant %i : débits = crédits et le net revient au praticien', (amount) => {
    for (const config of [PRODUCTION, PATIENT_PAYS]) {
      const payment = amountsFor(amount, config);
      const { lines } = LedgerService.paidEntries(payment);
      const t = totals(lines);
      expect(t.debit).toBe(t.credit);
      expect(lines.find((l) => l.account === 'payable')?.credit ?? 0).toBe(payment.net_amount);
      for (const l of lines) expect(Number.isInteger(l.debit) && Number.isInteger(l.credit)).toBe(true);
    }
  });

  it("colonnes qui ne se recoupent pas : l'écart est porté sur la commission et signalé", () => {
    const { lines, commission, commissionMismatch } = LedgerService.paidEntries({ amount: 15_000, net_amount: 14_250, commission_amount: 749, gateway_fees_amount: 300, fees_amount: 749 });
    expect(commission).toBe(750);
    expect(commissionMismatch).toBe(true);
    const t = totals(lines);
    expect(t.debit).toBe(t.credit);
  });

  it('sans frais ni net renseignés : aucune ligne à zéro, tout en commission', () => {
    const { lines } = LedgerService.paidEntries({ amount: 5_000, net_amount: null, commission_amount: null, gateway_fees_amount: null, fees_amount: null });
    expect(lines.map((l) => l.account)).toEqual(['cash', 'revenue_commission']);
    expect(lines.every((l) => l.debit > 0 || l.credit > 0)).toBe(true);
  });
});

describe('LedgerService.applyPaidEntries', () => {
  const payment = { id: 'pay-1', currency: 'XOF', ...amountsFor(15_000, PRODUCTION) } as Payment;
  const isInsert = (table: string) => (q: RecordedQuery) => q.sql.startsWith(`insert into "${table}"`);

  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('idempotent : des écritures existent déjà pour ce paiement, rien n’est réécrit', async () => {
    const { result, queries } = await withFakeTrx(
      (q) => (q.sql.includes('from "ledger_entries"') ? [{ id: 'e-1' }] : []),
      (trx) => new LedgerService().applyPaidEntries(trx, payment, 'prat-1'),
    );
    expect(result).toEqual({ applied: false, entries: 0 });
    expect(queries).toHaveLength(1);
    expect(queries.some(isInsert('ledger_entries'))).toBe(false);
  });

  it('crée chaque compte une seule fois, payable au nom du praticien, comptes plateforme sans propriétaire', async () => {
    let n = 0;
    const { result, queries } = await withFakeTrx(
      (q) => (isInsert('ledger_accounts')(q) ? [{ id: `acc-${++n}` }] : []),
      (trx) => new LedgerService().applyPaidEntries(trx, payment, 'prat-1'),
    );
    expect(result).toEqual({ applied: true, entries: 5 });

    // cash (deux lignes), payable, revenue_commission, expense_gateway : quatre comptes distincts.
    const created = queries.filter(isInsert('ledger_accounts'));
    expect(created.map((q) => q.parameters[2])).toEqual(['cash', 'payable', 'revenue_commission', 'expense_gateway']);
    expect(created.find((q) => q.parameters[2] === 'payable')?.parameters.slice(0, 2)).toEqual(['practitioner', 'prat-1']);
    expect(created.filter((q) => q.parameters[0] === 'platform').every((q) => q.parameters[1] === null)).toBe(true);
    // Un compte plateforme se cherche par owner_id IS NULL (la contrainte UNIQUE ne protège pas les NULL).
    const lookups = queries.filter((q) => q.sql.startsWith('select "id" from "ledger_accounts"'));
    expect(lookups.filter((q) => q.sql.includes('"owner_id" is null'))).toHaveLength(3);

    const insert = queries.find(isInsert('ledger_entries'))!;
    expect(insert.parameters.filter((p) => p === 'pay-1')).toHaveLength(5);
    expect(insert.parameters).toEqual(expect.arrayContaining(['acc-1', 'acc-2', 'acc-3', 'acc-4']));
  });

  it('réutilise un compte déjà présent au lieu d’en créer un doublon', async () => {
    const { queries } = await withFakeTrx(
      (q) => (q.sql.startsWith('select "id" from "ledger_accounts"') ? [{ id: 'existant' }] : []),
      (trx) => new LedgerService().applyPaidEntries(trx, payment, 'prat-1'),
    );
    expect(queries.some(isInsert('ledger_accounts'))).toBe(false);
    expect(queries.find(isInsert('ledger_entries'))?.parameters.filter((p) => p === 'existant')).toHaveLength(5);
  });
});
