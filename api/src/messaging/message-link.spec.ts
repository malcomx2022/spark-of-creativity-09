import { messageLink } from './message-link';
describe('Message notification destination', () => {
  it('opens the patient space for a message from a professional', () => expect(messageLink('appointment', true)).toBe('/dashboard/patient?tab=messages&appointment=appointment'));
  it('opens the practitioner space for a message from a patient', () => expect(messageLink('appointment', false, 'medecin')).toBe('/dashboard/practitioner?tab=messages&appointment=appointment'));
  it('opens the coach space for a sports appointment', () => expect(messageLink('appointment', false, 'coach_sportif')).toBe('/dashboard/coach?tab=messages&appointment=appointment'));
  it('encodes identifiers without adding query parameters', () => expect(messageLink('a&tab=finance', true)).toContain('appointment=a%26tab%3Dfinance'));
});
