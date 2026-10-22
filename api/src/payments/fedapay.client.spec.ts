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
