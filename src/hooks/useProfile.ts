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
      
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      const { data, error } = await withTimeout(query);

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
      const query = supabase
        .from('profiles')
        .upsert({ id: userId, ...data });
      
      const { error } = await withTimeout(query);

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
      
      const query = supabase
        .from('medical_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      const { data, error } = await withTimeout(query);

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
      const query = supabase
        .from('medical_profiles')
        .upsert({ user_id: userId, ...data });
      
      const { error } = await withTimeout(query);

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
      
      const query = supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      const { data, error } = await withTimeout(query);

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
      
      const query = supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false });
      
      const { data, error } = await withTimeout(query);

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}
