import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type CareNote = Tables<'care_notes'>;

export function useCareNotes(practitionerId?: string) {
  return useQuery<CareNote[]>({
    queryKey: ['care-notes', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      const { data, error } = await supabase
        .from('care_notes')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!practitionerId,
  });
}

export function useCreateCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<'care_notes'>) => {
      const { data: inserted, error } = await supabase
        .from('care_notes')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return inserted as CareNote;
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['care-notes'] });
      if (note?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', note.appointment_id] });
      }
    },
  });
}

export function useUpdateCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TablesUpdate<'care_notes'> }) => {
      const { data: updated, error } = await supabase
        .from('care_notes')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated as CareNote;
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['care-notes'] });
      if (note?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', note.appointment_id] });
      }
    },
  });
}

export function useCareNoteByAppointment(appointmentId?: string) {
  return useQuery<CareNote | null>({
    queryKey: ['care-note', 'appointment', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      
      const { data, error } = await supabase
        .from('care_notes')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });
}
