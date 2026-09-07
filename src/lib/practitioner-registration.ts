/**
 * Inscription praticien (ex Edge Function create-practitioner-account) : `POST /api/practitioners/register`.
 * Les données sauvegardées pour récupération (`registration-recovery.ts`) gardent le format
 * snake_case historique ; ce module les convertit vers le contrat de l'API.
 */
import { api, ApiError } from '@/lib/api';
import type { CreatePractitionerResponse } from '@/types/api-responses';

export interface PractitionerRegisterPayload {
  profile: { fullName: string; phone: string; gender?: string | null; dateOfBirth?: string | null };
  practitioner: Record<string, unknown>;
  documents: Record<string, string>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const list = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : undefined);

export function toPractitionerRegisterPayload(
  profileData: Record<string, unknown>,
  practitionerData: Record<string, unknown>,
  documents: Record<string, string>,
): PractitionerRegisterPayload {
  const practitioner: Record<string, unknown> = {
    name: str(practitionerData.name) ?? str(profileData.full_name) ?? '',
    phone: str(practitionerData.phone) ?? str(profileData.phone) ?? '',
    specialty: str(practitionerData.specialty) ?? 'Généraliste',
    practitionerType: str(practitionerData.practitioner_type) ?? 'autre',
    address: str(practitionerData.address),
    latitude: num(practitionerData.latitude) ?? null,
    longitude: num(practitionerData.longitude) ?? null,
    yearsExperience: num(practitionerData.years_experience),
    bio: str(practitionerData.bio),
    licenseNumber: str(practitionerData.license_number),
    sessionTypes: list(practitionerData.session_types),
    interventionZone: str(practitionerData.intervention_zone),
    interventionRadius: num(practitionerData.intervention_radius),
    certifications: list(practitionerData.certifications),
    communesServed: list(practitionerData.communes_served),
    languages: list(practitionerData.languages),
  };
  for (const k of Object.keys(practitioner)) if (practitioner[k] === undefined) delete practitioner[k];
  const docs: Record<string, string> = {};
  for (const key of ['idDocument', 'licenseDocument', 'diploma', 'profilePhoto']) if (documents[key]) docs[key] = documents[key];
  return {
    profile: {
      fullName: str(profileData.full_name) ?? String(practitioner.name),
      phone: str(profileData.phone) ?? String(practitioner.phone),
      gender: str(profileData.gender) ?? null,
      dateOfBirth: str(profileData.date_of_birth) ?? null,
    },
    practitioner,
    documents: docs,
  };
}

export interface RegisterPractitionerResult {
  data: CreatePractitionerResponse | null;
  error: Error | null;
  details?: string[];
}

/** Même forme de résultat que l'ancien `invokeEdgeFunctionWithRetry` pour limiter les changements dans les pages. */
export async function registerPractitioner(payload: PractitionerRegisterPayload): Promise<RegisterPractitionerResult> {
  try {
    const res = await api.post<{ practitioner: { id: string }; profile: unknown }>('/practitioners/register', payload, { timeoutMs: 90_000 });
    return { data: { success: true, practitionerId: res.practitioner?.id } as CreatePractitionerResponse, error: null };
  } catch (e) {
    if (e instanceof ApiError) {
      const details = e.detailMessages;
      return { data: { success: false, error: e.message, details } as CreatePractitionerResponse, error: e, details: details.length ? details : undefined };
    }
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
