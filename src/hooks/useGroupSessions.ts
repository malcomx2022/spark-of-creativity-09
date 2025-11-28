import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';

export function useGroupSessions(coachId?: string, page = 0, pageSize = 50) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['group-sessions', coachId, page],
    queryFn: async () => {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Return empty result for unauthenticated users
        return { data: [], count: 0 };
      }

      let query = supabase
        .from('group_sessions')
        .select('*', { count: 'exact' })
        .in('status', ['confirmee', 'planifiee'])
        .order('scheduled_date', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (coachId) {
        query = query.eq('coach_id', coachId);
      }

      const { data, error, count } = await withTimeout(Promise.resolve(query));
      
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: true
  });

  const cancelSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('group_sessions')
        .update({ status: 'annulee' })
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      toast({
        title: "Séance annulée",
        description: "La séance a été annulée avec succès"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const confirmSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('group_sessions')
        .update({ status: 'confirmee' })
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      toast({
        title: "Séance confirmée",
        description: "La séance a été confirmée avec succès"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return {
    sessions: sessions?.data || [],
    count: sessions?.count || 0,
    isLoading,
    cancelSession: cancelSession.mutate,
    confirmSession: confirmSession.mutate,
  };
}