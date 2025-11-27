import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Notification, NotificationPreferences } from '@/types/profile';
import { toast } from '@/hooks/use-toast';
import { playNotificationSound } from '@/lib/notification-sound';
import { withTimeout } from '@/lib/network-timeout';

export function useNotifications(userId?: string) {
  const queryClient = useQueryClient();

  // Listen to realtime notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('New notification received:', payload);
          
          // Play notification sound
          playNotificationSound();
          
          // Add the new notification to the cache with animation flag
          queryClient.setQueryData<Notification[]>(
            ['notifications', userId],
            (old) => {
              if (!old) return [{ ...payload.new, isNew: true } as Notification & { isNew?: boolean }];
              return [{ ...payload.new, isNew: true } as Notification & { isNew?: boolean }, ...old];
            }
          );

          // Show a toast for the new notification
          const notification = payload.new as Notification;
          toast({
            title: notification.title,
            description: notification.message,
            duration: 5000,
          });

          // Remove the isNew flag after animation completes
          setTimeout(() => {
            queryClient.setQueryData<Notification[]>(
              ['notifications', userId],
              (old) => {
                if (!old) return [];
                return old.map((n) =>
                  n.id === notification.id ? { ...n, isNew: false } : n
                );
              }
            );
          }, 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Notification updated:', payload);
          
          // Update the notification in the cache
          queryClient.setQueryData<Notification[]>(
            ['notifications', userId],
            (old) => {
              if (!old) return [];
              return old.map((n) =>
                n.id === payload.new.id ? (payload.new as Notification) : n
              );
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return useQuery<Notification[]>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await withTimeout(
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
      );

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      notificationId,
      userId,
    }: {
      notificationId: string;
      userId?: string;
    }) => {
      const { error } = await withTimeout(
        supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
      );

      if (error) throw error;
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

export function useNotificationPreferences(userId?: string) {
  return useQuery<NotificationPreferences | null>({
    queryKey: ['notification-preferences', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await withTimeout(
        supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
      );

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
