import { api } from './client';
import type { PractitionerProfile } from '@/types/practitioner';

// PostgreSQL numeric peut être sérialisé comme une chaîne par pg.
type PractitionerProfileResponse = Omit<PractitionerProfile, 'latitude' | 'longitude'> & {
  latitude?: number | string | null;
  longitude?: number | string | null;
};
function coordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export async function getOwnPractitionerProfile(): Promise<PractitionerProfile> {
  const profile = await api.get<PractitionerProfileResponse>('/practitioners/me');
  return { ...profile, latitude: coordinate(profile.latitude), longitude: coordinate(profile.longitude) };
}
