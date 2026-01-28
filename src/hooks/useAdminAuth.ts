import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Admin {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
}

export function useAdminAuth() {
  const { data: admin, isLoading, error } = useQuery<Admin | null>({
    queryKey: ['admin-auth'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return null;
      }

      // Get admin role from user_roles table
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      // Get profile info
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (roleData) {
        return {
          id: user.id,
          email: user.email || '',
          full_name: profileData?.full_name,
          role: roleData.role,
        } as Admin;
      }

      // Fallback: return user info if not in user_roles table
      return {
        id: user.id,
        email: user.email || '',
        full_name: profileData?.full_name || user.user_metadata?.full_name,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { admin, isLoading, error };
}
