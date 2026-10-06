import { isTrustedPushEndpoint } from './push-endpoint';
describe('push destination validation', () => {
  it.each(['https://fcm.googleapis.com/fcm/send/id', 'https://updates.push.services.mozilla.com/wpush/v2/id', 'https://web.push.apple.com/id', 'https://region.notify.windows.com/id'])('accepts browser service %s', value => expect(isTrustedPushEndpoint(value)).toBe(true));
  it.each(['http://fcm.googleapis.com/id', 'https://127.0.0.1/id', 'https://localhost/id', 'https://169.254.169.254/id', 'https://fcm.googleapis.com.evil.test/id', 'https://evilnotify.windows.com/id', 'https://user:pass@fcm.googleapis.com/id', 'https://fcm.googleapis.com:444/id', 'https://[::1]/id'])('refuses arbitrary destination %s', value => expect(isTrustedPushEndpoint(value)).toBe(false));
});
