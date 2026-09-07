import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Address, EmergencyContact, Profile } from '@/types/profile';

export function usePatientProfileData(userId?: string) {
  return useQuery({
    queryKey: ['patient-profile-full', userId],
    queryFn: async () => {
      if (!userId) return { profile: null as Profile | null, contacts: [] as EmergencyContact[], addresses: [] as Address[] };

      const [profile, contacts, addresses] = await Promise.all([
        api.get<Profile>('/profile'),
        api.get<EmergencyContact[]>('/medical/emergency-contacts'),
        api.get<Address[]>('/addresses'),
      ]);

      return { profile, contacts, addresses };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
