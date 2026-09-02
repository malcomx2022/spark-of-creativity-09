import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';

/** Statuts renvoyés par FedaPay (transactions). */
export type FedaPayStatus = 'pending' | 'processing' | 'authorized' | 'approved' | 'declined' | 'canceled' | 'refunded' | 'transferred' | 'timeout';

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

export interface FedaPayClient {
  createTransaction(input: CreateTransactionInput): Promise<FedaPayTransaction>;
  generateToken(transactionId: string): Promise<{ token: string; url: string }>;
  getTransaction(transactionId: string): Promise<FedaPayTransaction>;
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
}

/** Client factice pour dev/test : transactions en mémoire dont le statut est pilotable. */
@Injectable()
export class FakeFedaPayClient implements FedaPayClient {
  readonly transactions = new Map<string, FedaPayTransaction & { input: CreateTransactionInput }>();
  private seq = 1000;

  async createTransaction(input: CreateTransactionInput): Promise<FedaPayTransaction> {
    const id = String(++this.seq);
    const t = { id, status: 'pending' as FedaPayStatus, amount: input.amount, input };
    this.transactions.set(id, t);
    return { id, status: t.status, amount: input.amount };
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

  /** Simule l'évolution côté FedaPay (utilisé par les tests et l'endpoint admin de simulation). */
  setStatus(transactionId: string, status: FedaPayStatus): void {
    const t = this.transactions.get(transactionId);
    if (t) t.status = status;
  }
}
