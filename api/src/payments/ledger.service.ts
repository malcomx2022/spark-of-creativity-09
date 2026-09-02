import { Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB, LedgerAccountType, LedgerOwnerType, Payment } from '../database/types';

/** Écritures comptables en partie double — port de apply-ledger-entries. */
@Injectable()
export class LedgerService {
  /** Les comptes plateforme ont owner_id NULL : la contrainte UNIQUE ne les protège pas, d'où select-puis-insert. */
  private async ensureAccount(trx: Transaction<DB>, ownerType: LedgerOwnerType, ownerId: string | null, accountType: LedgerAccountType, currency: string): Promise<string> {
    let q = trx.selectFrom('ledger_accounts').select('id').where('owner_type', '=', ownerType).where('account_type', '=', accountType).where('currency', '=', currency);
    q = ownerId === null ? q.where('owner_id', 'is', null) : q.where('owner_id', '=', ownerId);
    const existing = await q.executeTakeFirst();
    if (existing) return existing.id;
    const created = await trx.insertInto('ledger_accounts').values({ owner_type: ownerType, owner_id: ownerId, account_type: accountType, currency }).returning('id').executeTakeFirstOrThrow();
    return created.id;
  }

  /** Idempotent : ne réécrit pas si des écritures existent déjà pour ce paiement. */
  async applyPaidEntries(trx: Transaction<DB>, payment: Payment, practitionerId: string): Promise<{ applied: boolean; entries: number }> {
    const already = await trx.selectFrom('ledger_entries').select('id').where('reference_type', '=', 'payment').where('reference_id', '=', payment.id).executeTakeFirst();
    if (already) return { applied: false, entries: 0 };
    const cur = payment.currency;
    const [cash, commission, fees, obligation, payable] = await Promise.all([
      this.ensureAccount(trx, 'platform', null, 'cash', cur),
      this.ensureAccount(trx, 'platform', null, 'revenue_commission', cur),
      this.ensureAccount(trx, 'platform', null, 'revenue_fees', cur),
      this.ensureAccount(trx, 'patient', payment.patient_id, 'obligation', cur),
      this.ensureAccount(trx, 'practitioner', practitionerId, 'payable', cur),
    ]);
    const ref = { reference_type: 'payment', reference_id: payment.id, currency: cur };
    const entries = [
      { account_id: cash, debit: payment.amount, credit: 0, description: 'Payment received from patient', ...ref },
      { account_id: obligation, debit: 0, credit: payment.amount, description: 'Payment obligation fulfilled', ...ref },
      { account_id: payable, debit: 0, credit: payment.net_amount ?? 0, description: 'Amount payable to practitioner', ...ref },
      { account_id: commission, debit: 0, credit: payment.commission_amount ?? 0, description: 'Platform commission', ...ref },
      { account_id: fees, debit: 0, credit: payment.gateway_fees_amount ?? 0, description: 'Gateway fees', ...ref },
    ].filter((e) => e.debit > 0 || e.credit > 0);
    if (entries.length > 0) await trx.insertInto('ledger_entries').values(entries).execute();
    return { applied: true, entries: entries.length };
  }
}
