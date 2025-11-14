import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type SupportTicket = Tables<'support_tickets'>;

export function useSupportTickets(userId?: string) {
  return useQuery<SupportTicket[]>({
    queryKey: ['support-tickets', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
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
      const { error } = await supabase
        .from('support_tickets')
        .insert({
          ...data,
          status: 'ouvert',
          priority: data.priority || 'medium',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}
