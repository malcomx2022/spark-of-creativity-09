import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export type Message = Tables<'messages'>;

export function useMessages(userId?: string, userType?: 'patient' | 'practitioner') {
  return useQuery<Message[]>({
    queryKey: ['messages', userId, userType],
    queryFn: async () => {
      if (!userId) return [];
      
      if (userType === 'practitioner') {
        // Pour le praticien: récupérer les messages des rendez-vous où il est le praticien
        const { data: appointments } = await supabase
          .from('appointments')
          .select('id')
          .eq('practitioner_id', userId);
        
        if (!appointments || appointments.length === 0) return [];
        
        const appointmentIds = appointments.map(apt => apt.id);
        
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .in('appointment_id', appointmentIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      } else {
        // Pour le patient: récupérer les messages envoyés ou reçus via ses rendez-vous
        const { data: appointments } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', userId);
        
        if (!appointments || appointments.length === 0) return [];
        
        const appointmentIds = appointments.map(apt => apt.id);
        
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .in('appointment_id', appointmentIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      }
    },
    enabled: !!userId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<'messages'>) => {
      const { error } = await supabase
        .from('messages')
        .insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useMarkMessageAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('id', messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}
