const STORAGE_KEY = 'patient-payment-progress';

type PaymentStatus = 'idle' | 'pending' | 'success' | 'error';

type PaymentMethod = 'mtn' | 'orange' | 'moov';

export interface PersistedPaymentState {
  appointmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  phoneNumber: string;
  paymentStatus: PaymentStatus;
  paymentUrl: string | null;
  paymentId: string | null;
  transactionId: string | null;
  expiresAt: string | null;
  useSavedMethod: boolean;
  selectedSavedMethod: string;
  payerName?: string;
  payerEmail?: string;
  lastUpdated: number;
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'mtn' || value === 'orange' || value === 'moov';
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === 'idle' || value === 'pending' || value === 'success' || value === 'error';
}

function isPersistedPaymentState(value: unknown): value is PersistedPaymentState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.appointmentId === 'string' &&
    typeof candidate.amount === 'number' &&
    isPaymentMethod(candidate.paymentMethod) &&
    typeof candidate.phoneNumber === 'string' &&
    isPaymentStatus(candidate.paymentStatus) &&
    ('paymentUrl' in candidate ? candidate.paymentUrl === null || typeof candidate.paymentUrl === 'string' : true) &&
    ('paymentId' in candidate ? candidate.paymentId === null || typeof candidate.paymentId === 'string' : true) &&
    ('transactionId' in candidate ? candidate.transactionId === null || typeof candidate.transactionId === 'string' : true) &&
    ('expiresAt' in candidate ? candidate.expiresAt === null || typeof candidate.expiresAt === 'string' : true) &&
    ('useSavedMethod' in candidate ? typeof candidate.useSavedMethod === 'boolean' : true) &&
    ('selectedSavedMethod' in candidate ? typeof candidate.selectedSavedMethod === 'string' : true) &&
    ('payerName' in candidate ? typeof candidate.payerName === 'string' : true) &&
    ('payerEmail' in candidate ? typeof candidate.payerEmail === 'string' : true) &&
    typeof candidate.lastUpdated === 'number'
  );
}

export function getPersistedPaymentState(): PersistedPaymentState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (isPersistedPaymentState(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error('Unable to parse persisted payment state', error);
  }

  return null;
}

export function setPersistedPaymentState(state: PersistedPaymentState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Unable to persist payment state', error);
  }
}

export function clearPersistedPaymentState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Unable to clear persisted payment state', error);
  }
}
