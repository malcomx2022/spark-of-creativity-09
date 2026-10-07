import { getCurrentUser } from './api/session';
import { PAYMENT_STORAGE_KEY as STORAGE_KEY, clearPersistedPaymentState } from './payment-storage-key';
export { clearPersistedPaymentState } from './payment-storage-key';


type PaymentStatus = 'idle' | 'pending' | 'success' | 'error';

type PaymentMethod = 'mtn' | 'moov';

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
  return value === 'mtn' || value === 'moov';
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
    const ownerId = getCurrentUser()?.id;
    const storedOwner = JSON.parse(window.localStorage.getItem('domicares.session') || 'null')?.user?.id;
    if (ownerId && storedOwner === ownerId && parsed?.ownerId === ownerId && parsed.version === 2 && isPersistedPaymentState(parsed.state)) {
      return parsed.state;
    }
    // Les anciens états sans propriétaire ne peuvent pas être réattribués.
    clearPersistedPaymentState();
  } catch (error) {
    console.error('Unable to parse persisted payment state', error);
  }

  return null;
}

export function setPersistedPaymentState(state: PersistedPaymentState, ownerId = getCurrentUser()?.id) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!ownerId) {
      clearPersistedPaymentState();
      return;
    }
    if (ownerId !== getCurrentUser()?.id) return;
    if (JSON.parse(window.localStorage.getItem('domicares.session') || 'null')?.user?.id !== ownerId) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ownerId, state }));
  } catch (error) {
    console.error('Unable to persist payment state', error);
  }
}
