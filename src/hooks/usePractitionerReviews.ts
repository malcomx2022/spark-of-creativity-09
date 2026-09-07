import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Avis public d'un praticien (masqués exclus) tel que renvoyé par GET /practitioners/:id/reviews. */
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  patient_name?: string | null;
  /** Compatibilité avec l'ancienne jointure `profiles!patient_id(full_name)`. */
  profiles?: { full_name: string | null } | null;
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  distribution: { stars: number; count: number }[];
}

interface PractitionerReviewsResponse {
  data: Review[];
  stats: ReviewStats;
}

const EMPTY_STATS: ReviewStats = {
  averageRating: 0,
  totalReviews: 0,
  distribution: [
    { stars: 5, count: 0 },
    { stars: 4, count: 0 },
    { stars: 3, count: 0 },
    { stars: 2, count: 0 },
    { stars: 1, count: 0 },
  ],
};

/** `practitionerId` = `practitioners.id` ; `page` commence à 1 (l'API pagine à partir de 0). */
export function usePractitionerReviews(practitionerId?: string, page = 1, limit = 10) {
  return useQuery<Review[]>({
    queryKey: ['reviews', 'practitioner', practitionerId, page, limit],
    queryFn: async () => {
      if (!practitionerId) return [];

      const result = await api.get<PractitionerReviewsResponse>(`/practitioners/${practitionerId}/reviews`, {
        query: { page: Math.max(0, page - 1), limit },
        auth: false,
      });

      return (result?.data || []).map((review) => ({
        ...review,
        profiles: { full_name: review.patient_name ?? null },
      }));
    },
    enabled: !!practitionerId,
  });
}

export function useReviewStats(practitionerId?: string) {
  return useQuery<ReviewStats | null>({
    queryKey: ['review-stats', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return null;

      const result = await api.get<PractitionerReviewsResponse>(`/practitioners/${practitionerId}/reviews`, {
        query: { page: 0, limit: 1 },
        auth: false,
      });

      const stats = result?.stats;
      if (!stats || stats.totalReviews === 0) return EMPTY_STATS;

      return {
        averageRating: parseFloat(Number(stats.averageRating).toFixed(1)),
        totalReviews: stats.totalReviews,
        distribution: stats.distribution,
      };
    },
    enabled: !!practitionerId,
  });
}
