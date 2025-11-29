import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

export function usePatientProfileData(userId?: string) {
  return useQuery({
    queryKey: ['patient-profile-full', userId],
    queryFn: async () => {
      if (!userId) return { profile: null, contacts: [], addresses: [] };
      
      const [profileResult, contactsResult, addressesResult] = await Promise.all([
        withTimeout(
          supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()
        ),
        withTimeout(
          supabase
            .from('emergency_contacts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        ),
        withTimeout(
          supabase
            .from('addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
        ),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (contactsResult.error) throw contactsResult.error;
      if (addressesResult.error) throw addressesResult.error;

      return {
        profile: profileResult.data,
        contacts: contactsResult.data || [],
        addresses: addressesResult.data || [],
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
