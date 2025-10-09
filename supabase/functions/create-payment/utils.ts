export const PAYMENT_METHODS = ['mtn', 'orange', 'moov'] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface PaymentRequestPayload {
  appointmentId: unknown;
  amount: unknown;
  paymentMethod: unknown;
  phoneNumber: unknown;
}

export interface ValidatedPaymentRequest {
  appointmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  phoneNumber: string;
}

export interface ValidationResult {
  success: boolean;
  errors: string[];
  data?: ValidatedPaymentRequest;
}

export interface FedaPayTransaction {
  id: string;
  url: string;
  status?: string;
}

export function normalizePhoneNumber(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  let normalized = input.trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/[^0-9+]/g, '');

  if ((normalized.match(/\+/g) ?? []).length > 1) {
    return null;
  }

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized.replace(/\+/g, '')}`;
  }

  const digits = normalized.slice(1);

  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

export function normalizeAmount(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      return null;
    }

    return Number(input.toFixed(2));
  }

  if (typeof input === 'string') {
    const sanitized = input.replace(/,/g, '.').trim();
    if (!sanitized) {
      return null;
    }

    const parsed = Number.parseFloat(sanitized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Number(parsed.toFixed(2));
  }

  return null;
}

export function validatePaymentRequest(payload: PaymentRequestPayload): ValidationResult {
  const errors: string[] = [];

  const appointmentId = typeof payload.appointmentId === 'string' ? payload.appointmentId.trim() : '';
  if (!appointmentId) {
    errors.push('appointmentId must be a non-empty string');
  }

  const amount = normalizeAmount(payload.amount);
  if (amount === null) {
    errors.push('amount must be a positive number');
  }

  const paymentMethod = typeof payload.paymentMethod === 'string' ? payload.paymentMethod : '';
  const isAllowedMethod = PAYMENT_METHODS.includes(paymentMethod as PaymentMethod);
  if (!paymentMethod || !isAllowedMethod) {
    errors.push(`paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }

  const phoneNumber = normalizePhoneNumber(payload.phoneNumber);
  if (!phoneNumber) {
    errors.push('phoneNumber must be a valid international phone number');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    errors: [],
    data: {
      appointmentId: appointmentId!,
      amount: amount!,
      paymentMethod: paymentMethod as PaymentMethod,
      phoneNumber: phoneNumber!,
    },
  };
}

export function parseFedaPayResponse(payload: unknown): FedaPayTransaction | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const container = payload as { v1?: unknown };
  if (typeof container.v1 !== 'object' || container.v1 === null) {
    return null;
  }

  const transaction = container.v1 as Record<string, unknown>;
  const { id, url, status } = transaction;

  const hasValidId = typeof id === 'string' || typeof id === 'number';
  const hasValidUrl = typeof url === 'string' && url.length > 0;
  const hasValidStatus = status === undefined || typeof status === 'string';

  if (!hasValidId || !hasValidUrl || !hasValidStatus) {
    return null;
  }

  return {
    id: String(id),
    url,
    status: typeof status === 'string' ? status : undefined,
  };
}
