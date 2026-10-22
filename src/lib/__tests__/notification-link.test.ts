import { describe, expect, it } from 'vitest';
import { notificationPath } from '../notification-link';

describe('notificationPath', () => {
  it.each([
    ['/dashboard/patient?tab=messages&appointment=a%2Fb', '/dashboard/patient?tab=messages&appointment=a%2Fb'],
    ['/dashboard/practitioner?tab=payouts', '/dashboard/practitioner?tab=payouts'],
    ['/dashboard/coach?tab=sessions', '/dashboard/coach?tab=sessions'],
    ['/dashboard?tab=messages&appointment=old', '/dashboard?tab=messages&appointment=old'],
    ['/admin?tab=kyc', '/admin?tab=kyc'],
  ])('suit le lien interne %s', (link, expected) => {
    expect(notificationPath(link)).toBe(expected);
  });

  it.each([
    [undefined], [null], [''], ['https://checkout.fedapay.com/pay/1'], ['//evil.test/dashboard'], ['/\\evil.test'],
    ['javascript:alert(1)'], ['/patient/appointments/1'], ['/dashboard/admin'], ['/dashboard/../login'], ['dashboard/patient'],
  ])('ignore %s', (link) => {
    expect(notificationPath(link)).toBeNull();
  });
});
