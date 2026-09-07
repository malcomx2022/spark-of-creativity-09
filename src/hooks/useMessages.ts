import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Message {
  id: string;
  appointment_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}

export interface MessageInsert {
  appointment_id: string;
  content: string;
  /** Ignoré : l'expéditeur est déduit du jeton par l'API (conservé pour compatibilité). */
  sender_id?: string;
  /** Chemin de stockage renvoyé par `uploadFile(file, { folder: 'message-attachments' })`. */
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}

interface ConversationSummary {
  appointment_id: string;
}

/**
 * Tous les messages de l'utilisateur (patient ou praticien, déduit du jeton), du plus récent au plus ancien.
 * TODO(api): aucune route « tous mes messages » ; on agrège les conversations (1re page, 50 max)
 * et leurs 200 derniers messages via GET /conversations puis GET /conversations/:id/messages.
 */
export function useMessages(userId?: string, userType?: 'patient' | 'practitioner') {
  return useQuery<Message[]>({
    queryKey: ['messages', userId, userType],
    queryFn: async () => {
      if (!userId) return [];

      const { conversations } = await api.get<{ conversations: ConversationSummary[]; hasMore: boolean }>('/conversations', { query: { page: 0, limit: 50 } });
      if (!conversations || conversations.length === 0) return [];

      const perConversation = await Promise.all(
        conversations.map((c) => api.get<Message[]>(`/conversations/${c.appointment_id}/messages`, { query: { limit: 200 } }))
      );

      return perConversation
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!userId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MessageInsert) => {
      const attachment = data.attachment_url
        ? {
            filePath: data.attachment_url,
            type: data.attachment_type ?? undefined,
            name: data.attachment_name ?? undefined,
            size: data.attachment_size ?? undefined,
          }
        : undefined;

      return api.post<Message>(`/conversations/${data.appointment_id}/messages`, {
        content: data.content,
        ...(attachment ? { attachment } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Marque comme lus les messages reçus d'une conversation.
 * TODO(api): pas de route par message ; `POST /conversations/:appointmentId/read` marque tous les
 * messages non lus de l'autre partie. Le paramètre est donc l'identifiant du rendez-vous.
 */
export function useMarkMessageAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointmentId: string) => {
      await api.post<{ updated: number }>(`/conversations/${appointmentId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
