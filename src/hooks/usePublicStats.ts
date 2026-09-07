import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PublicStats {
  practitioners_count: number;
  patients_count: number;
  appointments_completed: number;
  coaches_count: number;
}

const DEFAULT_STATS: PublicStats = {
  practitioners_count: 0,
  patients_count: 0,
  appointments_completed: 0,
  coaches_count: 0,
};

async function fetchPublicStats(): Promise<PublicStats> {
  try {
    const data = await api.get<Partial<PublicStats>>('/stats/public', { auth: false });
    return { ...DEFAULT_STATS, ...data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Erreur chargement statistiques publiques:', error);
    }
    // Return default values on error
    return DEFAULT_STATS;
  }
}

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: fetchPublicStats,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 2,
  });
}
