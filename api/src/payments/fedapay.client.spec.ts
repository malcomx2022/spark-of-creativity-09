import type { AppConfig } from '../config/config.schema';
import { FakeFedaPayClient, FedaPayError, HttpFedaPayClient } from './fedapay.client';

/** Contrat POST /v1/refunds relevé dans le tableau de bord FedaPay (RefundService.create, Refund.toJson()). */
describe('HttpFedaPayClient — remboursements /v1/refunds', () => {
  const config = { FEDAPAY_MODE: 'sandbox', FEDAPAY_SECRET_KEY: 'sk_sandbox_test' } as AppConfig;
  let fetchMock: jest.Mock;
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('POST /v1/refunds avec { transaction_id, amount, description } et lit l’enveloppe v1/refund', async () => {
    fetchMock.mockResolvedValue(reply(201, { 'v1/refund': { id: 77, status: 'pending', amount: 2000, transaction_id: 1234 } }));
    const res = await new HttpFedaPayClient(config).refundTransaction('1234', 2000, 'Séance annulée');
    expect(res).toEqual({ id: '77', status: 'pending', amount: 2000 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox-api.fedapay.com/v1/refunds');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ transaction_id: 1234, amount: 2000, description: 'Séance annulée' });
    expect(init.headers.Authorization).toBe('Bearer sk_sandbox_test');
  });

  it('GET /v1/refunds/{id} rend l’état du remboursement', async () => {
    fetchMock.mockResolvedValue(reply(200, { 'v1/refund': { id: 77, status: 'sent', amount: 2000 } }));
    await expect(new HttpFedaPayClient(config).getRefund('77')).resolves.toEqual({ id: '77', status: 'sent', amount: 2000 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox-api.fedapay.com/v1/refunds/77');
  });

  it('un refus FedaPay conserve le statut HTTP et le motif', async () => {
    fetchMock.mockResolvedValue(reply(422, { message: 'Remboursement possible pour MTN uniquement' }));
    const err = await new HttpFedaPayClient(config).refundTransaction('1234', 2000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FedaPayError);
    expect((err as FedaPayError).status).toBe(422);
    expect((err as FedaPayError).details).toEqual({ message: 'Remboursement possible pour MTN uniquement' });
  });
});

describe('HttpFedaPayClient — liste des transactions', () => {
  const config = { FEDAPAY_MODE: 'sandbox', FEDAPAY_SECRET_KEY: 'sk_sandbox_test' } as AppConfig;
  const reply = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const tx = (id: number, created_at: string) => ({ id, status: 'approved', amount: 1000, created_at });

  it('lit /v1/transactions/search (GET /v1/transactions est obsolète) et filtre la période sur created_at', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(reply({ 'v1/transactions': [...Array.from({ length: 99 }, (_, i) => tx(100 + i, '2026-10-20T10:00:00.000+01:00')), tx(1, '2026-10-23T10:00:00.000+01:00')], meta: { next_page: 2 } }))
      .mockResolvedValueOnce(reply({ 'v1/transactions': [tx(2, '2026-10-22T08:00:00.000+01:00'), tx(3, '2026-10-01T08:00:00.000+01:00')], meta: { next_page: null } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const list = await new HttpFedaPayClient(config).listTransactions(new Date('2026-10-21T00:00:00Z'), new Date('2026-10-23T23:59:59Z'));
    expect(list.map((t) => t.id)).toEqual(['1', '2']);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://sandbox-api.fedapay.com/v1/transactions/search?per_page=100&page=1',
      'https://sandbox-api.fedapay.com/v1/transactions/search?per_page=100&page=2',
    ]);
  });

  it('lit les dépôts par /v1/payouts/search et filtre la période sur created_at', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(reply({ 'v1/payouts': [{ id: 7, status: 'sent', amount: 900, created_at: '2026-10-22T09:00:00.000+01:00' }, { id: 8, status: 'sent', amount: 500, created_at: '2026-09-30T09:00:00.000+01:00' }], meta: { next_page: null } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const list = await new HttpFedaPayClient(config).listPayouts(new Date('2026-10-21T00:00:00Z'), new Date('2026-10-23T23:59:59Z'));
    expect(list).toEqual([{ id: '7', status: 'sent', amount: 900 }]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://sandbox-api.fedapay.com/v1/payouts/search?per_page=100&page=1']);
  });
});

describe('FakeFedaPayClient — remboursements', () => {
  it('un remboursement refusé après coup rend le montant à la transaction', async () => {
    const fake = new FakeFedaPayClient();
    const tx = await fake.createTransaction({ description: 'x', amount: 5000, callbackUrl: 'http://localhost', customer: { firstname: 'a', lastname: 'b', email: 'a@b.c', phoneNumber: '+22990000000' }, metadata: {} });
    fake.transactions.get(tx.id)!.status = 'approved';
    fake.pendingNextRefund = true;
    const refund = await fake.refundTransaction(tx.id, 5000);
    expect(fake.transactions.get(tx.id)).toMatchObject({ status: 'refunded', refunded: 5000 });
    fake.setRefundStatus(refund.id, 'failed');
    await expect(fake.getRefund(refund.id)).resolves.toMatchObject({ status: 'failed' });
    expect(fake.transactions.get(tx.id)).toMatchObject({ status: 'approved', refunded: 0 });
  });
});
