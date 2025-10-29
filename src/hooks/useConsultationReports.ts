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

export const usePatientConsultationReports = (patientId?: string) => {
  return useQuery({
    queryKey: ['patient-consultation-reports', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      
      // Get all appointments for the patient
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id')
        .eq('patient_id', patientId);
      
      if (appointmentsError) throw appointmentsError;
      if (!appointments || appointments.length === 0) return [];
      
      const appointmentIds = appointments.map(apt => apt.id);
      
      // Get all consultation reports for those appointments
      const { data, error } = await supabase
        .from('consultation_reports')
        .select('*, appointments(patient_name, practitioner_name, date, time)')
        .in('appointment_id', appointmentIds)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ConsultationReport[];
    },
    enabled: !!patientId,
  });
};
