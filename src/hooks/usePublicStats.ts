import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PublicStats {
  practitioners_count: number;
  patients_count: number;
  appointments_completed: number;
  coaches_count: number;
}

async function fetchPublicStats(): Promise<PublicStats> {
  const { data, error } = await supabase.rpc('get_public_stats');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Erreur chargement statistiques publiques:', error);
    }
    // Return default values on error
    return {
      practitioners_count: 0,
      patients_count: 0,
      appointments_completed: 0,
      coaches_count: 0,
    };
  }

  return data as unknown as PublicStats;
}

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: fetchPublicStats,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 2,
  });
}
