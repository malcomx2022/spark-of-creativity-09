/** Normalise au format E.164 (identique à send-otp/verify-otp). */
export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) normalized = '+' + normalized;
  return normalized;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}
