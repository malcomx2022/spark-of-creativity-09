import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      // Exclure les utilisateurs avec un rôle admin ou enregistrés comme praticiens
      const { data: adminRoles, error: adminRolesError } = await supabase
        .from('user_roles')
        .select('user_id');

      if (adminRolesError) throw adminRolesError;

      const { data: practitionerUsers, error: practitionersError } = await supabase
        .from('practitioners')
        .select('user_id');

      if (practitionersError) throw practitionersError;

      const excludedUserIds = Array.from(
        new Set([
          ...(adminRoles?.map((role) => role.user_id) ?? []),
          ...(practitionerUsers?.map((practitioner) => practitioner.user_id) ?? []),
        ])
      ).filter(Boolean);

      let patientsCount = 0;

      if (excludedUserIds.length === 0) {
        const { count, error: patientsError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        if (patientsError) throw patientsError;
        patientsCount = count ?? 0;
      } else {
        const quotedIds = excludedUserIds.map((id) => `"${id}"`);
        const formattedIds = `(${quotedIds.join(',')})`;

        const { count, error: patientsError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .not('id', 'in', formattedIds);

        if (patientsError) throw patientsError;
        patientsCount = count ?? 0;
      }

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
        patientsCount,
        practitionersCount: practitionersCount || 0,
        appointmentsCount: appointmentsCount || 0,
        totalRevenue,
      };
    },
  });
}
