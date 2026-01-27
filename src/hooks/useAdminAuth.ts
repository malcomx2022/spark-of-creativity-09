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

      // Get admin info from admins table
      const { data: adminData } = await supabase
        .from('admins')
        .select('id, email, full_name, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (adminData) {
        return adminData as Admin;
      }

      // Fallback: return user info if not in admins table
      return {
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { admin, isLoading, error };
}
