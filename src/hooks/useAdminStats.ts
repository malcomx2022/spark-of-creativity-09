import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      // Compter les patients (profiles sans rôle admin et sans practitioner)
      const { count: patientsCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Compter les praticiens
      const { count: practitionersCount } = await supabase
        .from('practitioners')
        .select('*', { count: 'exact', head: true });

      // Compter les rendez-vous
      const { count: appointmentsCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });

      // Calculer les revenus
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('status', 'completed');

      const totalRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

      return {
        patientsCount: patientsCount || 0,
        practitionersCount: practitionersCount || 0,
        appointmentsCount: appointmentsCount || 0,
        totalRevenue,
      };
    },
  });
}
