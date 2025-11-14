import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Review {
  id: string;
  patient_id: string;
  practitioner_id: string;
  appointment_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export function usePatientReviews(patientId?: string) {
  return useQuery<Review[]>({
    queryKey: ['reviews', 'patient', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
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
      const { error } = await supabase
        .from('reviews')
        .insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
