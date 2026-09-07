import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, type AuthUser } from '@/lib/api';

export const AUTH_USER_QUERY_KEY = ['auth', 'user'] as const;

/**
 * Utilisateur connecté (ex useAuthUser). La session est conservée localement par
 * `src/lib/api/session.ts` ; ce hook la reflète dans React Query et suit les changements
 * d'état (connexion, déconnexion, rotation du jeton, mise à jour des métadonnées).
 */
export function useAuthUser() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(AUTH_USER_QUERY_KEY, session?.user ?? null);
      if (event === 'SIGNED_OUT') queryClient.invalidateQueries({ queryKey: AUTH_USER_QUERY_KEY });
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery<AuthUser | null>({
    queryKey: AUTH_USER_QUERY_KEY,
    queryFn: async () => auth.getUser(),
    initialData: () => auth.getUser(),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
