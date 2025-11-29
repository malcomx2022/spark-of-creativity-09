import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

export interface Review {
  id: string;
  patient_id: string;
  practitioner_id: string;
  appointment_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  practitioner?: {
    name: string;
    specialty: string;
  };
  appointment?: {
    specialty: string;
  };
}

export function usePatientReviews(patientId?: string) {
  return useQuery<Review[]>({
    queryKey: ['reviews', 'patient', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      
      // ✅ Limiter à 50 derniers avis avec JOIN practitioners et appointments
      const { data, error } = await withTimeout(
        supabase
          .from('reviews')
          .select(`
            *,
            practitioner:practitioners!reviews_practitioner_id_fkey(name, specialty),
            appointment:appointments!reviews_appointment_id_fkey(specialty)
          `)
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(50)
      );

      if (error) throw error;
      
      // Transform data to match Review interface
      return (data || []).map(item => ({
        ...item,
        practitioner: item.practitioner ? {
          name: (item.practitioner as any).name,
          specialty: (item.practitioner as any).specialty,
        } : undefined,
        appointment: item.appointment ? {
          specialty: (item.appointment as any).specialty,
        } : undefined,
      }));
    },
    enabled: !!patientId,
    staleTime: 60000, // ✅ Cache pendant 1 minute
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      patient_id: string;
      practitioner_id: string;
      appointment_id: string;
      rating: number;
      comment?: string;
    }) => {
      const { error } = await withTimeout(
        supabase
          .from('reviews')
          .insert(data)
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
