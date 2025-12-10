import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export function useSupabaseUser() {
  const queryClient = useQueryClient();

  // Écouter les changements d'état d'authentification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Mettre à jour immédiatement le cache avec le nouvel état
        const user = session?.user ?? null;
        queryClient.setQueryData(['supabase', 'auth', 'user'], user);
        
        // Si déconnexion, invalider toutes les queries liées à l'utilisateur
        if (event === 'SIGNED_OUT') {
          queryClient.invalidateQueries({ queryKey: ['supabase', 'auth', 'user'] });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return useQuery<User | null>({
    queryKey: ['supabase', 'auth', 'user'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error && error.status !== 401) {
        throw error;
      }

      return data.user ?? null;
    },
    staleTime: 60_000,
  });
}
