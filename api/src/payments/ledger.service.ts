import { Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB, LedgerAccountType, LedgerOwnerType, Payment } from '../database/types';

/**
 * Écritures comptables en partie double — port de apply-ledger-entries, **équilibré**.
 *
 * L'historique créditait, pour un encaissement, `obligation` (patient) du montant total, `payable`
 * du net, `revenue_commission` de la commission et `revenue_fees` des frais de passerelle, contre un
 * seul débit `cash` du montant : pour 15 000 XOF, 15 000 au débit et 30 325 au crédit (08-REVUE-FEDAPAY
 * M11). Deux erreurs : la paire `obligation` n'avait pas de contrepartie (aucune créance n'avait été
 * constatée avant), et les frais de passerelle payés par la plateforme (`fees.ts`, `paid_by =
 * 'platform'`) étaient comptés en produit alors que ce sont une charge.
 *
 * Schéma retenu, pour un montant A, un net N, une commission C et des frais de passerelle G :
 *   - encaissement : débit `cash` A ; crédit `payable` N ; crédit `revenue_commission` C
 *     (+ crédit `revenue_fees` G si les frais sont facturés au patient, auquel cas N = A − C − G) ;
 *   - frais de passerelle, toujours supportés par la plateforme vis-à-vis de FedaPay :
 *     débit `expense_gateway` G ; crédit `cash` G.
 * Débits = crédits dans les deux configurations.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  /** Les comptes plateforme ont owner_id NULL : la contrainte UNIQUE ne les protège pas, d'où select-puis-insert. */
  private async ensureAccount(trx: Transaction<DB>, ownerType: LedgerOwnerType, ownerId: string | null, accountType: LedgerAccountType, currency: string): Promise<string> {
    let q = trx.selectFrom('ledger_accounts').select('id').where('owner_type', '=', ownerType).where('account_type', '=', accountType).where('currency', '=', currency);
    q = ownerId === null ? q.where('owner_id', 'is', null) : q.where('owner_id', '=', ownerId);
    const existing = await q.executeTakeFirst();
    if (existing) return existing.id;
    const created = await trx.insertInto('ledger_accounts').values({ owner_type: ownerType, owner_id: ownerId, account_type: accountType, currency }).returning('id').executeTakeFirstOrThrow();
    return created.id;
  }

  /**
   * Lignes d'un encaissement, équilibrées par construction : la commission est la différence entre
   * le montant, le net et les frais facturés au patient. Si les colonnes du paiement, arrondies
   * séparément, ne se recoupent pas (m3 : décimales sur colonnes entières), l'écart d'un franc est
   * porté sur la commission et journalisé plutôt que de déséquilibrer le grand livre.
   */
  static paidEntries(payment: Pick<Payment, 'amount' | 'net_amount' | 'commission_amount' | 'gateway_fees_amount' | 'fees_amount'>) {
    const amount = payment.amount;
    const net = payment.net_amount ?? 0;
    const gateway = payment.gateway_fees_amount ?? 0;
    // Frais facturés au patient quand fees_amount les inclut (calculateFees : feesAmount = commission + gateway).
    const gatewayBilledToPatient = (payment.fees_amount ?? 0) > (payment.commission_amount ?? 0) ? gateway : 0;
    const commission = amount - net - gatewayBilledToPatient;
    return {
      commission,
      commissionMismatch: commission !== (payment.commission_amount ?? 0),
      lines: [
        { account: 'cash' as const, owner: 'platform' as const, debit: amount, credit: 0, description: 'Payment received from patient' },
        { account: 'payable' as const, owner: 'practitioner' as const, debit: 0, credit: net, description: 'Amount payable to practitioner' },
        { account: 'revenue_commission' as const, owner: 'platform' as const, debit: 0, credit: commission, description: 'Platform commission' },
        { account: 'revenue_fees' as const, owner: 'platform' as const, debit: 0, credit: gatewayBilledToPatient, description: 'Gateway fees billed to patient' },
        { account: 'expense_gateway' as const, owner: 'platform' as const, debit: gateway, credit: 0, description: 'Gateway fees paid to FedaPay' },
        { account: 'cash' as const, owner: 'platform' as const, debit: 0, credit: gateway, description: 'Gateway fees paid to FedaPay' },
      ].filter((e) => e.debit > 0 || e.credit > 0),
    };
  }

  /** Idempotent : ne réécrit pas si des écritures existent déjà pour ce paiement. */
  async applyPaidEntries(trx: Transaction<DB>, payment: Payment, practitionerId: string): Promise<{ applied: boolean; entries: number }> {
    const already = await trx.selectFrom('ledger_entries').select('id').where('reference_type', '=', 'payment').where('reference_id', '=', payment.id).executeTakeFirst();
    if (already) return { applied: false, entries: 0 };
    const cur = payment.currency;
    const { lines, commission, commissionMismatch } = LedgerService.paidEntries(payment);
    if (commissionMismatch) {
      this.logger.warn(`Ledger paiement ${payment.id} : commission ${payment.commission_amount} ≠ montant − net − frais patient (${commission}), écart porté sur la commission`);
    }
    const accounts = new Map<string, string>();
    for (const line of lines) {
      const ownerId = line.owner === 'practitioner' ? practitionerId : null;
      const key = `${line.owner}:${line.account}`;
      if (!accounts.has(key)) accounts.set(key, await this.ensureAccount(trx, line.owner, ownerId, line.account, cur));
    }
    const ref = { reference_type: 'payment', reference_id: payment.id, currency: cur };
    const entries = lines.map((line) => ({ account_id: accounts.get(`${line.owner}:${line.account}`)!, debit: line.debit, credit: line.credit, description: line.description, ...ref }));
    if (entries.length > 0) await trx.insertInto('ledger_entries').values(entries).execute();
    return { applied: true, entries: entries.length };
  }
}
