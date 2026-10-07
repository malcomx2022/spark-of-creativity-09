import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../api/session';
import { clearPersistedPaymentState, getPersistedPaymentState, setPersistedPaymentState, type PersistedPaymentState } from '../payment-storage';

const response = (id = 'patient-A') => ({ accessToken: 'fixture', refreshToken: 'refresh', expiresIn: 900, tokenType: 'Bearer', user: { id, email: null, phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' } });
const state: PersistedPaymentState = { appointmentId: 'appointment-A', amount: 1000, paymentMethod: 'mtn', phoneNumber: 'fixture-phone', paymentStatus: 'pending', paymentUrl: null, paymentId: 'payment-A', transactionId: null, expiresAt: null, useSavedMethod: false, selectedSavedMethod: '', lastUpdated: 1 };
afterEach(() => { clearSession(); localStorage.clear(); });
describe('Payment progress ownership', () => {
  it('restores only the current owner and preserves progress during token rotation', () => {
    setSession(response()); setPersistedPaymentState(state);
    setSession({ ...response(), refreshToken: 'rotated' }, 'TOKEN_REFRESHED');
    expect(getPersistedPaymentState()).toEqual(state);
  });
  it('purges progress on logout, including silent session expiration', () => {
    setSession(response()); setPersistedPaymentState(state); clearSession(true);
    expect(getPersistedPaymentState()).toBeNull();
    expect(localStorage.getItem('patient-payment-progress')).toBeNull();
  });
  it('purges progress when switching accounts without logout', () => {
    setSession(response()); setPersistedPaymentState(state); setSession(response('patient-B'));
    expect(getPersistedPaymentState()).toBeNull();
  });
  it('discards legacy ownerless data rather than assigning it to the next user', () => {
    setSession(response()); localStorage.setItem('patient-payment-progress', JSON.stringify(state));
    expect(getPersistedPaymentState()).toBeNull();
  });
  it('refuses data belonging to another account', () => {
    setSession(response()); localStorage.setItem('patient-payment-progress', JSON.stringify({ version: 2, ownerId: 'patient-B', state }));
    expect(getPersistedPaymentState()).toBeNull();
  });
  it('does not persist progress without a session', () => {
    clearSession(); setPersistedPaymentState(state);
    expect(localStorage.getItem('patient-payment-progress')).toBeNull();
  });
  it('rejects a stale callback from the previous account', () => {
    setSession(response('patient-B'));
    setPersistedPaymentState(state, 'patient-A');
    expect(getPersistedPaymentState()).toBeNull();
  });
  it('purges progress after logout in another tab', () => {
    setSession(response()); setPersistedPaymentState(state);
    localStorage.removeItem('domicares.session');
    window.dispatchEvent(new StorageEvent('storage', { key: 'domicares.session', newValue: null }));
    expect(getPersistedPaymentState()).toBeNull();
  });
  it('tolerates malformed storage', () => {
    setSession(response()); localStorage.setItem('patient-payment-progress', 'null');
    expect(getPersistedPaymentState()).toBeNull(); clearPersistedPaymentState();
  });
});
