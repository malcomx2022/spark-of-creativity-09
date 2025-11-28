import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { withTimeout } from '@/lib/network-timeout';

export type ConsultationReport = Tables<'consultation_reports'>;

export const useConsultationReports = (practitionerId?: string, page = 0, pageSize = 50) => {
  return useQuery({
    queryKey: ['consultation-reports', practitionerId, page],
    queryFn: async () => {
      if (!practitionerId) return { data: [], count: 0 };
      
      const query = supabase
        .from('consultation_reports')
        .select('*', { count: 'exact' })
        .eq('practitioner_id', practitionerId)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      const { data, error, count } = await withTimeout(query);
      
      if (error) throw error;
      return { data: (data as ConsultationReport[]) || [], count: count || 0 };
    },
    enabled: !!practitionerId,
  });
};

export const useCreateConsultationReport = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (report: Omit<ConsultationReport, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await withTimeout(
        supabase
          .from('consultation_reports')
          .insert(report)
          .select()
          .single()
      );
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation-reports'] });
    },
  });
};

export const useConsultationReportByAppointment = (appointmentId?: string) => {
  return useQuery<ConsultationReport | null>({
    queryKey: ['consultation-report', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      
      const { data, error } = await withTimeout(
        supabase
          .from('consultation_reports')
          .select('*')
          .eq('appointment_id', appointmentId)
          .maybeSingle()
      );
      
      if (error) throw error;
      return data;
    },
    enabled: !!appointmentId,
  });
};

export const usePatientConsultationReports = (patientId?: string, page = 0, pageSize = 20) => {
  return useQuery({
    queryKey: ['patient-consultation-reports', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [], count: 0 };
      
      // Get all appointments for the patient
      const { data: appointments, error: appointmentsError } = await withTimeout(
        supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', patientId)
      );
      
      if (appointmentsError) throw appointmentsError;
      if (!appointments || appointments.length === 0) return { data: [], count: 0 };
      
      const appointmentIds = appointments.map(apt => apt.id);
      
      // Get consultation reports with pagination
      const { data, error, count } = await withTimeout(
        supabase
          .from('consultation_reports')
          .select('*, appointments(patient_name, practitioner_name, date, time)', { count: 'exact' })
          .in('appointment_id', appointmentIds)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );
      
      if (error) throw error;
      return { data: (data as ConsultationReport[]) || [], count: count || 0 };
    },
    enabled: !!patientId,
  });
};
