import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef } from 'react';

// Cache mémoire pour éviter les appels répétés pendant le montage initial
let cachedUser: User | null | undefined = undefined;
let cacheTimestamp = 0;
const CACHE_DURATION = 30_000; // 30 secondes

export function useSupabaseUser() {
  const queryClient = useQueryClient();
  const hasInitialized = useRef(false);

  // Écouter les changements d'état d'authentification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Mettre à jour le cache mémoire et React Query
        const user = session?.user ?? null;
        cachedUser = user;
        cacheTimestamp = Date.now();
        
        queryClient.setQueryData(['supabase', 'auth', 'user'], user);
        
        // Si déconnexion, invalider et nettoyer le cache
        if (event === 'SIGNED_OUT') {
          cachedUser = null;
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
      // Utiliser le cache mémoire si valide (évite les appels API répétés)
      const now = Date.now();
      if (cachedUser !== undefined && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedUser;
      }

      const { data, error } = await supabase.auth.getUser();

      if (error && error.status !== 401) {
        throw error;
      }

      // Mettre à jour le cache mémoire
      cachedUser = data.user ?? null;
      cacheTimestamp = now;

      return cachedUser;
    },
    // Données stables pendant 2 minutes
    staleTime: 2 * 60 * 1000,
    // Garder en cache pendant 10 minutes
    gcTime: 10 * 60 * 1000,
    // Ne pas refetch au focus pour l'auth (géré par onAuthStateChange)
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Initialiser avec le cache si disponible
    initialData: () => {
      if (cachedUser !== undefined && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
        return cachedUser;
      }
      return undefined;
    },
  });
}
