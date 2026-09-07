import { api, auth, type AuthUser } from '@/lib/api';
import type { Address, EmergencyContact } from '@/types/profile';

export interface PatientOnboardingPayload {
  profile: {
    fullName: string;
    phone: string;
    gender: string;
    dateOfBirth: string;
  };
  address: {
    label: string;
    address: string;
  } | null;
  emergencyContact: {
    name: string;
    phone: string;
    relationship?: string;
  } | null;
  medicalHistory: string[];
  acceptTermsAt: string;
}

const GENDERS = ['homme', 'femme', 'autre', 'non_specifie'] as const;
type Gender = (typeof GENDERS)[number];

async function upsertProfile(payload: PatientOnboardingPayload['profile']) {
  const gender: Gender = (GENDERS as readonly string[]).includes(payload.gender) ? (payload.gender as Gender) : 'non_specifie';
  await api.patch('/profile', {
    fullName: payload.fullName,
    phone: payload.phone,
    gender,
    ...(payload.dateOfBirth ? { dateOfBirth: payload.dateOfBirth } : {}),
  });
}

async function upsertAddress(address: PatientOnboardingPayload['address']) {
  if (!address || !address.address.trim()) {
    return;
  }
  const existing = (await api.get<Address[]>('/addresses')).find((a) => a.is_default);
  const body = { label: address.label, address: address.address, isDefault: true };
  if (existing) await api.patch(`/addresses/${existing.id}`, body);
  else await api.post('/addresses', body);
}

async function upsertEmergencyContact(emergencyContact: PatientOnboardingPayload['emergencyContact']) {
  if (!emergencyContact || !emergencyContact.name.trim() || !emergencyContact.phone.trim()) {
    return;
  }
  const existing = (await api.get<EmergencyContact[]>('/medical/emergency-contacts'))[0];
  const body = { name: emergencyContact.name, phone: emergencyContact.phone, relationship: emergencyContact.relationship ?? "Contact d'urgence" };
  if (existing) await api.patch(`/medical/emergency-contacts/${existing.id}`, body);
  else await api.post('/medical/emergency-contacts', body);
}

async function upsertMedicalProfile(medicalHistory: string[]) {
  await api.put('/medical/profile', { chronicDiseases: medicalHistory.length > 0 ? medicalHistory.join(', ') : null });
}

async function recordTermsConsent() {
  // `POST /api/medical/consents` fait un upsert (user_id, consent_type) et mémorise la version active des CGU.
  await api.post('/medical/consents', { consentType: 'cgu', accepted: true });
}

export async function completePatientOnboarding(userId: string, payload: PatientOnboardingPayload) {
  void userId; // l'API agit toujours pour l'utilisateur authentifié
  await upsertProfile(payload.profile);
  await upsertAddress(payload.address);
  await upsertEmergencyContact(payload.emergencyContact);
  await upsertMedicalProfile(payload.medicalHistory);
  await recordTermsConsent();
}

export async function completePatientOnboardingFromMetadata(user: AuthUser) {
  const metadata = user.metadata ?? {};
  const pendingPayload = metadata.pending_onboarding as PatientOnboardingPayload | undefined;

  if (!pendingPayload || metadata.patient_onboarding_completed) {
    return { completed: false } as const;
  }

  await completePatientOnboarding(user.id, pendingPayload);

  await auth.updateMetadata({
    patient_onboarding_completed: true,
    pending_onboarding: null,
  });

  return { completed: true } as const;
}
