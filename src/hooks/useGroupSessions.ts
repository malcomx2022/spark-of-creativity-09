import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, errorMessage, onTableChange } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface GroupSessionRow {
  id: string;
  coach_id: string;
  session_name: string;
  session_type: string;
  description?: string | null;
  max_participants: number;
  min_participants: number;
  current_participants: number | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_per_person: number;
  location: string;
  status: 'planifiee' | 'confirmee' | 'annulee' | 'terminee' | null;
  created_at: string;
  updated_at?: string;
  coach?: { id: string; name: string; image?: string | null; specialty?: string | null } | null;
  participants_paid?: number;
  participants_pending?: number;
}

interface SessionsPage {
  data: GroupSessionRow[];
  count: number;
}

/**
 * Séances de groupe à venir (catalogue public, filtrable par coach) : `GET /api/group-sessions`.
 * L'API ne renvoie que les séances planifiées / confirmées dont la date n'est pas passée.
 */
export function useGroupSessions(coachId?: string, page = 0, pageSize = 50) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['group-sessions', coachId, page],
    queryFn: () => api.get<SessionsPage>('/group-sessions', { query: { coachId, page, limit: pageSize }, auth: false }),
    enabled: true
  });

  const cancelSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await api.post(`/group-sessions/${sessionId}/cancel`, {});
    },
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: ['group-sessions'] });

      const previousSessions = queryClient.getQueryData<SessionsPage>(['group-sessions', coachId, page]);

      queryClient.setQueryData<SessionsPage | undefined>(['group-sessions', coachId, page], (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((s) => s.id !== sessionId)
        };
      });

      return { previousSessions };
    },
    onError: (err: unknown, sessionId, context) => {
      queryClient.setQueryData(['group-sessions', coachId, page], context?.previousSessions);
      toast({
        title: "Erreur",
        description: errorMessage(err),
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
      await api.post(`/group-sessions/${sessionId}/confirm`, {});
    },
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: ['group-sessions'] });

      const previousSessions = queryClient.getQueryData<SessionsPage>(['group-sessions', coachId, page]);

      queryClient.setQueryData<SessionsPage | undefined>(['group-sessions', coachId, page], (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((s) =>
            s.id === sessionId ? { ...s, status: 'confirmee' as const } : s
          )
        };
      });

      return { previousSessions };
    },
    onError: (err: unknown, sessionId, context) => {
      queryClient.setQueryData(['group-sessions', coachId, page], context?.previousSessions);
      toast({
        title: "Erreur",
        description: errorMessage(err),
        variant: "destructive"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      toast({
        title: "Séance confirmée",
        description: "La séance a été confirmée avec succès. Les participants inscrits ont été notifiés."
      });
    },
  });

  // Temps réel : séances et inscriptions (current_participants) via la passerelle Socket.IO de l'API
  useEffect(() => {
    return onTableChange(['group_sessions', 'group_session_participants'], () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
    });
  }, [coachId, queryClient]);

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
