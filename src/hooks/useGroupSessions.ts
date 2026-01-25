import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';
import { format } from 'date-fns';

export function useGroupSessions(coachId?: string, page = 0, pageSize = 50) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Date d'aujourd'hui pour filtrer les séances passées
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['group-sessions', coachId, page],
    queryFn: async () => {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Permettre aux visiteurs de voir les séances publiques (futures uniquement)
        const { data, error, count } = await supabase
          .from('group_sessions')
          .select('*', { count: 'exact' })
          .in('status', ['confirmee', 'planifiee'])
          .gte('scheduled_date', today) // ✅ Filtrer les séances passées
          .order('scheduled_date', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
      }

      let query = supabase
        .from('group_sessions')
        .select('*', { count: 'exact' })
        .in('status', ['confirmee', 'planifiee'])
        .gte('scheduled_date', today) // ✅ Filtrer les séances passées
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
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: ['group-sessions'] });

      const previousSessions = queryClient.getQueryData(['group-sessions', coachId, page]);

      queryClient.setQueryData(['group-sessions', coachId, page], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((s: any) => s.id !== sessionId)
        };
      });

      return { previousSessions };
    },
    onError: (err: any, sessionId, context) => {
      queryClient.setQueryData(['group-sessions', coachId, page], context?.previousSessions);
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      toast({
        title: "Séance annulée",
        description: "La séance a été annulée avec succès"
      });
    },
  });

  const confirmSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('group_sessions')
        .update({ status: 'confirmee' })
        .eq('id', sessionId);

      if (error) throw error;
    },
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: ['group-sessions'] });

      const previousSessions = queryClient.getQueryData(['group-sessions', coachId, page]);

      queryClient.setQueryData(['group-sessions', coachId, page], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((s: any) =>
            s.id === sessionId ? { ...s, status: 'confirmee' } : s
          )
        };
      });

      return { previousSessions };
    },
    onError: (err: any, sessionId, context) => {
      queryClient.setQueryData(['group-sessions', coachId, page], context?.previousSessions);
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      toast({
        title: "Séance confirmée",
        description: "La séance a été confirmée avec succès"
      });
    },
  });

  return {
    sessions: sessions?.data || [],
    count: sessions?.count || 0,
    isLoading,
    cancelSession: cancelSession.mutate,
    cancelSessionAsync: cancelSession.mutateAsync,
    isCancelling: cancelSession.isPending,
    confirmSession: confirmSession.mutate,
    confirmSessionAsync: confirmSession.mutateAsync,
    isConfirming: confirmSession.isPending,
  };
}