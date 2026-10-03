import { describe, expect, it } from 'vitest';
import { classifyPaymentStatus, paymentStatusLabel, resolveCallbackParams } from '../payment-callback';

describe('resolveCallbackParams', () => {
  it('lit l’identifiant du paiement dans le chemin et les paramètres ajoutés par FedaPay', () => {
    const p = resolveCallbackParams('pay-1', new URLSearchParams('id=258&status=approved'));
    expect(p).toEqual({ paymentId: 'pay-1', transactionId: '258', appointmentId: null, fedapayStatus: 'approved' });
  });

  it('répare l’ancienne URL où FedaPay concaténait ses paramètres à appointment_id', () => {
    const p = resolveCallbackParams(undefined, new URLSearchParams('appointment_id=appt-7?id=258&status=declined'));
    expect(p).toEqual({ paymentId: null, transactionId: '258', appointmentId: 'appt-7', fedapayStatus: 'declined' });
  });

  it('accepte les paramètres historiques payment_id et transaction_id', () => {
    const p = resolveCallbackParams(undefined, new URLSearchParams('payment_id=pay-2&transaction_id=99'));
    expect(p).toMatchObject({ paymentId: 'pay-2', transactionId: '99' });
  });

  it('ne renvoie rien sans paramètre exploitable', () => {
    expect(resolveCallbackParams(undefined, new URLSearchParams(''))).toEqual({ paymentId: null, transactionId: null, appointmentId: null, fedapayStatus: null });
  });
});

describe('classifyPaymentStatus', () => {
  it('distingue encaissé, terminé sans encaissement et encore en cours', () => {
    expect(classifyPaymentStatus('paid')).toBe('paid');
    expect(classifyPaymentStatus('partially_refunded')).toBe('paid');
    expect(classifyPaymentStatus('failed')).toBe('closed');
    expect(classifyPaymentStatus('canceled')).toBe('closed');
    expect(classifyPaymentStatus('pending')).toBe('open');
    expect(classifyPaymentStatus('authorized')).toBe('open');
    expect(classifyPaymentStatus('initiated')).toBe('open');
  });

  it('libelle les statuts en français', () => {
    expect(paymentStatusLabel('pending')).toBe('En attente');
    expect(paymentStatusLabel('paid')).toBe('Payé');
    expect(paymentStatusLabel('inconnu')).toBe('inconnu');
  });
});
