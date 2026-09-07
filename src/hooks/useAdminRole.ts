import { useQuery } from '@tanstack/react-query';
import { auth, type AdminRole } from '@/lib/api';

export type { AdminRole };

/** Rôle administrateur de l'utilisateur connecté (premier rôle de `user_roles`, résolu par `GET /api/auth/me`). */
export function useAdminRole() {
  return useQuery({
    queryKey: ['admin-role'],
    queryFn: async () => {
      const me = await auth.me();
      if (!me) return null;
      return (me.adminRoles[0] ?? null) as AdminRole | null;
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
