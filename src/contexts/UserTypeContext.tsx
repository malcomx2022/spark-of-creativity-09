import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/api';
import { useAuthUser } from '@/hooks/useAuthUser';
import { UserTypeContext } from '@/contexts/user-type';

export function UserTypeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useAuthUser();

  const { data: isPractitioner, isLoading, error } = useQuery({
    queryKey: ['user-type', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const me = await auth.me();
      return me?.role === 'practitioner' || me?.role === 'coach';
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
