import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type PractitionerAvailability = Tables<'practitioner_availability'>;
export type PractitionerException = Tables<'practitioner_exceptions'>;

export function usePractitionerAvailability(practitionerId?: string) {
  return useQuery<PractitionerAvailability[]>({
    queryKey: ['availability', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      const { data, error } = await supabase
        .from('practitioner_availability')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!practitionerId,
  });
}

export function useCreateAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: TablesInsert<'practitioner_availability'>) => {
      // 1. Vérifier les chevauchements avec les créneaux existants
      const { data: existingSlots, error: fetchError } = await supabase
        .from('practitioner_availability')
        .select('*')
        .eq('practitioner_id', data.practitioner_id)
        .eq('day_of_week', data.day_of_week);

      if (fetchError) throw fetchError;

      // 2. Détecter les chevauchements
      const hasOverlap = existingSlots?.some(slot => {
        const slotStart = slot.start_time;
        const slotEnd = slot.end_time;
        const newStart = data.start_time;
        const newEnd = data.end_time;

        // Cas de chevauchement:
        return (
          (newStart >= slotStart && newStart < slotEnd) ||
          (newEnd > slotStart && newEnd <= slotEnd) ||
          (newStart <= slotStart && newEnd >= slotEnd)
        );
      });

      if (hasOverlap) {
        throw new Error('Ce créneau chevauche un créneau existant. Veuillez choisir un autre horaire.');
      }

      // 3. Insérer le nouveau créneau si pas de chevauchement
      const { error } = await supabase
        .from('practitioner_availability')
        .insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible d\'ajouter le créneau.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TablesUpdate<'practitioner_availability'> }) => {
      const { error } = await supabase
        .from('practitioner_availability')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('practitioner_availability')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function usePractitionerExceptions(practitionerId?: string) {
  return useQuery<PractitionerException[]>({
    queryKey: ['exceptions', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      const { data, error } = await supabase
        .from('practitioner_exceptions')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!practitionerId,
  });
}

export function useCreateException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<'practitioner_exceptions'>) => {
      const { error } = await supabase
        .from('practitioner_exceptions')
        .insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}

export function useDeleteException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('practitioner_exceptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}
