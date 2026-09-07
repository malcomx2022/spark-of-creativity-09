import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/api';

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
      const me = await auth.me();
      if (!me) return null;
      const fullName = me.profile?.full_name ?? (me.user.metadata?.full_name as string | undefined);
      if (me.adminRoles.length > 0) {
        return { id: me.user.id, email: me.user.email || '', full_name: fullName, role: me.adminRoles[0] };
      }
      // Fallback: return user info if not in user_roles table
      return { id: me.user.id, email: me.user.email || '', full_name: fullName };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { admin, isLoading, error };
}
