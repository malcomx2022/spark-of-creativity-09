import { useQuery, useInfiniteQuery, useMutation, useQueryClient, QueryFunctionContext } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, onTableChange, subscribeAppointment, emitTyping, onTyping, uploadFile, getSignedFileUrl } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export interface Conversation {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  practitioner_id: string;
  practitioner_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  appointment_date: string;
  appointment_time?: string | null;
  appointment_status: string;
}

export interface Message {
  id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  appointment_id: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}

interface ConversationsPage {
  conversations: Conversation[];
  hasMore: boolean;
}

const PAGE_SIZE = 20; // Charger 20 conversations par page

/** Résout les chemins de stockage des pièces jointes en URL signées (affichage/téléchargement). */
async function withSignedAttachments(messages: Message[]): Promise<Message[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.attachment_url) return m;
      try {
        const url = await getSignedFileUrl(m.attachment_url);
        return url ? { ...m, attachment_url: url } : m;
      } catch {
        return m;
      }
    })
  );
}

// Get all conversations for a user (with infinite pagination)
export function useConversations(userId?: string, userType?: 'patient' | 'practitioner') {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['conversations', userId, userType],
    queryFn: async ({ pageParam = 0 }: QueryFunctionContext<readonly [string, string | undefined, string | undefined], number>) => {
      if (!userId) return { conversations: [], hasMore: false } as ConversationsPage;
      // L'API déduit l'utilisateur (patient ou praticien) du jeton.
      return api.get<ConversationsPage>('/conversations', { query: { page: pageParam, limit: PAGE_SIZE } });
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length : undefined;
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 10000,
    initialPageParam: 0,
  });

  // Set up realtime subscription for new messages to update conversations list
  useEffect(() => {
    if (!userId) return;

    const off = onTableChange('messages', () => {
      // Invalidate conversations when any message changes
      queryClient.invalidateQueries({ queryKey: ['conversations', userId, userType] });
    });

    return off;
  }, [userId, userType, queryClient]);

  return query;
}

// Get messages for a specific conversation
export function useConversationMessages(appointmentId?: string, userId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Message[]>({
    queryKey: ['messages', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return [];

      // ✅ Limiter à 200 derniers messages par conversation (ordre chronologique)
      const data = await api.get<Message[]>(`/conversations/${appointmentId}/messages`, { query: { limit: 200 } });
      return withSignedAttachments(data || []);
    },
    enabled: !!appointmentId,
    staleTime: 5000, // ✅ Cache pendant 5 secondes
  });

  // Set up realtime subscription for new messages
  useEffect(() => {
    if (!appointmentId) return;

    const offRoom = subscribeAppointment(appointmentId);
    const offChanges = onTableChange('messages', async (event) => {
      if (event.appointment_id && event.appointment_id !== appointmentId) return;

      if (event.op === 'INSERT') {
        // L'événement ne contient pas la ligne : refetch puis détection des nouveaux messages reçus
        const previous = queryClient.getQueryData<Message[]>(['messages', appointmentId]) ?? [];
        const knownIds = new Set(previous.map((m) => m.id));
        await queryClient.invalidateQueries({ queryKey: ['messages', appointmentId] });
        const next = queryClient.getQueryData<Message[]>(['messages', appointmentId]) ?? [];
        const received = next.some((m) => !knownIds.has(m.id) && m.sender_id !== userId);

        // Show notification if message is from other user
        if (received) {
          toast({
            title: 'Nouveau message',
            description: 'Vous avez reçu un nouveau message',
          });
        }

        // Invalidate conversations to update unread count
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } else {
        // UPDATE (lecture) / DELETE : rafraîchir la conversation
        queryClient.invalidateQueries({ queryKey: ['messages', appointmentId] });
      }
    });

    return () => {
      offChanges();
      offRoom();
    };
  }, [appointmentId, userId, queryClient]);

  return query;
}

// Send a message
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      /** Ignoré : l'expéditeur est déduit du jeton par l'API (conservé pour compatibilité). */
      sender_id?: string;
      content: string;
      appointment_id: string;
      attachment?: File;
    }) => {
      let attachment: { filePath: string; type?: string; name?: string; size?: number } | undefined;

      // Upload attachment if present
      if (data.attachment) {
        const uploaded = await uploadFile(data.attachment, { folder: 'message-attachments' });
        attachment = {
          filePath: uploaded.path,
          type: data.attachment.type || undefined,
          name: data.attachment.name,
          size: data.attachment.size,
        };
      }

      return api.post<Message>(`/conversations/${data.appointment_id}/messages`, {
        content: data.content,
        ...(attachment ? { attachment } : {}),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.appointment_id]
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Mark messages as read
export function useMarkMessagesAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      appointment_id: string;
      /** Ignoré : l'utilisateur est déduit du jeton par l'API (conservé pour compatibilité). */
      user_id?: string;
    }) => {
      // Mark all unread messages from the other party in this conversation as read
      await api.post<{ updated: number }>(`/conversations/${data.appointment_id}/read`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.appointment_id]
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Typing indicator hook
export function useTypingIndicator(appointmentId: string, userId: string) {
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!appointmentId || !userId) return;

    const offRoom = subscribeAppointment(appointmentId);
    const offTyping = onTyping((event) => {
      if (event.appointmentId !== appointmentId || event.userId === userId) return;
      setTypingUsers((prev) => {
        if (event.isTyping) return { ...prev, [event.userId]: true };
        if (!(event.userId in prev)) return prev;
        const next = { ...prev };
        delete next[event.userId];
        return next;
      });
    });

    return () => {
      offTyping();
      offRoom();
      setTypingUsers({});
    };
  }, [appointmentId, userId]);

  const setTyping = (isTyping: boolean) => {
    if (!appointmentId) return;
    emitTyping(appointmentId, isTyping);
  };

  // Check if other users (not current user) are typing
  const isOtherUserTyping = Object.keys(typingUsers).some((id) => id !== userId && typingUsers[id]);

  return { isOtherUserTyping, setTyping };
}
