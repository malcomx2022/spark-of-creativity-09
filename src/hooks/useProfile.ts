import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Profile, MedicalProfile, EmergencyContact, Address } from '@/types/profile';
import { useToast } from '@/hooks/use-toast';

/** Colonnes snake_case du front → corps camelCase attendu par l'API (valeurs `undefined` ignorées). */
export function toProfilePayload(data: Partial<Profile>) {
  return {
    ...(data.full_name !== undefined ? { fullName: data.full_name } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.gender !== undefined ? { gender: data.gender } : {}),
    ...(data.date_of_birth ? { dateOfBirth: data.date_of_birth } : {}),
    ...(data.avatar_url !== undefined ? { avatarUrl: data.avatar_url } : {}),
  };
}

export function toMedicalProfilePayload(data: Partial<MedicalProfile>) {
  const opt = <T>(v: T | undefined) => (v === undefined ? undefined : v);
  return {
    bloodType: opt(data.blood_type),
    allergies: opt(data.allergies),
    chronicDiseases: opt(data.chronic_diseases),
    currentMedications: opt(data.current_medications),
    additionalNotes: opt(data.additional_notes),
    shareWithPractitioner: opt(data.share_with_practitioner),
    primaryDoctorId: opt(data.primary_doctor_id),
    primaryDoctorName: opt(data.primary_doctor_name),
    primaryDoctorEmail: opt(data.primary_doctor_email),
    primaryDoctorPhone: opt(data.primary_doctor_phone),
  };
}

export function toEmergencyContactPayload(data: Partial<EmergencyContact>) {
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.relationship !== undefined ? { relationship: data.relationship } : {}),
  };
}

export function toAddressPayload(data: Partial<Address>) {
  return {
    ...(data.label !== undefined ? { label: data.label } : {}),
    ...(data.address !== undefined ? { address: data.address } : {}),
    ...(data.city !== undefined ? { city: data.city } : {}),
    ...(data.postal_code !== undefined ? { postalCode: data.postal_code } : {}),
    ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
    ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
    ...(data.is_default !== undefined ? { isDefault: data.is_default } : {}),
  };
}

export function useProfile(userId?: string) {
  return useQuery<Profile | null>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      return api.get<Profile>('/profile');
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<Profile> }) => {
      void userId;
      return api.patch<Profile>('/profile', toProfilePayload(data));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-full', variables.userId] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de mettre à jour le profil"),
        variant: "destructive"
      });
    }
  });
}

export function useMedicalProfile(userId?: string) {
  return useQuery<MedicalProfile | null>({
    queryKey: ['medical-profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await api.get<{ profile: MedicalProfile | null; completion: number }>('/medical/profile');
      return res.profile;
    },
    enabled: !!userId,
  });
}

export function useUpdateMedicalProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<MedicalProfile> }) => {
      void userId;
      const res = await api.put<{ profile: MedicalProfile; completion: number }>('/medical/profile', toMedicalProfilePayload(data));
      return res.profile;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['medical-profile', variables.userId] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de mettre à jour le profil médical"),
        variant: "destructive"
      });
    }
  });
}

export function useEmergencyContacts(userId?: string) {
  return useQuery<EmergencyContact[]>({
    queryKey: ['emergency-contacts', userId],
    queryFn: async () => {
      if (!userId) return [];
      return api.get<EmergencyContact[]>('/medical/emergency-contacts');
    },
    enabled: !!userId,
  });
}

export function useAddresses(userId?: string) {
  return useQuery<Address[]>({
    queryKey: ['addresses', userId],
    queryFn: async () => {
      if (!userId) return [];
      return api.get<Address[]>('/addresses');
    },
    enabled: !!userId,
  });
}

// Mutation pour supprimer un contact d'urgence
export function useDeleteEmergencyContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contactId, userId }: { contactId: string; userId: string }) => {
      await api.delete(`/medical/emergency-contacts/${contactId}`);
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-full', userId] });
      toast({
        title: "Contact supprimé",
        description: "Le contact d'urgence a été supprimé avec succès."
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de supprimer le contact"),
        variant: "destructive"
      });
    }
  });
}

// Mutation pour mettre à jour un contact d'urgence
export function useUpdateEmergencyContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contactId, userId, data }: { contactId: string; userId: string; data: Partial<EmergencyContact> }) => {
      await api.patch(`/medical/emergency-contacts/${contactId}`, toEmergencyContactPayload(data));
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-full', userId] });
      toast({
        title: "Contact mis à jour",
        description: "Le contact d'urgence a été mis à jour avec succès."
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de mettre à jour le contact"),
        variant: "destructive"
      });
    }
  });
}

// Mutation pour supprimer une adresse
export function useDeleteAddress() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ addressId, userId }: { addressId: string; userId: string }) => {
      await api.delete(`/addresses/${addressId}`);
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['addresses', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-full', userId] });
      toast({
        title: "Adresse supprimée",
        description: "L'adresse a été supprimée avec succès."
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de supprimer l'adresse"),
        variant: "destructive"
      });
    }
  });
}

// Mutation pour mettre à jour une adresse
export function useUpdateAddress() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ addressId, userId, data }: { addressId: string; userId: string; data: Partial<Address> }) => {
      await api.patch(`/addresses/${addressId}`, toAddressPayload(data));
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['addresses', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-full', userId] });
      toast({
        title: "Adresse mise à jour",
        description: "L'adresse a été mise à jour avec succès."
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de mettre à jour l'adresse"),
        variant: "destructive"
      });
    }
  });
}
