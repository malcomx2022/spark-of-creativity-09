export const PAYMENT_STORAGE_KEY = 'patient-payment-progress';

export function clearPersistedPaymentState() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(PAYMENT_STORAGE_KEY); } catch { /* Stockage indisponible. */ }
}
