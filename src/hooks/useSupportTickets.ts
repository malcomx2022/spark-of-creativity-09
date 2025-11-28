import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { withTimeout } from '@/lib/network-timeout';

export type SupportTicket = Tables<'support_tickets'>;

export function useSupportTickets(userId?: string) {
  return useQuery<SupportTicket[]>({
    queryKey: ['support-tickets', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      // ✅ Limiter à 50 derniers tickets
      const { data, error } = await withTimeout(
        supabase
          .from('support_tickets')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
      );

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000, // ✅ Cache pendant 30 secondes
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      user_id: string;
      subject: string;
      description: string;
      priority?: string;
    }) => {
      const { error } = await withTimeout(
        supabase
          .from('support_tickets')
          .insert({
            ...data,
            status: 'ouvert',
            priority: data.priority || 'medium',
          })
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}
