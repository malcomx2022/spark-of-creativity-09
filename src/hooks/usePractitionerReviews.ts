import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type Review = Tables<'reviews'>;

export function usePractitionerReviews(practitionerId?: string) {
  return useQuery<Review[]>({
    queryKey: ['reviews', 'practitioner', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!practitionerId,
  });
}

export function useReviewStats(practitionerId?: string) {
  return useQuery({
    queryKey: ['review-stats', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return null;
      
      const { data, error } = await supabase
        .from('reviews')
        .select('rating')
        .eq('practitioner_id', practitionerId)
        .eq('is_hidden', false);

      if (error) throw error;
      
      const reviews = data || [];
      const totalReviews = reviews.length;
      
      if (totalReviews === 0) {
        return {
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
      }

      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      const averageRating = sum / totalReviews;

      const distribution = [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: reviews.filter(r => r.rating === stars).length,
      }));

      return {
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalReviews,
        distribution,
      };
    },
    enabled: !!practitionerId,
  });
}
