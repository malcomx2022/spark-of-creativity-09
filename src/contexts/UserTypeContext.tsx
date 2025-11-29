import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface UserTypeContextValue {
  isPractitioner: boolean | undefined;
  isLoading: boolean;
  error: Error | null;
}

const UserTypeContext = createContext<UserTypeContextValue>({
  isPractitioner: undefined,
  isLoading: false,
  error: null
});

export function UserTypeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useSupabaseUser();

  const { data: isPractitioner, isLoading, error } = useQuery({
    queryKey: ['user-type', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: 1000,
  });

  return (
    <UserTypeContext.Provider value={{ isPractitioner, isLoading, error: error as Error | null }}>
      {children}
    </UserTypeContext.Provider>
  );
}

export const useUserType = () => useContext(UserTypeContext);
