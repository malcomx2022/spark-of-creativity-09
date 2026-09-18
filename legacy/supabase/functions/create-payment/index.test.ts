import {
  normalizeAmount,
  normalizePhoneNumber,
  parseFedaPayResponse,
  validatePaymentRequest,
  PAYMENT_METHODS,
} from './utils.ts';
import {
  assertEquals,
  assert,
  assertArrayIncludes,
} from './asserts.ts';

Deno.test('normalizePhoneNumber formats input and validates length', () => {
  assertEquals(normalizePhoneNumber(' 01 23 45 67 89 '), '+0123456789');
  assertEquals(normalizePhoneNumber('00229-61234567'), '+22961234567');
  assertEquals(normalizePhoneNumber('+22961234567'), '+22961234567');
  assertEquals(normalizePhoneNumber('invalid'), null);
  assertEquals(normalizePhoneNumber(''), null);
});

Deno.test('normalizeAmount accepts positive numbers and numeric strings', () => {
  assertEquals(normalizeAmount(1200), 1200);
  assertEquals(normalizeAmount('1200'), 1200);
  assertEquals(normalizeAmount('1200,50'), 1200.5);
  assertEquals(normalizeAmount(-5), null);
  assertEquals(normalizeAmount('abc'), null);
});

Deno.test('validatePaymentRequest returns normalized data for valid payload', () => {
  const result = validatePaymentRequest({
    appointmentId: 'apt-1',
    amount: '1500',
    paymentMethod: PAYMENT_METHODS[0],
    phoneNumber: '229 61 23 45 67',
  });

  assert(result.success);
  assert(result.data);
  assertEquals(result.data?.appointmentId, 'apt-1');
  assertEquals(result.data?.amount, 1500);
  assertEquals(result.data?.paymentMethod, PAYMENT_METHODS[0]);
  assertEquals(result.data?.phoneNumber, '+22961234567');
});

Deno.test('validatePaymentRequest reports every invalid field', () => {
  const result = validatePaymentRequest({
    appointmentId: '',
    amount: '-10',
    paymentMethod: 'cash',
    phoneNumber: 'abcd',
  });

  assertEquals(result.success, false);
  assertArrayIncludes(result.errors, [
    'appointmentId must be a non-empty string',
    'amount must be a positive number',
    'paymentMethod must be one of: mtn, orange, moov',
    'phoneNumber must be a valid international phone number',
  ]);
});

Deno.test('parseFedaPayResponse returns transaction payload when shape is correct', () => {
  const response = parseFedaPayResponse({
    v1: { id: 123, url: 'https://fedapay.test/payment', status: 'pending' },
  });

  assert(response);
  assertEquals(response?.id, '123');
  assertEquals(response?.url, 'https://fedapay.test/payment');
  assertEquals(response?.status, 'pending');
});

Deno.test('parseFedaPayResponse returns null for unexpected payloads', () => {
  assertEquals(parseFedaPayResponse(null), null);
  assertEquals(parseFedaPayResponse({}), null);
  assertEquals(
    parseFedaPayResponse({ v1: { id: null, url: undefined } }),
    null,
  );
});
