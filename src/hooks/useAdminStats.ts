import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Ex vue admin_dashboard_stats : GET /admin/stats (compteurs en snake_case). */
interface AdminDashboardStats {
  patients_count: number;
  practitioners_count: number;
  practitioners_pending_kyc: number;
  appointments_count: number;
  appointments_today: number;
  total_revenue: number;
  upcoming_group_sessions: number;
  open_tickets: number;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const data = await api.get<Partial<AdminDashboardStats>>('/admin/stats');
      return {
        patientsCount: data?.patients_count || 0,
        practitionersCount: data?.practitioners_count || 0,
        appointmentsCount: data?.appointments_count || 0,
        totalRevenue: data?.total_revenue || 0,
      };
    },
  });
}
