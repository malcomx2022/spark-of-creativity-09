import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';

/** Statuts renvoyés par FedaPay (transactions). */
export type FedaPayStatus = 'pending' | 'processing' | 'authorized' | 'approved' | 'declined' | 'canceled' | 'refunded' | 'transferred' | 'expired' | 'timeout';

export interface FedaPayCustomer {
  firstname: string;
  lastname: string;
  email?: string;
  /** Numéro sans indicatif (FedaPay attend `{ number, country: 'bj' }`). */
  phoneNumber: string;
  country?: string;
}

export interface CreateTransactionInput {
  amount: number;
  currency?: string;
  description: string;
  callbackUrl: string;
  customer: FedaPayCustomer;
  metadata: Record<string, unknown>;
}

export interface FedaPayTransaction {
  id: string;
  status: FedaPayStatus;
  amount?: number;
  reference?: string;
}

export type FedaPayPayoutStatus = 'pending' | 'started' | 'sent' | 'failed' | 'approved' | 'declined';

export interface CreatePayoutInput {
  amount: number;
  currency?: string;
  /** mtn | moov | bank */
  mode: string;
  customer: { firstname: string; lastname: string; email?: string; phoneNumber?: string; country?: string; bankAccount?: { number: string; bank: string; holder: string } };
  description?: string;
}

export interface FedaPayPayout {
  id: string;
  status: FedaPayPayoutStatus | string;
  amount?: number;
}

export interface FedaPayClient {
  createTransaction(input: CreateTransactionInput): Promise<FedaPayTransaction>;
  generateToken(transactionId: string): Promise<{ token: string; url: string }>;
  getTransaction(transactionId: string): Promise<FedaPayTransaction>;
  /**
   * Annule une transaction encore en attente (DELETE /v1/transactions/{id}) pour que son lien de
   * paiement cesse d'être payable. Au mieux : un refus (déjà payée, inexistante) rend false.
   */
  cancelTransaction(transactionId: string): Promise<boolean>;
  /** Transactions créées dans l'intervalle (réconciliation). */
  listTransactions(from: Date, to: Date): Promise<FedaPayTransaction[]>;
  /** Remboursement total ou partiel d'une transaction approuvée. */
  refundTransaction(transactionId: string, amount: number): Promise<{ id: string; status: string; amount?: number }>;
  /** Reversement (payout) vers un praticien — ex create-payout / process-payout-batch. */
  createPayout(input: CreatePayoutInput): Promise<FedaPayPayout>;
}

export const FEDAPAY_CLIENT = Symbol('FEDAPAY_CLIENT');

export class FedaPayError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
  }
}

function unwrap(data: Record<string, unknown>): FedaPayTransaction {
  const t = (data['v1/transaction'] ?? data.v1_transaction ?? (data.v1 as Record<string, unknown> | undefined)?.transaction ?? data.transaction ?? data) as Record<string, unknown>;
  return { id: String(t.id), status: String(t.status ?? 'pending') as FedaPayStatus, amount: t.amount as number | undefined, reference: t.reference as string | undefined };
}

/** API HTTP FedaPay (sandbox ou live) — port de create-payment / sync-payment-status. */
@Injectable()
export class HttpFedaPayClient implements FedaPayClient {
  private readonly logger = new Logger(HttpFedaPayClient.name);
  private readonly baseUrl: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.baseUrl = config.FEDAPAY_MODE === 'live' ? 'https://api.fedapay.com/v1' : 'https://sandbox-api.fedapay.com/v1';
  }

  private async request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.FEDAPAY_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
      const text = await res.text();
      const data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
      if (!res.ok) {
        this.logger.error(`FedaPay ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
        throw new FedaPayError(`Erreur FedaPay ${res.status}`, res.status, data);
      }
      return data;
    } catch (err) {
      if (err instanceof FedaPayError) throw err;
      throw new FedaPayError(err instanceof Error && err.name === 'AbortError' ? 'FedaPay ne répond pas (délai dépassé)' : `FedaPay injoignable : ${err instanceof Error ? err.message : String(err)}`, 504);
    } finally {
      clearTimeout(timer);
    }
  }

  async createTransaction(input: CreateTransactionInput): Promise<FedaPayTransaction> {
    const data = await this.request('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: input.description,
        amount: input.amount,
        currency: { iso: input.currency ?? 'XOF' },
        callback_url: input.callbackUrl,
        customer: {
          firstname: input.customer.firstname,
          lastname: input.customer.lastname,
          email: input.customer.email,
          phone_number: { number: input.customer.phoneNumber, country: input.customer.country ?? 'bj' },
        },
        custom_metadata: input.metadata,
      }),
    });
    return unwrap(data);
  }

  async generateToken(transactionId: string): Promise<{ token: string; url: string }> {
    const data = await this.request(`/transactions/${transactionId}/token`, { method: 'POST', body: '{}' });
    if (!data.token || !data.url) throw new FedaPayError('Token de paiement absent de la réponse FedaPay', 502, data);
    return { token: String(data.token), url: String(data.url) };
  }

  async getTransaction(transactionId: string): Promise<FedaPayTransaction> {
    return unwrap(await this.request(`/transactions/${transactionId}`));
  }

  async cancelTransaction(transactionId: string): Promise<boolean> {
    try {
      await this.request(`/transactions/${transactionId}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      if (err instanceof FedaPayError && err.status >= 400 && err.status < 500) {
        this.logger.warn(`annulation refusée pour la transaction ${transactionId} (${err.status})`);
        return false;
      }
      throw err;
    }
  }

  /** Pagination complète (reconcile-fedapay s'arrêtait à 100 transactions). */
  async listTransactions(from: Date, to: Date): Promise<FedaPayTransaction[]> {
    const out: FedaPayTransaction[] = [];
    for (let page = 1; page <= 50; page++) {
      const data = await this.request(`/transactions?per_page=100&page=${page}&created_at[gte]=${from.toISOString().slice(0, 10)}&created_at[lte]=${to.toISOString().slice(0, 10)}`);
      const list = ((data['v1/transactions'] ?? (data.v1 as Record<string, unknown> | undefined)?.transactions ?? data.data ?? data.transactions ?? []) as Record<string, unknown>[]).map((t) => unwrap({ transaction: t }));
      out.push(...list);
      if (list.length < 100) break;
    }
    return out;
  }

  async refundTransaction(transactionId: string, amount: number) {
    const data = await this.request(`/transactions/${transactionId}/refund`, { method: 'POST', body: JSON.stringify({ amount }) });
    const r = (data['v1/refund'] ?? (data.v1 as Record<string, unknown> | undefined)?.refund ?? data.refund ?? data) as Record<string, unknown>;
    return { id: String(r.id ?? transactionId), status: String(r.status ?? 'pending'), amount: r.amount as number | undefined };
  }

  async createPayout(input: CreatePayoutInput): Promise<FedaPayPayout> {
    const customer: Record<string, unknown> = { firstname: input.customer.firstname, lastname: input.customer.lastname, email: input.customer.email };
    if (input.customer.bankAccount) customer.bank_account = { number: input.customer.bankAccount.number, bank: input.customer.bankAccount.bank, holder: input.customer.bankAccount.holder };
    else customer.phone_number = { number: input.customer.phoneNumber, country: input.customer.country ?? 'bj' };
    const data = await this.request('/payouts', { method: 'POST', body: JSON.stringify({ amount: input.amount, currency: { iso: input.currency ?? 'XOF' }, mode: input.mode, description: input.description, customer }) });
    const p = (data['v1/payout'] ?? (data.v1 as Record<string, unknown> | undefined)?.payout ?? data.payout ?? data) as Record<string, unknown>;
    if (p.id === undefined) throw new FedaPayError('Identifiant de reversement absent de la réponse FedaPay', 502, data);
    return { id: String(p.id), status: String(p.status ?? 'pending'), amount: p.amount as number | undefined };
  }
}

/** Client factice pour dev/test : transactions en mémoire dont le statut est pilotable. */
@Injectable()
export class FakeFedaPayClient implements FedaPayClient {
  readonly transactions = new Map<string, FedaPayTransaction & { input: CreateTransactionInput; createdAt: Date; refunded: number }>();
  readonly payouts = new Map<string, FedaPayPayout & { input: CreatePayoutInput }>();
  /** Force l'échec du prochain reversement (tests). */
  failNextPayout = false;
  // Identifiants uniques entre exécutions (les tests e2e partagent une base).
  private seq = Number(String(Date.now()).slice(-9));

  async createTransaction(input: CreateTransactionInput): Promise<FedaPayTransaction> {
    const id = String(++this.seq);
    const t = { id, status: 'pending' as FedaPayStatus, amount: input.amount, input, createdAt: new Date(), refunded: 0 };
    this.transactions.set(id, t);
    return { id, status: t.status, amount: input.amount };
  }

  async listTransactions(from: Date, to: Date): Promise<FedaPayTransaction[]> {
    return [...this.transactions.values()].filter((t) => t.createdAt >= from && t.createdAt <= to).map((t) => ({ id: t.id, status: t.status, amount: t.amount }));
  }

  async refundTransaction(transactionId: string, amount: number) {
    const t = this.transactions.get(transactionId);
    if (!t) throw new FedaPayError('Transaction inconnue', 404);
    if (t.status !== 'approved' && t.status !== 'transferred' && t.status !== 'refunded') throw new FedaPayError('Transaction non remboursable', 400);
    t.refunded += amount;
    if (t.refunded >= (t.amount ?? 0)) t.status = 'refunded';
    return { id: `rf_${transactionId}_${t.refunded}`, status: 'approved', amount };
  }

  async createPayout(input: CreatePayoutInput): Promise<FedaPayPayout> {
    if (this.failNextPayout) {
      this.failNextPayout = false;
      throw new FedaPayError('Reversement refusé (simulation)', 400, { message: 'insufficient_funds' });
    }
    const id = `po_${++this.seq}`;
    const p = { id, status: 'pending', amount: input.amount, input };
    this.payouts.set(id, p);
    return { id, status: p.status, amount: input.amount };
  }

  setPayoutStatus(payoutId: string, status: string): void {
    const p = this.payouts.get(payoutId);
    if (p) p.status = status;
  }

  async generateToken(transactionId: string): Promise<{ token: string; url: string }> {
    if (!this.transactions.has(transactionId)) throw new FedaPayError('Transaction inconnue', 404);
    return { token: `tok_fake_${transactionId}`, url: `https://fedapay.fake/checkout/${transactionId}` };
  }

  async getTransaction(transactionId: string): Promise<FedaPayTransaction> {
    const t = this.transactions.get(transactionId);
    if (!t) throw new FedaPayError('Transaction inconnue', 404);
    return { id: t.id, status: t.status, amount: t.amount };
  }

  async cancelTransaction(transactionId: string): Promise<boolean> {
    const t = this.transactions.get(transactionId);
    if (!t || t.status !== 'pending') return false;
    t.status = 'canceled';
    return true;
  }

  /** Simule l'évolution côté FedaPay (utilisé par les tests et l'endpoint admin de simulation). */
  setStatus(transactionId: string, status: FedaPayStatus): void {
    const t = this.transactions.get(transactionId);
    if (t) t.status = status;
  }
}
