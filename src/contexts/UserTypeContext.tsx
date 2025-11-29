import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface UserTypeContextValue {
  isPractitioner: boolean | undefined;
  isLoading: boolean;
}

const UserTypeContext = createContext<UserTypeContextValue>({
  isPractitioner: undefined,
  isLoading: false
});

export function UserTypeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useSupabaseUser();

  const { data: isPractitioner, isLoading } = useQuery({
    queryKey: ['user-type', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <UserTypeContext.Provider value={{ isPractitioner, isLoading }}>
      {children}
    </UserTypeContext.Provider>
  );
}

export const useUserType = () => useContext(UserTypeContext);
