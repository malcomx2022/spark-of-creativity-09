import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

interface CareNote {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
  appointments?: {
    practitioner_name: string;
    date: string;
  };
}

export function usePatientCareNotes(patientId?: string, page = 0, pageSize = 20) {
  return useQuery({
    queryKey: ['patient-care-notes', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [], count: 0 };

      // ✅ Récupérer uniquement les notes partagées avec le patient
      const { data, error, count } = await withTimeout(
        supabase
          .from('care_notes')
          .select(`
            *,
            appointments!inner (
              id,
              patient_id,
              practitioner_name,
              date
            )
          `, { count: 'exact' })
          .eq('shared_with_patient', true)  // ⚠️ IMPORTANT : uniquement notes partagées
          .eq('appointments.patient_id', patientId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );

      if (error) throw error;
      return { data: (data as CareNote[]) || [], count: count || 0 };
    },
    enabled: !!patientId,
    staleTime: 30000,
  });
}
