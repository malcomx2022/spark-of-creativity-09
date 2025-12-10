import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { withTimeout } from '@/lib/network-timeout';

export type CareNote = Tables<'care_notes'>;

export interface CareNoteWithAppointment extends CareNote {
  appointments?: {
    practitioner_name: string;
    patient_name: string;
    date: string;
    specialty: string;
  };
}

export function useCareNotes(practitionerId?: string) {
  return useQuery<CareNoteWithAppointment[]>({
    queryKey: ['care-notes', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      // Fetch care notes first
      const { data: notes, error: notesError } = await withTimeout(
        supabase
          .from('care_notes')
          .select('*')
          .eq('practitioner_id', practitionerId)
          .order('created_at', { ascending: false })
      );

      if (notesError) throw notesError;
      if (!notes || notes.length === 0) return [];

      // Fetch appointments for these notes
      const appointmentIds = notes.map(n => n.appointment_id);
      const { data: appointments, error: apptError } = await withTimeout(
        supabase
          .from('appointments')
          .select('id, practitioner_name, patient_name, date, specialty')
          .in('id', appointmentIds)
      );

      if (apptError) {
        console.warn('Error fetching appointments for care notes:', apptError);
      }

      // Map appointments to notes
      const appointmentMap = new Map(appointments?.map(a => [a.id, a]) || []);
      
      return notes.map(note => ({
        ...note,
        appointments: appointmentMap.get(note.appointment_id) || {
          practitioner_name: 'Praticien',
          patient_name: 'Patient',
          date: note.created_at || new Date().toISOString(),
          specialty: 'Consultation'
        }
      })) as CareNoteWithAppointment[];
    },
    enabled: !!practitionerId,
  });
}

export function useCreateCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<'care_notes'>) => {
      const { data: inserted, error } = await withTimeout(
        supabase
          .from('care_notes')
          .insert(data)
          .select()
          .single()
      );

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
      const { data: updated, error } = await withTimeout(
        supabase
          .from('care_notes')
          .update(data)
          .eq('id', id)
          .select()
          .single()
      );

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
      
      const { data, error } = await withTimeout(
        supabase
          .from('care_notes')
          .select('*')
          .eq('appointment_id', appointmentId)
          .maybeSingle()
      );

      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });
}
