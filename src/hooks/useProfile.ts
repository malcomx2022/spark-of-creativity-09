import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, MedicalProfile, EmergencyContact, Address } from '@/types/profile';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';
import { useToast } from '@/hooks/use-toast';

export function useProfile(userId?: string) {
  return useQuery<Profile | null>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
      );

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<Profile> }) => {
      const { error } = await withTimeout(
        supabase
          .from('profiles')
          .upsert({ id: userId, ...data })
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError 
          ? error.message 
          : "Impossible de mettre à jour le profil",
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
      
      const { data, error } = await withTimeout(
        supabase
          .from('medical_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
      );

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useUpdateMedicalProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<MedicalProfile> }) => {
      const { error } = await withTimeout(
        supabase
          .from('medical_profiles')
          .upsert({ user_id: userId, ...data })
      );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['medical-profile', variables.userId] });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError 
          ? error.message 
          : "Impossible de mettre à jour le profil médical",
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
      
      const { data, error } = await withTimeout(
        supabase
          .from('emergency_contacts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useAddresses(userId?: string) {
  return useQuery<Address[]>({
    queryKey: ['addresses', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await withTimeout(
        supabase
          .from('addresses')
          .select('*')
          .eq('user_id', userId)
          .order('is_default', { ascending: false })
      );

      if (error) throw error;
      return data || [];
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
      const { error } = await withTimeout(
        supabase
          .from('emergency_contacts')
          .delete()
          .eq('id', contactId)
      );

      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      toast({
        title: "Contact supprimé",
        description: "Le contact d'urgence a été supprimé avec succès."
      });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError
          ? error.message
          : "Impossible de supprimer le contact",
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
      const { error } = await withTimeout(
        supabase
          .from('emergency_contacts')
          .update(data)
          .eq('id', contactId)
      );

      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      toast({
        title: "Contact mis à jour",
        description: "Le contact d'urgence a été mis à jour avec succès."
      });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError
          ? error.message
          : "Impossible de mettre à jour le contact",
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
      const { error } = await withTimeout(
        supabase
          .from('addresses')
          .delete()
          .eq('id', addressId)
      );

      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['addresses', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      toast({
        title: "Adresse supprimée",
        description: "L'adresse a été supprimée avec succès."
      });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError
          ? error.message
          : "Impossible de supprimer l'adresse",
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
      const { error } = await withTimeout(
        supabase
          .from('addresses')
          .update(data)
          .eq('id', addressId)
      );

      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['addresses', userId] });
      queryClient.invalidateQueries({ queryKey: ['patient-profile-data'] });
      toast({
        title: "Adresse mise à jour",
        description: "L'adresse a été mise à jour avec succès."
      });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError
          ? error.message
          : "Impossible de mettre à jour l'adresse",
        variant: "destructive"
      });
    }
  });
}
