import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

/** Ligne renvoyée par GET /reviews/mine. */
interface MyReviewRow {
  id: string;
  patient_id: string;
  practitioner_id: string;
  appointment_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_hidden?: boolean | null;
  practitioner: { id: string; name: string; specialty: string } | null;
}

/** Avis du patient connecté (l'API déduit le patient du jeton ; `patientId` ne sert qu'à activer la requête). */
export function usePatientReviews(patientId?: string) {
  return useQuery<Review[]>({
    queryKey: ['reviews', 'patient', patientId],
    queryFn: async () => {
      if (!patientId) return [];

      // ✅ 50 derniers avis avec le praticien associé
      const data = await api.get<MyReviewRow[]>('/reviews/mine');

      // Transform data to match Review interface
      // TODO(api): GET /reviews/mine ne renvoie pas la spécialité du rendez-vous (`appointment.specialty`).
      return (data || []).map((item) => ({
        id: item.id,
        patient_id: item.patient_id,
        practitioner_id: item.practitioner_id,
        appointment_id: item.appointment_id,
        rating: item.rating,
        comment: item.comment ?? undefined,
        created_at: item.created_at,
        practitioner: item.practitioner
          ? {
              name: item.practitioner.name,
              specialty: item.practitioner.specialty,
            }
          : undefined,
        appointment: undefined,
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
      /** Ignoré : le patient et le praticien sont déduits du rendez-vous par l'API (conservés pour compatibilité). */
      patient_id?: string;
      practitioner_id?: string;
      appointment_id: string;
      rating: number;
      comment?: string;
    }) => {
      await api.post<Review & { practitioner_rating: number }>('/reviews', {
        appointmentId: data.appointment_id,
        rating: data.rating,
        comment: data.comment?.trim() ? data.comment : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    },
  });
}
