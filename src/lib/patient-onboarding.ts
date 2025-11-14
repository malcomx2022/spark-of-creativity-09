import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

async function upsertProfile(userId: string, payload: PatientOnboardingPayload['profile']) {
  const { data: existingProfile, error: profileSelectError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profileSelectError) throw profileSelectError;

  const genderMap: Record<string, 'homme' | 'femme' | 'autre' | 'non_specifie'> = {
    'homme': 'homme',
    'femme': 'femme',
    'autre': 'autre',
    'non_specifie': 'non_specifie',
  };
  
  const normalizedGender = payload.gender ? (genderMap[payload.gender] || 'non_specifie') : 'non_specifie';

  if (!existingProfile) {
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        full_name: payload.fullName,
        phone: payload.phone,
        gender: normalizedGender,
        date_of_birth: payload.dateOfBirth || null,
      });

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: payload.fullName,
        phone: payload.phone,
        gender: normalizedGender,
        date_of_birth: payload.dateOfBirth || null,
      })
      .eq('id', userId);

    if (error) throw error;
  }
}

async function upsertAddress(userId: string, address: PatientOnboardingPayload['address']) {
  if (!address || !address.address.trim()) {
    return;
  }

  const { data: existingAddress, error: addressError } = await supabase
    .from('addresses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (addressError) throw addressError;

  if (existingAddress) {
    const { error } = await supabase
      .from('addresses')
      .update({
        label: address.label,
        address: address.address,
        is_default: true,
      })
      .eq('id', existingAddress.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        label: address.label,
        address: address.address,
        is_default: true,
      });

    if (error) throw error;
  }
}

async function upsertEmergencyContact(userId: string, emergencyContact: PatientOnboardingPayload['emergencyContact']) {
  if (!emergencyContact || !emergencyContact.name.trim() || !emergencyContact.phone.trim()) {
    return;
  }

  const { data: existingContact, error: contactError } = await supabase
    .from('emergency_contacts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (contactError) throw contactError;

  if (existingContact) {
    const { error } = await supabase
      .from('emergency_contacts')
      .update({
        name: emergencyContact.name,
        phone: emergencyContact.phone,
        relationship: emergencyContact.relationship ?? "Contact d'urgence",
      })
      .eq('id', existingContact.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('emergency_contacts')
      .insert({
        user_id: userId,
        name: emergencyContact.name,
        phone: emergencyContact.phone,
        relationship: emergencyContact.relationship ?? "Contact d'urgence",
      });

    if (error) throw error;
  }
}

async function upsertMedicalProfile(userId: string, medicalHistory: string[]) {
  const chronicDiseases = medicalHistory.length > 0 ? medicalHistory.join(', ') : null;

  const { error } = await supabase
    .from('medical_profiles')
    .upsert({
      user_id: userId,
      chronic_diseases: chronicDiseases,
    });

  if (error) throw error;
}

async function recordTermsConsent(userId: string, acceptedAt: string) {
  const { data: existingConsent, error: consentSelectError } = await supabase
    .from('user_consents')
    .select('id, is_accepted, accepted_at')
    .eq('user_id', userId)
    .eq('consent_type', 'cgu')
    .maybeSingle();

  if (consentSelectError) throw consentSelectError;

  if (!existingConsent) {
    const { error } = await supabase
      .from('user_consents')
      .insert({
        user_id: userId,
        consent_type: 'cgu',
        is_accepted: true,
        accepted_at: acceptedAt,
      });

    if (error) throw error;
    return;
  }

  if (!existingConsent.is_accepted || !existingConsent.accepted_at) {
    const { error } = await supabase
      .from('user_consents')
      .update({
        is_accepted: true,
        accepted_at: acceptedAt,
      })
      .eq('id', existingConsent.id);

    if (error) throw error;
  }
}

export async function completePatientOnboarding(userId: string, payload: PatientOnboardingPayload) {
  await upsertProfile(userId, payload.profile);
  await upsertAddress(userId, payload.address);
  await upsertEmergencyContact(userId, payload.emergencyContact);
  await upsertMedicalProfile(userId, payload.medicalHistory);
  await recordTermsConsent(userId, payload.acceptTermsAt);
}

export async function completePatientOnboardingFromMetadata(user: User) {
  const metadata = user.user_metadata ?? {};
  const pendingPayload = metadata.pending_onboarding as PatientOnboardingPayload | undefined;

  if (!pendingPayload || metadata.patient_onboarding_completed) {
    return { completed: false } as const;
  }

  await completePatientOnboarding(user.id, pendingPayload);

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      patient_onboarding_completed: true,
      pending_onboarding: null,
    },
  });

  if (updateError) {
    throw updateError;
  }

  return { completed: true } as const;
}
