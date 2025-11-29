import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase
          .from('admin_dashboard_stats')
          .select('*')
          .single()
      );

      if (error) throw error;

      return {
        patientsCount: data?.patients_count || 0,
        practitionersCount: data?.practitioners_count || 0,
        appointmentsCount: data?.appointments_count || 0,
        totalRevenue: data?.total_revenue || 0,
      };
    },
  });
}
