import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, onTableChange } from '@/lib/api';
import type { Notification, NotificationPreferences } from '@/types/profile';
import { toast } from '@/hooks/use-toast';
import { playNotificationSound } from '@/lib/notification-sound';

type NotificationWithFlag = Notification & { isNew?: boolean };

export function useNotifications(userId?: string) {
  const queryClient = useQueryClient();

  // Listen to realtime notifications (l'API ne diffuse que celles de l'utilisateur connecté)
  useEffect(() => {
    if (!userId) return;

    const queryKey = ['notifications', userId];

    const off = onTableChange('notifications', async (event) => {
      if (event.op !== 'INSERT') {
        // Mise à jour (lecture) ou suppression : rafraîchir la liste
        queryClient.invalidateQueries({ queryKey });
        return;
      }

      // L'événement ne contient pas la ligne : refetch puis détection des nouvelles notifications
      const previous = queryClient.getQueryData<NotificationWithFlag[]>(queryKey);
      const knownIds = new Set((previous ?? []).map((n) => n.id));
      await queryClient.invalidateQueries({ queryKey });
      const next = queryClient.getQueryData<NotificationWithFlag[]>(queryKey) ?? [];
      const fresh = previous === undefined ? [] : next.filter((n) => !knownIds.has(n.id));
      if (fresh.length === 0) return;

      // Play notification sound
      playNotificationSound();

      // Flag the new notifications for the entrance animation
      const freshIds = new Set(fresh.map((n) => n.id));
      queryClient.setQueryData<NotificationWithFlag[]>(queryKey, (old) =>
        (old ?? []).map((n) => (freshIds.has(n.id) ? { ...n, isNew: true } : n))
      );

      // Show a toast for each new notification
      for (const notification of fresh) {
        toast({
          title: notification.title,
          description: notification.message,
          duration: 5000,
        });
      }

      // Remove the isNew flag after animation completes
      setTimeout(() => {
        queryClient.setQueryData<NotificationWithFlag[]>(queryKey, (old) =>
          (old ?? []).map((n) => (freshIds.has(n.id) ? { ...n, isNew: false } : n))
        );
      }, 1000);
    });

    return off;
  }, [userId, queryClient]);

  return useQuery<Notification[]>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await api.get<Notification[]>('/notifications', { query: { limit: 50 } });
      return data || [];
    },
    enabled: !!userId,
    staleTime: 10000, // ✅ Cache pendant 10 secondes
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      notificationId,
    }: {
      notificationId: string;
      userId?: string;
    }) => {
      await api.post<Notification>(`/notifications/${notificationId}/read`);
    },
    onSuccess: (_data, variables) => {
      if (variables?.userId) {
        queryClient.invalidateQueries({ queryKey: ['notifications', variables.userId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_userId: string) => {
      await api.post<{ updated: number }>('/notifications/read-all');
    },
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      toast({
        title: 'Notifications marquées comme lues',
        description: 'Toutes vos notifications ont été marquées comme lues.',
      });
    },
    onError: () => {
      toast({
        title: 'Erreur',
        description: 'Impossible de marquer les notifications comme lues.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      notificationId,
      userId,
    }: {
      notificationId: string;
      userId: string;
    }) => {
      await api.delete<{ deleted: boolean }>(`/notifications/${notificationId}`);
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      toast({
        title: 'Notification supprimée',
        description: 'La notification a été supprimée.',
      });
    },
    onError: () => {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer la notification.',
        variant: 'destructive',
      });
    },
  });
}

export function useNotificationPreferences(userId?: string) {
  return useQuery<NotificationPreferences | null>({
    queryKey: ['notification-preferences', userId],
    queryFn: async () => {
      if (!userId) return null;
      // L'API renvoie les valeurs par défaut de la table si aucune ligne n'existe encore.
      return api.get<NotificationPreferences>('/notifications/preferences');
    },
    enabled: !!userId,
  });
}

export interface NotificationPreferencesUpdate {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  pushEnabled?: boolean;
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data }: { userId?: string; data: NotificationPreferencesUpdate }) => {
      return api.put<NotificationPreferences>('/notifications/preferences', data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences', variables.userId] });
    },
  });
}
