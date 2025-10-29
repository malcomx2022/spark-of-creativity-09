import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ConsultationReport = Tables<'consultation_reports'>;

export const useConsultationReports = (practitionerId?: string) => {
  return useQuery({
    queryKey: ['consultation-reports', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      const { data, error } = await supabase
        .from('consultation_reports')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ConsultationReport[];
    },
    enabled: !!practitionerId,
  });
};

export const useCreateConsultationReport = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (report: Omit<ConsultationReport, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('consultation_reports')
        .insert(report)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation-reports'] });
    },
  });
};

export const useConsultationReportByAppointment = (appointmentId?: string) => {
  return useQuery({
    queryKey: ['consultation-report', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      
      const { data, error } = await supabase
        .from('consultation_reports')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle();
      
      if (error) throw error;
      return data as ConsultationReport | null;
    },
    enabled: !!appointmentId,
  });
};
