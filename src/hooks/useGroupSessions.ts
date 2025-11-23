import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';

export function useGroupSessions(coachId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['group-sessions', coachId],
    queryFn: async () => {
      let query = supabase
        .from('group_sessions')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (coachId) {
        query = query.eq('coach_id', coachId);
      }

      const { data, error } = await withTimeout(Promise.resolve(query));
      
      if (error) throw error;
      return data;
    },
    enabled: !!coachId
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
    sessions: sessions || [],
    isLoading,
    cancelSession: cancelSession.mutate,
    confirmSession: confirmSession.mutate,
  };
}