import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst';

export function useAdminRole() {
  return useQuery({
    queryKey: ['admin-role'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.role as AdminRole | null;
    },
  });
}

export function useIsAdmin() {
  const { data: role, isLoading } = useAdminRole();
  return { isAdmin: !!role, role, isLoading };
}

export function useHasRole(requiredRole: AdminRole) {
  const { data: role } = useAdminRole();
  return role === requiredRole || role === 'super_admin';
}
