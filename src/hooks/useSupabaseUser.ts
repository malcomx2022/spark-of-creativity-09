import { useQuery } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useSupabaseUser() {
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
